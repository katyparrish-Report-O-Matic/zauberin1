import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Sync CTM call tracking data incrementally with rate limiting
 * - Only syncs accounts updated since last sync (incremental)
 * - Respects CTM API rate limits (100 req/min = 1 req/600ms)
 */

const RATE_LIMIT_DELAY = 600; // ms between requests to stay under 100 req/min

Deno.serve(async (req) => {
  let syncJob;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { organizationId } = await req.json();
    if (!organizationId) {
      return Response.json({ 
        success: false, 
        error: 'Organization ID is required' 
      }, { status: 400 });
    }

    console.log(`[CTM Sync] Starting incremental sync for org: ${organizationId}`);

    // Check for concurrent manual syncs
    const activeManualSync = await base44.asServiceRole.entities.SyncJob.filter({
      organization_id: organizationId,
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

    // Create SyncJob record to track progress
    const syncJob = await base44.asServiceRole.entities.SyncJob.create({
      organization_id: organizationId,
      data_source_id: 'placeholder',
      sync_type: 'manual',
      status: 'in_progress',
      started_at: new Date().toISOString(),
      progress_percentage: 0,
      current_step: 'Initializing...',
      records_synced: 0,
      records_created: 0
    });

    // Get CTM DataSource
    const dataSources = await base44.asServiceRole.entities.DataSource.filter({
      organization_id: organizationId,
      platform_type: 'call_tracking'
    }, '-updated_date', 1);

    if (!dataSources.length) {
      await base44.asServiceRole.entities.SyncJob.update(syncJob.id, {
        status: 'failed',
        error_message: 'CTM data source not configured',
        completed_at: new Date().toISOString()
      });
      return Response.json({ 
        success: false, 
        error: 'CTM data source not configured' 
      }, { status: 400 });
    }

    const dataSource = dataSources[0];
    const apiKey = dataSource.credentials?.api_key;
    
    if (!apiKey) {
      await base44.asServiceRole.entities.SyncJob.update(syncJob.id, {
        status: 'failed',
        error_message: 'CTM API key not configured',
        completed_at: new Date().toISOString()
      });
      return Response.json({ 
        success: false, 
        error: 'CTM API key not configured' 
      }, { status: 400 });
    }

    // Update SyncJob with data_source_id
    await base44.asServiceRole.entities.SyncJob.update(syncJob.id, {
      data_source_id: dataSource.id
    });

    // Setup auth
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const auth = btoa(String.fromCharCode(...data));

    // For incremental sync: only fetch accounts updated since last sync
    const lastSyncAt = dataSource.last_sync_at ? new Date(dataSource.last_sync_at) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    console.log(`[CTM Sync] Last sync: ${lastSyncAt.toISOString()}`);

    let totalCalls = 0;
    const baseUrl = 'https://api.calltrackingmetrics.com/api/v1';

    // Fetch accounts (only those in account_ids list from DataSource)
    const accountIds = dataSource.account_ids || [];
    console.log(`[CTM Sync] Syncing ${accountIds.length} configured accounts`);

    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i];
      try {
        // Update progress
        const progress = Math.round((i / accountIds.length) * 100);
        await base44.asServiceRole.entities.SyncJob.update(syncJob.id, {
          progress_percentage: progress,
          current_step: `Processing account ${i + 1}/${accountIds.length}`
        });

        // Rate limiting - respect API limits
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
          // Rate limited - back off and retry
          console.warn(`[CTM Sync] Rate limited for account ${accountId}, backing off...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }

        if (!response.ok) {
          console.error(`[CTM Sync] Failed to fetch calls for account ${accountId}: ${response.status}`);
          continue;
        }

        const callsData = await response.json();
        const calls = callsData.calls || [];
        
        if (calls.length > 0) {
          // Filter to only calls since last sync (incremental)
          const filteredCalls = calls.filter(call => {
            const callDate = new Date(call.start_time);
            return callDate >= lastSyncAt;
          });

          if (filteredCalls.length > 0) {
            const callRecords = filteredCalls.map(call => ({
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
              organization_id: organizationId,
              sync_date: new Date().toISOString().split('T')[0]
            }));

            // Bulk create call records immediately
            await base44.asServiceRole.entities.CallRecord.bulkCreate(callRecords);
            totalCalls += filteredCalls.length;
            
            // Update sync job with new totals
            await base44.asServiceRole.entities.SyncJob.update(syncJob.id, {
              records_synced: totalCalls,
              records_created: totalCalls
            });

            console.log(`[CTM Sync] Account ${accountId}: ${filteredCalls.length} new calls saved`);
          }
        }

      } catch (error) {
        console.error(`[CTM Sync] Error processing account ${accountId}:`, error.message);
        continue;
      }
    }

    // Update DataSource with sync info
    const now = new Date().toISOString();
    await base44.asServiceRole.entities.DataSource.update(dataSource.id, {
      last_sync_at: now,
      last_sync_status: 'success',
      total_records_synced: (dataSource.total_records_synced || 0) + totalCalls
    });

    // Mark sync job as completed
    await base44.asServiceRole.entities.SyncJob.update(syncJob.id, {
      status: 'completed',
      completed_at: now,
      progress_percentage: 100,
      current_step: 'Completed',
      records_synced: totalCalls,
      records_created: totalCalls
    });

    console.log(`[CTM Sync] ✅ Sync complete: ${totalCalls} new calls`);

    return Response.json({
      success: true,
      calls_synced: totalCalls,
      accounts_processed: accountIds.length,
      sync_type: 'incremental',
      last_sync_at: now,
      sync_job_id: syncJob.id
    });

  } catch (error) {
    console.error('[CTM Sync] Error:', error);
    // If we created a SyncJob, mark it as failed
    if (syncJob) {
      try {
        await base44.asServiceRole.entities.SyncJob.update(syncJob.id, {
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        });
      } catch (updateError) {
        console.error('[CTM Sync] Could not update SyncJob:', updateError);
      }
    }
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});