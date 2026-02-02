import { base44 } from "@/api/base44Client";
import { environmentConfig } from "../config/EnvironmentConfig";

/**
 * Data Sync Service - SIMPLIFIED
 * Stores CallRecords only. Reports aggregate on-demand.
 */
class DataSyncService {
  /**
   * Initialize a sync job
   */
  async initializeSync(dataSourceId, syncType = 'manual') {
    try {
      const dataSource = await base44.entities.DataSource.filter({ id: dataSourceId });
      if (!dataSource || dataSource.length === 0) {
        throw new Error('Data source not found');
      }

      const ds = dataSource[0];
      const orgId = ds.organization_id;

      // Check for concurrent syncs
      const activeSyncs = await base44.entities.SyncJob.filter({
        organization_id: orgId,
        data_source_id: ds.id,
        status: 'in_progress'
      });

      if (activeSyncs.length > 0) {
        throw new Error(`Sync already in progress. Started at ${activeSyncs[0].started_at}`);
      }

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - (ds.sync_config?.backfill_days || 30));

      const syncJob = await base44.entities.SyncJob.create({
        organization_id: orgId,
        data_source_id: ds.id,
        sync_type: syncType,
        date_range: {
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0]
        },
        status: 'in_progress',
        started_at: new Date().toISOString(),
        progress_percentage: 0,
        current_step: 'Initializing sync...',
        records_synced: 0,
        records_created: 0,
        records_updated: 0,
        records_failed: 0,
        api_calls_made: 0,
        retry_count: 0
      });

      console.log('[DataSync] Created sync job:', syncJob.id);

      this.runSync(syncJob, ds).catch(error => {
        console.error('[DataSync] Sync failed:', error);
      });

