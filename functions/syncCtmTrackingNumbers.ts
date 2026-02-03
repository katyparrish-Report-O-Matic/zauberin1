import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const fetchWithRetry = async (url, options, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    const response = await fetch(url, options);
    if (response.status === 429) {
      const waitTime = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }
    return response;
  }
  throw new Error('Max retries exceeded');
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { dataSourceId } = body;

    // Get data source for CTM credentials
    const dataSources = await base44.entities.DataSource.filter({ platform_type: 'call_tracking' });
    
    if (dataSources.length === 0) {
      return Response.json({ error: 'No CTM data source found' }, { status: 404 });
    }

    const dataSource = dataSourceId 
      ? dataSources.find(ds => ds.id === dataSourceId) 
      : dataSources[0];

    if (!dataSource) {
      return Response.json({ error: 'Data source not found' }, { status: 404 });
    }

    const credentials = dataSource.credentials || {};
    const accessToken = credentials.access_token;
    const secretKey = credentials.api_key;

    if (!accessToken || !secretKey) {
      return Response.json({ error: 'Missing CTM credentials' }, { status: 400 });
    }

    // Get all CTM accounts from AccountHierarchy
    const accounts = await base44.entities.AccountHierarchy.filter({
      data_source_id: dataSource.id,
      hierarchy_level: 'account'
    });

    if (accounts.length === 0) {
      return Response.json({ error: 'No CTM accounts found' }, { status: 404 });
    }

    let created = 0;
    let updated = 0;
    const syncDate = new Date().toISOString();

    for (const account of accounts) {
      const accountId = account.external_id;
      const accountName = account.name;

      // Fetch tracking numbers from CTM API
      const url = `https://api.calltrackingmetrics.com/api/v1/accounts/${accountId}/numbers.json`;
      const authHeader = 'Basic ' + btoa(`${accessToken}:${secretKey}`);

      const response = await fetchWithRetry(url, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error(`Failed to fetch numbers for account ${accountId}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const numbers = data.numbers || [];

      for (const num of numbers) {
        const trackingNumber = num.number || num.tracking_number;
        if (!trackingNumber) continue;

        // Check if already exists
        const existing = await base44.entities.TrackingNumber.filter({
          tracking_number: trackingNumber,
          source: 'ctm'
        });

        const record = {
          tracking_number: trackingNumber,
          description: num.name || num.description || '',
          account_name: accountName,
          account_id: accountId,
          status: num.active ? 'active' : 'inactive',
          source: 'ctm',
          sync_date: syncDate
        };

        if (existing.length > 0) {
          await base44.entities.TrackingNumber.update(existing[0].id, record);
          updated++;
        } else {
          await base44.entities.TrackingNumber.create(record);
          created++;
        }
      }
    }

    return Response.json({
      success: true,
      created,
      updated,
      total: created + updated
    });

  } catch (error) {
    console.error('Sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});