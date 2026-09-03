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

const ACCOUNT_BATCH_SIZE = 5;

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

    // Get all CTM accounts from AccountHierarchy
    const accounts = await base44.entities.AccountHierarchy.filter({
      data_source_id: dataSource.id,
      hierarchy_level: 'account'
    });

    if (accounts.length === 0) {
      return Response.json({ error: 'No CTM accounts found' }, { status: 404 });
    }

    // Fetch ALL existing tracking numbers once upfront
    const existingNumbers = await base44.entities.TrackingNumber.filter({ source: 'ctm' });
    const existingSet = new Set(existingNumbers.map(n => n.tracking_number));

    const syncDate = new Date().toISOString();
    let created = 0;

    // Process accounts in batches
    for (let i = 0; i < accounts.length; i += ACCOUNT_BATCH_SIZE) {
      const accountBatch = accounts.slice(i, i + ACCOUNT_BATCH_SIZE);
      const batchRecords = [];

      for (const account of accountBatch) {
        const accountId = account.external_id;
        const accountName = account.name;

        // Fetch tracking numbers from CTM API
        const url = `https://api.calltrackingmetrics.com/api/v1/accounts/${accountId}/numbers.json`;
        const authHeader = `Basic ${auth}`;

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

          // Skip if already exists
          if (existingSet.has(trackingNumber)) continue;

          batchRecords.push({
            tracking_number: trackingNumber,
            description: num.name || num.description || '',
            account_name: accountName,
            account_id: accountId,
            status: num.active ? 'active' : 'inactive',
            source: 'ctm',
            sync_date: syncDate
          });
        }
      }

      // Deduplicate within batch by tracking_number
      const uniqueRecords = [];
      const seenInBatch = new Set();
      for (const record of batchRecords) {
        if (!seenInBatch.has(record.tracking_number)) {
          seenInBatch.add(record.tracking_number);
          uniqueRecords.push(record);
        }
      }

      // Bulk create this batch
      if (uniqueRecords.length > 0) {
        await base44.entities.TrackingNumber.bulkCreate(uniqueRecords);
        created += uniqueRecords.length;
        
        // Add to existingSet so next batch doesn't duplicate
        uniqueRecords.forEach(r => existingSet.add(r.tracking_number));
      }
    }

    return Response.json({
      success: true,
      created,
      total: created
    });

  } catch (error) {
    console.error('Sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});