import { base44 } from "@/api/base44Client";
import { environmentConfig } from "../config/EnvironmentConfig";

/**
 * Table Query Service
 * Handles natural language to SQL-like queries for complex table generation
 */
class TableQueryService {
  
  /**
   * Generate table configuration from natural language
   */
  async generateTableConfig(naturalLanguageRequest, organizationId, accountId = null) {
    try {
      environmentConfig.log('info', '[TableQuery] Processing NL request:', naturalLanguageRequest);

      // Build context about available data
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
        'dealer/account_name',
        'region',
        'date',
        'call_status',
        'tracking_source',
        'campaign',
        'keyword'
      ];

      // Use LLM to interpret the request
      const config = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a business intelligence expert helping create data tables like Looker Studio.

User's request: "${naturalLanguageRequest}"

Available metrics: ${availableMetrics.join(', ')}
Available dimensions: ${availableDimensions.join(', ')}

IMPORTANT RULES:
1. Identify what dimensions to GROUP BY (dealer, region, date, etc.)
2. Identify what metrics to display as columns
3. Determine aggregation types (sum, avg, count)
4. Decide if subtotals and grand totals are needed
5. Determine appropriate column formatting (number, percentage, duration)
6. Default to showing dealer/account if not specified

Examples:
- "Show calls by dealer" → Group by dealer, show call metrics
- "Regional breakdown of calls" → Group by region, then dealer
- "Daily call report for all dealers" → Group by date, then dealer
- "Compare dealers within each region" → Group by region, then dealer

Generate a complete table configuration.`,
        response_json_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            groupBy: { 
              type: "array",
              items: { type: "string" },
              description: "Dimensions to group by (e.g., ['region', 'account_name'] or ['account_name'])"
            },
            columns: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: { type: "string", description: "Field name" },
                  label: { type: "string", description: "Display label" },
                  format: { 
                    type: "string", 
                    enum: ["number", "percentage", "duration", "currency", "text"],
                    description: "How to format values"
                  },
                  align: { 
                    type: "string", 
                    enum: ["left", "right", "center"],
                    description: "Column alignment"
                  }
                }
              }
            },
            aggregations: {
              type: "object",
              description: "How to aggregate each column",
              additionalProperties: {
                type: "object",
                properties: {
                  type: { 
                    type: "string", 
                    enum: ["sum", "avg", "count", "min", "max"],
                    description: "Aggregation type"
                  }
                }
              }
            },
            showSubtotals: { type: "boolean", description: "Show subtotals for groups" },
            showGrandTotal: { type: "boolean", description: "Show grand total row" },
            filters: {
              type: "object",
              description: "Any filters to apply"
            },
            sortBy: {
              type: "object",
              properties: {
                column: { type: "string" },
                direction: { type: "string", enum: ["asc", "desc"] }
              }
            }
          },
          required: ["title", "groupBy", "columns", "aggregations"]
        }
      });

      environmentConfig.log('info', '[TableQuery] Generated config:', config);

      return config;

    } catch (error) {
      environmentConfig.log('error', '[TableQuery] Error:', error);
      throw error;
    }
  }

  /**
   * Execute query and fetch data for the table
   */
  async executeQuery(config, organizationId, dateRange, accountId = null) {
    try {
      environmentConfig.log('info', '[TableQuery] Executing query with config:', config);

      const { groupBy, filters = {} } = config;

      // Determine what entity to query
      const needsCallRecords = groupBy.includes('date') || 
                               groupBy.includes('call_status') ||
                               groupBy.includes('tracking_source') ||
                               filters.call_status ||
                               filters.tracking_source;

      if (needsCallRecords) {
        return await this.queryCallRecords(organizationId, dateRange, accountId, filters);
      } else {
        return await this.queryAggregatedMetrics(organizationId, dateRange, accountId, config);
      }

    } catch (error) {
      environmentConfig.log('error', '[TableQuery] Query error:', error);
      throw error;
    }
  }

  /**
   * Query call records for detailed reporting
   */
  async queryCallRecords(organizationId, dateRange, accountId = null, filters = {}) {
    try {
      const queryFilter = {
        organization_id: organizationId
      };

      if (accountId && accountId !== 'all') {
        queryFilter.account_id = accountId;
      }

      if (dateRange?.from) {
        // Filter by date range in query
        // Note: This is a simplified version, you'd need to handle date filtering properly
      }

      const records = await base44.entities.CallRecord.filter(queryFilter, '-start_time', 1000);

      // Transform to table format
      const tableData = records.map(record => ({
        date: record.start_time ? record.start_time.split('T')[0] : null,
        account_name: record.account_name,
        region: record.region,
        total_calls: 1,
        answered_calls: record.call_status === 'answered' ? 1 : 0,
        voicemail_calls: record.is_voicemail ? 1 : 0,
        missed_calls: record.call_status === 'missed' ? 1 : 0,
        working_hours_calls: record.is_working_hours ? 1 : 0,
        after_hours_calls: !record.is_working_hours ? 1 : 0,
        qualified_calls: record.qualified ? 1 : 0,
        call_duration: record.talk_time || 0,
        call_status: record.call_status,
        tracking_source: record.web_source
      }));

      environmentConfig.log('info', `[TableQuery] Fetched ${tableData.length} call records`);

      return tableData;

    } catch (error) {
      environmentConfig.log('error', '[TableQuery] CallRecord query error:', error);
      throw error;
    }
  }

  /**
   * Query aggregated metrics (faster for summary reports)
   */
  async queryAggregatedMetrics(organizationId, dateRange, accountId, config) {
    try {
      // Fetch from TransformedMetric entity
      const metricNames = config.columns
        .filter(col => !config.groupBy.includes(col.key))
        .map(col => col.key);

      const metricsData = {};

      for (const metricName of metricNames) {
        const metrics = await base44.entities.TransformedMetric.filter({
          metric_name: metricName
        }, '-period_start', 500);

        // Filter by organization and date range
        const filtered = metrics.filter(m => {
          const matchesOrg = m.segment?.data_source_id; // Has data source means it's synced
          
          if (accountId && accountId !== 'all') {
            const matchesAccount = m.segment?.account_id === accountId;
            if (!matchesAccount) return false;
          }

          if (dateRange?.from) {
            const metricDate = new Date(m.period_start);
            const fromDate = new Date(dateRange.from);
            const toDate = dateRange.to ? new Date(dateRange.to) : new Date();
            
            if (metricDate < fromDate || metricDate > toDate) return false;
          }

          return matchesOrg;
        });

        metricsData[metricName] = filtered;
      }

      // Combine metrics into table rows
      const tableData = [];
      const seenKeys = new Set();

      Object.keys(metricsData).forEach(metricName => {
        metricsData[metricName].forEach(metric => {
          const rowKey = `${metric.segment?.account_id}_${metric.segment?.region}_${metric.period_start}`;
          
          if (!seenKeys.has(rowKey)) {
            seenKeys.add(rowKey);
            
            const row = {
              date: metric.period_start ? metric.period_start.split('T')[0] : null,
              account_name: metric.segment?.account_name || 'Unknown',
              region: metric.segment?.region || 'Unknown'
            };

            // Add all metrics for this row
            Object.keys(metricsData).forEach(mn => {
              const matchingMetric = metricsData[mn].find(m => {
                return m.segment?.account_id === metric.segment?.account_id &&
                       m.segment?.region === metric.segment?.region &&
                       m.period_start === metric.period_start;
              });
              
              row[mn] = matchingMetric ? matchingMetric.aggregated_value : 0;
            });

            tableData.push(row);
          }
        });
      });

      environmentConfig.log('info', `[TableQuery] Generated ${tableData.length} aggregated rows`);

      return tableData;

    } catch (error) {
      environmentConfig.log('error', '[TableQuery] Metrics query error:', error);
      throw error;
    }
  }
}

export const tableQueryService = new TableQueryService();