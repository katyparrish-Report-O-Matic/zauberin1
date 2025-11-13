import { base44 } from "@/api/base44Client";
import { environmentConfig } from "../config/EnvironmentConfig";

/**
 * Data Sync Service
 * Manages background data synchronization jobs
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
   * Sync call tracking data - ULTRA OPTIMIZED v5
   * Fixed: Account names from API + proper AccountHierarchy creation
   */
  async syncCallTracking(syncJob, dataSource) {
    let recordsSynced = 0;
    let recordsCreated = 0;
    let recordsUpdated = 0;

    const accountIds = dataSource.account_ids || [];
    const apiKey = dataSource.credentials?.api_key || dataSource.credentials?.access_token;
    const isAgencyLevel = dataSource.metadata?.access_level === 'agency' || apiKey.includes(':');

    if (accountIds.length === 0) {
      throw new Error('No account IDs configured for Call Tracking sync');
    }

    if (!apiKey) {
      throw new Error('No API credentials found for Call Tracking sync');
    }

    console.log(`[DataSync] 🚀 Processing ${accountIds.length} account(s) in parallel`);

    // ⚡ STEP 1: Fetch all accounts in parallel (0% → 50%)
    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: `Fetching ${accountIds.length} account(s) in parallel...`,
      progress_percentage: 5
    });

    const accountPromises = accountIds.map(async (accountId, index) => {
      console.log(`[DataSync] 📞 [${index + 1}/${accountIds.length}] Fetching account ${accountId}`);

      const result = await base44.functions.invoke('syncCallTrackingData', {
        accountId: String(accountId),
        startDate: syncJob.date_range.start_date,
        endDate: syncJob.date_range.end_date,
        apiKey,
        isAgencyLevel
      });

      if (!result.data?.success) {
        throw new Error(result.data?.error || `Account ${accountId} failed`);
      }

      const progressIncrement = 40 / accountIds.length;
      const currentProgress = 5 + ((index + 1) * progressIncrement);

      await base44.entities.SyncJob.update(syncJob.id, {
        current_step: `Fetched ${index + 1}/${accountIds.length}: ${result.data.account.name} (${result.data.totalCalls} calls)`,
        progress_percentage: Math.round(currentProgress)
      });

      return {
        accountId: String(accountId),
        accountName: result.data.account.name,
        accountMetadata: result.data.account,
        metrics: result.data.metrics,
        callCount: result.data.totalCalls
      };
    });

    const accountResults = await Promise.all(accountPromises);

    const totalCalls = accountResults.reduce((sum, r) => sum + r.callCount, 0);
    console.log(`[DataSync] ✅ Fetched ${totalCalls} total calls from ${accountResults.length} accounts`);

    // ⚡ STEP 2: Create/Update AccountHierarchy records (45% → 50%)
    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: `Creating account hierarchy for ${accountResults.length} accounts...`,
      progress_percentage: 45
    });

    for (const accountResult of accountResults) {
      try {
        const existing = await base44.entities.AccountHierarchy.filter({
          data_source_id: dataSource.id,
          external_id: accountResult.accountId
        });

        if (existing.length === 0) {
          await base44.entities.AccountHierarchy.create({
            organization_id: dataSource.organization_id,
            data_source_id: dataSource.id,
            platform_type: dataSource.platform_type,
            hierarchy_level: 'account',
            external_id: accountResult.accountId,
            name: accountResult.accountName,
            status: accountResult.accountMetadata.status || 'active',
            metadata: {
              synced_at: new Date().toISOString(),
              timezone: accountResult.accountMetadata.timezone,
              country: accountResult.accountMetadata.country
            },
            last_updated: new Date().toISOString()
          });
          console.log(`[DataSync] ✓ Created AccountHierarchy: ${accountResult.accountName}`);
        } else {
          await base44.entities.AccountHierarchy.update(existing[0].id, {
            name: accountResult.accountName,
            status: accountResult.accountMetadata.status || 'active',
            metadata: {
              synced_at: new Date().toISOString(),
              timezone: accountResult.accountMetadata.timezone,
              country: accountResult.accountMetadata.country
            },
            last_updated: new Date().toISOString()
          });
          console.log(`[DataSync] ✓ Updated AccountHierarchy: ${accountResult.accountName}`);
        }
      } catch (error) {
        console.error(`[DataSync] ⚠️ Failed to create/update AccountHierarchy for ${accountResult.accountId}:`, error.message);
      }
    }

    // ⚡ STEP 3: Store metrics (50% → 95%)
    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: 'Storing metrics in database...',
      progress_percentage: 50
    });

    const allMetrics = accountResults.flatMap(r => 
      r.metrics.map(m => ({
        ...m,
        accountId: r.accountId,
        accountName: r.accountName
      }))
    );

    console.log(`[DataSync] 💾 Processing ${allMetrics.length} days of data`);

    const metricsToStore = [
      'total_calls',
      'answered_calls',
      'missed_calls',
      'qualified_calls',
      'average_duration',
      'answer_rate'
    ];

    let totalRecordsCreated = 0;
    const errors = [];

    for (let metricIndex = 0; metricIndex < metricsToStore.length; metricIndex++) {
      const metricName = metricsToStore[metricIndex];

      console.log(`[DataSync] 💾 [${metricIndex + 1}/${metricsToStore.length}] Storing ${metricName}...`);

      const batchSize = 10;
      let batchCount = 0;

      for (let i = 0; i < allMetrics.length; i += batchSize) {
        const batch = allMetrics.slice(i, i + batchSize);

        const createPromises = batch.map(async (dayMetrics) => {
          const value = dayMetrics[metricName];

          if (value === undefined || value === null) return null;

          try {
            await base44.entities.TransformedMetric.create({
              metric_name: metricName,
              time_period: 'daily',
              period_start: dayMetrics.date + 'T00:00:00.000Z',
              period_end: dayMetrics.date + 'T23:59:59.999Z',
              raw_value: value,
              aggregated_value: value,
              segment: {
                platform: 'call_tracking',
                data_source_id: dataSource.id,
                account_id: dayMetrics.accountId,
                account_name: dayMetrics.accountName
              },
              derived_metrics: {
                growth_rate: 0,
                moving_average: value,
                percent_of_total: 0
              },
              data_quality_score: 100
            });
            return 1;
          } catch (error) {
            console.error(`[DataSync] ❌ Failed to create record for ${metricName} on ${dayMetrics.date}:`, error.message);
            errors.push({ metric: metricName, date: dayMetrics.date, error: error.message });
            return null;
          }
        });

        const results = await Promise.all(createPromises);
        const successCount = results.filter(r => r !== null).length;
        totalRecordsCreated += successCount;
        batchCount++;

        console.log(`[DataSync] ✓ Batch ${batchCount}: ${successCount} records created for ${metricName}`);
      }

      const progressIncrement = 45 / metricsToStore.length;
      await base44.entities.SyncJob.update(syncJob.id, {
        current_step: `Stored ${metricIndex + 1}/${metricsToStore.length} metrics (${totalRecordsCreated} records)`,
        progress_percentage: Math.round(50 + ((metricIndex + 1) * progressIncrement))
      });
    }

    recordsSynced = totalCalls;
    recordsCreated = totalRecordsCreated;

    console.log(`[DataSync] ✅ Stored ${recordsCreated} metric records`);

    if (errors.length > 0) {
      console.warn(`[DataSync] ⚠️ ${errors.length} errors occurred during storage`);
    }

    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: `✅ Finalizing... (${recordsCreated} records, ${errors.length} errors)`,
      progress_percentage: 95,
      metrics_synced: metricsToStore
    });

    return { recordsSynced, recordsCreated, recordsUpdated };
  }

  async syncGoogleAds(syncJob, dataSource) {
    console.log('[DataSync] Google Ads sync not yet implemented');
    return { recordsSynced: 0, recordsCreated: 0, recordsUpdated: 0 };
  }

  async syncGoogleAnalytics(syncJob, dataSource) {
    console.log('[DataSync] Google Analytics sync not yet implemented');
    return { recordsSynced: 0, recordsCreated: 0, recordsUpdated: 0 };
  }
}

export const dataSyncService = new DataSyncService();