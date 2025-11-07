import { base44 } from "@/api/base44Client";
import { environmentConfig } from "../config/EnvironmentConfig";

/**
 * Monitoring Service
 * Tracks application metrics and system health
 */
class MonitoringService {
  constructor() {
    this.metricsBuffer = [];
    this.bufferSize = 100;
    this.flushInterval = 30000; // 30 seconds
    
    // Start periodic flush
    this.startPeriodicFlush();
  }

  /**
   * Record an application metric
   */
  async recordMetric(metricType, value, unit, context = {}, organizationId = null) {
    try {
      const metric = {
        metric_type: metricType,
        metric_value: value,
        metric_unit: unit,
        organization_id: organizationId,
        context,
        timestamp: new Date().toISOString()
      };

      // Add to buffer
      this.metricsBuffer.push(metric);

      // Flush if buffer is full
      if (this.metricsBuffer.length >= this.bufferSize) {
        await this.flushMetrics();
      }

      environmentConfig.log('debug', `[Monitoring] Recorded ${metricType}: ${value}${unit}`);
    } catch (error) {
      environmentConfig.log('error', '[Monitoring] Error recording metric:', error);
    }
  }

  /**
   * Flush metrics buffer to database
   */
  async flushMetrics() {
    if (this.metricsBuffer.length === 0) return;

    try {
      const metricsToFlush = [...this.metricsBuffer];
      this.metricsBuffer = [];

      for (const metric of metricsToFlush) {
        await base44.entities.ApplicationMetric.create(metric);
      }

      environmentConfig.log('debug', `[Monitoring] Flushed ${metricsToFlush.length} metrics`);
    } catch (error) {
      environmentConfig.log('error', '[Monitoring] Error flushing metrics:', error);
      // Add metrics back to buffer on error
      this.metricsBuffer.push(...metricsToFlush);
    }
  }

  /**
   * Start periodic flush
   */
  startPeriodicFlush() {
    setInterval(() => {
      this.flushMetrics();
    }, this.flushInterval);
  }

  /**
   * Track API response time
   */
  async trackAPICall(endpoint, duration, success, statusCode) {
    await this.recordMetric(
      'api_response_time',
      duration,
      'ms',
      { endpoint, success, status_code: statusCode }
    );

    // Track error rate
    if (!success || statusCode >= 400) {
      await this.recordMetric(
        'error_rate',
        1,
        'count',
        { endpoint, status_code: statusCode }
      );
    }
  }

  /**
   * Track page load time
   */
  async trackPageLoad(pageName, duration) {
    await this.recordMetric(
      'page_load_time',
      duration,
      'ms',
      { page: pageName }
    );
  }

  /**
   * Track user activity
   */
  async trackUserActivity(action, userId, organizationId) {
    await this.recordMetric(
      'user_activity',
      1,
      'count',
      { action, user_id: userId },
      organizationId
    );
  }

  /**
   * Track cache hit rate
   */
  async trackCacheHit(hit, cacheType) {
    await this.recordMetric(
      'cache_hit_rate',
      hit ? 1 : 0,
      'count',
      { cache_type: cacheType, hit }
    );
  }

  /**
   * Track database query time
   */
  async trackDatabaseQuery(queryType, duration) {
    await this.recordMetric(
      'database_query_time',
      duration,
      'ms',
      { query_type: queryType }
    );
  }