      return syncJob;

    } catch (error) {
      environmentConfig.log('error', '[DataSync] Initialize error:', error);
      throw error;
    }
  }

  /**
   * Run sync job in background
   */
  async runSync(syncJob, dataSource) {
    try {
      let result;

      if (dataSource.platform_type === 'call_tracking') {
        result = await this.syncCallTracking(syncJob, dataSource);
      } else if (dataSource.platform_type === 'google_ads') {
        result = await this.syncGoogleAds(syncJob, dataSource);
      } else if (dataSource.platform_type === 'google_analytics_4') {
        result = await this.syncGoogleAnalytics(syncJob, dataSource);
      } else if (dataSource.platform_type === 'salesforce') {
        result = await this.syncSalesforce(syncJob, dataSource);
      } else {
        throw new Error(`Unsupported platform type: ${dataSource.platform_type}`);
      }

      await base44.entities.SyncJob.update(syncJob.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress_percentage: 100,
        current_step: 'Sync completed successfully',
        records_synced: result.recordsSynced,
        records_created: result.recordsCreated,
        records_updated: result.recordsUpdated,
        duration_seconds: Math.floor((new Date() - new Date(syncJob.started_at)) / 1000)
      });

      await base44.entities.DataSource.update(dataSource.id, {
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'success',
        last_sync_error: null,
        total_records_synced: (dataSource.total_records_synced || 0) + result.recordsCreated
      });

      console.log('[DataSync] Sync completed:', syncJob.id);

    } catch (error) {
      console.error('[DataSync] Sync error:', error);

      await base44.entities.SyncJob.update(syncJob.id, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message,
        duration_seconds: Math.floor((new Date() - new Date(syncJob.started_at)) / 1000)
      });

      await base44.entities.DataSource.update(dataSource.id, {
        last_sync_status: 'failed',
        last_sync_error: error.message
      });
    }
  }

  /**
   * TRUE BATCHING: Sync call tracking data in small batches
   * Multiple SHORT backend calls instead of one LONG call
   */
  async syncCallTracking(syncJob, dataSource) {
    const accountIds = dataSource.account_ids || [];
    
    if (accountIds.length === 0) {
      throw new Error('No account IDs configured for Call Tracking sync');
    }

    console.log(`[DataSync] 🚀 Starting batched sync for ${accountIds.length} accounts`);

    let currentIndex = 0;
    let totalCreated = 0;
    const batchSize = 10; // Process 10 accounts per batch

    while (currentIndex < accountIds.length) {
      console.log(`[DataSync] 📦 Batch starting at index ${currentIndex}`);

      try {
        // Call backend batch function
        const result = await base44.functions.invoke('syncCtmBatch', {
          dataSourceId: dataSource.id,
          startIndex: currentIndex,
          batchSize
        });

        if (!result.data?.success) {
          throw new Error(result.data?.error || 'Batch sync failed');
        }

        const { processedCount, totalSaved, nextStartIndex, isComplete } = result.data;

        totalCreated += totalSaved;
        currentIndex = nextStartIndex;

        // Update progress
        const progress = Math.round((currentIndex / accountIds.length) * 100);
        await base44.entities.SyncJob.update(syncJob.id, {
          progress_percentage: progress,
          records_synced: totalCreated,
          records_created: totalCreated,
          current_step: `Processed ${currentIndex}/${accountIds.length} accounts (${totalCreated} records saved)`
        });

        console.log(`[DataSync] ✅ Batch complete: ${totalSaved} records, next index: ${nextStartIndex}`);

        if (isComplete) {
          break;
        }

        // Delay between batches to prevent blocking
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`[DataSync] ❌ Batch at index ${currentIndex} failed:`, error.message);
        throw error;
      }
    }

    console.log(`[DataSync] 🏁 Batched sync complete: ${totalCreated} records saved`);

    return {
      recordsSynced: totalCreated,
      recordsCreated: totalCreated,
      recordsUpdated: 0
    };
  }

  async syncGoogleAds(syncJob, dataSource) {
    console.log('[DataSync] Google Ads sync not yet implemented');
    return { recordsSynced: 0, recordsCreated: 0, recordsUpdated: 0 };
  }

  async syncGoogleAnalytics(syncJob, dataSource) {
    console.log('[DataSync] Google Analytics sync not yet implemented');
    return { recordsSynced: 0, recordsCreated: 0, recordsUpdated: 0 };
  }

  async syncSalesforce(syncJob, dataSource) {
    let recordsCreated = 0;
    let recordsUpdated = 0;

    console.log('[DataSync] Starting Salesforce sync');

    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: 'Fetching Salesforce data...',
      progress_percentage: 10
    });

    const result = await base44.functions.invoke('syncSalesforceData', {
      startDate: syncJob.date_range.start_date,
      endDate: syncJob.date_range.end_date
    });

    if (!result.data?.success) {
      throw new Error(result.data?.error || 'Salesforce sync failed');
    }

    const { accounts, agreements } = result.data;

    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: `Processing ${accounts.length} accounts and ${agreements.length} agreements...`,
      progress_percentage: 30
    });

    const syncDate = new Date().toISOString().split('T')[0];

    // Store accounts
    const accountRecords = accounts.map(acc => ({
      organization_id: dataSource.organization_id,
      data_source_id: dataSource.id,
      ...acc,
      sync_date: syncDate
    }));

    if (accountRecords.length > 0) {
      await base44.entities.SalesforceAccount.bulkCreate(accountRecords);
      recordsCreated += accountRecords.length;
    }

    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: 'Storing service agreements...',
      progress_percentage: 70
    });

    // Store agreements
    const agreementRecords = agreements.map(agr => ({
      organization_id: dataSource.organization_id,
      data_source_id: dataSource.id,
      ...agr,
      sync_date: syncDate
    }));

    if (agreementRecords.length > 0) {
      await base44.entities.ServiceAgreement.bulkCreate(agreementRecords);
      recordsCreated += agreementRecords.length;
    }

    const recordsSynced = accounts.length + agreements.length;

    console.log(`[DataSync] Salesforce sync complete - ${recordsCreated} records stored`);

    return { recordsSynced, recordsCreated, recordsUpdated };
  }
}

export const dataSyncService = new DataSyncService();