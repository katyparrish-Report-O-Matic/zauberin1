
import { base44 } from "@/api/base44Client";
import { environmentConfig } from "../config/EnvironmentConfig";
import { googleAdsService } from "../integrations/GoogleAdsService";
import { googleAnalyticsService } from "../integrations/GoogleAnalyticsService";
import { dataTransformationService } from "../data/DataTransformationService";

/**
 * Data Synchronization Service - OPTIMIZED
 * Parallel processing for multi-account syncs
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

      // Mark as completed
      await base44.entities.SyncJob.update(syncJobId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        duration_seconds: Math.floor((new Date() - new Date(syncJob.started_at)) / 1000),
        records_synced: result.recordsSynced,
        records_created: result.recordsCreated,
        records_updated: result.recordsUpdated,
        progress_percentage: 100
      });

      // Update data source
      await base44.entities.DataSource.update(dataSource.id, {
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'success',
        total_records_synced: (dataSource.total_records_synced || 0) + result.recordsSynced,
        next_sync_at: this.calculateNextSync(dataSource)
      });

      environmentConfig.log('info', `[DataSync] ✅ Sync ${syncJobId} completed: ${result.recordsSynced} records`);

    } catch (error) {
      environmentConfig.log('error', `[DataSync] ❌ Sync ${syncJobId} failed:`, error);

      await base44.entities.SyncJob.update(syncJobId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message
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
        const transformedData = await dataTransformationService.transformData(
          metricsData,
          {
            metric_name: metricName,
            time_period: 'daily',
            organization_id: dataSource.organization_id
          }
        );

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
        const transformedData = await dataTransformationService.transformData(
          metricsData,
          {
            metric_name: metricName,
            time_period: 'daily',
            organization_id: dataSource.organization_id
          }
        );

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
   * Sync call tracking data - OPTIMIZED with parallel processing
   */
  async syncCallTracking(syncJob, dataSource) {
    let recordsSynced = 0;
    let recordsCreated = 0;
    let recordsUpdated = 0; // Not currently used, but kept for consistency

    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: 'Preparing sync...',
      progress_percentage: 5
    });

    const accountIds = dataSource.account_ids || [];
    
    if (accountIds.length === 0) {
      throw new Error('No account IDs configured');
    }

    const apiKey = dataSource.credentials?.api_key || dataSource.credentials?.access_token;
    
    if (!apiKey) {
      throw new Error('No API credentials found');
    }

    const isAgencyLevel = dataSource.metadata?.access_level === 'agency' || 
                          dataSource.auth_type === 'api_key' ||
                          apiKey.includes(':');

    console.log(`[DataSync] 🚀 Syncing ${accountIds.length} account(s) in parallel for Call Tracking`);

    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: `Fetching data from ${accountIds.length} account(s)...`,
      progress_percentage: 20
    });

    // ⚡ OPTIMIZATION: Process all accounts in parallel
    const accountPromises = accountIds.map(async (accountId, index) => {
      environmentConfig.log('info', `[DataSync] 📞 Account ${index + 1}/${accountIds.length}: ${accountId}`);

      const result = await base44.functions.invoke('syncCallTrackingData', {
        accountId: String(accountId), // Ensure string type for backend function
        startDate: syncJob.date_range.start_date,
        endDate: syncJob.date_range.end_date,
        apiKey,
        isAgencyLevel
      });

      if (!result.data?.success) {
        throw new Error(result.data?.error || `Failed to sync account ${accountId}`);
      }

      return {
        accountId,
        metrics: result.data.metrics,
        callCount: result.data.totalCalls // Assuming totalCalls is returned by the backend function
      };
    });

    // Wait for all accounts to complete
    const accountResults = await Promise.all(accountPromises);
    
    console.log(`[DataSync] ✅ All ${accountResults.length} accounts fetched for Call Tracking`);

    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: 'Processing and storing data...',
      progress_percentage: 70
    });

    // Combine and transform all metrics
    const allMetrics = accountResults.flatMap(r => r.metrics);
    const metricsToSync = ['total_calls', 'answered_calls', 'qualified_calls'];
    
    for (const metricName of metricsToSync) {
      const transformedData = await dataTransformationService.transformData(
        allMetrics,
        {
          metric_name: metricName,
          time_period: 'daily',
          organization_id: dataSource.organization_id
        }
      );

      recordsCreated += transformedData.data.length;
    }

    recordsSynced = accountResults.reduce((sum, r) => sum + (r.callCount || 0), 0); // Sum up total calls from all accounts

    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: 'Sync complete!',
      progress_percentage: 95,
      metrics_synced: metricsToSync
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
