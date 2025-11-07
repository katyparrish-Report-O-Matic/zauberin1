
import { base44 } from "@/api/base44Client";
import { cacheService } from "../cache/CacheService";
import { environmentConfig } from "../config/EnvironmentConfig";

/**
 * Data Transformation Service
 * Handles normalization, aggregation, validation, and storage of metric data
 */
class DataTransformationService {
  constructor() {
    this.anomalyThreshold = 3; // Standard deviations for anomaly detection
  }

  /**
   * Transform raw API response into normalized format
   */
  async transformData(rawData, config) {
    const { metric_name, time_period = 'daily', segment_by = [] } = config;
    const qualityIssues = [];

    try {
      environmentConfig.log('info', `[DataTransform] Transforming ${metric_name} data...`);

      // Validate schema
      const schemaValidation = this.validateSchema(rawData, config);
      if (!schemaValidation.valid) {
        qualityIssues.push({
          metric_name,
          issue_type: 'schema_mismatch',
          severity: 'high',
          description: schemaValidation.error,
          affected_records: 0
        });
      }

      // Normalize and clean data
      const cleanedData = this.cleanData(rawData, qualityIssues, metric_name);

      // Aggregate by time period
      const aggregatedData = this.aggregateByTimePeriod(cleanedData, time_period, segment_by);

      // Calculate derived metrics
      const enrichedData = this.calculateDerivedMetrics(aggregatedData);

      // Detect anomalies
      const anomalies = this.detectAnomalies(enrichedData, metric_name);
      qualityIssues.push(...anomalies);

      // Store transformed data
      for (const record of enrichedData) {
        await base44.entities.TransformedMetric.create({
          metric_name,
          time_period,
          period_start: record.period_start,
          period_end: record.period_end,
          raw_value: record.raw_value,
          aggregated_value: record.value,
          segment: record.segment || {},
          derived_metrics: {
            growth_rate: record.growth_rate,
            moving_average: record.moving_average,
            percent_of_total: record.percent_of_total
          },
          data_quality_score: record.quality_score
        });
      }

      // Log quality issues
      for (const issue of qualityIssues) {
        await base44.entities.DataQualityLog.create(issue);
      }

      environmentConfig.log('info', `[DataTransform] Processed ${enrichedData.length} records, ${qualityIssues.length} issues`);

      return {
        data: enrichedData,
        quality_issues: qualityIssues,
        quality_score: this.calculateOverallQuality(qualityIssues, enrichedData.length)
      };

    } catch (error) {
      environmentConfig.log('error', '[DataTransform] Error:', error);
      throw error;
    }
  }

  /**
   * Validate data against expected schema
   */
  validateSchema(data, config) {
    if (!Array.isArray(data)) {
      return { valid: false, error: 'Data must be an array' };
    }

    if (data.length === 0) {
      return { valid: false, error: 'Data array is empty' };
    }

    const requiredFields = ['date'];
    const firstRecord = data[0];

    for (const field of requiredFields) {
      if (!(field in firstRecord)) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }

    return { valid: true };
  }

  /**
   * Clean data - handle nulls, missing values, outliers
   */
  cleanData(data, qualityIssues, metricName) {
    const cleaned = [];
    let nullCount = 0;

    for (const record of data) {
      const cleanedRecord = { ...record };

      // Handle missing values
      Object.keys(cleanedRecord).forEach(key => {
        if (key !== 'date' && key !== 'name' && typeof cleanedRecord[key] !== 'object') { // Added check for objects
          if (cleanedRecord[key] === null || cleanedRecord[key] === undefined) {
            nullCount++;
            cleanedRecord[key] = 0;
            cleanedRecord._imputed = true;
          }
          
          // Ensure numeric values
          if (typeof cleanedRecord[key] === 'string' && key !== 'date') {
            const parsed = parseFloat(cleanedRecord[key]);
            if (!isNaN(parsed)) {
              cleanedRecord[key] = parsed;
            }
          }
        }
      });

      cleaned.push(cleanedRecord);
    }

    // Log issues
    if (nullCount > 0) {
      qualityIssues.push({
        metric_name: metricName,
        issue_type: 'null_value',
        severity: nullCount > data.length * 0.1 ? 'high' : 'medium',
        description: `Found ${nullCount} null/missing values. Replaced with 0.`,
        affected_records: nullCount,
        auto_fixed: true
      });
    }

    return cleaned;
  }

  /**
   * Aggregate data by time period
   */
  aggregateByTimePeriod(data, timePeriod, segmentBy) {
    const groups = {};

    for (const record of data) {
      const periodKey = this.getPeriodKey(record.date, timePeriod);
      const segmentKey = this.getSegmentKey(record, segmentBy);
      const groupKey = `${periodKey}_${segmentKey}`;

      if (!groups[groupKey]) {
        groups[groupKey] = {
          period_start: periodKey,
          period_end: this.getPeriodEnd(periodKey, timePeriod),
          segment: this.extractSegment(record, segmentBy),
          values: [],
          records: []
        };
      }

      Object.keys(record).forEach(key => {
        if (key !== 'date' && key !== 'name' && typeof record[key] === 'number') {
          groups[groupKey].values.push(record[key]);
        }
      });
      groups[groupKey].records.push(record);
    }

    // Calculate aggregations
    const aggregated = [];
    for (const groupKey in groups) {
      const group = groups[groupKey];
      const values = group.values;
      
      aggregated.push({
        period_start: group.period_start,
        period_end: group.period_end,
        segment: group.segment,
        value: this.sum(values),
        raw_value: this.sum(values),
        count: values.length,
        average: this.average(values),
        min: Math.min(...values),
        max: Math.max(...values),
        quality_score: group.records.filter(r => !r._imputed).length / group.records.length * 100
      });
    }

    return aggregated;
  }

