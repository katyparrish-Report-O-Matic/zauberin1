import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Backend function to sync Call Tracking Metrics data
 * This runs server-side to avoid CORS issues
 */

Deno.serve(async (req) => {
  try {
    // Initialize Base44 client
    const base44 = createClientFromRequest(req);
    
    // Parse request body FIRST (before checking auth)
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

    // Verify user is authenticated
    let user;
    try {
      user = await base44.auth.me();
    } catch (authError) {
      return Response.json({ 
        error: 'Authentication failed',
        details: 'Make sure you are logged in and try again',
        authError: authError.message
      }, { status: 401 });
    }

    if (!user) {
      return Response.json({ 
        error: 'Unauthorized',
        details: 'No authenticated user found. Please log in and try again.'
      }, { status: 401 });
    }

    console.log(`[CTM Backend] Syncing data for user: ${user.email}, account: ${accountId}`);

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
        details: credError.message 
      }, { status: 400 });
    }
    
    // Fetch calls from CTM API
    const baseUrl = 'https://api.calltrackingmetrics.com/api/v1';
    let allCalls = [];
    let currentPage = 1;
    let totalPages = 1;

    console.log(`[CTM Backend] Fetching calls from ${startDate} to ${endDate}...`);

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
      } catch (fetchError) {
        return Response.json({ 
          error: 'Failed to connect to CTM API',
          details: fetchError.message 
        }, { status: 503 });
      }

      if (!response.ok) {
        const errorText = await response.text();
        return Response.json({ 
          success: false,
          error: `CTM API Error`,
          status: response.status,
          details: errorText,
          hint: response.status === 401 
            ? 'Check your API credentials (Access Key:Secret Key or encoded token)' 
            : response.status === 404
            ? 'Account ID not found. Verify the account ID is correct.'
            : 'Check API connection and parameters'
        }, { status: response.status });
      }

      const data = await response.json();
      
      if (data.calls && Array.isArray(data.calls)) {
        allCalls = allCalls.concat(data.calls);
        console.log(`[CTM Backend] Page ${currentPage}: ${data.calls.length} calls`);
      }

      totalPages = data.total_pages || 1;
      currentPage++;

    } while (currentPage <= totalPages && currentPage <= 100); // Safety limit

    console.log(`[CTM Backend] Total calls fetched: ${allCalls.length}`);

    // Aggregate by date
    const metricsByDate = {};

    allCalls.forEach(call => {
      const date = call.start_time ? call.start_time.split('T')[0] : 'unknown';
      
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

    console.log(`[CTM Backend] Sync complete. ${metrics.length} days of data.`);

    return Response.json({
      success: true,
      metrics,
      totalCalls: allCalls.length,
      dateRange: { startDate, endDate },
      summary: {
        total_calls: allCalls.length,
        days_with_data: metrics.length,
        total_pages_fetched: currentPage - 1
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