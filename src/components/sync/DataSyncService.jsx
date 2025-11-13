
import { base44 } from "@/api/base44Client";
import { environmentConfig } from "../config/EnvironmentConfig";
import { googleAdsService } from "../integrations/GoogleAdsService";
import { googleAnalyticsService } from "../integrations/GoogleAnalyticsService";

/**
 * Data Synchronization Service - OPTIMIZED v4
 * Fixed: Proper batch storage with error handling
 */
class DataSyncService {
  constructor() {
    this.activeSyncs = new Map();
    this.syncQueue = [];
  }

  /**
   * Initialize data source sync
   */
  async initializeSync(dataSourceId, syncType = 'backfill') {
    try {
      const dataSources = await base44.entities.DataSource.list();
      const dataSource = dataSources.find(ds => ds.id === dataSourceId);

      if (!dataSource) {
        throw new Error('Data source not found');
      }

      if (!dataSource.enabled) {
        throw new Error('Data source is disabled');
      }

      environmentConfig.log('info', `[DataSync] 🚀 Starting ${syncType} sync for ${dataSource.name}`);

      // Determine date range
      const dateRange = this.calculateDateRange(dataSource, syncType);

      // Create sync job
      const syncJob = await base44.entities.SyncJob.create({
        organization_id: dataSource.organization_id,
        data_source_id: dataSourceId,
        sync_type: syncType,
        date_range: {
          start_date: dateRange.startDate,
          end_date: dateRange.endDate
        },
        status: 'pending',
        progress_percentage: 0
      });

      // Start sync (don't await - run in background)
      this.executeSyncJob(syncJob.id);

      return syncJob;

    } catch (error) {
      environmentConfig.log('error', '[DataSync] Initialize sync error:', error);
      throw error;
    }
  }

  /**
   * Execute sync job
   */
  async executeSyncJob(syncJobId) {
    const startTime = Date.now();

    try {
      // Update status to in_progress
      await base44.entities.SyncJob.update(syncJobId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
        current_step: 'Starting sync...'
      });

      const syncJobs = await base44.entities.SyncJob.list();
      const syncJob = syncJobs.find(sj => sj.id === syncJobId);

      const dataSources = await base44.entities.DataSource.list();
      const dataSource = dataSources.find(ds => ds.id === syncJob.data_source_id);

      let result;

      // Execute platform-specific sync
      switch (dataSource.platform_type) {
        case 'google_ads':
          result = await this.syncGoogleAds(syncJob, dataSource);
          break;
        case 'google_analytics_4':
          result = await this.syncGoogleAnalytics(syncJob, dataSource);
          break;
        case 'call_tracking':
          result = await this.syncCallTracking(syncJob, dataSource);
          break;
        default:
          throw new Error(`Unsupported platform: ${dataSource.platform_type}`);
      }

      const duration = Math.floor((Date.now() - startTime) / 1000);

      // Mark as completed
      await base44.entities.SyncJob.update(syncJobId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        duration_seconds: duration,
        records_synced: result.recordsSynced,
        records_created: result.recordsCreated,
        records_updated: result.recordsUpdated,
        progress_percentage: 100,
        current_step: `✅ Complete! ${result.recordsCreated} records stored in ${duration}s`
      });

      // Update data source
      await base44.entities.DataSource.update(dataSource.id, {
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'success',
        total_records_synced: (dataSource.total_records_synced || 0) + result.recordsSynced,
        next_sync_at: this.calculateNextSync(dataSource)
      });

