import React, { useEffect } from 'react';
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { dataSyncService } from "../sync/DataSyncService";
import { dailyTransformerService } from "../transform/DailyTransformerService";

/**
 * Job Scheduler Component
 * Manages scheduled background jobs for data syncing and transformation
 */
export default function JobScheduler() {
  
  // Fetch scheduled jobs
  const { data: scheduledJobs = [] } = useQuery({
    queryKey: ['scheduledJobs'],
    queryFn: async () => {
      const jobs = await base44.entities.ScheduledJob.filter({ enabled: true });
      return jobs;
    },
    refetchInterval: 60000, // Check every minute
    initialData: []
  });

  useEffect(() => {
    // Check and execute jobs
    const checkJobs = async () => {
      const now = new Date();

      for (const job of scheduledJobs) {
        try {
          // Check if job should run
          const nextRun = job.next_run ? new Date(job.next_run) : null;
          
          if (!nextRun || nextRun > now) {
            continue; // Not time to run yet
          }

          console.log(`[JobScheduler] 🚀 Running job: ${job.job_name}`);

          // Execute job based on type
          if (job.job_type === 'data_fetch') {
            await executeDataFetchJob(job);
          } else if (job.job_type === 'data_transformation') {
            await executeTransformationJob(job);
          } else if (job.job_type === 'quality_check') {
            await executeQualityCheckJob(job);
          } else if (job.job_type === 'data_cleanup') {
            await executeCleanupJob(job);
          }

          // Update next run time
          const nextRunTime = calculateNextRunTime(job.schedule);
          await base44.entities.ScheduledJob.update(job.id, {
            last_run: now.toISOString(),
            next_run: nextRunTime.toISOString()
          });

          console.log(`[JobScheduler] ✅ Job completed: ${job.job_name}`);

        } catch (error) {
          console.error(`[JobScheduler] ❌ Job failed: ${job.job_name}`, error);
          
          // Log execution failure
          await base44.entities.JobExecution.create({
            job_id: job.id,
            job_name: job.job_name,
            status: 'failed',
            started_at: now.toISOString(),
            completed_at: new Date().toISOString(),
            error_message: error.message
          });
        }
      }
    };

    // Run job check every minute
    const interval = setInterval(checkJobs, 60000);
    
    // Initial check
    checkJobs();

    return () => clearInterval(interval);
  }, [scheduledJobs]);

  return null; // This is a background service, no UI
}

/**
 * Execute data fetch job (sync from external APIs)
 */
async function executeDataFetchJob(job) {
  const startTime = new Date();
  
  try {
    // Get data source from configuration
    const dataSourceId = job.configuration?.data_source_id;
    
    if (!dataSourceId) {
      throw new Error('No data source configured for this job');
    }

    // Execute sync
    const syncJob = await dataSyncService.initializeSync(dataSourceId, 'scheduled');

    // Log execution
    await base44.entities.JobExecution.create({
      job_id: job.id,
      job_name: job.job_name,
      status: 'completed',
      started_at: startTime.toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime.getTime(),
      result_summary: {
        sync_job_id: syncJob.id
      }
    });

  } catch (error) {
    throw error;
  }
}

/**
 * Execute daily transformation job (CallRecords → TransformedMetrics)
 */
async function executeTransformationJob(job) {
  const startTime = new Date();
  
  try {
    const organizationId = job.organization_id;
    const dataSourceId = job.configuration?.data_source_id;
    const dateRange = job.configuration?.date_range;

    let result;

    if (dateRange && dateRange.start_date && dateRange.end_date) {
      // Transform date range
      result = await dailyTransformerService.transformDateRange(
        organizationId,
        dataSourceId,
        dateRange.start_date,
        dateRange.end_date
      );
    } else if (dataSourceId) {
      // Transform yesterday's data for specific data source
      result = await dailyTransformerService.transformCallRecords(
        organizationId,
        dataSourceId
      );
    } else {
      // Transform yesterday's data for all data sources in organization
      result = await dailyTransformerService.transformOrganization(organizationId);
    }

    // Log execution
    await base44.entities.JobExecution.create({
      job_id: job.id,
      job_name: job.job_name,
      status: 'completed',
      started_at: startTime.toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime.getTime(),
      records_processed: result.metricsCreated || result.totalMetricsCreated || 0,
      result_summary: result
    });

    console.log(`[JobScheduler] ✅ Transformation complete: ${result.metricsCreated || result.totalMetricsCreated || 0} metrics created`);

  } catch (error) {
    throw error;
  }
}

/**
 * Execute quality check job
 */
async function executeQualityCheckJob(job) {
  const startTime = new Date();
  
  try {
    // Check for data quality issues
    const issues = [];
    
    // Check for missing data
    const recentMetrics = await base44.entities.TransformedMetric.list('-period_start', 100);
    
    if (recentMetrics.length === 0) {
      issues.push({
        type: 'missing_data',
        severity: 'high',
        message: 'No recent TransformedMetric data found'
      });
    }

    // Check for empty segments
    const emptySegments = recentMetrics.filter(m => !m.segment || Object.keys(m.segment).length === 0);
    
    if (emptySegments.length > 0) {
      issues.push({
        type: 'schema_mismatch',
        severity: 'critical',
        message: `${emptySegments.length} metrics have empty segment data`,
        affected_count: emptySegments.length
      });
    }

    // Log any issues found
    for (const issue of issues) {
      await base44.entities.DataQualityLog.create({
        metric_name: 'system_check',
        issue_type: issue.type,
        severity: issue.severity,
        description: issue.message,
        affected_records: issue.affected_count || 0
      });
    }

    // Log execution
    await base44.entities.JobExecution.create({
      job_id: job.id,
      job_name: job.job_name,
      status: 'completed',
      started_at: startTime.toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime.getTime(),
      result_summary: {
        issues_found: issues.length,
        issues
      }
    });

  } catch (error) {
    throw error;
  }
}

/**
 * Execute cleanup job
 */
async function executeCleanupJob(job) {
  const startTime = new Date();
  
  try {
    const cleanupDays = job.configuration?.cleanup_days || 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - cleanupDays);

    // Clean up old job executions
    const oldExecutions = await base44.entities.JobExecution.filter({});
    let deletedCount = 0;

    for (const execution of oldExecutions) {
      if (new Date(execution.created_date) < cutoffDate) {
        await base44.entities.JobExecution.delete(execution.id);
        deletedCount++;
      }
    }

    // Log execution
    await base44.entities.JobExecution.create({
      job_id: job.id,
      job_name: job.job_name,
      status: 'completed',
      started_at: startTime.toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime.getTime(),
      records_processed: deletedCount,
      result_summary: {
        records_deleted: deletedCount,
        cutoff_date: cutoffDate.toISOString()
      }
    });

  } catch (error) {
    throw error;
  }
}

/**
 * Calculate next run time based on schedule
 */
function calculateNextRunTime(schedule) {
  const now = new Date();
  
  switch (schedule) {
    case 'hourly':
      now.setHours(now.getHours() + 1);
      now.setMinutes(0);
      now.setSeconds(0);
      return now;
      
    case 'daily':
      now.setDate(now.getDate() + 1);
      now.setHours(0);
      now.setMinutes(0);
      now.setSeconds(0);
      return now;
      
    case 'weekly':
      now.setDate(now.getDate() + 7);
      now.setHours(0);
      now.setMinutes(0);
      now.setSeconds(0);
      return now;
      
    default:
      // Default to daily
      now.setDate(now.getDate() + 1);
      now.setHours(0);
      now.setMinutes(0);
      now.setSeconds(0);
      return now;
  }
}