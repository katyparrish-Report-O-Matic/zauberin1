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
   * Execute query to fetch real CallRecord data
   */
  async executeTableQuery(config, organizationId, accountId = 'all') {
    try {
      environmentConfig.log('info', '[TableQuery] Executing query for organization:', organizationId);
      environmentConfig.log('info', '[TableQuery] Account filter:', accountId);

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

      // Transform to table format with all metrics
      const tableData = callRecords.map(record => ({
        date: record.start_time ? record.start_time.split('T')[0] : null,
        account_name: record.account_name || 'Unknown',
        region: record.region || 'Unknown',
        total_calls: 1,
        answered_calls: record.call_status === 'answered' ? 1 : 0,
        voicemail_calls: record.is_voicemail ? 1 : 0,
        missed_calls: record.call_status === 'missed' ? 1 : 0,
        working_hours_calls: record.is_working_hours ? 1 : 0,
        after_hours_calls: !record.is_working_hours ? 1 : 0,
        qualified_calls: record.qualified ? 1 : 0,
        call_duration: record.talk_time || 0,
        call_status: record.call_status || 'unknown'
      }));

      environmentConfig.log('info', `[TableQuery] Transformed to ${tableData.length} table rows`);

      return tableData;

    } catch (error) {
      environmentConfig.log('error', '[TableQuery] Query error:', error);
      throw error;
    }
  }
}

export const tableQueryService = new TableQueryService();