import { base44 } from "@/api/base44Client";
import { environmentConfig } from "../config/EnvironmentConfig";

/**
 * Daily Transformer Service
 * STEP 2: Reads CallRecords and creates aggregated TransformedMetrics with proper segment data
 * This is the second step in the two-step architecture (sync → transform)
 */
class DailyTransformerService {
  
  /**
   * Run daily transformation for a specific date or date range
   */
  async transformCallRecords(organizationId, dataSourceId, targetDate = null) {
    try {
      // If no date specified, use yesterday
      if (!targetDate) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        targetDate = yesterday.toISOString().split('T')[0];
      }

      console.log(`[Transformer] 🔄 Starting transformation for ${targetDate}`);

      // Fetch all CallRecords for the target date
      const allCallRecords = await base44.entities.CallRecord.filter({
        organization_id: organizationId,
        data_source_id: dataSourceId
      }, '-start_time', 50000);

      // Filter to target date
      const callRecordsForDate = allCallRecords.filter(call => {
        if (!call.start_time) return false;
        const callDate = call.start_time.split('T')[0];
        return callDate === targetDate;
      });

      console.log(`[Transformer] 📊 Found ${callRecordsForDate.length} calls for ${targetDate}`);

      if (callRecordsForDate.length === 0) {
        console.log(`[Transformer] ℹ️ No calls to transform for ${targetDate}`);
        return { metricsCreated: 0, date: targetDate };
      }

      // Group by account_id to create metrics per account
      const callsByAccount = {};
      
      callRecordsForDate.forEach(call => {
        const accountKey = call.account_id;
        
        if (!callsByAccount[accountKey]) {
          callsByAccount[accountKey] = {
            account_id: call.account_id,
            account_name: call.account_name,
            region: call.region,
            calls: []
          };
        }
        
        callsByAccount[accountKey].calls.push(call);
      });

      console.log(`[Transformer] 🏢 Processing ${Object.keys(callsByAccount).length} accounts`);

      // Calculate metrics for each account
      const metricsToCreate = [];

      for (const [accountId, accountData] of Object.entries(callsByAccount)) {
        const calls = accountData.calls;
        
        // Calculate aggregated metrics
        const totalCalls = calls.length;
        const answeredCalls = calls.filter(c => c.call_status === 'answered').length;
        const missedCalls = calls.filter(c => c.call_status === 'missed').length;
        const voicemailCalls = calls.filter(c => c.is_voicemail === true).length;
        const qualifiedCalls = calls.filter(c => c.qualified === true).length;
        const workingHoursCalls = calls.filter(c => c.is_working_hours === true).length;
        const afterHoursCalls = calls.filter(c => c.is_working_hours === false).length;
        
        // Calculate average duration
        const totalDuration = calls.reduce((sum, c) => sum + (c.talk_time || 0), 0);
        const avgDuration = answeredCalls > 0 ? Math.round(totalDuration / answeredCalls) : 0;
        
        // Calculate answer rate
        const answerRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;

        // Create segment object with proper account/region data
        const segment = {
          platform: 'call_tracking',
          data_source_id: dataSourceId,
          organization_id: organizationId,
          account_id: accountData.account_id,
          account_name: accountData.account_name,
          region: accountData.region || 'Unknown'
        };

        // Define metrics to store
        const metricDefinitions = [
          { name: 'total_calls', value: totalCalls },
          { name: 'answered_calls', value: answeredCalls },
          { name: 'missed_calls', value: missedCalls },
          { name: 'voicemail_calls', value: voicemailCalls },
          { name: 'qualified_calls', value: qualifiedCalls },
          { name: 'working_hours_calls', value: workingHoursCalls },
          { name: 'after_hours_calls', value: afterHoursCalls },
          { name: 'average_duration', value: avgDuration },
          { name: 'answer_rate', value: answerRate }
        ];

        // Create TransformedMetric records for each metric
        metricDefinitions.forEach(metric => {
          metricsToCreate.push({
            metric_name: metric.name,
            time_period: 'daily',
            period_start: targetDate + 'T00:00:00.000Z',
            period_end: targetDate + 'T23:59:59.999Z',
            raw_value: metric.value,
            aggregated_value: metric.value,
            segment: segment,
            derived_metrics: {
              growth_rate: 0,
              moving_average: metric.value,
              percent_of_total: 0
            },
            data_quality_score: 100
          });
        });
      }

      console.log(`[Transformer] 💾 Creating ${metricsToCreate.length} TransformedMetric records...`);

      // Delete existing metrics for this date to avoid duplicates
      const existingMetrics = await base44.entities.TransformedMetric.filter({
        organization_id: organizationId,
        data_source_id: dataSourceId
      });

      const metricsToDelete = existingMetrics.filter(m => {
        if (!m.period_start) return false;
        const metricDate = m.period_start.split('T')[0];
        return metricDate === targetDate;
      });

      if (metricsToDelete.length > 0) {
        console.log(`[Transformer] 🗑️ Deleting ${metricsToDelete.length} existing metrics for ${targetDate}`);
        for (const metric of metricsToDelete) {
          await base44.entities.TransformedMetric.delete(metric.id);
        }
      }

      // Bulk create new metrics
      if (metricsToCreate.length > 0) {
        await base44.entities.TransformedMetric.bulkCreate(metricsToCreate);
        console.log(`[Transformer] ✅ Created ${metricsToCreate.length} TransformedMetric records`);
      }

      return {
        success: true,
        date: targetDate,
        metricsCreated: metricsToCreate.length,
        accountsProcessed: Object.keys(callsByAccount).length,
        callsProcessed: callRecordsForDate.length
      };

    } catch (error) {
      environmentConfig.log('error', '[Transformer] Error:', error);
      throw error;
    }
  }

  /**
   * Run transformation for a date range
   */
  async transformDateRange(organizationId, dataSourceId, startDate, endDate) {
    try {
      console.log(`[Transformer] 🔄 Transforming date range: ${startDate} to ${endDate}`);

      const start = new Date(startDate);
      const end = new Date(endDate);
      const results = [];

      let currentDate = new Date(start);
      while (currentDate <= end) {
        const dateStr = currentDate.toISOString().split('T')[0];
        
        try {
          const result = await this.transformCallRecords(organizationId, dataSourceId, dateStr);
          results.push(result);
          console.log(`[Transformer] ✓ Completed ${dateStr}: ${result.metricsCreated} metrics`);
        } catch (error) {
          console.error(`[Transformer] ❌ Failed ${dateStr}:`, error.message);
          results.push({
            success: false,
            date: dateStr,
            error: error.message
          });
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      const totalMetrics = results.reduce((sum, r) => sum + (r.metricsCreated || 0), 0);
      const successCount = results.filter(r => r.success).length;

      console.log(`[Transformer] ✅ Range complete: ${successCount}/${results.length} days, ${totalMetrics} total metrics`);

      return {
        success: true,
        daysProcessed: results.length,
        daysSuccessful: successCount,
        totalMetricsCreated: totalMetrics,
        results
      };

    } catch (error) {
      environmentConfig.log('error', '[Transformer] Range error:', error);
      throw error;
    }
  }

  /**
   * Run transformation for all data sources in an organization
   */
  async transformOrganization(organizationId, targetDate = null) {
    try {
      console.log(`[Transformer] 🏢 Transforming all data sources for organization ${organizationId}`);

      const dataSources = await base44.entities.DataSource.filter({
        organization_id: organizationId,
        platform_type: 'call_tracking',
        enabled: true
      });

      if (dataSources.length === 0) {
        console.log(`[Transformer] ℹ️ No active call tracking data sources found`);
        return { success: true, dataSourcesProcessed: 0 };
      }

      const results = [];

      for (const dataSource of dataSources) {
        try {
          const result = await this.transformCallRecords(organizationId, dataSource.id, targetDate);
          results.push({
            dataSourceId: dataSource.id,
            dataSourceName: dataSource.name,
            ...result
          });
        } catch (error) {
          console.error(`[Transformer] ❌ Failed data source ${dataSource.id}:`, error.message);
          results.push({
            dataSourceId: dataSource.id,
            dataSourceName: dataSource.name,
            success: false,
            error: error.message
          });
        }
      }

      const totalMetrics = results.reduce((sum, r) => sum + (r.metricsCreated || 0), 0);
      const successCount = results.filter(r => r.success).length;

      console.log(`[Transformer] ✅ Organization complete: ${successCount}/${results.length} sources, ${totalMetrics} total metrics`);

      return {
        success: true,
        dataSourcesProcessed: results.length,
        dataSourcesSuccessful: successCount,
        totalMetricsCreated: totalMetrics,
        results
      };

    } catch (error) {
      environmentConfig.log('error', '[Transformer] Organization error:', error);
      throw error;
    }
  }
}

export const dailyTransformerService = new DailyTransformerService();