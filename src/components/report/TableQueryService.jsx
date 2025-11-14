import { base44 } from "@/api/base44Client";
import { environmentConfig } from "../config/EnvironmentConfig";

/**
 * Table Query Service
 * Translates natural language to database queries for TransformedMetric data
 * Uses pre-aggregated metrics, NOT raw CallRecords
 */
class TableQueryService {
  
  /**
   * Generate table configuration from natural language
   */
  async generateTableFromRequest(naturalLanguageRequest, organizationId, dateContext = '') {
    try {
      environmentConfig.log('info', '[TableQuery] Processing NL request:', naturalLanguageRequest);

      const availableMetrics = [
        'total_calls',
        'answered_calls', 
        'voicemail_calls',
        'missed_calls',
        'working_hours_calls',
        'after_hours_calls',
        'qualified_calls',
        'average_duration',
        'answer_rate'
      ];

      const availableDimensions = [
        'account_name',
        'region',
        'date',
        'data_source'
      ];

      // Use LLM to interpret the request
      const config = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a business intelligence expert creating Looker-style data tables.

User's request: "${naturalLanguageRequest}"
${dateContext}

Available metrics: ${availableMetrics.join(', ')}
Available dimensions: ${availableDimensions.join(', ')}

IMPORTANT RULES:
1. Identify dimensions to GROUP BY (account_name, region, date)
2. Metrics are already aggregated daily - we'll sum across time periods
3. ALWAYS include account_name unless user specifically says otherwise
4. For "by region and account" → groupBy: ["region", "account_name"]
5. For "by account" → groupBy: ["account_name"]
6. Show subtotals when grouping by multiple levels
7. Format percentages (answer_rate), numbers (calls), durations (seconds)

Generate a complete table configuration that queries pre-aggregated metrics.`,
        response_json_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            groupBy: { 
              type: "array",
              items: { type: "string" },
              description: "Dimensions to group by, e.g., ['region', 'account_name']"
            },
            columns: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: { type: "string", description: "Metric name" },
                  label: { type: "string", description: "Display label" },
                  format: { 
                    type: "string", 
                    enum: ["number", "percentage", "duration", "text"],
                    description: "How to format values"
                  },
                  aggregation: {
                    type: "string",
                    enum: ["sum", "avg", "count"],
                    description: "How to aggregate this metric"
                  },
                  align: { 
                    type: "string", 
                    enum: ["left", "right", "center"]
                  }
                }
              }
            },
            showSubtotals: { type: "boolean" },
            showGrandTotal: { type: "boolean" },
            sortBy: {
              type: "object",
              properties: {
                column: { type: "string" },
                direction: { type: "string", enum: ["asc", "desc"] }
              }
            }
          },
          required: ["title", "groupBy", "columns"]
        }
      });

      // Ensure we have proper defaults
      config.showSubtotals = config.showSubtotals ?? true;
      config.showGrandTotal = config.showGrandTotal ?? true;

      environmentConfig.log('info', '[TableQuery] Generated config:', config);

      return config;

    } catch (error) {
      environmentConfig.log('error', '[TableQuery] Error:', error);
      throw error;
    }
  }

  /**
   * Execute query to fetch TransformedMetric data and aggregate by groupBy dimensions
   * Uses pre-aggregated daily metrics, NOT raw CallRecords
   */
  async executeTableQuery(config, organizationId, accountId = 'all') {
    try {
      environmentConfig.log('info', '[TableQuery] Executing query for organization:', organizationId);
      environmentConfig.log('info', '[TableQuery] Account filter:', accountId);
      environmentConfig.log('info', '[TableQuery] GroupBy dimensions:', config.groupBy);

      // Fetch ALL TransformedMetric records for this organization
      // These are already aggregated by day
      const allMetrics = await base44.entities.TransformedMetric.filter(
        {}, 
        '-period_start', 
        10000
      );

      environmentConfig.log('info', `[TableQuery] Fetched ${allMetrics.length} metric records`);

      // Filter by organization and optionally by account
      const filteredMetrics = allMetrics.filter(metric => {
        // Check if metric has segment data
        if (!metric.segment) return false;
        
        // Filter by account if specified
        if (accountId && accountId !== 'all') {
          if (metric.segment.account_id !== accountId) return false;
        }
        
        return true;
      });

      environmentConfig.log('info', `[TableQuery] Filtered to ${filteredMetrics.length} metrics for query`);

      if (filteredMetrics.length === 0) {
        return [];
      }

      // Group metrics by metric_name to organize data
      const metricsByName = {};
      filteredMetrics.forEach(metric => {
        const name = metric.metric_name;
        if (!metricsByName[name]) {
          metricsByName[name] = [];
        }
        metricsByName[name].push(metric);
      });

      environmentConfig.log('info', '[TableQuery] Metrics available:', Object.keys(metricsByName));

      // Build unified records by grouping dimensions
      const groupBy = config.groupBy || ['account_name'];
      const aggregatedData = this.aggregateMetrics(metricsByName, groupBy);

      environmentConfig.log('info', `[TableQuery] Aggregated into ${aggregatedData.length} groups`);

      return aggregatedData;

    } catch (error) {
      environmentConfig.log('error', '[TableQuery] Query error:', error);
      throw error;
    }
  }

  /**
   * Aggregate pre-calculated metrics by specified dimensions
   */
  aggregateMetrics(metricsByName, groupByDimensions) {
    const groups = {};

    // Process each metric type
    Object.entries(metricsByName).forEach(([metricName, metrics]) => {
      metrics.forEach(metric => {
        if (!metric.segment) return;

        // Create group key from dimensions
        const groupKey = groupByDimensions
          .map(dim => {
            if (dim === 'date') {
              return metric.period_start ? metric.period_start.split('T')[0] : 'Unknown';
            }
            return metric.segment[dim] || 'Unknown';
          })
          .join('|||');

        if (!groups[groupKey]) {
          // Initialize group with dimension values
          groups[groupKey] = {
            _groupKey: groupKey
          };
          
          // Add dimension values
          groupByDimensions.forEach(dim => {
            if (dim === 'date') {
              groups[groupKey][dim] = metric.period_start ? metric.period_start.split('T')[0] : 'Unknown';
            } else {
              groups[groupKey][dim] = metric.segment[dim] || 'Unknown';
            }
          });

          // Initialize all metrics to 0
          groups[groupKey].total_calls = 0;
          groups[groupKey].answered_calls = 0;
          groups[groupKey].voicemail_calls = 0;
          groups[groupKey].missed_calls = 0;
          groups[groupKey].working_hours_calls = 0;
          groups[groupKey].after_hours_calls = 0;
          groups[groupKey].qualified_calls = 0;
          groups[groupKey].average_duration = 0;
          groups[groupKey].answer_rate = 0;
          groups[groupKey]._durationSum = 0;
          groups[groupKey]._durationCount = 0;
          groups[groupKey]._rateSum = 0;
          groups[groupKey]._rateCount = 0;
        }

        // Aggregate the metric value
        const group = groups[groupKey];
        const value = metric.aggregated_value || 0;

        // For average/rate metrics, track sum and count for proper averaging
        if (metricName === 'average_duration') {
          group._durationSum += value;
          group._durationCount++;
        } else if (metricName === 'answer_rate') {
          group._rateSum += value;
          group._rateCount++;
        } else {
          // For count metrics, sum them
          group[metricName] = (group[metricName] || 0) + value;
        }
      });
    });

    // Calculate final averages and clean up
    const aggregated = Object.values(groups).map(group => {
      // Calculate average_duration
      if (group._durationCount > 0) {
        group.average_duration = Math.round(group._durationSum / group._durationCount);
      }

      // Calculate answer_rate
      if (group._rateCount > 0) {
        group.answer_rate = Math.round(group._rateSum / group._rateCount);
      }

      // Remove temporary fields
      delete group._durationSum;
      delete group._durationCount;
      delete group._rateSum;
      delete group._rateCount;
      delete group._groupKey;

      return group;
    });

    // Sort by first dimension, then by total_calls descending
    const firstDimension = groupByDimensions[0];
    aggregated.sort((a, b) => {
      const dimCompare = String(a[firstDimension]).localeCompare(String(b[firstDimension]));
      if (dimCompare !== 0) return dimCompare;
      return (b.total_calls || 0) - (a.total_calls || 0);
    });

    return aggregated;
  }
}

export const tableQueryService = new TableQueryService();