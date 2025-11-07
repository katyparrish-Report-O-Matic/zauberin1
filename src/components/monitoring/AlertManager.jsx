import { base44 } from "@/api/base44Client";
import { monitoringService } from "./MonitoringService";
import { slackService } from "../integrations/SlackService";
import { environmentConfig } from "../config/EnvironmentConfig";

/**
 * Alert Manager
 * Monitors conditions and sends alerts
 */
class AlertManager {
  constructor() {
    this.alertThresholds = {
      api_downtime: { checkInterval: 60000 }, // 1 minute
      high_error_rate: { threshold: 5, windowMinutes: 15 },
      slow_performance: { threshold: 3000, windowMinutes: 15 },
      data_sync_failure: { checkInterval: 300000 } // 5 minutes
    };

    this.isRunning = false;
  }

  /**
   * Start monitoring
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    environmentConfig.log('info', '[AlertManager] Starting monitoring');

    // Check different conditions at different intervals
    this.apiDowntimeCheck = setInterval(() => this.checkAPIDowntime(), 60000);
    this.errorRateCheck = setInterval(() => this.checkErrorRate(), 300000); // 5 min
    this.performanceCheck = setInterval(() => this.checkPerformance(), 300000);
    this.syncCheck = setInterval(() => this.checkDataSync(), 300000);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    clearInterval(this.apiDowntimeCheck);
    clearInterval(this.errorRateCheck);
    clearInterval(this.performanceCheck);
    clearInterval(this.syncCheck);
    
    environmentConfig.log('info', '[AlertManager] Stopped monitoring');
  }

  /**
   * Check for API downtime
   */
  async checkAPIDowntime() {
    try {
      const components = await base44.entities.SystemStatus.list();
      const apiComponent = components.find(c => c.component_name === 'api');

      if (!apiComponent || apiComponent.status === 'major_outage') {
        await this.createAlert({
          alert_type: 'api_downtime',
          severity: 'critical',
          message: 'API is down or unresponsive',
          details: {
            last_check: apiComponent?.last_check,
            status: apiComponent?.status
          }
        });
      }
    } catch (error) {
      environmentConfig.log('error', '[AlertManager] Error checking API downtime:', error);
    }
  }

  /**
   * Check for high error rate
   */
  async checkErrorRate() {
    try {
      const summary = await monitoringService.getMetricsSummary(
        this.alertThresholds.high_error_rate.windowMinutes * 60000
      );

      if (summary && summary.error_rate.percentage > this.alertThresholds.high_error_rate.threshold) {
        await this.createAlert({
          alert_type: 'high_error_rate',
          severity: 'warning',
          message: `Error rate is ${summary.error_rate.percentage.toFixed(2)}% (threshold: ${this.alertThresholds.high_error_rate.threshold}%)`,
          details: {
            error_count: summary.error_rate.total,
            percentage: summary.error_rate.percentage,
            window_minutes: this.alertThresholds.high_error_rate.windowMinutes
          }
        });
      }
    } catch (error) {
      environmentConfig.log('error', '[AlertManager] Error checking error rate:', error);
    }
  }

  /**
   * Check for slow performance
   */
  async checkPerformance() {
    try {
      const summary = await monitoringService.getMetricsSummary(
        this.alertThresholds.slow_performance.windowMinutes * 60000
      );

      if (summary && summary.api_response_time.avg > this.alertThresholds.slow_performance.threshold) {
        await this.createAlert({
          alert_type: 'slow_performance',
          severity: 'warning',
          message: `Average API response time is ${summary.api_response_time.avg}ms (threshold: ${this.alertThresholds.slow_performance.threshold}ms)`,
          details: {
            avg_response_time: summary.api_response_time.avg,
            max_response_time: summary.api_response_time.max,
            threshold: this.alertThresholds.slow_performance.threshold
          }
        });
      }

      if (summary && summary.page_load_time.avg > 5000) {
        await this.createAlert({
          alert_type: 'slow_performance',
          severity: 'warning',
          message: `Average page load time is ${summary.page_load_time.avg}ms`,
          details: {
            avg_load_time: summary.page_load_time.avg,
            max_load_time: summary.page_load_time.max
          }
        });
      }
    } catch (error) {
      environmentConfig.log('error', '[AlertManager] Error checking performance:', error);
    }
  }

  /**
   * Check for data sync failures
   */
  async checkDataSync() {
    try {
      const recentExecutions = await base44.entities.JobExecution.list('-created_date', 10);
      const failedSyncs = recentExecutions.filter(exec => 
        exec.status === 'failed' && 
        exec.job_name.toLowerCase().includes('sync')
      );

      if (failedSyncs.length > 0) {
        await this.createAlert({
          alert_type: 'data_sync_failure',
          severity: 'critical',
          message: `${failedSyncs.length} data sync job(s) failed`,
          details: {
            failed_jobs: failedSyncs.map(job => ({
              name: job.job_name,
              error: job.error_message,
              time: job.started_at
            }))
          }
        });
      }
    } catch (error) {
      environmentConfig.log('error', '[AlertManager] Error checking data sync:', error);
    }
  }

