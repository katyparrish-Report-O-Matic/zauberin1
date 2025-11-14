import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Backend function to run data transformation
 * Transforms CallRecords into TransformedMetrics with proper segments
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify authentication
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      return Response.json({ 
        error: 'Invalid JSON in request body',
        details: parseError.message 
      }, { status: 400 });
    }

    const { organizationId, dataSourceId, targetDate, startDate, endDate, mode = 'single' } = body;

    if (!organizationId) {
      return Response.json({ error: 'organizationId is required' }, { status: 400 });
    }

    console.log(`[Transform] 🔄 Starting transformation: mode=${mode}, org=${organizationId}`);

    let result;

    if (mode === 'range' && startDate && endDate) {
      // Transform date range
      result = await transformDateRange(base44, organizationId, dataSourceId, startDate, endDate);
    } else if (mode === 'organization') {
      // Transform all data sources in organization
      result = await transformOrganization(base44, organizationId, targetDate);
    } else {
      // Transform single date for specific data source
      if (!dataSourceId) {
        return Response.json({ error: 'dataSourceId is required for single date transformation' }, { status: 400 });
      }
      result = await transformCallRecords(base44, organizationId, dataSourceId, targetDate);
    }

    return Response.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('[Transform] ❌ Error:', error);
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});

/**
 * Transform CallRecords for a specific date
 */
async function transformCallRecords(base44, organizationId, dataSourceId, targetDate = null) {
  // If no date specified, use yesterday
  if (!targetDate) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    targetDate = yesterday.toISOString().split('T')[0];
  }

  console.log(`[Transform] 📊 Transforming ${targetDate}`);

  // Fetch all CallRecords for this organization and data source
  const allCallRecords = await base44.asServiceRole.entities.CallRecord.filter({
    organization_id: organizationId,
    data_source_id: dataSourceId
  }, '-start_time', 50000);

  console.log(`[Transform] 📞 Found ${allCallRecords.length} total CallRecords`);

  // Filter to target date
  const callRecordsForDate = allCallRecords.filter(call => {
    if (!call.start_time) return false;
    const callDate = call.start_time.split('T')[0];
    return callDate === targetDate;
  });

  console.log(`[Transform] 📅 ${callRecordsForDate.length} calls for ${targetDate}`);

  if (callRecordsForDate.length === 0) {
    console.log(`[Transform] ℹ️ No calls to transform`);
    return { 
      success: true,
      metricsCreated: 0, 
      date: targetDate,
      message: 'No call records found for this date'
    };
  }

  // Group by account_id
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

  console.log(`[Transform] 🏢 Processing ${Object.keys(callsByAccount).length} accounts`);

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
    
    const totalDuration = calls.reduce((sum, c) => sum + (c.talk_time || 0), 0);
    const avgDuration = answeredCalls > 0 ? Math.round(totalDuration / answeredCalls) : 0;
    const answerRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;

    // Create segment with proper data
    const segment = {
      platform: 'call_tracking',
      data_source_id: dataSourceId,
      organization_id: organizationId,
      account_id: accountData.account_id,
      account_name: accountData.account_name,
      region: accountData.region || 'Unknown'
    };

    // Define metrics
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

    // Create TransformedMetric records
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

  console.log(`[Transform] 💾 Creating ${metricsToCreate.length} metrics...`);

  // Delete existing metrics for this date
  const existingMetrics = await base44.asServiceRole.entities.TransformedMetric.filter({
    organization_id: organizationId,
    data_source_id: dataSourceId
  });

  const metricsToDelete = existingMetrics.filter(m => {
    if (!m.period_start) return false;
    const metricDate = m.period_start.split('T')[0];
    return metricDate === targetDate;
  });

  if (metricsToDelete.length > 0) {
    console.log(`[Transform] 🗑️ Deleting ${metricsToDelete.length} old metrics`);
    for (const metric of metricsToDelete) {
      await base44.asServiceRole.entities.TransformedMetric.delete(metric.id);
    }
  }

  // Bulk create new metrics
  if (metricsToCreate.length > 0) {
    await base44.asServiceRole.entities.TransformedMetric.bulkCreate(metricsToCreate);
    console.log(`[Transform] ✅ Created ${metricsToCreate.length} metrics`);
  }

  return {
    success: true,
    date: targetDate,
    metricsCreated: metricsToCreate.length,
    accountsProcessed: Object.keys(callsByAccount).length,
    callsProcessed: callRecordsForDate.length
  };
}

/**
 * Transform date range
 */
async function transformDateRange(base44, organizationId, dataSourceId, startDate, endDate) {
  console.log(`[Transform] 📅 Range: ${startDate} to ${endDate}`);

  const start = new Date(startDate);
  const end = new Date(endDate);
  const results = [];

  let currentDate = new Date(start);
  while (currentDate <= end) {
    const dateStr = currentDate.toISOString().split('T')[0];
    
    try {
      const result = await transformCallRecords(base44, organizationId, dataSourceId, dateStr);
      results.push(result);
      console.log(`[Transform] ✓ ${dateStr}: ${result.metricsCreated} metrics`);
    } catch (error) {
      console.error(`[Transform] ❌ ${dateStr}:`, error.message);
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

  console.log(`[Transform] ✅ Range complete: ${successCount}/${results.length} days, ${totalMetrics} metrics`);

  return {
    success: true,
    daysProcessed: results.length,
    daysSuccessful: successCount,
    totalMetricsCreated: totalMetrics,
    results
  };
}

/**
 * Transform all data sources in organization
 */
async function transformOrganization(base44, organizationId, targetDate = null) {
  console.log(`[Transform] 🏢 Organization ${organizationId}`);

  const dataSources = await base44.asServiceRole.entities.DataSource.filter({
    organization_id: organizationId,
    platform_type: 'call_tracking',
    enabled: true
  });

  if (dataSources.length === 0) {
    console.log(`[Transform] ℹ️ No active data sources`);
    return { 
      success: true, 
      dataSourcesProcessed: 0,
      message: 'No active call tracking data sources found'
    };
  }

  const results = [];

  for (const dataSource of dataSources) {
    try {
      const result = await transformCallRecords(base44, organizationId, dataSource.id, targetDate);
      results.push({
        dataSourceId: dataSource.id,
        dataSourceName: dataSource.name,
        ...result
      });
    } catch (error) {
      console.error(`[Transform] ❌ Data source ${dataSource.id}:`, error.message);
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

  console.log(`[Transform] ✅ Org complete: ${successCount}/${results.length} sources, ${totalMetrics} metrics`);

  return {
    success: true,
    dataSourcesProcessed: results.length,
    dataSourcesSuccessful: successCount,
    totalMetricsCreated: totalMetrics,
    results
  };
}