  /**
   * Calculate derived metrics
   */
  calculateDerivedMetrics(data) {
    return data.map((record, idx) => {
      const enhanced = { ...record };

      // Growth rate
      if (idx > 0) {
        const previousValue = data[idx - 1].value;
        enhanced.growth_rate = previousValue > 0 
          ? ((record.value - previousValue) / previousValue) * 100 
          : 0;
      } else {
        enhanced.growth_rate = 0;
      }

      // Moving average (3-period)
      const windowSize = 3;
      const startIdx = Math.max(0, idx - windowSize + 1);
      const window = data.slice(startIdx, idx + 1);
      enhanced.moving_average = this.average(window.map(d => d.value));

      // Percent of total
      const total = this.sum(data.map(d => d.value));
      enhanced.percent_of_total = total > 0 ? (record.value / total) * 100 : 0;

      return enhanced;
    });
  }

  /**
   * Detect anomalies using statistical methods
   */
  detectAnomalies(data, metricName) {
    const anomalies = [];
    const values = data.map(d => d.value);
    
    if (values.length < 3) return anomalies;

    const mean = this.average(values);
    const stdDev = this.standardDeviation(values, mean);

    for (let i = 0; i < data.length; i++) {
      const value = data[i].value;
      const zScore = stdDev > 0 ? Math.abs((value - mean) / stdDev) : 0;

      if (zScore > this.anomalyThreshold) {
        anomalies.push({
          metric_name: metricName,
          issue_type: 'anomaly',
          severity: zScore > 4 ? 'critical' : 'high',
          description: `Anomaly detected: value ${value.toFixed(2)} is ${zScore.toFixed(2)} standard deviations from mean`,
          affected_records: 1,
          raw_data_sample: data[i]
        });
      }
    }

    return anomalies;
  }

  /**
   * Get cached transformed data
   */
  async getCachedData(metricName, timePeriod, startDate, endDate, organizationId = null) {
    try {
      // Generate cache key
      const cacheKey = cacheService.generateKey('metric_data', {
        metric: metricName,
        period: timePeriod,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        org: organizationId
      });

      // Try to get from cache
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        environmentConfig.log('info', `[DataTransform] Using cached metric data: ${metricName}`);
        return cached;
      }

      // Not cached, fetch from database
      const metrics = await base44.entities.TransformedMetric.filter({
        metric_name: metricName,
        time_period: timePeriod
      });

      const filtered = metrics.filter(record => {
        const recordDate = new Date(record.period_start);
        return recordDate >= new Date(startDate) && recordDate <= new Date(endDate);
      });

      if (filtered.length > 0) {
        // Cache for future use
        await cacheService.set(cacheKey, filtered, {
          type: 'metric_data',
          organizationId,
          ttl: 900 // 15 minutes
        });
        
        environmentConfig.log('info', `[DataTransform] Cached ${filtered.length} metric records`);
        return filtered;
      }

      return null;
    } catch (error) {
      environmentConfig.log('error', '[DataTransform] Error fetching cached data:', error);
      return null;
    }
  }

  /**
   * Get recent quality issues
   */
  async getQualityIssues(limit = 10) {
    try {
      const issues = await base44.entities.DataQualityLog.filter(
        { resolution_status: 'unresolved' },
        '-created_date',
        limit
      );
      return issues;
    } catch (error) {
      environmentConfig.log('error', '[DataTransform] Error fetching quality issues:', error);
      return [];
    }
  }

  // Helper methods
  getPeriodKey(date, timePeriod) {
    const d = new Date(date);
    switch (timePeriod) {
      case 'hourly':
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}`;
      case 'daily':
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      case 'weekly':
        const weekNum = this.getWeekNumber(d);
        return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
      case 'monthly':
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      default:
        return date;
    }
  }

  getPeriodEnd(periodStart, timePeriod) {
    const d = new Date(periodStart);
    switch (timePeriod) {
      case 'hourly':
        d.setHours(d.getHours() + 1);
        break;
      case 'daily':
        d.setDate(d.getDate() + 1);
        break;
      case 'weekly':
        d.setDate(d.getDate() + 7);
        break;
      case 'monthly':
        d.setMonth(d.getMonth() + 1);
        break;
    }
    return d.toISOString();
  }

  getWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  getSegmentKey(record, segmentBy) {
    if (!segmentBy || segmentBy.length === 0) return 'all';
    return segmentBy.map(seg => record[seg] || 'unknown').join('_');
  }

  extractSegment(record, segmentBy) {
    const segment = {};
    if (segmentBy && segmentBy.length > 0) {
      segmentBy.forEach(key => {
        if (record[key]) {
          segment[key] = record[key];
        }
      });
    }
    return segment;
  }

  sum(values) {
    return values.reduce((acc, val) => acc + (val || 0), 0);
  }

  average(values) {
    if (values.length === 0) return 0;
    return this.sum(values) / values.length;
  }

  standardDeviation(values, mean = null) {
    if (values.length === 0) return 0;
    const avg = mean !== null ? mean : this.average(values);
    const squaredDiffs = values.map(val => Math.pow(val - avg, 2));
    return Math.sqrt(this.average(squaredDiffs));
  }

  calculateOverallQuality(issues, recordCount) {
    if (recordCount === 0) return 100;
    
    const severityWeights = { low: 1, medium: 3, high: 7, critical: 15 };
    const totalDeductions = issues.reduce((sum, issue) => {
      return sum + (severityWeights[issue.severity] * (issue.affected_records || 1));
    }, 0);

    const score = Math.max(0, 100 - (totalDeductions / recordCount) * 10);
    return Math.round(score);
  }
}

export const dataTransformationService = new DataTransformationService();
