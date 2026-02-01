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
   * SIMPLIFIED: Sync call tracking data - Store CallRecords ONLY
   * Reports will aggregate on-demand from CallRecords
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

    console.log(`[DataSync] 🚀 Syncing ${accountIds.length} account(s) - storing raw call records only`);

    // STEP 1: Fetch all accounts in parallel (0% → 50%)
    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: `Fetching ${accountIds.length} account(s) with call data...`,
      progress_percentage: 10
    });

    // Get account hierarchy records for region info
    const accountHierarchies = await base44.entities.AccountHierarchy.filter({
      data_source_id: dataSource.id
    });

    const accountRegionMap = {};
    accountHierarchies.forEach(ah => {
      if (ah.external_id && ah.region) {
        accountRegionMap[ah.external_id] = ah.region;
      }
    });

    // Process accounts SEQUENTIALLY with rate limiting (not in parallel)
    const accountResults = [];
    const ACCOUNT_DELAY = 200; // 200ms between account syncs to avoid base44 rate limits

    for (let index = 0; index < accountIds.length; index++) {
      const accountId = accountIds[index];
      const accountRegion = accountRegionMap[String(accountId)] || null;
      
      // Rate limit between accounts
      if (index > 0) {
        await new Promise(resolve => setTimeout(resolve, ACCOUNT_DELAY));
      }

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

      const progressIncrement = 30 / accountIds.length;
      const currentProgress = 10 + ((index + 1) * progressIncrement);

      await base44.entities.SyncJob.update(syncJob.id, {
        current_step: `Fetched ${index + 1}/${accountIds.length}: ${result.data.account.name} (${result.data.totalCalls} calls)`,
        progress_percentage: Math.round(currentProgress)
      });

      accountResults.push({
        accountId: String(accountId),
        accountName: result.data.account.name,
        accountMetadata: result.data.account,
        callRecords: result.data.callRecords || [],
        callCount: result.data.totalCalls
      });
    }

    const totalCalls = accountResults.reduce((sum, r) => sum + r.callCount, 0);
    console.log(`[DataSync] ✅ Fetched ${totalCalls} total calls from ${accountResults.length} accounts`);

    // STEP 2: Update AccountHierarchy (40% → 50%)
    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: `Updating account hierarchy...`,
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
          console.log(`[DataSync] ✓ Created AccountHierarchy: ${accountResult.accountName}`);
        } else {
          await base44.entities.AccountHierarchy.update(existing[0].id, {
            name: accountResult.accountName,
            region: accountResult.accountMetadata.region || existing[0].region,
            status: accountResult.accountMetadata.status || 'active',
            last_updated: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error(`[DataSync] ⚠️ AccountHierarchy update failed for ${accountResult.accountId}:`, error.message);
      }
    }

    // STEP 3: Store CallRecords ONLY (50% → 100%)
    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: 'Preparing call records for storage...',
      progress_percentage: 50
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

    console.log(`[DataSync] 💾 Attempting to store ${allCallRecords.length} call records...`);

    if (allCallRecords.length === 0) {
      console.warn('[DataSync] ⚠️ No call records to store!');
      return { recordsSynced: 0, recordsCreated: 0, recordsUpdated: 0 };
    }

    // Log a sample record for debugging
    console.log(`[DataSync] 📋 Sample record to be created:`, JSON.stringify(allCallRecords[0], null, 2));

    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: `Bulk creating ${allCallRecords.length} call records...`,
      progress_percentage: 60
    });

    // CRITICAL: Actually call bulkCreate and validate the result
    console.log(`[DataSync] 🔄 Calling bulkCreate for ${allCallRecords.length} records...`);
    
    const createdRecords = await base44.entities.CallRecord.bulkCreate(allCallRecords);
    
    console.log(`[DataSync] 📊 bulkCreate returned:`, {
      inputCount: allCallRecords.length,
      outputCount: createdRecords?.length || 0,
      isArray: Array.isArray(createdRecords),
      type: typeof createdRecords
    });

    // VALIDATION: Ensure records were actually created
    if (!createdRecords || !Array.isArray(createdRecords) || createdRecords.length === 0) {
      throw new Error(
        `bulkCreate failed: Expected ${allCallRecords.length} records but got ${createdRecords?.length || 0}. ` +
        `Result type: ${typeof createdRecords}, isArray: ${Array.isArray(createdRecords)}`
      );
    }

    recordsCreated = createdRecords.length;
    recordsSynced = totalCalls;

    console.log(`[DataSync] ✅ Successfully stored ${recordsCreated} call records`);

    // VERIFY: Double-check by querying the database
    const verifyCount = await base44.entities.CallRecord.filter({
      data_source_id: dataSource.id,
      sync_date: allCallRecords[0].sync_date
    });

    console.log(`[DataSync] 🔍 Verification: Found ${verifyCount.length} records in database for this sync`);

    if (verifyCount.length === 0) {
      throw new Error(`Verification failed: Records not found in database after bulkCreate!`);
    }

    await base44.entities.SyncJob.update(syncJob.id, {
      current_step: `✅ Sync complete - ${recordsCreated} call records stored and verified`,
      progress_percentage: 90
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