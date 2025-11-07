import { base44 } from "@/api/base44Client";
import { environmentConfig } from "../config/EnvironmentConfig";

/**
 * Status Checker
 * Performs health checks on system components
 */
class StatusChecker {
  constructor() {
    this.components = [
      'api',
      'database',
      'cache',
      'webhooks',
      'scheduled_jobs',
      'integrations',
      'frontend'
    ];
  }

  /**
   * Start periodic health checks
   */
  start() {
    environmentConfig.log('info', '[StatusChecker] Starting health checks');
    
    // Check every 2 minutes
    this.checkInterval = setInterval(() => {
      this.performHealthChecks();
    }, 120000);

    // Run immediately
    this.performHealthChecks();
  }

  /**
   * Stop health checks
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      environmentConfig.log('info', '[StatusChecker] Stopped health checks');
    }
  }

  /**
   * Perform health checks on all components
   */
  async performHealthChecks() {
    for (const component of this.components) {
      await this.checkComponent(component);
    }
  }

  /**
   * Check a single component
   */
  async checkComponent(componentName) {
    try {
      let status = 'operational';
      let statusMessage = 'All systems operational';
      let metadata = {};

      const startTime = Date.now();

      switch (componentName) {
        case 'api':
          const apiCheck = await this.checkAPI();
          status = apiCheck.status;
          statusMessage = apiCheck.message;
          metadata = apiCheck.metadata;
          break;

        case 'database':
          const dbCheck = await this.checkDatabase();
          status = dbCheck.status;
          statusMessage = dbCheck.message;
          metadata = dbCheck.metadata;
          break;

        case 'cache':
          const cacheCheck = await this.checkCache();
          status = cacheCheck.status;
          statusMessage = cacheCheck.message;
          metadata = cacheCheck.metadata;
          break;

        case 'webhooks':
          const webhookCheck = await this.checkWebhooks();
          status = webhookCheck.status;
          statusMessage = webhookCheck.message;
          metadata = webhookCheck.metadata;
          break;

        case 'scheduled_jobs':
          const jobsCheck = await this.checkScheduledJobs();
          status = jobsCheck.status;
          statusMessage = jobsCheck.message;
          metadata = jobsCheck.metadata;
          break;

        case 'integrations':
          const integrationsCheck = await this.checkIntegrations();
          status = integrationsCheck.status;
          statusMessage = integrationsCheck.message;
          metadata = integrationsCheck.metadata;
          break;

        case 'frontend':
          status = 'operational'; // If this code is running, frontend is operational
          statusMessage = 'Frontend is responding';
          metadata = { response_time_ms: Date.now() - startTime };
          break;
      }

      const responseTime = Date.now() - startTime;

      // Calculate uptime (simple version - would be more complex in production)
      const uptime = status === 'operational' ? 99.9 : 95.0;

      // Update or create status
      const existingStatus = await base44.entities.SystemStatus.filter({
        component_name: componentName
      });

      if (existingStatus.length > 0) {
        await base44.entities.SystemStatus.update(existingStatus[0].id, {
          status,
          status_message: statusMessage,
          last_check: new Date().toISOString(),
          response_time_avg_ms: responseTime,
          metadata
        });
      } else {
        await base44.entities.SystemStatus.create({
          component_name: componentName,
          status,
          status_message: statusMessage,
          last_check: new Date().toISOString(),
          uptime_percentage: uptime,
          response_time_avg_ms: responseTime,
          metadata
        });
      }

      environmentConfig.log('debug', `[StatusChecker] ${componentName}: ${status}`);
    } catch (error) {
      environmentConfig.log('error', `[StatusChecker] Error checking ${componentName}:`, error);
      
      // Mark as degraded on error
      await this.markComponentDegraded(componentName, error.message);
    }
  }

  /**
   * Check API health
   */
  async checkAPI() {
    try {
      // Try to fetch a small dataset
      const reports = await base44.entities.ReportRequest.list('-created_date', 1);
      
      return {
        status: 'operational',
        message: 'API is responding normally',
        metadata: { last_query: 'ReportRequest.list' }
      };
    } catch (error) {
      return {
        status: 'major_outage',
        message: `API error: ${error.message}`,
        metadata: { error: error.message }
      };
    }
  }

  /**
   * Check database health
   */
  async checkDatabase() {
    try {
      // Simple read check
      await base44.entities.Organization.list('-created_date', 1);
      
      return {
        status: 'operational',
        message: 'Database is accessible',
        metadata: {}
      };
    } catch (error) {
      return {
        status: 'major_outage',
        message: `Database error: ${error.message}`,
        metadata: { error: error.message }
      };
    }
  }

