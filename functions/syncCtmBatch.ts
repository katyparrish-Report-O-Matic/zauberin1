import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Sync a BATCH of CTM accounts (NOT all at once)
 * This prevents timeout by processing only 25-50 accounts per call
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { dataSourceId, startIndex = 0, batchSize = 25 } = await req.json();

    if (!dataSourceId) {
      return Response.json({ error: 'dataSourceId required' }, { status: 400 });
    }

    // Fetch DataSource
    const dataSources = await base44.asServiceRole.entities.DataSource.filter({
      id: dataSourceId
    });

    if (!dataSources.length) {
      return Response.json({ error: 'Data source not found' }, { status: 404 });
    }

    const dataSource = dataSources[0];
    const accountIds = dataSource.account_ids || [];
    const apiKey = dataSource.credentials?.api_key;

    if (!apiKey) {
      return Response.json({ error: 'API key not configured' }, { status: 400 });
    }

    // Calculate batch boundaries
    const endIndex = Math.min(startIndex + batchSize, accountIds.length);
    const batchAccountIds = accountIds.slice(startIndex, endIndex);
    const isComplete = endIndex >= accountIds.length;

    console.log(`[CTM Batch] Processing accounts ${startIndex}-${endIndex-1} of ${accountIds.length}`);

    if (batchAccountIds.length === 0) {
      return Response.json({
        success: true,
        processedCount: 0,
        totalSaved: 0,
        nextStartIndex: startIndex,
        isComplete: true
      });
    }

    // Date range
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = dataSource.last_sync_at 
      ? new Date(dataSource.last_sync_at).toISOString().split('T')[0]
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let totalSaved = 0;
    
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

    const baseUrl = 'https://api.calltrackingmetrics.com/api/v1';

    // Get account regions
    const accountHierarchies = await base44.asServiceRole.entities.AccountHierarchy.filter({
      data_source_id: dataSource.id
    });
    const accountRegionMap = {};
    accountHierarchies.forEach(ah => {
      if (ah.external_id && ah.region) {
        accountRegionMap[ah.external_id] = ah.region;
      }
    });

    // Process ONLY this batch of accounts
    for (let i = 0; i < batchAccountIds.length; i++) {
      const accountId = batchAccountIds[i];
      const accountRegion = accountRegionMap[String(accountId)] || null;

      try {
        console.log(`[CTM Batch] [${i+1}/${batchAccountIds.length}] Fetching account ${accountId}`);

        // Fetch account metadata
        let accountName = `Account ${accountId}`;
        try {
          const accountResponse = await fetch(`${baseUrl}/accounts/${accountId}.json`, {
            method: 'GET',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json'
            }
          });
          if (accountResponse.ok) {
            const accountData = await accountResponse.json();
            accountName = accountData.name || accountName;
          }
        } catch (metaError) {
          console.warn(`[CTM Batch] Could not fetch metadata for ${accountId}`);
        }

        // Fetch calls for this account
        let allCalls = [];
        let page = 1;
        const maxPages = 10;

        while (page <= maxPages) {
          const callsUrl = `${baseUrl}/accounts/${accountId}/calls.json?page=${page}&per_page=100&start_date=${startDate}&end_date=${endDate}`;
          
          const callsResponse = await fetch(callsUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json'
            }
          });

          if (!callsResponse.ok) {
            console.warn(`[CTM Batch] Account ${accountId} page ${page} failed: ${callsResponse.status}`);
            break;
          }

          const callsData = await callsResponse.json();
          const calls = callsData.calls || [];
          
          if (calls.length === 0) break;
          
          allCalls = allCalls.concat(calls);
          
          if (calls.length < 100) break;
          page++;
        }

        console.log(`[CTM Batch] Account ${accountId}: ${allCalls.length} calls fetched`);

        // Process and save call records
        if (allCalls.length > 0) {
          const callRecords = allCalls
            .filter(call => call.called_at)
            .map(call => {
              const isVoicemail = call.call_status === 'voicemail' || call.status === 'voicemail';
              const isAnswered = call.talk_time && call.talk_time > 0;
              const isWorkingHours = call.custom_fields?.working_hours === 'Working Hours';

              return {
                organization_id: dataSource.organization_id,
                data_source_id: dataSource.id,
                account_id: String(accountId),
                account_name: accountName,
                region: accountRegion,
                call_id: String(call.id),
                tracking_number: call.tracking_number,
                caller_number: call.caller_number,
                start_time: call.called_at,
                duration: call.duration || 0,
                talk_time: call.talk_time || 0,
                call_status: call.call_status || (isVoicemail ? 'voicemail' : (isAnswered ? 'answered' : 'missed')),
                is_voicemail: isVoicemail,
                is_working_hours: isWorkingHours,
                qualified: call.qualified || false,
                sale_status: call.sale_status,
                first_time_caller: call.is_new_caller || false,
                keypress: call.keypress,
                web_source: call.web_source || call.source,
                web_medium: call.medium,
                web_campaign: call.ga?.campaign,
                web_keyword: call.webvisit?.keywords,
                landing_page: call.webvisit?.location_host && call.webvisit?.location_path 
                  ? `https://${call.webvisit.location_host}${call.webvisit.location_path}` 
                  : call.last_location,
                referrer: call.webvisit?.referrer_host && call.webvisit?.referrer_path
                  ? `https://${call.webvisit.referrer_host}${call.webvisit.referrer_path}`
                  : call.referrer,
                city: call.city,
                state: call.state,
                country: call.country,
                recording_url: call.audio,
                transcription: call.transcription_text,
                tags: call.tag_list || [],
                custom_fields: call.custom_fields || {},
                sync_date: new Date().toISOString().split('T')[0]
              };
            });

          const created = await base44.asServiceRole.entities.CallRecord.bulkCreate(callRecords);
          const savedCount = Array.isArray(created) ? created.length : 0;
          totalSaved += savedCount;
          console.log(`[CTM Batch] Account ${accountId} saved ${savedCount} records`);
        }

        // Update/Create AccountHierarchy
        const existing = await base44.asServiceRole.entities.AccountHierarchy.filter({
          data_source_id: dataSource.id,
          external_id: String(accountId)
        });

        if (existing.length === 0) {
          await base44.asServiceRole.entities.AccountHierarchy.create({
            organization_id: dataSource.organization_id,
            data_source_id: dataSource.id,
            platform_type: 'call_tracking',
            hierarchy_level: 'account',
            external_id: String(accountId),
            name: accountName,
            region: accountRegion,
            status: 'active',
            last_updated: new Date().toISOString()
          });
        } else {
          await base44.asServiceRole.entities.AccountHierarchy.update(existing[0].id, {
            name: accountName,
            region: accountRegion || existing[0].region,
            last_updated: new Date().toISOString()
          });
        }

        // Small delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.error(`[CTM Batch] Account ${accountId} error:`, error.message);
        continue;
      }
    }

    console.log(`[CTM Batch] Batch complete: ${totalSaved} records saved`);

    return Response.json({
      success: true,
      processedCount: batchAccountIds.length,
      totalSaved,
      nextStartIndex: endIndex,
      isComplete,
      batchInfo: {
        startIndex,
        endIndex,
        totalAccounts: accountIds.length
      }
    });

  } catch (error) {
    console.error('[CTM Batch] Error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});