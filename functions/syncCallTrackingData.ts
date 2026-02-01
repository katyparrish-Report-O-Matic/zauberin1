import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Backend function to sync Call Tracking Metrics data
 * OPTIMIZED VERSION: Parallel processing, smart pagination, early aggregation
 * RETURNS: Account metadata + aggregated metrics + raw call records
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      return Response.json({ 
        error: 'Invalid JSON in request body',
        details: parseError.message 
      }, { status: 400 });
    }

    const { accountId, dataSourceId, endDate, apiKey, isAgencyLevel, includeRawCalls = false, accountRegion = null } = body;
    let { startDate } = body;

    if (!accountId || !endDate || !apiKey) {
      return Response.json({ 
        error: 'Missing required parameters',
        required: ['accountId', 'endDate', 'apiKey']
      }, { status: 400 });
    }

    // Fetch DataSource to check for incremental sync
    let dataSource = null;
    let syncType = 'full';
    
    if (dataSourceId) {
      const dataSources = await base44.asServiceRole.entities.DataSource.filter({
        id: dataSourceId
      });
      dataSource = dataSources[0];
      
      // If no startDate provided and we have a last_sync_at, use incremental sync
      if (!startDate && dataSource?.last_sync_at) {
        startDate = new Date(dataSource.last_sync_at).toISOString().split('T')[0];
        syncType = 'incremental';
        console.log(`[CTM Sync] 📅 Using incremental sync from ${startDate}`);
      }
    }

    if (!startDate) {
      return Response.json({ 
        error: 'startDate required (or provide dataSourceId for incremental sync)',
        details: 'Either specify startDate or provide a dataSourceId with last_sync_at'
      }, { status: 400 });
    }

    console.log(`[CTM Sync] 🚀 Starting ${syncType} sync for account ${accountId} (${startDate} to ${endDate})`);

    // Parse credentials
    const parseCredentials = (token) => {
      if (token && token.length > 40 && !token.includes(':')) {
        return token;
      }
      if (token && token.includes(':')) {
        const [access, secret] = token.split(':');
        const encoder = new TextEncoder();
        const data = encoder.encode(`${access}:${secret}`);
        return btoa(String.fromCharCode(...data));
      }
      throw new Error('Invalid credentials format');
    };

    let auth;
    try {
      auth = parseCredentials(apiKey);
    } catch (credError) {
      return Response.json({ 
        error: 'Invalid API credentials format',
        details: credError.message
      }, { status: 400 });
    }
    
    const baseUrl = 'https://api.calltrackingmetrics.com/api/v1';
    
    // ⚡ STEP 1: Fetch account metadata
    console.log(`[CTM Sync] 📋 Fetching account metadata for ${accountId}...`);
    const accountUrl = `${baseUrl}/accounts/${accountId}.json`;
    
    let accountMetadata = { id: accountId, name: `Account ${accountId}`, status: 'active', region: accountRegion };
    
    try {
      const accountResponse = await fetch(accountUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (accountResponse.ok) {
        const accountData = await accountResponse.json();
        accountMetadata = {
          id: String(accountData.id || accountId),
          name: accountData.name || `Account ${accountId}`,
          status: accountData.status || 'active',
          timezone: accountData.timezone,
          country: accountData.country,
          region: accountRegion || accountData.region || null
        };
        console.log(`[CTM Sync] ✓ Found account: ${accountMetadata.name} (Region: ${accountMetadata.region || 'None'})`);
      } else {
        console.warn(`[CTM Sync] ⚠️ Could not fetch account metadata (${accountResponse.status}), using defaults`);
      }
    } catch (metadataError) {
      console.warn(`[CTM Sync] ⚠️ Account metadata fetch failed, using defaults:`, metadataError.message);
    }
    
    // ⚡ STEP 2: Fetch calls data
    const callsEndpoint = `/accounts/${accountId}/calls.json`;
    
    // Fetch first page to get total count
    const firstPageUrl = `${baseUrl}${callsEndpoint}?page=1&per_page=100&start_date=${startDate}&end_date=${endDate}`;
    
    let firstResponse;
    try {
      firstResponse = await fetch(firstPageUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (fetchError) {
      return Response.json({ 
        error: 'Failed to connect to CTM API',
        details: fetchError.message
      }, { status: 503 });
    }

    if (!firstResponse.ok) {
      const errorText = await firstResponse.text();
      console.error(`[CTM Sync] ❌ API Error ${firstResponse.status}:`, errorText);
      
      let hint = 'Check API connection';
      if (firstResponse.status === 401) {
        hint = 'Invalid API credentials';
      } else if (firstResponse.status === 404) {
        hint = `Account ID "${accountId}" not found`;
      }
      
      return Response.json({ 
        success: false,
        error: `CTM API Error`,
        status: firstResponse.status,
        details: errorText,
        hint
      }, { status: firstResponse.status });
    }

    const firstPage = await firstResponse.json();
    const totalPages = firstPage.total_pages || 1;
    const totalEntries = firstPage.total_entries || 0;
    
    console.log(`[CTM Sync] 📊 Total: ${totalEntries} calls across ${totalPages} pages`);

    // Initialize with first page
    const allCalls = firstPage.calls || [];
    
    // Sequential fetch remaining pages (simple and reliable)
    if (totalPages > 1) {
      const maxPages = Math.min(totalPages, 100);
      for (let page = 2; page <= maxPages; page++) {
        console.log(`[CTM Sync] 📄 Fetching page ${page}/${maxPages}...`);
        
        const url = `${baseUrl}${callsEndpoint}?page=${page}&per_page=100&start_date=${startDate}&end_date=${endDate}`;
        
        try {
          const pageResponse = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (pageResponse.ok) {
            const pageData = await pageResponse.json();
            if (pageData?.calls && pageData.calls.length > 0) {
              allCalls.push(...pageData.calls);
              console.log(`[CTM Sync] ✓ Page ${page}: ${pageData.calls.length} calls`);
            } else {
              console.log(`[CTM Sync] ⚠️ Page ${page}: No calls found, stopping pagination`);
              break;
            }
          } else {
            console.warn(`[CTM Sync] ⚠️ Page ${page} failed (${pageResponse.status}), continuing...`);
          }
        } catch (pageError) {
          console.warn(`[CTM Sync] ⚠️ Page ${page} error: ${pageError.message}, continuing...`);
        }
      }
    }

    console.log(`[CTM Sync] ✅ Fetched ${allCalls.length} total calls`);

    // ⚡ STEP 3: Aggregate by date for metrics
    const metricsByDate = {};

    allCalls.forEach(call => {
      const date = call.called_at ? call.called_at.split(' ')[0] : null;
      
      if (!date) return;
      
      if (!metricsByDate[date]) {
        metricsByDate[date] = {
          date,
          total_calls: 0,
          answered_calls: 0,
          missed_calls: 0,
          voicemail_calls: 0,
          qualified_calls: 0,
          working_hours_calls: 0,
          after_hours_calls: 0,
          total_duration: 0
        };
      }

      metricsByDate[date].total_calls++;
      
      // Determine call status
      const isVoicemail = call.call_status === 'voicemail' || call.status === 'voicemail';
      const isAnswered = call.talk_time && call.talk_time > 0;
      const isWorkingHours = call.custom_fields?.working_hours === 'Working Hours';
      
      if (isVoicemail) {
        metricsByDate[date].voicemail_calls++;
      } else if (isAnswered) {
        metricsByDate[date].answered_calls++;
        metricsByDate[date].total_duration += call.talk_time;
      } else {
        metricsByDate[date].missed_calls++;
      }

      if (isWorkingHours) {
        metricsByDate[date].working_hours_calls++;
      } else {
        metricsByDate[date].after_hours_calls++;
      }

      if (call.sale_status === 'qualified' || call.qualified === true) {
        metricsByDate[date].qualified_calls++;
      }
    });

    // Calculate derived metrics
    const metrics = Object.values(metricsByDate).map(day => ({
      ...day,
      average_duration: day.answered_calls > 0 
        ? Math.round(day.total_duration / day.answered_calls) 
        : 0,
      answer_rate: day.total_calls > 0 
        ? Math.round((day.answered_calls / day.total_calls) * 100) 
        : 0
    }));

    // Sort by date
    metrics.sort((a, b) => new Date(a.date) - new Date(b.date));

    console.log(`[CTM Sync] ✅ Aggregated into ${metrics.length} days`);

    // Update last_sync_at timestamp
    const now = new Date().toISOString();
    if (dataSource) {
      await base44.asServiceRole.entities.DataSource.update(dataSource.id, {
        last_sync_at: now,
        last_sync_status: 'success',
        total_records_synced: (dataSource.total_records_synced || 0) + allCalls.length
      });
      console.log(`[CTM Sync] ✓ Updated last_sync_at to ${now}`);
    }

    // ⚡ STEP 4: Process raw call records (if requested)
    let callRecords = null;
    if (includeRawCalls) {
      console.log(`[CTM Sync] 📞 Processing ${allCalls.length} raw call records...`);
      
      // FILTER OUT calls without called_at (required field)
      const validCalls = allCalls.filter(call => call.called_at);
      
      if (validCalls.length < allCalls.length) {
        console.warn(`[CTM Sync] ⚠️ Filtered out ${allCalls.length - validCalls.length} calls without called_at`);
      }
      
      callRecords = validCalls.map(call => {
        const isVoicemail = call.call_status === 'voicemail' || call.status === 'voicemail';
        const isAnswered = call.talk_time && call.talk_time > 0;
        const isWorkingHours = call.custom_fields?.working_hours === 'Working Hours';

        return {
          call_id: String(call.id),
          tracking_number: call.tracking_number,
          caller_number: call.caller_number,
          start_time: call.called_at,
          end_time: null,
          duration: call.duration || 0,
          talk_time: call.talk_time || 0,
          call_status: call.call_status || (isVoicemail ? 'voicemail' : (isAnswered ? 'answered' : 'missed')),
          is_voicemail: isVoicemail,
          is_working_hours: isWorkingHours,
          qualified: call.qualified || false,
          sale_status: call.sale_status,
          first_time_caller: call.is_new_caller || false,
          keypress: call.keypress,

          // Web attribution fields - from actual API
          web_source: call.web_source || call.source,
          web_medium: call.medium,
          web_campaign: call.ga?.campaign,
          web_campaign_id: null,
          web_keyword: call.webvisit?.keywords,
          web_visit_keywords: call.webvisit?.keywords,
          web_ad_group_id: null,
          web_adgroup_id: null,
          web_creative_id: null,
          web_ad_network: null,
          web_ad_match_type: null,
          web_ad_slot: null,
          web_ad_slot_position: null,
          web_ad_targeting_type: null,

          // Additional fields
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
      
      console.log(`[CTM Sync] ✓ Processed ${callRecords.length} call records`);
    }

    return Response.json({
      success: true,
      account: accountMetadata,
      metrics,
      callRecords,
      totalCalls: allCalls.length,
      dateRange: { startDate, endDate },
      summary: {
        account_id: accountId,
        account_name: accountMetadata.name,
        region: accountMetadata.region,
        total_calls: allCalls.length,
        days_with_data: metrics.length,
        pages_fetched: totalPages,
        call_records_included: includeRawCalls,
        date_range: `${startDate} to ${endDate}`,
        sync_type: syncType,
        last_sync_at: dataSource?.last_sync_at || null
      }
    });

  } catch (error) {
    console.error('[CTM Sync] ❌ Error:', error);
    return Response.json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});