import { base44 } from "@/api/base44Client";

/**
 * Database Optimization Service
 * Provides performance optimization utilities and recommendations
 */
class DatabaseOptimizationService {
  constructor() {
    this.queryLog = [];
    this.maxLogSize = 100;
  }

  /**
   * Log query performance
   */
  logQuery(entityName, operation, duration, resultCount, filters = {}) {
    const log = {
      timestamp: new Date().toISOString(),
      entity: entityName,
      operation,
      duration_ms: duration,
      result_count: resultCount,
      filters,
      slow: duration > 1000 // Flag slow queries (>1s)
    };

    this.queryLog.unshift(log);
    
    // Keep log size manageable
    if (this.queryLog.length > this.maxLogSize) {
      this.queryLog.pop();
    }

    if (log.slow) {
      console.warn(`[DBPerf] Slow query detected: ${entityName}.${operation} took ${duration}ms`);
    }

    return log;
  }

  /**
   * Execute optimized query with monitoring
   */
  async executeOptimized(entityName, operation, options = {}) {
    const startTime = Date.now();
    let result;
    let resultCount = 0;

    try {
      const {
        filters = {},
        sort = '-created_date',
        limit = 50,
        skip = 0
      } = options;

      switch (operation) {
        case 'list':
          result = await base44.entities[entityName].list(sort, limit);
          resultCount = result.length;
          break;

        case 'filter':
          result = await base44.entities[entityName].filter(filters, sort, limit);
          resultCount = result.length;
          break;

        case 'get':
          result = await base44.entities[entityName].list();
          resultCount = result.length;
          break;

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      const duration = Date.now() - startTime;
      this.logQuery(entityName, operation, duration, resultCount, filters);

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logQuery(entityName, operation, duration, 0, filters);
      throw error;
    }
  }

  /**
   * Get slow query report
   */
  getSlowQueries(threshold = 1000) {
    return this.queryLog.filter(log => log.duration_ms > threshold);
  }

  /**
   * Get query statistics
   */
  getQueryStats() {
    if (this.queryLog.length === 0) {
      return null;
    }

    const durations = this.queryLog.map(log => log.duration_ms);
    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const maxDuration = Math.max(...durations);
    const slowQueries = this.getSlowQueries();

    // Group by entity
    const byEntity = {};
    this.queryLog.forEach(log => {
      if (!byEntity[log.entity]) {
        byEntity[log.entity] = {
          count: 0,
          totalDuration: 0,
          slowCount: 0
        };
      }
      byEntity[log.entity].count++;
      byEntity[log.entity].totalDuration += log.duration_ms;
      if (log.slow) byEntity[log.entity].slowCount++;
    });

    return {
      total_queries: this.queryLog.length,
      avg_duration_ms: Math.round(avgDuration),
      max_duration_ms: maxDuration,
      slow_queries: slowQueries.length,
      by_entity: byEntity,
      recent_slow: slowQueries.slice(0, 10)
    };
  }

  /**
   * Generate optimization recommendations
   */
  async generateRecommendations(organizationId) {
    const recommendations = [];

    try {
      // Check for large collections
      const reports = await base44.entities.ReportRequest.list();
      if (reports.length > 1000) {
        recommendations.push({
          priority: 'high',
          category: 'data_volume',
          entity: 'ReportRequest',
          issue: `${reports.length} reports - consider archiving old reports`,
          action: 'Implement archival strategy for reports older than 1 year',
          estimated_impact: 'High - reduce query times by 50-70%'
        });
      }

      // Check transformed metrics
      const metrics = await base44.entities.TransformedMetric.list();
      if (metrics.length > 10000) {
        recommendations.push({
          priority: 'critical',
          category: 'data_volume',
          entity: 'TransformedMetric',
          issue: `${metrics.length} metric records - very large dataset`,
          action: 'Archive metrics older than 90 days to separate table',
          estimated_impact: 'Critical - current queries may be very slow'
        });
      }

      // Check for missing pagination
      const slowQueries = this.getSlowQueries(2000);
      if (slowQueries.length > 0) {
        recommendations.push({
          priority: 'high',
          category: 'query_optimization',
          issue: `${slowQueries.length} slow queries detected (>2s)`,
          action: 'Implement pagination and add query limits',
          estimated_impact: 'High - immediate query performance improvement'
        });
      }

      // Check audit logs
      const auditLogs = await base44.entities.AuditLog.list();
      if (auditLogs.length > 5000) {
        recommendations.push({
          priority: 'medium',
          category: 'data_retention',
          entity: 'AuditLog',
          issue: `${auditLogs.length} audit logs - growing storage`,
          action: 'Archive logs older than 6 months',
          estimated_impact: 'Medium - reduce storage costs'
        });
      }

      // Check cache entries
      const cacheEntries = await base44.entities.CacheEntry.list();
      const expiredCount = cacheEntries.filter(c => 
        new Date(c.expires_at) < new Date()
      ).length;
      
      if (expiredCount > 100) {
        recommendations.push({
          priority: 'low',
          category: 'cleanup',
          entity: 'CacheEntry',
          issue: `${expiredCount} expired cache entries`,
          action: 'Run cache cleanup job',
          estimated_impact: 'Low - minor storage reduction'
        });
      }

      return recommendations;

    } catch (error) {
      console.error('[DBOptimization] Error generating recommendations:', error);
      return recommendations;
    }
  }

  /**
   * Suggested indexes for Base44 platform
   */
  getIndexRecommendations() {
    return [
      {
        entity: 'ReportRequest',
        fields: ['organization_id', 'created_date'],
        type: 'composite',
        reason: 'Frequently filtered by organization and sorted by date'
      },
      {
        entity: 'TransformedMetric',
        fields: ['metric_name', 'period_start'],
        type: 'composite',
        reason: 'Common query pattern for metric time series'
      },
      {
        entity: 'TransformedMetric',
        fields: ['time_period'],
        type: 'single',
        reason: 'Frequently filtered by aggregation period'
      },
      {
        entity: 'AuditLog',
        fields: ['organization_id', 'created_date'],
        type: 'composite',
        reason: 'Time-based queries within organization scope'
      },
      {
        entity: 'AuditLog',
        fields: ['action_type'],
        type: 'single',
        reason: 'Filter by action type for security monitoring'
      },
      {
        entity: 'CacheEntry',
        fields: ['cache_key'],
        type: 'unique',
        reason: 'Primary lookup field for cache retrieval'
      },
      {
        entity: 'CacheEntry',
        fields: ['expires_at'],
        type: 'single',
        reason: 'Used in cleanup operations'
      },
      {
        entity: 'ApiSettings',
        fields: ['organization_id', 'is_active'],
        type: 'composite',
        reason: 'Finding active API configs per organization'
      },
      {
        entity: 'JobExecution',
        fields: ['job_id', 'started_at'],
        type: 'composite',
        reason: 'Job history queries'
      }
    ];
  }

  /**
   * Estimate query cost
   */
  estimateQueryCost(entity, operation, resultSize) {
    // Simple cost estimation
    const baseCost = {
      list: 10,
      filter: 15,
      get: 5,
      create: 20,
      update: 25,
      delete: 15
    };

    const cost = (baseCost[operation] || 10) * (1 + Math.log10(resultSize + 1));
    
    return {
      estimated_cost: Math.round(cost),
      category: cost < 50 ? 'cheap' : cost < 200 ? 'moderate' : 'expensive',
      suggestion: cost > 200 ? 'Consider adding pagination or caching' : 'Query is efficient'
    };
  }

  /**
   * Clear query log
   */
  clearLog() {
    this.queryLog = [];
  }
}

export const dbOptimizationService = new DatabaseOptimizationService();