import { base44 } from "@/api/base44Client";
import { environmentConfig } from "../config/EnvironmentConfig";

/**
 * Table Query Service - SIMPLIFIED
 * Queries CallRecords directly and aggregates on-demand
 * No more TransformedMetric dependency
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
        'average_talk_time',
        'answer_rate',
        'account_type',
        'industry',
        'number_of_employees',
        'annual_revenue',
        'owner_name'
      ];

      const availableDimensions = [
        'account_name',
        'region',
        'date',
        'call_status',
        'web_source',
        'web_campaign',
        'billing_state',
        'billing_city',
        'account_type',
        'owner_name'
      ];

      // Use LLM to interpret the request
      const config = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a business intelligence expert creating Looker-style data tables.

User's request: "${naturalLanguageRequest}"
${dateContext}

Available metrics: ${availableMetrics.join(', ')}
Available dimensions: ${availableDimensions.join(', ')}

IMPORTANT RULES:
1. Identify dimensions to GROUP BY (account_name, region, date, billing_state, account_type, etc.)
2. Determine data source: "calls" if request mentions calls/contacts/metrics, "salesforce" if mentions accounts/types/locations
3. ALWAYS include account_name in groupBy unless explicitly excluded
4. For "by region and account" → groupBy: ["billing_state", "account_name"]
5. For "accounts by type" → groupBy: ["account_type", "account_name"]
6. Show subtotals when grouping by multiple levels
7. Format percentages (answer_rate), numbers (calls/employees), currency (revenue), durations (seconds)
8. Set dataSource: "calls" or "salesforce" based on request intent

Generate a complete table configuration.`,
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
            },
            dataSource: { 
              type: "string",
              enum: ["calls", "salesforce"],
              default: "calls",
              description: "Data source to query"
            }
          },
          required: ["title", "groupBy", "columns", "dataSource"]
        }
      });

      // Ensure we have proper defaults
      config.showSubtotals = config.showSubtotals ?? true;
      config.showGrandTotal = config.showGrandTotal ?? true;
      config.dataSource = config.dataSource || 'calls';

      environmentConfig.log('info', '[TableQuery] Generated config:', config);
      environmentConfig.log('info', '[TableQuery] Data source:', config.dataSource);

      return config;

    } catch (error) {
      environmentConfig.log('error', '[TableQuery] Error:', error);
      throw error;
    }
  }

  /**
    * Execute query - Fetch data and aggregate on-demand
    */
  async executeTableQuery(config, organizationId, accountId = 'all') {
    try {
      environmentConfig.log('info', '[TableQuery] Executing query for organization:', organizationId);
      environmentConfig.log('info', '[TableQuery] Data source:', config.dataSource);
      environmentConfig.log('info', '[TableQuery] GroupBy dimensions:', config.groupBy);

      const dataSource = config.dataSource || 'calls';

      if (dataSource === 'salesforce') {
        return await this.executeSalesforceQuery(config, organizationId);
      } else {
        return await this.executeCallsQuery(config, organizationId, accountId);
      }

    } catch (error) {
      environmentConfig.log('error', '[TableQuery] Query error:', error);
      throw error;
    }
  }

  /**
   * Execute calls query
   */
  async executeCallsQuery(config, organizationId, accountId = 'all') {
    const filter = {
      organization_id: organizationId
    };

    if (accountId && accountId !== 'all') {
      filter.account_id = accountId;
    }

    const callRecords = await base44.entities.CallRecord.filter(
      filter,
      '-start_time',
      10000
    );

    environmentConfig.log('info', `[TableQuery] Fetched ${callRecords.length} call records`);

    if (callRecords.length === 0) {
      return [];
    }

    const groupBy = config.groupBy || ['account_name'];
    const aggregatedData = this.aggregateCallRecords(callRecords, groupBy);

    environmentConfig.log('info', `[TableQuery] Aggregated into ${aggregatedData.length} groups`);

    return aggregatedData;
  }

  /**
   * Execute Salesforce query
   */
  async executeSalesforceQuery(config, organizationId) {
    const accounts = await base44.entities.SalesforceAccount.filter(
      { organization_id: organizationId },
      '-account_name',
      10000
    );

    environmentConfig.log('info', `[TableQuery] Fetched ${accounts.length} Salesforce accounts`);

    if (accounts.length === 0) {
      return [];
    }

    const groupBy = config.groupBy || ['account_name'];
    const aggregatedData = this.aggregateSalesforceAccounts(accounts, groupBy);

    environmentConfig.log('info', `[TableQuery] Aggregated into ${aggregatedData.length} groups`);

    return aggregatedData;
  }

  /**
   * Aggregate call records by specified dimensions
   */
  aggregateCallRecords(callRecords, groupByDimensions) {
    const groups = {};

    callRecords.forEach(call => {
      // Create group key from dimensions
      const groupKey = groupByDimensions
        .map(dim => {
          if (dim === 'date') {
            return call.start_time ? call.start_time.split('T')[0] : 'Unknown';
          }
          return call[dim] || 'Unknown';
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
            groups[groupKey][dim] = call.start_time ? call.start_time.split('T')[0] : 'Unknown';
          } else {
            groups[groupKey][dim] = call[dim] || 'Unknown';
          }
        });

        // Initialize metrics
        groups[groupKey].total_calls = 0;
        groups[groupKey].answered_calls = 0;
        groups[groupKey].voicemail_calls = 0;
        groups[groupKey].missed_calls = 0;
        groups[groupKey].working_hours_calls = 0;
        groups[groupKey].after_hours_calls = 0;
        groups[groupKey].qualified_calls = 0;
        groups[groupKey].average_duration = 0;
        groups[groupKey].average_talk_time = 0;
        groups[groupKey].answer_rate = 0;
        groups[groupKey]._totalDuration = 0;
        groups[groupKey]._totalTalkTime = 0;
        groups[groupKey]._callsWithDuration = 0;
      }

      const group = groups[groupKey];

      // Count calls
      group.total_calls++;

      // Status-based counts
      if (call.call_status === 'answered') {
        group.answered_calls++;
      } else if (call.call_status === 'voicemail') {
        group.voicemail_calls++;
      } else if (call.call_status === 'missed') {
        group.missed_calls++;
      }

      // Working hours
      if (call.is_working_hours) {
        group.working_hours_calls++;
      } else {
        group.after_hours_calls++;
      }

      // Qualified calls
      if (call.qualified) {
        group.qualified_calls++;
      }

      // Duration tracking
      if (call.duration) {
        group._totalDuration += call.duration;
        group._callsWithDuration++;
      }

      if (call.talk_time) {
        group._totalTalkTime += call.talk_time;
      }
    });

    // Calculate averages and rates
    const aggregated = Object.values(groups).map(group => {
      // Average duration
      if (group._callsWithDuration > 0) {
        group.average_duration = Math.round(group._totalDuration / group._callsWithDuration);
      }

      // Average talk time
      if (group.answered_calls > 0) {
        group.average_talk_time = Math.round(group._totalTalkTime / group.answered_calls);
      }

      // Answer rate
      if (group.total_calls > 0) {
        group.answer_rate = Math.round((group.answered_calls / group.total_calls) * 100);
      }

      // Remove temporary fields
      delete group._totalDuration;
      delete group._totalTalkTime;
      delete group._callsWithDuration;
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

  /**
   * Aggregate Salesforce accounts by specified dimensions
   */
  aggregateSalesforceAccounts(accounts, groupByDimensions) {
    const groups = {};

    accounts.forEach(account => {
      const groupKey = groupByDimensions
        .map(dim => {
          if (dim === 'account_type') return account.type || 'Unknown';
          if (dim === 'billing_state') return account.billing_state || 'Unknown';
          if (dim === 'billing_city') return account.billing_city || 'Unknown';
          if (dim === 'owner_name') return account.owner_name || 'Unknown';
          return account[dim] || 'Unknown';
        })
        .join('|||');

      if (!groups[groupKey]) {
        groups[groupKey] = {
          _groupKey: groupKey
        };

        groupByDimensions.forEach(dim => {
          if (dim === 'account_type') {
            groups[groupKey].account_type = account.type || 'Unknown';
          } else if (dim === 'billing_state') {
            groups[groupKey].billing_state = account.billing_state || 'Unknown';
          } else if (dim === 'billing_city') {
            groups[groupKey].billing_city = account.billing_city || 'Unknown';
          } else if (dim === 'owner_name') {
            groups[groupKey].owner_name = account.owner_name || 'Unknown';
          } else {
            groups[groupKey][dim] = account[dim] || 'Unknown';
          }
        });

        groups[groupKey].account_count = 0;
        groups[groupKey].total_employees = 0;
        groups[groupKey].total_revenue = 0;
        groups[groupKey]._accountsWithRevenue = 0;
      }

      const group = groups[groupKey];
      group.account_count++;

      if (account.number_of_employees) {
        group.total_employees += account.number_of_employees;
      }

      if (account.annual_revenue) {
        group.total_revenue += account.annual_revenue;
        group._accountsWithRevenue++;
      }
    });

    const aggregated = Object.values(groups).map(group => {
      group.average_employees = group.account_count > 0 
        ? Math.round(group.total_employees / group.account_count) 
        : 0;
      
      group.average_revenue = group._accountsWithRevenue > 0
        ? Math.round(group.total_revenue / group._accountsWithRevenue)
        : 0;

      delete group._accountsWithRevenue;
      delete group._groupKey;

      return group;
    });

    const firstDimension = groupByDimensions[0];
    aggregated.sort((a, b) => {
      const dimCompare = String(a[firstDimension]).localeCompare(String(b[firstDimension]));
      if (dimCompare !== 0) return dimCompare;
      return (b.account_count || 0) - (a.account_count || 0);
    });

    return aggregated;
  }
}

export const tableQueryService = new TableQueryService();