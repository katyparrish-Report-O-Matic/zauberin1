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
    * Sync call tracking data - FETCH & SAVE IMMEDIATELY
    * Process one account at a time - no bulk memory accumulation
    */
  async syncCallTracking(syncJob, dataSource) {
    const accountIds = dataSource.account_ids || [];
    const apiKey = dataSource.credentials?.api_key || dataSource.credentials?.access_token;
    const organizationId = dataSource.organization_id;
    const dataSourceId = dataSource.id;

    if (accountIds.length === 0) {
      throw new Error('No account IDs configured for Call Tracking sync');
    }

    if (!apiKey) {
      throw new Error('No API credentials found for Call Tracking sync');
    }

    console.log(`[DataSync] 🚀 Syncing ${accountIds.length} account(s) - saving after each fetch`);

    let totalCreated = 0;
    let totalFetched = 0;
    let failedAccounts = [];

    // Process ONE account at a time - fetch then IMMEDIATELY save
    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i];

      try {
        console.log(`[DataSync] 📞 [${i + 1}/${accountIds.length}] Fetching account ${accountId}`);

        // 1. FETCH this account's data
        const result = await base44.functions.invoke('syncCallTrackingData', {
          accountId: String(accountId),
          startDate: syncJob.date_range?.start_date,
          endDate: syncJob.date_range?.end_date,
          apiKey,
          includeRawCalls: true
        });

        if (!result.data?.success) {
          console.log(`[DataSync] ⚠️ Account ${accountId} failed: ${result.data?.error}`);
          failedAccounts.push({ accountId, error: result.data?.error });
          continue;
        }

        const callRecords = result.data.callRecords || [];
        totalFetched += callRecords.length;

        console.log(`[DataSync] 📥 Account ${accountId} returned ${callRecords.length} records`);

        // 2. IMMEDIATELY SAVE this account's records (don't wait for other accounts)
        if (callRecords.length > 0) {
          const recordsToSave = callRecords.map(call => ({
            organization_id: organizationId,
            data_source_id: dataSourceId,
            account_id: String(accountId),
            account_name: result.data.account?.name || String(accountId),
            region: result.data.account?.region || null,
            call_id: String(call.call_id || call.id),
            start_time: call.start_time || call.called_at,
            end_time: call.end_time || null,
            duration: call.duration || 0,
            talk_time: call.talk_time || 0,
            call_status: call.call_status || call.status || 'unknown',
            is_voicemail: call.is_voicemail || false,
            is_working_hours: call.is_working_hours !== false,
            qualified: call.qualified || false,
            sale_status: call.sale_status || null,
            first_time_caller: call.first_time_caller || false,
            caller_number: call.caller_number || null,
            tracking_number: call.tracking_number || null,
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
            sync_date: new Date().toISOString().split('T')[0]
          }));

          try {
            const created = await base44.entities.CallRecord.bulkCreate(recordsToSave);
            const createdCount = Array.isArray(created) ? created.length : 0;
            totalCreated += createdCount;
            console.log(`[DataSync] ✅ Account ${accountId} SAVED ${createdCount} records (total: ${totalCreated})`);
          } catch (saveError) {
            console.error(`[DataSync] ❌ Account ${accountId} SAVE FAILED:`, saveError.message);
            failedAccounts.push({ accountId, error: saveError.message });
          }
        } else {
          console.log(`[DataSync] ⏭️ Account ${accountId} has 0 records - skipping save`);
        }

        // 3. UPDATE PROGRESS after each account
        const progress = Math.round(((i + 1) / accountIds.length) * 100);
        await base44.entities.SyncJob.update(syncJob.id, {
          progress_percentage: progress,
          records_synced: totalFetched,
          records_created: totalCreated,
          current_step: `Processed ${i + 1}/${accountIds.length} accounts`
        });

      } catch (error) {
        console.error(`[DataSync] ❌ Account ${accountId} ERROR:`, error.message);
        failedAccounts.push({ accountId, error: error.message });
      }

      // Small delay to prevent rate limiting
      if (i < accountIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // 4. FINAL STATUS
    console.log(`[DataSync] 🏁 Sync complete: ${totalCreated} records saved from ${accountIds.length} accounts`);
    if (failedAccounts.length > 0) {
      console.log(`[DataSync] ⚠️ ${failedAccounts.length} accounts failed:`, failedAccounts);
    }

    return { recordsSynced: totalFetched, recordsCreated: totalCreated, recordsUpdated: 0 };
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