  /**
   * Check cache health
   */
  async checkCache() {
    try {
      const cacheEntries = await base44.entities.CacheEntry.list('-created_date', 10);
      
      return {
        status: 'operational',
        message: 'Cache is operational',
        metadata: { total_entries: cacheEntries.length }
      };
    } catch (error) {
      return {
        status: 'degraded',
        message: 'Cache may be experiencing issues',
        metadata: { error: error.message }
      };
    }
  }

  /**
   * Check webhooks health
   */
  async checkWebhooks() {
    try {
      const webhooks = await base44.entities.WebhookEndpoint.filter({ enabled: true });
      const recentActivity = await base44.entities.WebhookActivity.list('-created_date', 10);
      
      const failedRecent = recentActivity.filter(a => a.status === 'failed').length;
      const status = failedRecent > 5 ? 'degraded' : 'operational';

      return {
        status,
        message: status === 'degraded' ? 'Some webhooks are failing' : 'Webhooks are operational',
        metadata: {
          active_webhooks: webhooks.length,
          recent_failures: failedRecent
        }
      };
    } catch (error) {
      return {
        status: 'degraded',
        message: 'Unable to check webhook status',
        metadata: { error: error.message }
      };
    }
  }

  /**
   * Check scheduled jobs health
   */
  async checkScheduledJobs() {
    try {
      const jobs = await base44.entities.ScheduledJob.filter({ enabled: true });
      const recentExecutions = await base44.entities.JobExecution.list('-started_at', 20);
      
      const failedJobs = recentExecutions.filter(e => e.status === 'failed').length;
      const status = failedJobs > 3 ? 'degraded' : 'operational';

      return {
        status,
        message: status === 'degraded' ? 'Some scheduled jobs are failing' : 'Scheduled jobs are running normally',
        metadata: {
          active_jobs: jobs.length,
          recent_failures: failedJobs
        }
      };
    } catch (error) {
      return {
        status: 'degraded',
        message: 'Unable to check job status',
        metadata: { error: error.message }
      };
    }
  }

  /**
   * Check integrations health
   */
  async checkIntegrations() {
    try {
      const slack = await base44.entities.SlackIntegration.filter({ enabled: true });
      const email = await base44.entities.EmailSchedule.filter({ enabled: true });
      const warehouse = await base44.entities.DataWarehouseConnection.filter({ enabled: true });
      
      const erroredWarehouse = warehouse.filter(w => w.sync_status === 'error').length;
      const status = erroredWarehouse > 0 ? 'degraded' : 'operational';

      return {
        status,
        message: status === 'degraded' ? 'Some integrations have errors' : 'Integrations are operational',
        metadata: {
          slack_integrations: slack.length,
          email_schedules: email.length,
          warehouse_connections: warehouse.length,
          warehouse_errors: erroredWarehouse
        }
      };
    } catch (error) {
      return {
        status: 'degraded',
        message: 'Unable to check integration status',
        metadata: { error: error.message }
      };
    }
  }

  /**
   * Mark component as degraded
   */
  async markComponentDegraded(componentName, errorMessage) {
    try {
      const existingStatus = await base44.entities.SystemStatus.filter({
        component_name: componentName
      });

      const statusData = {
        status: 'degraded',
        status_message: `Error: ${errorMessage}`,
        last_check: new Date().toISOString(),
        metadata: { last_error: errorMessage }
      };

      if (existingStatus.length > 0) {
        await base44.entities.SystemStatus.update(existingStatus[0].id, statusData);
      } else {
        await base44.entities.SystemStatus.create({
          component_name: componentName,
          ...statusData,
          uptime_percentage: 95.0,
          response_time_avg_ms: 0
        });
      }
    } catch (error) {
      environmentConfig.log('error', '[StatusChecker] Error marking component degraded:', error);
    }
  }

  /**
   * Get overall system status
   */
  async getOverallStatus() {
    try {
      const components = await base44.entities.SystemStatus.list();

      if (components.length === 0) {
        return {
          status: 'operational',
          message: 'System status not yet initialized'
        };
      }

      const hasCritical = components.some(c => c.status === 'major_outage');
      const hasDegraded = components.some(c => c.status === 'degraded' || c.status === 'partial_outage');
      const hasMaintenance = components.some(c => c.status === 'maintenance');

      let status = 'operational';
      let message = 'All systems operational';

      if (hasCritical) {
        status = 'major_outage';
        message = 'Major service disruption';
      } else if (hasDegraded) {
        status = 'degraded';
        message = 'Some systems experiencing issues';
      } else if (hasMaintenance) {
        status = 'maintenance';
        message = 'Scheduled maintenance in progress';
      }

      return { status, message, components };
    } catch (error) {
      environmentConfig.log('error', '[StatusChecker] Error getting overall status:', error);
      return {
        status: 'unknown',
        message: 'Unable to determine system status',
        components: []
      };
    }
  }
}

export const statusChecker = new StatusChecker();