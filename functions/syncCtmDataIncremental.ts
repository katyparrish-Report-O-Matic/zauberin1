import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Sync CTM call tracking data incrementally with rate limiting
 * - Only syncs calls since last sync (incremental)
 * - Respects CTM API rate limits (100 req/min = 1 req/600ms)
 */

const RATE_LIMIT_DELAY = 600; // ms between requests (100 req/min)

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get CTM DataSource
    const dataSources = await base44.asServiceRole.entities.DataSource.filter({
      platform_type: 'call_tracking'
    }, '-updated_date', 1);

    if (!dataSources.length) {
      return Response.json({ 
        success: false, 
        error: 'CTM data source not configured' 
      }, { status: 400 });
    }

    const dataSource = dataSources[0];
    const apiKey = dataSource.credentials?.api_key;
    
    if (!apiKey) {
      return Response.json({ 
        success: false, 
        error: 'CTM API key not configured' 
      }, { status: 400 });
    }

    // Setup auth
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const auth = btoa(String.fromCharCode(...data));

    // For incremental: only fetch since last sync (or last 24h if never synced)
    const lastSyncAt = dataSource.last_sync_at 
      ? new Date(dataSource.last_sync_at) 
      : new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    console.log(`[CTM Sync] Last sync: ${lastSyncAt.toISOString()}`);

    // Check for concurrent manual syncs
    const activeManualSync = await base44.asServiceRole.entities.SyncJob.filter({
      organization_id: dataSource.organization_id,
      sync_type: 'manual',
      status: 'in_progress'
    }, '-created_date', 1);

    if (activeManualSync.length > 0) {
      return Response.json({
        success: false,
        error: 'Manual sync already in progress. Only one manual sync allowed at a time.',
        active_sync_id: activeManualSync[0].id,
        started_at: activeManualSync[0].started_at
      }, { status: 409 });
    }

    // Create SyncJob to track progress
    const syncJob = await base44.asServiceRole.entities.SyncJob.create({
      organization_id: dataSource.organization_id,
      data_source_id: dataSource.id,
      sync_type: 'manual',
      status: 'in_progress',
      started_at: new Date().toISOString(),
      progress_percentage: 0,
      current_step: 'Initializing...',
      records_synced: 0,
      records_created: 0
    });

    let totalCallsCreated = 0;
    let accountsProcessed = 0;
    let errors = [];
    const baseUrl = 'https://api.calltrackingmetrics.com/api/v1';
    const accountIds = dataSource.account_ids || [];

    // Process each account
    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i];
      try {
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));

        const url = `${baseUrl}/accounts/${accountId}/calls.json?per_page=100`;
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.status === 429) {
          console.warn(`[CTM Sync] Rate limited for account ${accountId}`);
          errors.push({ account: accountId, error: 'Rate limited' });
          continue;
        }

        if (!response.ok) {
          console.error(`[CTM Sync] Failed to fetch calls for account ${accountId}: ${response.status}`);
          errors.push({ account: accountId, error: `HTTP ${response.status}` });
          continue;
        }

        const callsData = await response.json();
        const calls = callsData.calls || [];
        
        // Filter to calls since last sync (incremental)
        const newCalls = calls.filter(call => {
          const callDate = new Date(call.start_time);
          return callDate >= lastSyncAt;
        });

        if (newCalls.length > 0) {
          // Bulk create call records
          const callRecords = newCalls.map(call => ({
            call_id: call.id,
            account_id: accountId,
            account_name: call.account_name,
            caller_number: call.caller_number,
            tracking_number: call.tracking_number,
            duration: call.duration,
            call_status: call.call_status,
            start_time: call.start_time,
            first_time_caller: call.first_time_caller,
            tags: call.tags || [],
            custom_fields: call.custom_fields || {},
            data_source_id: dataSource.id,
            organization_id: dataSource.organization_id,
            sync_date: new Date().toISOString().split('T')[0]
          }));

          await base44.asServiceRole.entities.CallRecord.bulkCreate(callRecords);
          totalCallsCreated += newCalls.length;
          console.log(`[CTM Sync] Account ${accountId}: ${newCalls.length} new calls`);
        }

        accountsProcessed++;

      } catch (error) {
        console.error(`[CTM Sync] Error processing account ${accountId}:`, error.message);
        errors.push({ account: accountId, error: error.message });
      }
    }

    // Update DataSource with sync metadata
    const now = new Date().toISOString();
    await base44.asServiceRole.entities.DataSource.update(dataSource.id, {
      last_sync_at: now,
      last_sync_status: 'success',
      total_records_synced: (dataSource.total_records_synced || 0) + totalCallsCreated
    });

    console.log(`[CTM Sync] ✅ Complete: ${totalCallsCreated} calls, ${accountsProcessed}/${accountIds.length} accounts`);

    return Response.json({
      success: true,
      calls_synced: totalCallsCreated,
      accounts_processed: accountsProcessed,
      total_accounts: accountIds.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('[CTM Sync] Error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});