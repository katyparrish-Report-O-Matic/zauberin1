import { base44 } from "@/api/base44Client";
import { environmentConfig } from "../config/EnvironmentConfig";

/**
 * Metric Registry Service
 * Manages metric definitions catalog and platform mappings
 */
class MetricRegistry {
  constructor() {
    this.cache = null;
    this.cacheExpiry = null;
  }

  /**
   * Initialize default metric definitions
   */
  async initializeDefaultMetrics(organizationId = null) {
    try {
      environmentConfig.log('info', '[MetricRegistry] Initializing default metrics');

      const defaultMetrics = [
        // Google Ads Metrics
        {
          metric_key: 'impressions',
          display_name: 'Impressions',
          description: 'Number of times your ads were shown',
          category: 'traffic',
          data_type: 'integer',
          aggregation_method: 'sum',
          platform_mappings: {
            google_ads: 'metrics.impressions',
            facebook_ads: 'impressions'
          },
          higher_is_better: true,
          available_dimensions: ['campaign', 'ad_group', 'keyword', 'device', 'location']
        },
        {
          metric_key: 'clicks',
          display_name: 'Clicks',
          description: 'Number of clicks on your ads',
          category: 'traffic',
          data_type: 'integer',
          aggregation_method: 'sum',
          platform_mappings: {
            google_ads: 'metrics.clicks',
            facebook_ads: 'clicks'
          },
          higher_is_better: true,
          available_dimensions: ['campaign', 'ad_group', 'keyword', 'device', 'location']
        },
        {
          metric_key: 'cost',
          display_name: 'Cost',
          description: 'Total advertising spend',
          category: 'cost',
          data_type: 'currency',
          unit: 'USD',
          aggregation_method: 'sum',
          is_cost_metric: true,
          platform_mappings: {
            google_ads: 'metrics.cost_micros',
            facebook_ads: 'spend'
          },
          format: {
            decimal_places: 2,
            prefix: '$',
            thousands_separator: true
          },
          higher_is_better: false,
          available_dimensions: ['campaign', 'ad_group', 'device', 'location']
        },
        {
          metric_key: 'conversions',
          display_name: 'Conversions',
          description: 'Total number of conversions',
          category: 'conversion',
          data_type: 'decimal',
          aggregation_method: 'sum',
          is_conversion_metric: true,
          platform_mappings: {
            google_ads: 'metrics.conversions',
            google_analytics_4: 'conversions',
            facebook_ads: 'actions'
          },
          format: {
            decimal_places: 2
          },
          higher_is_better: true,
          available_dimensions: ['campaign', 'ad_group', 'conversion_action']
        },
        {
          metric_key: 'conversion_value',
          display_name: 'Conversion Value',
          description: 'Total value of conversions',
          category: 'revenue',
          data_type: 'currency',
          unit: 'USD',
          aggregation_method: 'sum',
          platform_mappings: {
            google_ads: 'metrics.conversions_value',
            google_analytics_4: 'total_revenue'
          },
          format: {
            decimal_places: 2,
            prefix: '$',
            thousands_separator: true
          },
          higher_is_better: true,
          available_dimensions: ['campaign', 'ad_group']
        },
        // Calculated Google Ads Metrics
        {
          metric_key: 'ctr',
          display_name: 'Click-Through Rate',
          description: 'Percentage of impressions that resulted in clicks',
          category: 'traffic',
          data_type: 'percentage',
          unit: '%',
          is_calculated: true,
          calculation_formula: '(clicks / impressions) * 100',
          depends_on: ['clicks', 'impressions'],
          format: {
            decimal_places: 2,
            suffix: '%'
          },
          higher_is_better: true
        },
        {
          metric_key: 'cpc',
          display_name: 'Cost Per Click',
          description: 'Average cost for each click',
          category: 'cost',
          data_type: 'currency',
          unit: 'USD',
          is_calculated: true,
          is_cost_metric: true,
          calculation_formula: 'cost / clicks',
          depends_on: ['cost', 'clicks'],
          format: {
            decimal_places: 2,
            prefix: '$'
          },
          higher_is_better: false
        },
        {
          metric_key: 'cpa',
          display_name: 'Cost Per Acquisition',
          description: 'Average cost for each conversion',
          category: 'conversion',
          data_type: 'currency',
          unit: 'USD',
          is_calculated: true,
          is_cost_metric: true,
          calculation_formula: 'cost / conversions',
          depends_on: ['cost', 'conversions'],
          format: {
            decimal_places: 2,
            prefix: '$'
          },
          higher_is_better: false
        },
        {
          metric_key: 'roas',
          display_name: 'Return on Ad Spend',
          description: 'Revenue generated for every dollar spent',
          category: 'revenue',
          data_type: 'decimal',
          is_calculated: true,
          calculation_formula: 'conversion_value / cost',
          depends_on: ['conversion_value', 'cost'],
          format: {
            decimal_places: 2,
            suffix: 'x'
          },
          higher_is_better: true
        },
        {
          metric_key: 'conversion_rate',
          display_name: 'Conversion Rate',
          description: 'Percentage of clicks that resulted in conversions',
          category: 'conversion',
          data_type: 'percentage',
          unit: '%',
          is_calculated: true,
          calculation_formula: '(conversions / clicks) * 100',
          depends_on: ['conversions', 'clicks'],
          format: {
            decimal_places: 2,
            suffix: '%'
          },
          higher_is_better: true
        },
        // GA4 Metrics
        {
          metric_key: 'sessions',
          display_name: 'Sessions',
          description: 'Number of sessions on your website',
          category: 'traffic',
          data_type: 'integer',
          aggregation_method: 'sum',
          platform_mappings: {
            google_analytics_4: 'sessions'
          },
          higher_is_better: true,
          available_dimensions: ['source', 'medium', 'campaign', 'page', 'device']
        },
        {
          metric_key: 'users',
          display_name: 'Users',
          description: 'Number of unique users',
          category: 'traffic',
          data_type: 'integer',
          aggregation_method: 'count',
          platform_mappings: {
            google_analytics_4: 'totalUsers'
          },
          higher_is_better: true,
          available_dimensions: ['source', 'medium', 'campaign', 'device']
        },
        {
          metric_key: 'pageviews',
          display_name: 'Pageviews',
          description: 'Total number of pages viewed',
          category: 'engagement',
          data_type: 'integer',
          aggregation_method: 'sum',
          platform_mappings: {
            google_analytics_4: 'screenPageViews'
          },
          higher_is_better: true,
          available_dimensions: ['page', 'source', 'device']
        },
        {
          metric_key: 'bounce_rate',
          display_name: 'Bounce Rate',
          description: 'Percentage of sessions with no engagement',
          category: 'engagement',
          data_type: 'percentage',
          unit: '%',
          is_calculated: true,
          calculation_formula: '(1 - engaged_sessions / sessions) * 100',
          depends_on: ['engaged_sessions', 'sessions'],
          format: {
            decimal_places: 2,
            suffix: '%'
          },
          higher_is_better: false
        },
        {
          metric_key: 'engagement_rate',
          display_name: 'Engagement Rate',
          description: 'Percentage of sessions that were engaged',
          category: 'engagement',
          data_type: 'percentage',
          unit: '%',
          is_calculated: true,
          calculation_formula: '(engaged_sessions / sessions) * 100',
          depends_on: ['engaged_sessions', 'sessions'],
          format: {
            decimal_places: 2,
            suffix: '%'
          },
          higher_is_better: true
        },
        // Call Tracking Metrics
        {
          metric_key: 'total_calls',
          display_name: 'Total Calls',
          description: 'Total number of phone calls received',
          category: 'call_tracking',
          data_type: 'integer',
          aggregation_method: 'sum',
          platform_mappings: {
            call_tracking: 'calls'
          },
          higher_is_better: true,
          available_dimensions: ['tracking_number', 'campaign', 'source', 'location']
        },
        {
          metric_key: 'answered_calls',
          display_name: 'Answered Calls',
          description: 'Number of calls that were answered',
          category: 'call_tracking',
          data_type: 'integer',
          aggregation_method: 'sum',
          platform_mappings: {
            call_tracking: 'answered_calls'
          },
          higher_is_better: true,
          available_dimensions: ['tracking_number', 'campaign']
        },
        {
          metric_key: 'qualified_calls',
          display_name: 'Qualified Calls',
          description: 'Number of calls marked as qualified leads',
          category: 'call_tracking',
          data_type: 'integer',
          aggregation_method: 'sum',
          is_conversion_metric: true,
          platform_mappings: {
            call_tracking: 'qualified_calls'
          },
          higher_is_better: true,
          available_dimensions: ['tracking_number', 'campaign']
        },
        {
          metric_key: 'answer_rate',
          display_name: 'Answer Rate',
          description: 'Percentage of calls that were answered',
          category: 'call_tracking',
          data_type: 'percentage',
          unit: '%',
          is_calculated: true,
          calculation_formula: '(answered_calls / total_calls) * 100',
          depends_on: ['answered_calls', 'total_calls'],
          format: {
            decimal_places: 2,
            suffix: '%'
          },
          higher_is_better: true
        },
        {
          metric_key: 'call_conversion_rate',
          display_name: 'Call Conversion Rate',
          description: 'Percentage of calls that were qualified',
          category: 'call_tracking',
          data_type: 'percentage',
          unit: '%',
          is_calculated: true,
          calculation_formula: '(qualified_calls / answered_calls) * 100',
          depends_on: ['qualified_calls', 'answered_calls'],
          format: {
            decimal_places: 2,
            suffix: '%'
          },
          higher_is_better: true
        }
      ];

      let created = 0;
      for (const metric of defaultMetrics) {
        const existing = await base44.entities.MetricDefinition.filter({
          metric_key: metric.metric_key
        });

        if (existing.length === 0) {
          await base44.entities.MetricDefinition.create(metric);
          created++;
        }
      }

      environmentConfig.log('info', `[MetricRegistry] Initialized ${created} new metrics`);
      
      // Clear cache
      this.cache = null;

      return { created, total: defaultMetrics.length };

    } catch (error) {
      environmentConfig.log('error', '[MetricRegistry] Initialize error:', error);
      throw error;
    }
  }

