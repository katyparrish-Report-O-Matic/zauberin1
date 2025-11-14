import { base44 } from "@/api/base44Client";
import { environmentConfig } from "../config/EnvironmentConfig";

/**
 * Table Query Service
 * Translates natural language to database queries for real CallRecord data
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
        'call_status'
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
2. Metrics should be aggregated (sum for counts, avg for rates/durations)
3. ALWAYS include account_name unless user specifically says otherwise
4. For "by region and account" → groupBy: ["region", "account_name"]
5. For "by account" → groupBy: ["account_name"]
6. Show subtotals when grouping by multiple levels
7. Format percentages (answer_rate), numbers (calls), durations (seconds)

Generate a complete table configuration that queries REAL data.`,
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
                  key: { type: "string", description: "Field name from CallRecord" },
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
   * Execute query to fetch real CallRecord data and aggregate by groupBy dimensions
   */
  async executeTableQuery(config, organizationId, accountId = 'all') {
    try {
      environmentConfig.log('info', '[TableQuery] Executing query for organization:', organizationId);
      environmentConfig.log('info', '[TableQuery] Account filter:', accountId);
      environmentConfig.log('info', '[TableQuery] GroupBy dimensions:', config.groupBy);

      // Build query filter
      const queryFilter = {
        organization_id: organizationId
      };

      // Add account filter if specific account is selected
      if (accountId && accountId !== 'all') {
        queryFilter.account_id = accountId;
      }

      environmentConfig.log('info', '[TableQuery] Fetching CallRecords with filter:', queryFilter);
      const callRecords = await base44.entities.CallRecord.filter(queryFilter, '-start_time', 1000);

      environmentConfig.log('info', `[TableQuery] Fetched ${callRecords.length} call records`);

      if (callRecords.length === 0) {
        return [];
      }

      // Transform each call record to include calculated metrics
      const transformedRecords = callRecords.map(record => ({
        // Dimensions
        date: record.start_time ? record.start_time.split('T')[0] : 'Unknown',
        account_name: record.account_name || 'Unknown',
        account_id: record.account_id || 'Unknown',
        region: record.region || 'Unknown',
        call_status: record.call_status || 'unknown',
        
        // Metrics (raw values for aggregation)
        total_calls: 1,
        answered_calls: record.call_status === 'answered' ? 1 : 0,
        voicemail_calls: record.is_voicemail ? 1 : 0,
        missed_calls: record.call_status === 'missed' ? 1 : 0,
        working_hours_calls: record.is_working_hours ? 1 : 0,
        after_hours_calls: !record.is_working_hours ? 1 : 0,
        qualified_calls: record.qualified ? 1 : 0,
        call_duration: record.talk_time || 0,
        
        // Keep original record for debugging
        _original: record
      }));

      // Group and aggregate data based on groupBy dimensions
      const groupBy = config.groupBy || ['account_name'];
      const aggregatedData = this.aggregateData(transformedRecords, groupBy);

      environmentConfig.log('info', `[TableQuery] Aggregated into ${aggregatedData.length} groups`);

      return aggregatedData;

    } catch (error) {
      environmentConfig.log('error', '[TableQuery] Query error:', error);
      throw error;
    }
  }

  /**
   * Aggregate data by specified dimensions
   */
  aggregateData(records, groupByDimensions) {
    const groups = {};

    // Group records
    records.forEach(record => {
      // Create group key from dimensions
      const groupKey = groupByDimensions
        .map(dim => record[dim] || 'Unknown')
        .join('|||');

      if (!groups[groupKey]) {
        // Initialize group with dimension values
        groups[groupKey] = {
          _groupKey: groupKey
        };
        
        // Add dimension values
        groupByDimensions.forEach(dim => {
          groups[groupKey][dim] = record[dim] || 'Unknown';
        });

        // Initialize metric accumulators
        groups[groupKey].total_calls = 0;
        groups[groupKey].answered_calls = 0;
        groups[groupKey].voicemail_calls = 0;
        groups[groupKey].missed_calls = 0;
        groups[groupKey].working_hours_calls = 0;
        groups[groupKey].after_hours_calls = 0;
        groups[groupKey].qualified_calls = 0;
        groups[groupKey].total_duration = 0;
        groups[groupKey]._recordCount = 0;
      }

      // Aggregate metrics
      const group = groups[groupKey];
      group.total_calls += record.total_calls;
      group.answered_calls += record.answered_calls;
      group.voicemail_calls += record.voicemail_calls;
      group.missed_calls += record.missed_calls;
      group.working_hours_calls += record.working_hours_calls;
      group.after_hours_calls += record.after_hours_calls;
      group.qualified_calls += record.qualified_calls;
      group.total_duration += record.call_duration;
      group._recordCount++;
    });

    // Calculate derived metrics
    const aggregated = Object.values(groups).map(group => {
      // Calculate average_duration
      const average_duration = group.answered_calls > 0 
        ? Math.round(group.total_duration / group.answered_calls)
        : 0;

      // Calculate answer_rate (percentage)
      const answer_rate = group.total_calls > 0
        ? Math.round((group.answered_calls / group.total_calls) * 100)
        : 0;

      return {
        ...group,
        average_duration,
        answer_rate,
        // Remove temporary fields
        total_duration: undefined,
        _recordCount: undefined,
        _groupKey: undefined
      };
    });

    // Sort by first dimension, then by total_calls descending
    const firstDimension = groupByDimensions[0];
    aggregated.sort((a, b) => {
      const dimCompare = String(a[firstDimension]).localeCompare(String(b[firstDimension]));
      if (dimCompare !== 0) return dimCompare;
      return b.total_calls - a.total_calls;
    });

    return aggregated;
  }
}

export const tableQueryService = new TableQueryService();