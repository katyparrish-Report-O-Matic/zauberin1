import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const RATE_LIMIT_DELAY = 600;
const RETRY_DELAY = 5000;
const MAX_RETRIES = 3;

async function fetchWithRetry(url, headers, retryCount = 0) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers
    });

    if (response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        console.warn(`[CTM Numbers] Rate limited (429), retrying ${retryCount + 1}/${MAX_RETRIES}...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchWithRetry(url, headers, retryCount + 1);
      } else {
        console.error(`[CTM Numbers] Rate limited (429) - max retries exceeded`);
        return { ok: false, status: 429, rateLimitExhausted: true };
      }
    }

    return response;
  } catch (error) {
    console.error(`[CTM Numbers] Fetch error:`, error.message);
    throw error;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { dataSourceId } = await req.json();

    if (!dataSourceId) {
      return Response.json({ error: 'dataSourceId required' }, { status: 400 });
    }

    // Fetch DataSource
    const dataSources = await base44.asServiceRole.entities.DataSource.filter({
      id: dataSourceId
    });

    if (!dataSources.length) {
      return Response.json({ error: 'Data source not found' }, { status: 404 });
    }

    const dataSource = dataSources[0];
    const accountIds = dataSource.account_ids || [];
    const apiKey = dataSource.credentials?.api_key;

    if (!apiKey) {
      return Response.json({ error: 'API key not configured' }, { status: 400 });
    }

    // Parse API credentials
    let auth;
    if (apiKey.includes(':')) {
      const [access, secret] = apiKey.split(':');
      const encoder = new TextEncoder();
      const data = encoder.encode(`${access}:${secret}`);
      auth = btoa(String.fromCharCode(...data));
    } else {
      auth = apiKey;
    }

    const baseUrl = 'https://api.calltrackingmetrics.com/api/v1';
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    };

    // Get account hierarchies for names
    const accountHierarchies = await base44.asServiceRole.entities.AccountHierarchy.filter({
      data_source_id: dataSource.id
    });
    const accountNameMap = {};
    accountHierarchies.forEach(ah => {
      if (ah.external_id) {
        accountNameMap[ah.external_id] = ah.name;
      }
    });

    let totalSaved = 0;
    let totalUpdated = 0;
    const syncDate = new Date().toISOString();

    // Loop through all accounts
    for (const accountId of accountIds) {
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));

      const accountName = accountNameMap[String(accountId)] || `Account ${accountId}`;
      
      console.log(`[CTM Numbers] Fetching tracking numbers for account ${accountId} (${accountName})`);

      const numbersUrl = `${baseUrl}/accounts/${accountId}/numbers.json`;
      const response = await fetchWithRetry(numbersUrl, headers);

      if (response.rateLimitExhausted) {
        console.error(`[CTM Numbers] Rate limit exhausted for account ${accountId}`);
        continue;
      }

      if (!response.ok) {
        console.warn(`[CTM Numbers] Failed to fetch numbers for account ${accountId}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const numbers = data.numbers || data || [];

      if (!Array.isArray(numbers)) {
        console.warn(`[CTM Numbers] Unexpected response format for account ${accountId}`);
        continue;
      }

      for (const num of numbers) {
        const trackingNumber = num.number || num.tracking_number || num.phone_number;
        if (!trackingNumber) continue;

        const description = num.name || num.description || num.label || '';
        const status = num.status === 'active' || num.active === true ? 'active' : 'inactive';

        // Check if tracking number already exists
        const existing = await base44.asServiceRole.entities.TrackingNumber.filter({
          tracking_number: trackingNumber,
          source: 'ctm'
        });

        const recordData = {
          tracking_number: trackingNumber,
          description: description,
          account_name: accountName,
          account_id: String(accountId),
          status: status,
          source: 'ctm',
          sync_date: syncDate
        };

        if (existing.length > 0) {
          await base44.asServiceRole.entities.TrackingNumber.update(existing[0].id, recordData);
          totalUpdated++;
        } else {
          await base44.asServiceRole.entities.TrackingNumber.create(recordData);
          totalSaved++;
        }
      }

      console.log(`[CTM Numbers] Account ${accountId}: processed ${numbers.length} numbers`);
    }

    console.log(`[CTM Numbers] Sync complete: ${totalSaved} created, ${totalUpdated} updated`);

    return Response.json({
      success: true,
      created: totalSaved,
      updated: totalUpdated,
      totalProcessed: totalSaved + totalUpdated
    });

  } catch (error) {
    console.error('[CTM Numbers] Error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});