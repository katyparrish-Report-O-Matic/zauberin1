import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Sync Google Analytics 4 data via GA4 Data API
 * Uses OAuth access token from app connectors
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { propertyId, startDate, endDate } = body;

    if (!propertyId || !startDate || !endDate) {
      return Response.json({ 
        error: 'Missing required parameters',
        required: ['propertyId', 'startDate', 'endDate']
      }, { status: 400 });
    }

    console.log(`[GA4] Syncing property ${propertyId} from ${startDate} to ${endDate}`);

    // Get OAuth access token from app connector
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googleanalytics');
    
    if (!accessToken) {
      return Response.json({
        error: 'Google Analytics not connected',
        hint: 'Please authorize Google Analytics in the app connectors'
      }, { status: 401 });
    }

    // Fetch GA4 metrics using Data API
    const request = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: 'date' },
        { name: 'sessionDefaultChannelGroup' }
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'screenPageViews' },
        { name: 'engagedSessions' },
        { name: 'conversions' },
        { name: 'eventCount' },
        { name: 'totalRevenue' }
      ]
    };

    console.log('[GA4] Fetching metrics...');
    const response = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[GA4] API Error:', error);
      throw new Error(`GA4 API failed: ${error}`);
    }

    const data = await response.json();
    console.log(`[GA4] Received ${data.rows?.length || 0} rows`);

    // Process metrics
    const metrics = (data.rows || []).map(row => {
      const date = row.dimensionValues[0].value;
      const channelGroup = row.dimensionValues[1].value;
      const sessions = parseInt(row.metricValues[0].value) || 0;
      const users = parseInt(row.metricValues[1].value) || 0;
      const newUsers = parseInt(row.metricValues[2].value) || 0;
      const pageviews = parseInt(row.metricValues[3].value) || 0;
      const engagedSessions = parseInt(row.metricValues[4].value) || 0;
      const conversions = parseInt(row.metricValues[5].value) || 0;
      const events = parseInt(row.metricValues[6].value) || 0;
      const revenue = parseFloat(row.metricValues[7].value) || 0;

      return {
        date,
        channel_group: channelGroup,
        sessions,
        users,
        new_users: newUsers,
        pageviews,
        engaged_sessions: engagedSessions,
        conversions,
        events,
        revenue: revenue.toFixed(2),
        engagement_rate: sessions > 0 ? ((engagedSessions / sessions) * 100).toFixed(2) : 0,
        pages_per_session: sessions > 0 ? (pageviews / sessions).toFixed(2) : 0,
        bounce_rate: sessions > 0 ? (((sessions - engagedSessions) / sessions) * 100).toFixed(2) : 0,
        conversion_rate: sessions > 0 ? ((conversions / sessions) * 100).toFixed(2) : 0
      };
    });

    // Aggregate by date
    const metricsByDate = {};
    metrics.forEach(m => {
      if (!metricsByDate[m.date]) {
        metricsByDate[m.date] = {
          date: m.date,
          sessions: 0,
          users: 0,
          new_users: 0,
          pageviews: 0,
          engaged_sessions: 0,
          conversions: 0,
          events: 0,
          revenue: 0
        };
      }
      
      metricsByDate[m.date].sessions += m.sessions;
      metricsByDate[m.date].users += m.users;
      metricsByDate[m.date].new_users += m.new_users;
      metricsByDate[m.date].pageviews += m.pageviews;
      metricsByDate[m.date].engaged_sessions += m.engaged_sessions;
      metricsByDate[m.date].conversions += m.conversions;
      metricsByDate[m.date].events += m.events;
      metricsByDate[m.date].revenue += parseFloat(m.revenue);
    });

    const aggregatedMetrics = Object.values(metricsByDate).map(day => ({
      ...day,
      revenue: day.revenue.toFixed(2),
      engagement_rate: day.sessions > 0 ? ((day.engaged_sessions / day.sessions) * 100).toFixed(2) : 0,
      pages_per_session: day.sessions > 0 ? (day.pageviews / day.sessions).toFixed(2) : 0,
      bounce_rate: day.sessions > 0 ? (((day.sessions - day.engaged_sessions) / day.sessions) * 100).toFixed(2) : 0,
      conversion_rate: day.sessions > 0 ? ((day.conversions / day.sessions) * 100).toFixed(2) : 0
    }));

    aggregatedMetrics.sort((a, b) => a.date.localeCompare(b.date));

    console.log(`[GA4] Processed ${aggregatedMetrics.length} aggregated days`);

    return Response.json({
      success: true,
      property_id: propertyId,
      date_range: { startDate, endDate },
      metrics: aggregatedMetrics,
      metrics_by_channel: metrics,
      summary: {
        total_days: aggregatedMetrics.length,
        total_sessions: aggregatedMetrics.reduce((sum, d) => sum + d.sessions, 0),
        total_conversions: aggregatedMetrics.reduce((sum, d) => sum + d.conversions, 0)
      }
    });

  } catch (error) {
    console.error('[GA4] Error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});