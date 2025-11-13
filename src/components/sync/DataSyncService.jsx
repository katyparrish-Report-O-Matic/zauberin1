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
   * Sync call tracking data - SIMPLIFIED - Store calls directly without existence check
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

    console.log(`[DataSync] 🚀 Processing ${accountIds.length} account(s) - syncing metrics + raw calls`);

    // ⚡ STEP 1: Fetch all accounts in parallel (0% → 40%)
    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: `Fetching ${accountIds.length} account(s) with full call data...`,
      progress_percentage: 5
    });

    // Get account hierarchy records to get region info
    const accountHierarchies = await base44.entities.AccountHierarchy.filter({
      data_source_id: dataSource.id
    });

    const accountRegionMap = {};
    accountHierarchies.forEach(ah => {
      if (ah.external_id && ah.region) {
        accountRegionMap[ah.external_id] = ah.region;
      }
    });

    const accountPromises = accountIds.map(async (accountId, index) => {
      const accountRegion = accountRegionMap[String(accountId)] || null;
      console.log(`[DataSync] 📞 [${index + 1}/${accountIds.length}] Fetching account ${accountId} (Region: ${accountRegion || 'None'})`);

      const result = await base44.functions.invoke('syncCallTrackingData', {
        accountId: String(accountId),
        startDate: syncJob.date_range.start_date,
        endDate: syncJob.date_range.end_date,
        apiKey,
        isAgencyLevel,
        includeRawCalls: true,
        accountRegion
      });

      if (!result.data?.success) {
        throw new Error(result.data?.error || `Account ${accountId} failed`);
      }

      const progressIncrement = 35 / accountIds.length;
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
        callRecords: result.data.callRecords || [],
        callCount: result.data.totalCalls
      };
    });

    const accountResults = await Promise.all(accountPromises);

    const totalCalls = accountResults.reduce((sum, r) => sum + r.callCount, 0);
    console.log(`[DataSync] ✅ Fetched ${totalCalls} total calls from ${accountResults.length} accounts`);

    // ⚡ STEP 2: Create/Update AccountHierarchy (40% → 45%)
    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: `Creating account hierarchy for ${accountResults.length} accounts...`,
      progress_percentage: 40
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
            region: accountResult.accountMetadata.region,
            status: accountResult.accountMetadata.status || 'active',
            metadata: {
              synced_at: new Date().toISOString(),
              timezone: accountResult.accountMetadata.timezone,
              country: accountResult.accountMetadata.country
            },
            last_updated: new Date().toISOString()
          });
          console.log(`[DataSync] ✓ Created AccountHierarchy: ${accountResult.accountName} (Region: ${accountResult.accountMetadata.region || 'None'})`);
        } else {
          await base44.entities.AccountHierarchy.update(existing[0].id, {
            name: accountResult.accountName,
            region: accountResult.accountMetadata.region || existing[0].region,
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
        console.error(`[DataSync] ⚠️ Failed AccountHierarchy for ${accountResult.accountId}:`, error.message);
      }
    }

    // ⚡ STEP 3: Store raw call records using bulkCreate (45% → 70%)
    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: 'Preparing call records for bulk storage...',
      progress_percentage: 45
    });

    const allCallRecords = accountResults.flatMap(r => 
      r.callRecords.map(call => ({
        organization_id: dataSource.organization_id,
        data_source_id: dataSource.id,
        account_id: r.accountId,
        account_name: r.accountName,
        region: r.accountMetadata.region || null,
        call_id: call.call_id,
        tracking_number: call.tracking_number || null,
        caller_number: call.caller_number || null,
        start_time: call.start_time,
        end_time: call.end_time || null,
        duration: call.duration || 0,
        talk_time: call.talk_time || 0,
        call_status: call.call_status || 'unknown',
        is_voicemail: call.is_voicemail || false,
        is_working_hours: call.is_working_hours !== false,
        qualified: call.qualified || false,
        sale_status: call.sale_status || null,
        first_time_caller: call.first_time_caller || false,
        keypress: call.keypress || null,
        web_source: call.web_source || null,
        web_medium: call.web_medium || null,
        web_campaign: call.web_campaign || null,
        web_campaign_id: call.web_campaign_id || null,
        web_keyword: call.web_keyword || null,
        web_visit_keywords: call.web_visit_keywords || null,
        web_ad_group_id: call.web_ad_group_id || null,
        web_adgroup_id: call.web_adgroup_id || null,
        web_creative_id: call.web_creative_id || null,
        web_ad_network: call.web_ad_network || null,
        web_ad_match_type: call.web_ad_match_type || null,
        web_ad_slot: call.web_ad_slot || null,
        web_ad_slot_position: call.web_ad_slot_position || null,
        web_ad_targeting_type: call.web_ad_targeting_type || null,
        landing_page: call.landing_page || null,
        referrer: call.referrer || null,
        city: call.city || null,
        state: call.state || null,
        country: call.country || null,
        recording_url: call.recording_url || null,
        transcription: call.transcription || null,
        tags: call.tags || [],
        custom_fields: call.custom_fields || {},
        sync_date: call.sync_date
      }))
    );

    console.log(`[DataSync] 💾 Storing ${allCallRecords.length} call records using bulkCreate...`);

    if (allCallRecords.length > 0) {
      try {
        await base44.entities.SyncJob.update(syncJob.id, {
          current_step: `Bulk creating ${allCallRecords.length} call records...`,
          progress_percentage: 50
        });

        // Use bulkCreate to insert all at once
        await base44.entities.CallRecord.bulkCreate(allCallRecords);
        
        recordsCreated = allCallRecords.length;
        console.log(`[DataSync] ✅ Successfully created ${recordsCreated} call records`);

        await base44.entities.SyncJob.update(syncJob.id, {
          current_step: `Stored ${recordsCreated} call records`,
          progress_percentage: 70
        });
      } catch (error) {
        console.error(`[DataSync] ❌ Bulk create failed:`, error);
        throw new Error(`Failed to store call records: ${error.message}`);
      }
    }

    // ⚡ STEP 4: Store aggregated metrics (70% → 95%)
    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: 'Storing aggregated metrics...',
      progress_percentage: 70
    });

    const allMetrics = accountResults.flatMap(r => 
      r.metrics.map(m => ({
        ...m,
        accountId: r.accountId,
        accountName: r.accountName,
        region: r.accountMetadata.region
      }))
    );

    console.log(`[DataSync] 💾 Processing ${allMetrics.length} days of aggregated data`);

    const metricsToStore = [
      'total_calls',
      'answered_calls',
      'missed_calls',
      'voicemail_calls',
      'qualified_calls',
      'working_hours_calls',
      'after_hours_calls',
      'average_duration',
      'answer_rate'
    ];

    let totalMetricsCreated = 0;

    for (let metricIndex = 0; metricIndex < metricsToStore.length; metricIndex++) {
      const metricName = metricsToStore[metricIndex];

      const metricRecords = allMetrics
        .filter(m => m[metricName] !== undefined && m[metricName] !== null)
        .map(dayMetrics => ({
          metric_name: metricName,
          time_period: 'daily',
          period_start: dayMetrics.date + 'T00:00:00.000Z',
          period_end: dayMetrics.date + 'T23:59:59.999Z',
          raw_value: dayMetrics[metricName],
          aggregated_value: dayMetrics[metricName],
          segment: {
            platform: 'call_tracking',
            data_source_id: dataSource.id,
            account_id: dayMetrics.accountId,
            account_name: dayMetrics.accountName,
            region: dayMetrics.region
          },
          derived_metrics: {
            growth_rate: 0,
            moving_average: dayMetrics[metricName],
            percent_of_total: 0
          },
          data_quality_score: 100
        }));

      if (metricRecords.length > 0) {
        try {
          await base44.entities.TransformedMetric.bulkCreate(metricRecords);
          totalMetricsCreated += metricRecords.length;
        } catch (error) {
          console.error(`[DataSync] ⚠️ Failed to store ${metricName}:`, error.message);
        }
      }

      const progressIncrement = 25 / metricsToStore.length;
      await base44.entities.SyncJob.update(syncJob.id, {
        current_step: `Stored ${metricIndex + 1}/${metricsToStore.length} metric types (${totalMetricsCreated} records)`,
        progress_percentage: Math.round(70 + ((metricIndex + 1) * progressIncrement))
      });
    }

    recordsSynced = totalCalls;

    console.log(`[DataSync] ✅ Complete: ${recordsCreated} calls + ${totalMetricsCreated} metrics`);

    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: `✅ Sync complete (${recordsCreated} calls, ${totalMetricsCreated} metrics)`,
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