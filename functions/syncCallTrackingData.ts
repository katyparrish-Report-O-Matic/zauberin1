import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Backend function to sync Call Tracking Metrics data
 * This runs server-side to avoid CORS issues
 * Called by DataSyncService - uses service role, no user auth required
 */

Deno.serve(async (req) => {
  try {
    // Initialize Base44 client
    const base44 = createClientFromRequest(req);
    
    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      return Response.json({ 
        error: 'Invalid JSON in request body',
        details: parseError.message 
      }, { status: 400 });
    }

    const { accountId, startDate, endDate, apiKey } = body;

    // Validate required parameters
    if (!accountId || !startDate || !endDate || !apiKey) {
      return Response.json({ 
        error: 'Missing required parameters',
        required: ['accountId', 'startDate', 'endDate', 'apiKey'],
        received: { 
          accountId: !!accountId, 
          startDate: !!startDate, 
          endDate: !!endDate, 
          apiKey: !!apiKey 
        }
      }, { status: 400 });
    }

    console.log(`[CTM Backend] Syncing call data for account: ${accountId} from ${startDate} to ${endDate}`);

    // Parse credentials - support multiple formats
    const parseCredentials = (token) => {
      // Already encoded Basic Token (length > 40, no colons)
      if (token && token.length > 40 && !token.includes(':')) {
        return token;
      }
      
      // Access Key + Secret Key with colon
      if (token && token.includes(':')) {
        const [access, secret] = token.split(':');
        const encoder = new TextEncoder();
        const data = encoder.encode(`${access}:${secret}`);
        return btoa(String.fromCharCode(...data));
      }
      
      throw new Error('Invalid credentials format. Use either: encoded token or "accessKey:secretKey"');
    };

    let auth;
    try {
      auth = parseCredentials(apiKey);
    } catch (credError) {
      return Response.json({ 
        error: 'Invalid API credentials format',
        details: credError.message,
        hint: 'Use format: "accessKey:secretKey" or pre-encoded token'
      }, { status: 400 });
    }
    
    // Fetch calls from CTM API
    const baseUrl = 'https://api.calltrackingmetrics.com/api/v1';
    let allCalls = [];
    let currentPage = 1;
    let totalPages = 1;
    let apiCallsMade = 0;

    console.log(`[CTM Backend] Fetching calls from CTM API...`);

    do {
      const url = `${baseUrl}/accounts/${accountId}/calls.json?page=${currentPage}&per_page=100&start_date=${startDate}&end_date=${endDate}`;
      
      let response;
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          }
        });
        apiCallsMade++;
      } catch (fetchError) {
        console.error(`[CTM Backend] Fetch error:`, fetchError);
        return Response.json({ 
          error: 'Failed to connect to CTM API',
          details: fetchError.message,
          hint: 'Check your internet connection and CTM API status'
        }, { status: 503 });
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CTM Backend] API Error ${response.status}:`, errorText);
        
        return Response.json({ 
          success: false,
          error: `CTM API Error`,
          status: response.status,
          details: errorText,
          hint: response.status === 401 
            ? 'Invalid API credentials. Check your Access Key and Secret Key in Data Sources.' 
            : response.status === 404
            ? `Account ID "${accountId}" not found. Verify the account ID in Data Sources.`
            : response.status === 429
            ? 'Rate limit exceeded. Wait a moment and try again.'
            : 'Check API connection and parameters'
        }, { status: response.status });
      }

      const data = await response.json();
      
      if (data.calls && Array.isArray(data.calls)) {
        allCalls = allCalls.concat(data.calls);
        console.log(`[CTM Backend] Page ${currentPage}/${data.total_pages || 1}: ${data.calls.length} calls fetched`);
      } else {
        console.warn(`[CTM Backend] No calls array in response for page ${currentPage}`);
      }

      totalPages = data.total_pages || 1;
      currentPage++;

    } while (currentPage <= totalPages && currentPage <= 100); // Safety limit: max 100 pages

    console.log(`[CTM Backend] ✅ Fetch complete. Total calls: ${allCalls.length}, API calls: ${apiCallsMade}`);

    // Aggregate by date
    const metricsByDate = {};

    allCalls.forEach(call => {
      // Extract date from start_time
      const date = call.start_time ? call.start_time.split('T')[0] : null;
      
      if (!date) {
        console.warn(`[CTM Backend] Call ${call.id} missing start_time`);
        return;
      }
      
      if (!metricsByDate[date]) {
        metricsByDate[date] = {
          date,
          total_calls: 0,
          answered_calls: 0,
          missed_calls: 0,
          qualified_calls: 0,
          total_duration: 0,
          call_ids: []
        };
      }

      metricsByDate[date].total_calls++;
      metricsByDate[date].call_ids.push(call.id);
      
      // Check if call was answered (talk_time > 0)
      if (call.talk_time && call.talk_time > 0) {
        metricsByDate[date].answered_calls++;
        metricsByDate[date].total_duration += call.talk_time;
      } else {
        metricsByDate[date].missed_calls++;
      }

      // Check if call was qualified
      if (call.sale_status === 'qualified' || call.qualified === true) {
        metricsByDate[date].qualified_calls++;
      }
    });

    // Convert to array and calculate averages
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

    console.log(`[CTM Backend] ✅ Aggregation complete. ${metrics.length} days of data.`);

    return Response.json({
      success: true,
      metrics,
      totalCalls: allCalls.length,
      dateRange: { startDate, endDate },
      summary: {
        account_id: accountId,
        total_calls: allCalls.length,
        days_with_data: metrics.length,
        total_pages_fetched: currentPage - 1,
        api_calls_made: apiCallsMade,
        date_range: `${startDate} to ${endDate}`
      }
    });

  } catch (error) {
    console.error('[CTM Backend] Unexpected error:', error);
    return Response.json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});