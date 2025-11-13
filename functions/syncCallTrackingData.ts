import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Backend function to sync Call Tracking Metrics data
 * OPTIMIZED VERSION: Parallel processing, smart pagination, early aggregation
 * RETURNS: Account metadata + aggregated metrics + raw call records
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      return Response.json({ 
        error: 'Invalid JSON in request body',
        details: parseError.message 
      }, { status: 400 });
    }

    const { accountId, startDate, endDate, apiKey, isAgencyLevel, includeRawCalls = false, accountRegion = null } = body;

    if (!accountId || !startDate || !endDate || !apiKey) {
      return Response.json({ 
        error: 'Missing required parameters',
        required: ['accountId', 'startDate', 'endDate', 'apiKey']
      }, { status: 400 });
    }

    console.log(`[CTM Sync] 🚀 Starting sync for account ${accountId} (${startDate} to ${endDate})`);

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
    
    // Parallel fetch remaining pages (max 5 concurrent)
    if (totalPages > 1) {
      const remainingPages = [];
      for (let page = 2; page <= Math.min(totalPages, 100); page++) {
        remainingPages.push(page);
      }

      // Fetch in batches of 5 to avoid rate limiting
      const batchSize = 5;
      for (let i = 0; i < remainingPages.length; i += batchSize) {
        const batch = remainingPages.slice(i, i + batchSize);
        
        console.log(`[CTM Sync] ⚡ Fetching pages ${batch[0]}-${batch[batch.length - 1]}...`);
        
        const promises = batch.map(page => {
          const url = `${baseUrl}${callsEndpoint}?page=${page}&per_page=100&start_date=${startDate}&end_date=${endDate}`;
          return fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json'
            }
          }).then(r => r.ok ? r.json() : null);
        });

        const results = await Promise.all(promises);
        
        results.forEach((data, idx) => {
          if (data?.calls) {
            allCalls.push(...data.calls);
            console.log(`[CTM Sync] ✓ Page ${batch[idx]}: ${data.calls.length} calls`);
          }
        });
      }
    }

    console.log(`[CTM Sync] ✅ Fetched ${allCalls.length} total calls`);

    // ⚡ STEP 3: Aggregate by date for metrics
    const metricsByDate = {};

    allCalls.forEach(call => {
      const date = call.start_time ? call.start_time.split('T')[0] : null;
      
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
      const isVoicemail = call.status === 'voicemail' || call.voicemail === true;
      const isAnswered = call.talk_time && call.talk_time > 0;
      const isWorkingHours = call.during_business_hours === true;
      
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

    // ⚡ STEP 4: Process raw call records (if requested)
    let callRecords = null;
    if (includeRawCalls) {
      console.log(`[CTM Sync] 📞 Processing ${allCalls.length} raw call records...`);
      
      callRecords = allCalls.map(call => {
        const isVoicemail = call.status === 'voicemail' || call.voicemail === true;
        const isAnswered = call.talk_time && call.talk_time > 0;
        const isWorkingHours = call.during_business_hours === true;
        
        return {
          call_id: String(call.id),
          tracking_number: call.tracking_number,
          caller_number: call.caller_number,
          start_time: call.start_time,
          end_time: call.end_time,
          duration: call.duration || 0,
          talk_time: call.talk_time || 0,
          call_status: isVoicemail ? 'voicemail' : (isAnswered ? 'answered' : 'missed'),
          is_voicemail: isVoicemail,
          is_working_hours: isWorkingHours,
          qualified: call.qualified || false,
          sale_status: call.sale_status,
          first_time_caller: call.first_time_caller || false,
          keypress: call.keypress,
          
          // Web attribution fields - CORRECTED MAPPING
          web_source: call.tracking_source,
          web_medium: call.tracking_medium,
          web_campaign: call.utm_campaign,
          web_campaign_id: call.utm_campaign_id,
          web_keyword: call.keyword,
          web_visit_keywords: call.keywords,
          web_ad_group_id: call.gclid_ad_group_id,
          web_adgroup_id: call.gclid_adgroup_id,
          web_creative_id: call.gclid_creative_id,
          web_ad_network: call.gclid_network,
          web_ad_match_type: call.gclid_match_type,
          web_ad_slot: call.gclid_slot,
          web_ad_slot_position: call.gclid_slot_position,
          web_ad_targeting_type: call.gclid_targeting_type,
          
          // Additional fields
          landing_page: call.landing_page_url,
          referrer: call.referrer,
          city: call.city,
          state: call.state,
          country: call.country,
          recording_url: call.recording,
          transcription: call.transcription,
          tags: call.tags || [],
          custom_fields: call.custom_source_data || {},
          
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
        date_range: `${startDate} to ${endDate}`
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