  /**
   * Create an alert
   */
  async createAlert(alertData) {
    try {
      // Check if similar alert is already active
      const existingAlerts = await base44.entities.MonitoringAlert.filter({
        alert_type: alertData.alert_type,
        status: 'active'
      });

      // Don't create duplicate active alerts
      if (existingAlerts.length > 0) {
        environmentConfig.log('debug', `[AlertManager] Alert ${alertData.alert_type} already active`);
        return;
      }

      const alert = await base44.entities.MonitoringAlert.create({
        ...alertData,
        status: 'active',
        triggered_at: new Date().toISOString(),
        notification_sent: false,
        notification_channels: []
      });

      environmentConfig.log('warn', `[AlertManager] Alert created: ${alertData.message}`);

      // Send notifications
      await this.sendNotifications(alert);

      return alert;
    } catch (error) {
      environmentConfig.log('error', '[AlertManager] Error creating alert:', error);
    }
  }

  /**
   * Send alert notifications
   */
  async sendNotifications(alert) {
    const channels = [];

    try {
      // Send email notification
      if (alert.severity === 'critical' || alert.severity === 'warning') {
        await this.sendEmailNotification(alert);
        channels.push('email');
      }

      // Send Slack notification
      if (alert.severity === 'critical') {
        await this.sendSlackNotification(alert);
        channels.push('slack');
      }

      // Update alert with notification status
      await base44.entities.MonitoringAlert.update(alert.id, {
        notification_sent: true,
        notification_channels: channels
      });

    } catch (error) {
      environmentConfig.log('error', '[AlertManager] Error sending notifications:', error);
    }
  }

  /**
   * Send email notification
   */
  async sendEmailNotification(alert) {
    try {
      // Get admin users (in a real app, you'd query User entity with role='admin')
      const adminEmail = 'admin@example.com'; // Placeholder

      const severityEmoji = {
        info: 'ℹ️',
        warning: '⚠️',
        critical: '🚨'
      };

      await base44.integrations.Core.SendEmail({
        from_name: 'MetricFlow Monitoring',
        to: adminEmail,
        subject: `${severityEmoji[alert.severity]} MetricFlow Alert: ${alert.alert_type}`,
        body: `
          <h2>Alert: ${alert.message}</h2>
          <p><strong>Severity:</strong> ${alert.severity.toUpperCase()}</p>
          <p><strong>Type:</strong> ${alert.alert_type}</p>
          <p><strong>Time:</strong> ${new Date(alert.triggered_at).toLocaleString()}</p>
          ${alert.details ? `<pre>${JSON.stringify(alert.details, null, 2)}</pre>` : ''}
          <p>Please check the monitoring dashboard for more details.</p>
        `
      });

      environmentConfig.log('info', `[AlertManager] Email notification sent for ${alert.alert_type}`);
    } catch (error) {
      environmentConfig.log('error', '[AlertManager] Error sending email:', error);
    }
  }

  /**
   * Send Slack notification
   */
  async sendSlackNotification(alert) {
    try {
      // Get Slack integrations
      const slackIntegrations = await base44.entities.SlackIntegration.filter({
        enabled: true
      });

      if (slackIntegrations.length === 0) return;

      const integration = slackIntegrations[0];

      const severityColor = {
        info: '#3b82f6',
        warning: '#f59e0b',
        critical: '#ef4444'
      };

      const message = {
        text: `🚨 MetricFlow Alert: ${alert.message}`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `🚨 ${alert.alert_type.replace('_', ' ').toUpperCase()}`
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Severity:*\n${alert.severity.toUpperCase()}`
              },
              {
                type: 'mrkdwn',
                text: `*Time:*\n${new Date(alert.triggered_at).toLocaleString()}`
              }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Message:*\n${alert.message}`
            }
          }
        ],
        attachments: [
          {
            color: severityColor[alert.severity],
            text: alert.details ? JSON.stringify(alert.details, null, 2) : ''
          }
        ]
      };

      await slackService.postMessage(integration.webhook_url, message);
      
      environmentConfig.log('info', `[AlertManager] Slack notification sent for ${alert.alert_type}`);
    } catch (error) {
      environmentConfig.log('error', '[AlertManager] Error sending Slack notification:', error);
    }
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId, resolvedBy = 'system') {
    try {
      await base44.entities.MonitoringAlert.update(alertId, {
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        acknowledged_by: resolvedBy
      });

      environmentConfig.log('info', `[AlertManager] Alert ${alertId} resolved`);
    } catch (error) {
      environmentConfig.log('error', '[AlertManager] Error resolving alert:', error);
    }
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId, acknowledgedBy) {
    try {
      await base44.entities.MonitoringAlert.update(alertId, {
        status: 'acknowledged',
        acknowledged_by: acknowledgedBy
      });

      environmentConfig.log('info', `[AlertManager] Alert ${alertId} acknowledged by ${acknowledgedBy}`);
    } catch (error) {
      environmentConfig.log('error', '[AlertManager] Error acknowledging alert:', error);
    }
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts() {
    try {
      return await base44.entities.MonitoringAlert.filter({
        status: 'active'
      }, '-triggered_at');
    } catch (error) {
      environmentConfig.log('error', '[AlertManager] Error getting active alerts:', error);
      return [];
    }
  }
}

export const alertManager = new AlertManager();