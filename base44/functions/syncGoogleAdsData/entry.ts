import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Sync Google Ads data via Google Ads API
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
    const { customerId, startDate, endDate } = body;

    if (!customerId || !startDate || !endDate) {
      return Response.json({ 
        error: 'Missing required parameters',
        required: ['customerId', 'startDate', 'endDate']
      }, { status: 400 });
    }

    console.log(`[Google Ads] Syncing customer ${customerId} from ${startDate} to ${endDate}`);

    // Get OAuth access token from app connector
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googleads');
    
    if (!accessToken) {
      return Response.json({
        error: 'Google Ads not connected',
        hint: 'Please authorize Google Ads in the app connectors'
      }, { status: 401 });
    }

    // Fetch campaigns
    console.log('[Google Ads] Fetching campaigns...');
    const campaignsQuery = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign_budget.amount_micros
      FROM campaign
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    `;

    const campaignsResponse = await fetch(
      `https://googleads.googleapis.com/v15/customers/${customerId}/googleAds:searchStream`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'developer-token': Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN') || 'test-token'
        },
        body: JSON.stringify({ query: campaignsQuery })
      }
    );

    if (!campaignsResponse.ok) {
      const error = await campaignsResponse.text();
      throw new Error(`Campaign fetch failed: ${error}`);
    }

    const campaignsData = await campaignsResponse.json();
    const campaigns = campaignsData.results || [];

    console.log(`[Google Ads] Found ${campaigns.length} campaigns`);

    // Fetch performance metrics
    console.log('[Google Ads] Fetching performance metrics...');
    const metricsQuery = `
      SELECT
        segments.date,
        campaign.id,
        campaign.name,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    `;

    const metricsResponse = await fetch(
      `https://googleads.googleapis.com/v15/customers/${customerId}/googleAds:searchStream`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'developer-token': Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN') || 'test-token'
        },
        body: JSON.stringify({ query: metricsQuery })
      }
    );

    if (!metricsResponse.ok) {
      const error = await metricsResponse.text();
      throw new Error(`Metrics fetch failed: ${error}`);
    }

    const metricsData = await metricsResponse.json();
    const metrics = (metricsData.results || []).map(row => {
      const costMicros = row.metrics?.cost_micros || 0;
      const impressions = row.metrics?.impressions || 0;
      const clicks = row.metrics?.clicks || 0;
      const conversions = row.metrics?.conversions || 0;
      const conversionValue = row.metrics?.conversions_value || 0;

      return {
        date: row.segments?.date,
        campaign_id: row.campaign?.id,
        campaign_name: row.campaign?.name,
        impressions,
        clicks,
        cost: costMicros / 1000000, // Convert micros to currency
        conversions,
        conversion_value: conversionValue,
        ctr: impressions > 0 ? (clicks / impressions * 100).toFixed(2) : 0,
        cpc: clicks > 0 ? (costMicros / 1000000 / clicks).toFixed(2) : 0,
        cpa: conversions > 0 ? (costMicros / 1000000 / conversions).toFixed(2) : 0,
        roas: costMicros > 0 ? (conversionValue / (costMicros / 1000000)).toFixed(2) : 0
      };
    });

    console.log(`[Google Ads] Processed ${metrics.length} metric records`);

    return Response.json({
      success: true,
      customer_id: customerId,
      date_range: { startDate, endDate },
      campaigns,
      metrics,
      summary: {
        total_campaigns: campaigns.length,
        total_metrics: metrics.length
      }
    });

  } catch (error) {
    console.error('[Google Ads] Error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});