      environmentConfig.log('info', `[DataSync] ✅ Sync ${syncJobId} completed: ${result.recordsCreated} records stored`);

    } catch (error) {
      environmentConfig.log('error', `[DataSync] ❌ Sync ${syncJobId} failed:`, error);

      await base44.entities.SyncJob.update(syncJobId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message,
        current_step: `❌ Failed: ${error.message}`
      });

      // Update data source
      const syncJobs = await base44.entities.SyncJob.list();
      const syncJob = syncJobs.find(sj => sj.id === syncJobId);

      await base44.entities.DataSource.update(syncJob.data_source_id, {
        last_sync_status: 'failed',
        last_sync_error: error.message
      });
    }
  }

  /**
   * Sync Google Ads data
   */
  async syncGoogleAds(syncJob, dataSource) {
    let recordsSynced = 0;
    let recordsCreated = 0;
    let recordsUpdated = 0;

    // Step 1: Sync account hierarchy
    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: 'Syncing account hierarchy',
      progress_percentage: 10
    });

    const hierarchyResult = await googleAdsService.syncAccountHierarchy(
      dataSource.id,
      dataSource.organization_id
    );
    recordsSynced += hierarchyResult.recordsSynced;

    // Step 2: Fetch and transform metrics
    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: 'Fetching performance metrics',
      progress_percentage: 40
    });

    const accountIds = dataSource.account_ids || [];
    const metricsToSync = ['impressions', 'clicks', 'cost', 'conversions', 'conversion_value'];

    for (const accountId of accountIds) {
      const metricsData = await googleAdsService.fetchMetrics(
        accountId,
        syncJob.date_range.start_date,
        syncJob.date_range.end_date,
        metricsToSync,
        [],
        dataSource.credentials.access_token
      );

      // Transform and store each metric
      for (const metricName of metricsToSync) {
        const transformedData = await base44.functions.invoke('transformData', { // Assuming dataTransformationService is moved to a function
          data: metricsData,
          options: {
            metric_name: metricName,
            time_period: 'daily',
            organization_id: dataSource.organization_id
          }
        });

        recordsCreated += transformedData.data.length;
      }

      recordsSynced += metricsData.length * metricsToSync.length;
    }

    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: 'Completing sync',
      progress_percentage: 90,
      metrics_synced: metricsToSync
    });

    return { recordsSynced, recordsCreated, recordsUpdated };
  }

  /**
   * Sync Google Analytics data
   */
  async syncGoogleAnalytics(syncJob, dataSource) {
    let recordsSynced = 0;
    let recordsCreated = 0;
    let recordsUpdated = 0;

    // Step 1: Sync property hierarchy
    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: 'Syncing property hierarchy',
      progress_percentage: 10
    });

    const hierarchyResult = await googleAnalyticsService.syncPropertyHierarchy(
      dataSource.id,
      dataSource.organization_id
    );
    recordsSynced += hierarchyResult.recordsSynced;

    // Step 2: Fetch and transform metrics
    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: 'Fetching analytics metrics',
      progress_percentage: 40
    });

    const propertyIds = dataSource.property_ids || [];
    const metricsToSync = ['sessions', 'users', 'pageviews', 'conversions', 'total_revenue'];

    for (const propertyId of propertyIds) {
      const metricsData = await googleAnalyticsService.fetchMetrics(
        propertyId,
        syncJob.date_range.start_date,
        syncJob.date_range.end_date,
        metricsToSync,
        [],
        dataSource.credentials.access_token
      );

      // Transform and store
      for (const metricName of metricsToSync) {
        const transformedData = await base44.functions.invoke('transformData', { // Assuming dataTransformationService is moved to a function
          data: metricsData,
          options: {
            metric_name: metricName,
            time_period: 'daily',
            organization_id: dataSource.organization_id
          }
        });

        recordsCreated += transformedData.data.length;
      }

      recordsSynced += metricsData.length * metricsToSync.length;
    }

    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: 'Completing sync',
      progress_percentage: 90,
      metrics_synced: metricsToSync
    });

    return { recordsSynced, recordsCreated, recordsUpdated };
  }

  /**
   * Sync call tracking data - ULTRA OPTIMIZED v4
   * Fixed: Sequential storage with proper error handling
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

    // ⚡ STEP 1: Fetch all accounts in parallel (10% → 50%)
    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: `Fetching ${accountIds.length} account(s) in parallel...`,
      progress_percentage: 10
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
      const currentProgress = 10 + ((index + 1) * progressIncrement);

      await base44.entities.SyncJob.update(syncJob.id, {
        current_step: `Fetched ${index + 1}/${accountIds.length} accounts (${result.data.totalCalls} calls)`,
        progress_percentage: Math.round(currentProgress)
      });

      return {
        accountId,
        metrics: result.data.metrics,
        callCount: result.data.totalCalls
      };
    });

    const accountResults = await Promise.all(accountPromises);

    const totalCalls = accountResults.reduce((sum, r) => sum + r.callCount, 0);
    console.log(`[DataSync] ✅ Fetched ${totalCalls} total calls from ${accountResults.length} accounts`);

    // ⚡ STEP 2: Store metrics (50% → 95%)
    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: 'Storing metrics in database...',
      progress_percentage: 50
    });

    const allMetrics = accountResults.flatMap(r => r.metrics);

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

    // Store each metric type sequentially to avoid overwhelming the database
    for (let metricIndex = 0; metricIndex < metricsToStore.length; metricIndex++) {
      const metricName = metricsToStore[metricIndex];

      console.log(`[DataSync] 💾 [${metricIndex + 1}/${metricsToStore.length}] Storing ${metricName}...`);

      // Store all days for this metric in small batches
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
                account_id: String(accountResults.find(r => r.metrics.includes(dayMetrics))?.accountId || 'unknown')
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

      // Update progress after each metric type
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

  /**
   * Calculate date range based on sync type
   */
  calculateDateRange(dataSource, syncType) {
    const endDate = new Date();
    let startDate;

    switch (syncType) {
      case 'backfill':
        // Backfill based on configured days
        const backfillDays = dataSource.sync_config?.backfill_days || 90;
        startDate = new Date(endDate.getTime() - backfillDays * 24 * 60 * 60 * 1000);
        break;

      case 'incremental':
        // Since last sync
        startDate = dataSource.last_sync_at
          ? new Date(dataSource.last_sync_at)
          : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000); // Default to last 7 days if no previous sync
        break;

      case 'manual':
      case 'scheduled':
      default:
        // Last 7 days by default for manual/scheduled
        startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  }

  /**
   * Calculate next sync time
   */
  calculateNextSync(dataSource) {
    if (!dataSource.sync_config?.schedule) {
      return null;
    }

    const now = new Date();
    let nextSync;

    switch (dataSource.sync_config.schedule) {
      case 'hourly':
        nextSync = new Date(now.getTime() + 60 * 60 * 1000);
        break;
      case 'daily':
        nextSync = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        break;
      default:
        return null;
    }

    return nextSync.toISOString();
  }

  /**
   * Get sync status for data source
   */
  async getSyncStatus(dataSourceId) {
    try {
      const syncJobs = await base44.entities.SyncJob.filter(
        { data_source_id: dataSourceId },
        '-created_date',
        10
      );

      const dataSources = await base44.entities.DataSource.list();
      const dataSource = dataSources.find(ds => ds.id === dataSourceId);

      return {
        data_source: dataSource,
        recent_jobs: syncJobs,
        last_sync_status: dataSource?.last_sync_status,
        next_sync_at: dataSource?.next_sync_at
      };

    } catch (error) {
      environmentConfig.log('error', '[DataSync] Get sync status error:', error);
      throw error;
    }
  }
}

export const dataSyncService = new DataSyncService();