  /**
   * Get all metric definitions (with caching)
   */
  async getAllMetrics() {
    try {
      // Check cache
      if (this.cache && this.cacheExpiry && new Date() < this.cacheExpiry) {
        return this.cache;
      }

      const metrics = await base44.entities.MetricDefinition.list();
      
      // Cache for 5 minutes
      this.cache = metrics;
      this.cacheExpiry = new Date(Date.now() + 5 * 60 * 1000);

      return metrics;

    } catch (error) {
      environmentConfig.log('error', '[MetricRegistry] Get all metrics error:', error);
      return [];
    }
  }

  /**
   * Get metrics by category
   */
  async getMetricsByCategory(category) {
    const allMetrics = await this.getAllMetrics();
    return allMetrics.filter(m => m.category === category);
  }

  /**
   * Get metric by key
   */
  async getMetric(metricKey) {
    const allMetrics = await this.getAllMetrics();
    return allMetrics.find(m => m.metric_key === metricKey);
  }

  /**
   * Get platform-specific metric name
   */
  async getPlatformMetricName(metricKey, platform) {
    const metric = await this.getMetric(metricKey);
    if (!metric) return null;

    return metric.platform_mappings?.[platform] || metricKey;
  }

  /**
   * Search metrics
   */
  async searchMetrics(query) {
    const allMetrics = await this.getAllMetrics();
    const lowerQuery = query.toLowerCase();

    return allMetrics.filter(m =>
      m.metric_key.toLowerCase().includes(lowerQuery) ||
      m.display_name.toLowerCase().includes(lowerQuery) ||
      m.description?.toLowerCase().includes(lowerQuery) ||
      m.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get calculated metric dependencies
   */
  async getMetricDependencies(metricKey) {
    const metric = await this.getMetric(metricKey);
    if (!metric || !metric.is_calculated) return [];

    return metric.depends_on || [];
  }
}

export const metricRegistry = new MetricRegistry();