import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Sync a BATCH of CTM call records (by RECORDS, not accounts)
 * - Processes until maxRecords reached
 * - 600ms delay between EVERY API request
 * - 429 retry logic with exponential backoff
 * - Tracks exact pagination position (account + page)
 * - Returns nextStartIndex for resuming
 */

const RATE_LIMIT_DELAY = 600; // ms between requests
const RETRY_DELAY = 5000; // ms to wait on 429
const MAX_RETRIES = 3;

// Helper: fetch with rate limit and retry logic
async function fetchWithRetry(url, headers, retryCount = 0) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers
    });

    if (response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        console.warn(`[CTM Batch] Rate limited (429), retrying ${retryCount + 1}/${MAX_RETRIES}...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchWithRetry(url, headers, retryCount + 1);
      } else {
        console.error(`[CTM Batch] Rate limited (429) - max retries exceeded`);
        return { ok: false, status: 429, rateLimitExhausted: true };
      }
    }

    return response;
  } catch (error) {
    console.error(`[CTM Batch] Fetch error:`, error.message);
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

    const { dataSourceId, startAccountIndex = 0, startPage = 1, maxRecords = 500 } = await req.json();

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

    if (startAccountIndex >= accountIds.length) {
      return Response.json({
        success: true,
        recordsSaved: 0,
        nextAccountIndex: startAccountIndex,
        nextPage: 1,
        isComplete: true
      });
    }

    console.log(`[CTM Batch] Starting at account ${startAccountIndex}/${accountIds.length}, page ${startPage}, max ${maxRecords} records`);

    // Date range
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = dataSource.last_sync_at 
      ? new Date(dataSource.last_sync_at).toISOString().split('T')[0]
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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

    // Get account regions
    const accountHierarchies = await base44.asServiceRole.entities.AccountHierarchy.filter({
      data_source_id: dataSource.id
    });
    const accountRegionMap = {};
    accountHierarchies.forEach(ah => {
      if (ah.external_id && ah.region) {
        accountRegionMap[ah.external_id] = ah.region;
      }
    });

    // Batch collection
    let recordsSaved = 0;
    let currentAccountIndex = startAccountIndex;
    let currentPage = startPage;
    const batchStart = Date.now();

    // Process accounts/pages until we hit record limit or timeout
    while (currentAccountIndex < accountIds.length && recordsSaved < maxRecords) {
      // Safety: abort if batch takes over 55 seconds (leave 5s buffer)
      if (Date.now() - batchStart > 55000) {
        console.log(`[CTM Batch] Time limit approaching, stopping batch`);
        break;
      }

      const accountId = accountIds[currentAccountIndex];
      const accountRegion = accountRegionMap[String(accountId)] || null;

      try {
        console.log(`[CTM Batch] Account ${currentAccountIndex + 1}/${accountIds.length} (ID: ${accountId}), page ${currentPage}, ${recordsSaved} records so far`);

        // Fetch account metadata (with delay + retry)
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        
        let accountName = `Account ${accountId}`;
        try {
          const metaResponse = await fetchWithRetry(`${baseUrl}/accounts/${accountId}.json`, headers);
          if (metaResponse.ok) {
            const accountData = await metaResponse.json();
            accountName = accountData.name || accountName;
          }
        } catch (metaError) {
          console.warn(`[CTM Batch] Could not fetch metadata for ${accountId}`);
        }

        // Fetch calls for this account with pagination
        let pagesFetched = 0;
        let hasMorePages = true;

        while (hasMorePages && recordsSaved < maxRecords && currentPage <= 100) {
          // Rate limit delay before each call
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));

          const callsUrl = `${baseUrl}/accounts/${accountId}/calls.json?page=${currentPage}&per_page=100&start_date=${startDate}&end_date=${endDate}`;
          
          const callsResponse = await fetchWithRetry(callsUrl, headers);

          if (callsResponse.rateLimitExhausted) {
            console.error(`[CTM Batch] Account ${accountId} rate limit exhausted, moving to next account`);
            hasMorePages = false;
            break;
          }

          if (!callsResponse.ok) {
            console.warn(`[CTM Batch] Account ${accountId} page ${currentPage} failed: ${callsResponse.status}, moving to next account`);
            hasMorePages = false;
            break;
          }

          const callsData = await callsResponse.json();
          const calls = callsData.calls || [];

          if (calls.length === 0) {
            hasMorePages = false;
            break;
          }

          // Process and save call records
          const callRecords = calls
            .filter(call => call.called_at)
            .map(call => {
              const isVoicemail = call.call_status === 'voicemail' || call.status === 'voicemail';
              const isAnswered = call.talk_time && call.talk_time > 0;
              const isWorkingHours = call.custom_fields?.working_hours === 'Working Hours';

              return {
                organization_id: dataSource.organization_id,
                data_source_id: dataSource.id,
                account_id: String(accountId),
                account_name: accountName,
                region: accountRegion,
                call_id: String(call.id),
                tracking_number: call.tracking_number,
                caller_number: call.caller_number,
                start_time: call.called_at,
                duration: call.duration || 0,
                talk_time: call.talk_time || 0,
                call_status: call.call_status || (isVoicemail ? 'voicemail' : (isAnswered ? 'answered' : 'missed')),
                is_voicemail: isVoicemail,
                is_working_hours: isWorkingHours,
                qualified: call.qualified || false,
                sale_status: call.sale_status,
                first_time_caller: call.is_new_caller || false,
                keypress: call.keypress,
                web_source: call.web_source || call.source,
                web_medium: call.medium,
                web_campaign: call.ga?.campaign,
                web_keyword: call.webvisit?.keywords,
                landing_page: call.webvisit?.location_host && call.webvisit?.location_path 
                  ? `https://${call.webvisit.location_host}${call.webvisit.location_path}` 
                  : call.last_location,
                referrer: call.webvisit?.referrer_host && call.webvisit?.referrer_path
                  ? `https://${call.webvisit.referrer_host}${call.webvisit.referrer_path}`
                  : call.referrer,
                city: call.city,
                state: call.state,
                country: call.country,
                recording_url: call.audio,
                transcription: call.transcription_text,
                tags: call.tag_list || [],
                custom_fields: call.custom_fields || {},
                sync_date: new Date().toISOString().split('T')[0]
              };
            });

          if (callRecords.length > 0) {
            // Get call_ids from this batch
            const callIds = callRecords.map(r => r.call_id);

            // Check which already exist in database
            const existingRecords = await base44.asServiceRole.entities.CallRecord.filter({
              call_id: { $in: callIds }
            }).select('call_id');

            const existingCallIds = new Set(existingRecords.map(r => r.call_id));

            // Filter to only new records
            const newRecords = callRecords.filter(r => !existingCallIds.has(r.call_id));
            const skippedCount = callRecords.length - newRecords.length;

            if (newRecords.length > 0) {
              await base44.asServiceRole.entities.CallRecord.bulkCreate(newRecords);
            }

            recordsSaved += newRecords.length;
            console.log(`[CTM Batch] Page ${currentPage}: saved ${newRecords.length} new, skipped ${skippedCount} duplicates (total: ${recordsSaved})`);
          }

          pagesFetched++;
          currentPage++;

          // Stop if fewer than 100 records (last page)
          if (calls.length < 100) {
            hasMorePages = false;
          }
        }

        // Update/Create AccountHierarchy
        const existing = await base44.asServiceRole.entities.AccountHierarchy.filter({
          data_source_id: dataSource.id,
          external_id: String(accountId)
        });

        if (existing.length === 0) {
          await base44.asServiceRole.entities.AccountHierarchy.create({
            organization_id: dataSource.organization_id,
            data_source_id: dataSource.id,
            platform_type: 'call_tracking',
            hierarchy_level: 'account',
            external_id: String(accountId),
            name: accountName,
            region: accountRegion,
            status: 'active',
            last_updated: new Date().toISOString()
          });
        } else {
          await base44.asServiceRole.entities.AccountHierarchy.update(existing[0].id, {
            name: accountName,
            region: accountRegion || existing[0].region,
            last_updated: new Date().toISOString()
          });
        }

        // Move to next account
        currentAccountIndex++;
        currentPage = 1; // Reset page for next account

      } catch (error) {
        console.error(`[CTM Batch] Account ${accountId} error:`, error.message);
        currentAccountIndex++;
        currentPage = 1;
        continue;
      }
    }

    const isComplete = currentAccountIndex >= accountIds.length;

    console.log(`[CTM Batch] Batch complete: ${recordsSaved} records saved`);

    return Response.json({
      success: true,
      recordsSaved,
      nextAccountIndex: currentAccountIndex,
      nextPage: currentPage,
      isComplete,
      batchInfo: {
        startAccountIndex,
        endAccountIndex: currentAccountIndex,
        totalAccounts: accountIds.length,
        recordsInBatch: recordsSaved,
        timeSeconds: Math.round((Date.now() - batchStart) / 1000)
      }
    });

  } catch (error) {
    console.error('[CTM Batch] Error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});