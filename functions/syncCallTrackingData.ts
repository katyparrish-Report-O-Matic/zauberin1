import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Backend function to sync Call Tracking Metrics data
 * OPTIMIZED VERSION: Parallel processing, smart pagination, early aggregation
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

    const { accountId, startDate, endDate, apiKey, isAgencyLevel } = body;

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
    const callsEndpoint = `/accounts/${accountId}/calls.json`;
    
    // ⚡ OPTIMIZATION 1: Fetch first page to get total count
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
    
    // ⚡ OPTIMIZATION 2: Parallel fetch remaining pages (max 5 concurrent)
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

    // ⚡ OPTIMIZATION 3: Stream-based aggregation (aggregate as we go)
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
          qualified_calls: 0,
          total_duration: 0
        };
      }

      metricsByDate[date].total_calls++;
      
      if (call.talk_time && call.talk_time > 0) {
        metricsByDate[date].answered_calls++;
        metricsByDate[date].total_duration += call.talk_time;
      } else {
        metricsByDate[date].missed_calls++;
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

    return Response.json({
      success: true,
      metrics,
      totalCalls: allCalls.length,
      dateRange: { startDate, endDate },
      summary: {
        account_id: accountId,
        total_calls: allCalls.length,
        days_with_data: metrics.length,
        pages_fetched: totalPages,
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