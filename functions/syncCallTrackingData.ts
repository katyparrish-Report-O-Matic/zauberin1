import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Backend function to sync Call Tracking Metrics data
 * This runs server-side to avoid CORS issues
 */

Deno.serve(async (req) => {
  try {
    // Initialize Base44 client
    const base44 = createClientFromRequest(req);
    
    // Verify user is authenticated
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get request body
    const { accountId, startDate, endDate, apiKey } = await req.json();

    if (!accountId || !startDate || !endDate || !apiKey) {
      return Response.json({ 
        error: 'Missing required parameters: accountId, startDate, endDate, apiKey' 
      }, { status: 400 });
    }

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
      
      throw new Error('Invalid credentials format');
    };

    const auth = parseCredentials(apiKey);
    
    // Fetch calls from CTM API
    const baseUrl = 'https://api.calltrackingmetrics.com/api/v1';
    let allCalls = [];
    let currentPage = 1;
    let totalPages = 1;

    do {
      const url = `${baseUrl}/accounts/${accountId}/calls.json?page=${currentPage}&per_page=100&start_date=${startDate}&end_date=${endDate}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        return Response.json({ 
          success: false,
          error: `CTM API Error (${response.status}): ${errorText}` 
        }, { status: response.status });
      }

      const data = await response.json();
      
      if (data.calls && Array.isArray(data.calls)) {
        allCalls = allCalls.concat(data.calls);
      }

      totalPages = data.total_pages || 1;
      currentPage++;

    } while (currentPage <= totalPages);

    // Aggregate by date
    const metricsByDate = {};

    allCalls.forEach(call => {
      const date = call.start_time.split('T')[0];
      
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

    return Response.json({
      success: true,
      metrics,
      totalCalls: allCalls.length,
      dateRange: { startDate, endDate }
    });

  } catch (error) {
    console.error('[CTM Backend] Sync error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});