  /**
   * Get metrics summary
   */
  async getMetricsSummary(timeRange = 3600000) { // Default 1 hour
    try {
      const cutoff = new Date(Date.now() - timeRange);
      const allMetrics = await base44.entities.ApplicationMetric.list('-created_date', 10000);
      
      const recentMetrics = allMetrics.filter(m => 
        new Date(m.created_date) >= cutoff
      );

      const summary = {
        api_response_time: {
          avg: 0,
          max: 0,
          min: Infinity,
          count: 0
        },
        error_rate: {
          total: 0,
          percentage: 0
        },
        page_load_time: {
          avg: 0,
          max: 0,
          count: 0
        },
        user_activity: {
          total: 0,
          unique_users: new Set()
        },
        cache_hit_rate: {
          hits: 0,
          misses: 0,
          percentage: 0
        }
      };

      let totalApiCalls = 0;

      recentMetrics.forEach(metric => {
        switch (metric.metric_type) {
          case 'api_response_time':
            summary.api_response_time.avg += metric.metric_value;
            summary.api_response_time.max = Math.max(summary.api_response_time.max, metric.metric_value);
            summary.api_response_time.min = Math.min(summary.api_response_time.min, metric.metric_value);
            summary.api_response_time.count++;
            totalApiCalls++;
            break;

          case 'error_rate':
            summary.error_rate.total++;
            break;

          case 'page_load_time':
            summary.page_load_time.avg += metric.metric_value;
            summary.page_load_time.max = Math.max(summary.page_load_time.max, metric.metric_value);
            summary.page_load_time.count++;
            break;

          case 'user_activity':
            summary.user_activity.total++;
            if (metric.context?.user_id) {
              summary.user_activity.unique_users.add(metric.context.user_id);
            }
            break;

          case 'cache_hit_rate':
            if (metric.context?.hit) {
              summary.cache_hit_rate.hits++;
            } else {
              summary.cache_hit_rate.misses++;
            }
            break;
        }
      });

      // Calculate averages and percentages
      if (summary.api_response_time.count > 0) {
        summary.api_response_time.avg = Math.round(
          summary.api_response_time.avg / summary.api_response_time.count
        );
      }

      if (totalApiCalls > 0) {
        summary.error_rate.percentage = 
          (summary.error_rate.total / totalApiCalls) * 100;
      }

      if (summary.page_load_time.count > 0) {
        summary.page_load_time.avg = Math.round(
          summary.page_load_time.avg / summary.page_load_time.count
        );
      }

      const totalCacheOps = summary.cache_hit_rate.hits + summary.cache_hit_rate.misses;
      if (totalCacheOps > 0) {
        summary.cache_hit_rate.percentage = 
          (summary.cache_hit_rate.hits / totalCacheOps) * 100;
      }

      summary.user_activity.unique_users = summary.user_activity.unique_users.size;

      return summary;
    } catch (error) {
      environmentConfig.log('error', '[Monitoring] Error getting metrics summary:', error);
      return null;
    }
  }

  /**
   * Get metrics over time
   */
  async getMetricsTimeSeries(metricType, hours = 24) {
    try {
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      const allMetrics = await base44.entities.ApplicationMetric.filter({
        metric_type: metricType
      }, '-created_date', 10000);

      const recentMetrics = allMetrics.filter(m => 
        new Date(m.created_date) >= cutoff
      );

      // Group by hour
      const byHour = {};
      recentMetrics.forEach(metric => {
        const hour = new Date(metric.created_date).toISOString().substring(0, 13) + ':00:00Z';
        if (!byHour[hour]) {
          byHour[hour] = { values: [], count: 0 };
        }
        byHour[hour].values.push(metric.metric_value);
        byHour[hour].count++;
      });

      // Calculate averages
      const timeSeries = Object.entries(byHour).map(([hour, data]) => ({
        timestamp: hour,
        value: data.values.reduce((sum, v) => sum + v, 0) / data.count,
        count: data.count
      }));

      return timeSeries.sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
      );
    } catch (error) {
      environmentConfig.log('error', '[Monitoring] Error getting time series:', error);
      return [];
    }
  }

  /**
   * Cleanup old metrics
   */
  async cleanupOldMetrics(daysToKeep = 7) {
    try {
      const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
      const allMetrics = await base44.entities.ApplicationMetric.list();

      let deleted = 0;
      for (const metric of allMetrics) {
        if (new Date(metric.created_date) < cutoff) {
          await base44.entities.ApplicationMetric.delete(metric.id);
          deleted++;
        }
      }

      environmentConfig.log('info', `[Monitoring] Cleaned up ${deleted} old metrics`);
      return deleted;
    } catch (error) {
      environmentConfig.log('error', '[Monitoring] Error cleaning up metrics:', error);
      return 0;
    }
  }
}

export const monitoringService = new MonitoringService();