
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
        if (key !== 'date' && key !== 'name' && typeof cleanedRecord[key] !== 'object') { // Exclude objects like segment
          if (cleanedRecord[key] === null || cleanedRecord[key] === undefined) {
            nullCount++;
            cleanedRecord[key] = 0;
            cleanedRecord._imputed = true;
          }
          
          // Ensure numeric values for potential metric fields
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
        // Collect numeric values that are not the 'date' or segment identifiers
        if (key !== 'date' && !segmentBy.includes(key) && typeof record[key] === 'number') {
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
      
      // Ensure values array is not empty to prevent errors with min/max
      if (values.length === 0) {
        continue; 
      }

      aggregated.push({
        period_start: group.period_start,
        period_end: group.period_end,
        segment: group.segment,
        value: this.sum(values),
        raw_value: this.sum(values), // raw_value is often the sum of cleaned values
        count: values.length,
        average: this.average(values),
        min: Math.min(...values),
        max: Math.max(...values),
        quality_score: group.records.filter(r => !r._imputed).length / group.records.length * 100
      });
    }

    // Sort by period_start to ensure correct order for derived metrics
    aggregated.sort((a, b) => new Date(a.period_start).getTime() - new Date(b.period_start).getTime());

    return aggregated;
  }

  /**
   * Calculate derived metrics
   */
  calculateDerivedMetrics(data) {
    // Group data by segment to calculate derived metrics independently for each segment
    const segmentedData = data.reduce((acc, record) => {
      const segmentString = JSON.stringify(record.segment); // Use string representation of segment object as key
      if (!acc[segmentString]) {
        acc[segmentString] = [];
      }
      acc[segmentString].push(record);
      return acc;
    }, {});

    const enrichedResults = [];

    for (const segmentKey in segmentedData) {
      const segmentRecords = segmentedData[segmentKey];
      const segmentTotal = this.sum(segmentRecords.map(d => d.value));

      segmentRecords.forEach((record, idx) => {
        const enhanced = { ...record };

        // Growth rate compared to previous period within the same segment
        if (idx > 0) {
          const previousValue = segmentRecords[idx - 1].value;
          enhanced.growth_rate = previousValue !== 0 
            ? ((record.value - previousValue) / previousValue) * 100 
            : (record.value === 0 ? 0 : 100); // If previous is 0 and current is not, it's 100% growth or infinite. Handle as 100 for simplicity.
        } else {
          enhanced.growth_rate = 0; // First record in a segment has no previous period
        }

        // Moving average (e.g., 3-period) within the same segment
        const windowSize = 3;
        const startIdx = Math.max(0, idx - windowSize + 1);
        const window = segmentRecords.slice(startIdx, idx + 1);
        enhanced.moving_average = this.average(window.map(d => d.value));

        // Percent of total within this segment (over the entire period covered by this segment's data)
        enhanced.percent_of_total = segmentTotal > 0 ? (record.value / segmentTotal) * 100 : 0;
        
        enrichedResults.push(enhanced);
      });
    }

    return enrichedResults;
  }

  /**
   * Detect anomalies using statistical methods
   */
  detectAnomalies(data, metricName) {
    const anomalies = [];
    
    // Group data by segment for anomaly detection specific to each segment
    const segmentedData = data.reduce((acc, record) => {
      const segmentString = JSON.stringify(record.segment);
      if (!acc[segmentString]) {
        acc[segmentString] = [];
      }
      acc[segmentString].push(record);
      return acc;
    }, {});

    for (const segmentKey in segmentedData) {
      const segmentRecords = segmentedData[segmentKey];
      const values = segmentRecords.map(d => d.value);
      
      if (values.length < 3) continue; // Need at least 3 points for meaningful std dev

      const mean = this.average(values);
      const stdDev = this.standardDeviation(values, mean);

      for (let i = 0; i < segmentRecords.length; i++) {
        const record = segmentRecords[i];
        const value = record.value;
        const zScore = stdDev > 0 ? Math.abs((value - mean) / stdDev) : 0;

        if (zScore > this.anomalyThreshold) {
          anomalies.push({
            metric_name: metricName,
            issue_type: 'anomaly',
            severity: zScore > 4 ? 'critical' : 'high',
            description: `Anomaly detected: value ${value.toFixed(2)} is ${zScore.toFixed(2)} standard deviations from mean in segment ${segmentKey}`,
            affected_records: 1,
            raw_data_sample: record // Store the transformed record, which includes original values and segment
          });
        }
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
        console.log(`[DataTransform] Using cached metric data: ${metricName}`);
        return cached;
      }

      // Not cached, fetch from database
      const metrics = await base44.entities.TransformedMetric.filter({
        metric_name: metricName,
        time_period: timePeriod
      });

      const filtered = metrics.filter(record => {
        const recordDate = new Date(record.period_start);
        const start = new Date(startDate);
        const end = new Date(endDate);
        return recordDate >= start && recordDate <= end;
      });

      if (filtered.length > 0) {
        // Cache for future use
        await cacheService.set(cacheKey, filtered, {
          type: 'metric_data',
          organizationId,
          ttl: 900 // 15 minutes
        });
        
        console.log(`[DataTransform] Cached ${filtered.length} metric records`);
        return filtered;
      }

      return null;
    } catch (error) {
      console.error('[DataTransform] Error fetching cached data:', error);
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
      console.error('[DataTransform] Error fetching quality issues:', error);
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
        // For unsupported time periods or raw, return the original date or a simple timestamp
        return d.toISOString().split('T')[0]; // Default to daily representation if invalid
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
        d.setHours(0, 0, 0, 0); // Ensure it's the beginning of the next day
        break;
      case 'weekly':
        d.setDate(d.getDate() + 7);
        d.setHours(0, 0, 0, 0); // Ensure it's the beginning of the next week
        break;
      case 'monthly':
        d.setMonth(d.getMonth() + 1);
        d.setDate(1); // Ensure it's the beginning of the next month
        d.setHours(0, 0, 0, 0);
        break;
      default:
        // For unsupported time periods, return the period start itself or add a day
        d.setDate(d.getDate() + 1);
        d.setHours(0, 0, 0, 0);
        break;
    }
    return d.toISOString();
  }

  getWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    // Thursday in current week decides the year.
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    // January 4 is always in week 1.
    const yearStart = new Date(d.getFullYear(), 0, 4);
    // Calculate full weeks to nearest yearStart.
    return Math.ceil((((d - yearStart) / 86400000) + yearStart.getDay() + 1) / 7);
  }

  getSegmentKey(record, segmentBy) {
    if (!segmentBy || segmentBy.length === 0) return 'all';
    // Create a consistent key from segment values
    const segmentParts = segmentBy.map(seg => record[seg] !== undefined && record[seg] !== null ? String(record[seg]) : 'unknown');
    return segmentParts.join('_');
  }

  extractSegment(record, segmentBy) {
    const segment = {};
    if (segmentBy && segmentBy.length > 0) {
      segmentBy.forEach(key => {
        if (record[key] !== undefined && record[key] !== null) {
          segment[key] = record[key];
        }
      });
    }
    return segment;
  }

  sum(values) {
    return values.reduce((acc, val) => acc + (typeof val === 'number' ? val : 0), 0);
  }

  average(values) {
    if (values.length === 0) return 0;
    return this.sum(values) / values.length;
  }

  standardDeviation(values, mean = null) {
    if (values.length <= 1) return 0; // Standard deviation is undefined or zero for less than 2 points
    const avg = mean !== null ? mean : this.average(values);
    const squaredDiffs = values.map(val => Math.pow(val - avg, 2));
    // Use N-1 for sample standard deviation if values are a sample
    // Or N for population standard deviation if values are the whole population
    // Here we assume N for simplicity in general metric calculation
    return Math.sqrt(this.sum(squaredDiffs) / values.length); 
  }

  calculateOverallQuality(issues, recordCount) {
    if (recordCount === 0) return 100;
    
    const severityWeights = { low: 1, medium: 3, high: 7, critical: 15 };
    const totalDeductions = issues.reduce((sum, issue) => {
      // If issue.affected_records is 0, consider it affecting at least 1 record for deduction
      const affected = issue.affected_records > 0 ? issue.affected_records : 1; 
      return sum + (severityWeights[issue.severity] * affected);
    }, 0);

    // Normalize deduction based on total possible records, max deduction 100 points
    const maxPossibleDeduction = recordCount * severityWeights.critical; // Max theoretical deduction
    let deductionPercentage = 0;
    if (maxPossibleDeduction > 0) {
      deductionPercentage = (totalDeductions / maxPossibleDeduction) * 100;
    }
    
    // Scale the deduction so it doesn't drop too sharply, maybe logarithmically or cap it
    // For simplicity, let's cap the effect and use a simple linear scaling as before
    const score = Math.max(0, 100 - deductionPercentage); // Simple linear scale for now

    return Math.round(score);
  }
}

export const dataTransformationService = new DataTransformationService();
