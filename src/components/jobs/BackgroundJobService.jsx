
import { base44 } from "@/api/base44Client";
import { dataTransformationService } from "../data/DataTransformationService";
import { backupService } from "../backup/BackupService";
import { cacheService } from "../cache/CacheService";
import { archivalService } from "../performance/ArchivalService";
import { productionApiService } from "../api/ProductionApiService";

/**
 * Background Job Service
 * Handles scheduled data fetching, report generation, and cleanup
 */
class BackgroundJobService {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Check and execute due jobs
   */
  async checkAndExecuteJobs() {
    if (this.isRunning) {
      console.log('[BackgroundJobs] Already running, skipping...');
      return;
    }

    try {
      this.isRunning = true;
      const now = new Date();

      // Get all enabled jobs
      const jobs = await base44.entities.ScheduledJob.filter({ enabled: true });

      for (const job of jobs) {
        // Check if job is due
        if (this.isJobDue(job, now)) {
          console.log(`[BackgroundJobs] Executing job: ${job.job_name}`);
          await this.executeJob(job);
        }
      }
    } catch (error) {
      console.error('[BackgroundJobs] Error checking jobs:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check if job should run
   */
  isJobDue(job, now) {
    if (!job.next_run) {
      return true; // Never run before
    }

    const nextRun = new Date(job.next_run);
    return now >= nextRun;
  }

  /**
   * Execute a job
   */
  async executeJob(job) {
    const execution = await base44.entities.JobExecution.create({
      job_id: job.id,
      job_name: job.job_name,
      status: 'running',
      started_at: new Date().toISOString()
    });

    const startTime = Date.now();

    try {
      let result;

      switch (job.job_type) {
        case 'data_fetch':
          result = await this.executeDataFetch(job);
          break;
        case 'report_generation':
          result = await this.executeReportGeneration(job);
          break;
        case 'data_cleanup':
          result = await this.executeDataCleanup(job);
          break;
        case 'quality_check':
          result = await this.executeDataQualityCheck(job);
          break;
        case 'backup':
          result = await this.executeBackup(job);
          break;
        case 'api_health_check':
          result = await this.executeApiHealthCheck(job);
          break;
        case 'data_prefetch':
          result = await this.executeDataPrefetch(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.job_type}`);
      }

      const duration = Date.now() - startTime;

      // Update execution as completed
      await base44.entities.JobExecution.update(execution.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        duration_ms: duration,
        records_processed: result.recordsProcessed || 0,
        result_summary: result.summary || {}
      });

      // Update job next run time
      await this.updateNextRunTime(job);

      console.log(`[BackgroundJobs] Job ${job.job_name} completed in ${duration}ms`);

    } catch (error) {
      const duration = Date.now() - startTime;

      // Update execution as failed
      await base44.entities.JobExecution.update(execution.id, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        duration_ms: duration,
        error_message: error.message
      });

      console.error(`[BackgroundJobs] Job ${job.job_name} failed:`, error);
    }
  }

  /**
   * Execute data fetch job
   */
  async executeDataFetch(job) {
    const metrics = job.configuration?.metrics || ['revenue', 'users'];
    let totalRecords = 0;
    const summary = {};

    for (const metric of metrics) {
      // Generate mock data (replace with real API call)
      const mockData = this.generateMockDataForMetric(metric);

      // Transform and store
      const transformed = await dataTransformationService.transformData(mockData, {
        metric_name: metric,
        time_period: 'hourly',
        segment_by: []
      });

      totalRecords += transformed.data.length;
      summary[metric] = {
        records: transformed.data.length,
        quality_score: transformed.quality_score
      };
    }

    return {
      recordsProcessed: totalRecords,
      summary
    };
  }

  /**
   * Execute report generation job
   */
  async executeReportGeneration(job) {
    const reportType = job.configuration?.report_type || 'daily_summary';

    // Fetch recent transformed data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - (reportType === 'weekly' ? 7 : 1));

    const metrics = await base44.entities.TransformedMetric.filter({
      time_period: 'daily'
    });

    // Filter by date range
    const filteredMetrics = metrics.filter(m => {
      const date = new Date(m.period_start);
      return date >= startDate && date <= endDate;
    });

    // Generate summary
    const summary = {
      report_type: reportType,
      period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
      total_records: filteredMetrics.length,
      metrics_count: new Set(filteredMetrics.map(m => m.metric_name)).size,
      average_quality: filteredMetrics.reduce((sum, m) => sum + (m.data_quality_score || 0), 0) / filteredMetrics.length
    };

    // Store report (in a real system, generate PDF/CSV here)
    console.log('[BackgroundJobs] Generated report:', summary);

    return {
      recordsProcessed: filteredMetrics.length,
      summary
    };
  }

  /**
   * Execute data cleanup job
   */
  async executeDataCleanup(job) {
    const cleanupDays = job.configuration?.cleanup_days || 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - cleanupDays);

    let deletedCount = 0;

    // Clean expired cache
    const cacheCleanup = await cacheService.cleanupExpired();
    deletedCount += cacheCleanup;

    // Run archival for all entities
    const orgId = job.configuration?.organization_id;
    // Check if orgId is provided before attempting archival, or handle it within archivalService
    let archivalResults = {};
    let totalArchived = 0;
    if (orgId) {
      archivalResults = await archivalService.runFullArchival(orgId);
      totalArchived = Object.values(archivalResults).reduce((sum, result) => {
        // Ensure result.archived is a number before adding
        return sum + (typeof result.archived === 'number' ? result.archived : 0);
      }, 0);
      deletedCount += totalArchived;
    } else {
      console.warn('[BackgroundJobs] Data cleanup job configured with archival but no organization_id provided. Skipping archival.');
      archivalResults = { skipped: 'No organization_id provided' };
    }
    
    // Archive old transformed metrics
    const oldMetrics = await base44.entities.TransformedMetric.list();
    for (const metric of oldMetrics) {
      if (new Date(metric.period_start) < cutoffDate) {
        await base44.entities.TransformedMetric.delete(metric.id);
        deletedCount++;
      }
    }

    // Clean old job executions (keep last 100)
    const executions = await base44.entities.JobExecution.list('-created_date');
    if (executions.length > 100) {
      for (let i = 100; i < executions.length; i++) {
        await base44.entities.JobExecution.delete(executions[i].id);
        deletedCount++;
      }
    }

    return {
      recordsProcessed: deletedCount,
      summary: {
        deleted_records: deletedCount,
        cache_cleaned: cacheCleanup,
        archived_records: totalArchived,
        cutoff_date: cutoffDate.toISOString(),
        archival_details: archivalResults
      }
    };
  }

  /**
   * Execute data quality check job (placeholder)
   */
  async executeDataQualityCheck(job) {
    console.log(`[BackgroundJobs] Executing data quality check for job: ${job.job_name}`);
    // This is a placeholder. Real implementation would involve:
    // 1. Fetching data based on job configuration (e.g., specific metrics, time ranges)
    // 2. Applying data quality rules (e.g., completeness, accuracy, consistency)
    // 3. Storing quality reports or alerts.

    const checkResult = {
      overall_score: Math.floor(Math.random() * 100),
      issues_found: Math.floor(Math.random() * 10),
      last_checked: new Date().toISOString()
    };

    console.log('[BackgroundJobs] Data quality check completed:', checkResult);

    return {
      recordsProcessed: 1, // Represents one check run
      summary: checkResult
    };
  }

  /**
   * Execute backup job
   */
  async executeBackup(job) {
    const orgId = job.configuration?.organization_id;

    if (!orgId) {
      throw new Error('Organization ID required for backup job');
    }

    const backup = await backupService.createFullBackup(orgId, job.job_name);

    // Clean up expired backups
    const deletedCount = await backupService.cleanupExpiredBackups(orgId);

    return {
      recordsProcessed: 1,
      summary: {
        backup_id: backup.id,
        backup_size: backupService.formatBytes(backup.size_bytes),
        expired_backups_deleted: deletedCount
      }
    };
  }

  /**
   * Execute API health check job
   */
  async executeApiHealthCheck(job) {
    const orgId = job.configuration?.organization_id;
    
    if (!orgId) {
      throw new Error('Organization ID required for health check');
    }

    const result = await productionApiService.checkApiHealth(orgId);

    return {
      recordsProcessed: 1,
      summary: {
        healthy: result.healthy,
        duration_ms: result.duration,
        error: result.error
      }
    };
  }

  /**
   * Execute data prefetch job
   */
  async executeDataPrefetch(job) {
    const orgId = job.configuration?.organization_id;
    
    if (!orgId) {
      throw new Error('Organization ID required for data prefetch');
    }

    const result = await productionApiService.prefetchDashboardData(orgId);

    return {
      recordsProcessed: result.prefetched || 0,
      summary: {
        prefetched: result.prefetched,
        total_metrics: result.total,
        error: result.error
      }
    };
  }

  /**
   * Update job's next run time
   */
  async updateNextRunTime(job) {
    const now = new Date();
    let nextRun = new Date(now);

    switch (job.schedule) {
      case 'hourly':
        nextRun.setHours(nextRun.getHours() + 1);
        break;
      case 'daily':
        nextRun.setDate(nextRun.getDate() + 1);
        nextRun.setHours(0, 0, 0, 0);
        break;
      case 'weekly':
        nextRun.setDate(nextRun.getDate() + 7);
        nextRun.setHours(0, 0, 0, 0);
        break;
      case 'manual':
        nextRun = null;
        break;
    }

    await base44.entities.ScheduledJob.update(job.id, {
      last_run: now.toISOString(),
      next_run: nextRun ? nextRun.toISOString() : null
    });
  }

  /**
   * Generate mock data for a metric
   */
  generateMockDataForMetric(metric) {
    const hours = 24;
    const data = [];

    for (let i = 0; i < hours; i++) {
      const date = new Date();
      date.setHours(date.getHours() - (hours - i));

      data.push({
        date: date.toISOString(),
        value: Math.floor(Math.random() * 1000) + 500
      });
    }

    return data;
  }

  /**
   * Get job status summary
   */
  async getJobsSummary() {
    const jobs = await base44.entities.ScheduledJob.list();
    const recentExecutions = await base44.entities.JobExecution.list('-created_date', 10);

    return {
      total_jobs: jobs.length,
      enabled_jobs: jobs.filter(j => j.enabled).length,
      recent_executions: recentExecutions,
      next_job: jobs
        .filter(j => j.enabled && j.next_run)
        .sort((a, b) => new Date(a.next_run) - new Date(b.next_run))[0]
    };
  }

  /**
   * Manually trigger a job
   */
  async triggerJob(jobId) {
    const job = await base44.entities.ScheduledJob.list();
    const targetJob = job.find(j => j.id === jobId);

    if (!targetJob) {
      throw new Error('Job not found');
    }

    await this.executeJob(targetJob);
  }
}

export const backgroundJobService = new BackgroundJobService();
