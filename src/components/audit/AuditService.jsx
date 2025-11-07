import { base44 } from "@/api/base44Client";

/**
 * Audit Service
 * Centralized logging for all system activities
 */
class AuditService {
  constructor() {
    this.retentionDays = 365; // Keep logs for 1 year
  }

  /**
   * Log an activity
   */
  async log(activityData) {
    try {
      const {
        organizationId,
        userEmail,
        actionType,
        resourceType = null,
        resourceId = null,
        actionDetails = {},
        success = true,
        errorMessage = null,
        metadata = {}
      } = activityData;

      // Get browser info
      const userAgent = navigator.userAgent;
      
      await base44.entities.AuditLog.create({
        organization_id: organizationId,
        user_email: userEmail,
        action_type: actionType,
        resource_type: resourceType,
        resource_id: resourceId,
        action_details: actionDetails,
        ip_address: 'client', // IP will be captured server-side in production
        user_agent: userAgent,
        success,
        error_message: errorMessage,
        metadata
      });

      console.log(`[Audit] Logged: ${actionType} by ${userEmail}`);
    } catch (error) {
      console.error('[Audit] Failed to log activity:', error);
    }
  }

  /**
   * Log API call
   */
  async logApiCall(organizationId, userEmail, endpoint, success, responseTime, errorMessage = null) {
    await this.log({
      organizationId,
      userEmail,
      actionType: 'api_call',
      resourceType: 'api',
      actionDetails: {
        endpoint,
        response_time_ms: responseTime
      },
      success,
      errorMessage
    });
  }

  /**
   * Log report action
   */
  async logReportAction(organizationId, userEmail, action, reportId, reportTitle) {
    const actionTypes = {
      create: 'report_created',
      update: 'report_updated',
      delete: 'report_deleted'
    };

    await this.log({
      organizationId,
      userEmail,
      actionType: actionTypes[action],
      resourceType: 'report',
      resourceId: reportId,
      actionDetails: {
        report_title: reportTitle,
        action
      }
    });
  }

  /**
   * Log settings change
   */
  async logSettingsChange(organizationId, userEmail, settingType, oldValue, newValue) {
    await this.log({
      organizationId,
      userEmail,
      actionType: 'settings_changed',
      resourceType: 'settings',
      actionDetails: {
        setting_type: settingType,
        old_value: oldValue,
        new_value: newValue
      }
    });
  }

  /**
   * Log data export
   */
  async logDataExport(organizationId, userEmail, exportType, recordCount) {
    await this.log({
      organizationId,
      userEmail,
      actionType: 'data_export',
      resourceType: 'data',
      actionDetails: {
        export_type: exportType,
        record_count: recordCount
      }
    });
  }

  /**
   * Log webhook trigger
   */
  async logWebhookTrigger(organizationId, webhookId, success, recordsProcessed) {
    await this.log({
      organizationId,
      userEmail: 'system',
      actionType: 'webhook_triggered',
      resourceType: 'webhook',
      resourceId: webhookId,
      actionDetails: {
        records_processed: recordsProcessed
      },
      success
    });
  }

  /**
   * Get recent logs
   */
  async getRecentLogs(organizationId, limit = 50, filters = {}) {
    try {
      const query = { organization_id: organizationId };
      
      if (filters.userEmail) {
        query.user_email = filters.userEmail;
      }
      
      if (filters.actionType) {
        query.action_type = filters.actionType;
      }

      const logs = await base44.entities.AuditLog.filter(query, '-created_date', limit);
      
      // Filter by date range if provided
      if (filters.startDate || filters.endDate) {
        return logs.filter(log => {
          const logDate = new Date(log.created_date);
          if (filters.startDate && logDate < new Date(filters.startDate)) return false;
          if (filters.endDate && logDate > new Date(filters.endDate)) return false;
          return true;
        });
      }

      return logs;
    } catch (error) {
      console.error('[Audit] Error fetching logs:', error);
      return [];
    }
  }

  /**
   * Check for suspicious activity
   */
  async checkSuspiciousActivity(organizationId) {
    try {
      const rules = await base44.entities.AlertRule.filter({
        organization_id: organizationId,
        enabled: true
      });

      const now = new Date();
      const alerts = [];

      for (const rule of rules) {
        const windowStart = new Date(now.getTime() - rule.time_window_minutes * 60000);

        // Get logs in time window
        const recentLogs = await this.getRecentLogs(organizationId, 1000);
        const windowLogs = recentLogs.filter(log => 
          new Date(log.created_date) >= windowStart
        );

        let triggered = false;

        switch (rule.rule_type) {
          case 'failed_api_calls':
            const failedCalls = windowLogs.filter(
              log => log.action_type === 'api_call' && !log.success
            );
            triggered = failedCalls.length >= rule.threshold;
            if (triggered) {
              alerts.push({
                rule,
                message: `${failedCalls.length} failed API calls in ${rule.time_window_minutes} minutes`,
                count: failedCalls.length
              });
            }
            break;

          case 'config_changes':
            const configChanges = windowLogs.filter(
              log => log.action_type === 'settings_changed'
            );
            triggered = configChanges.length >= rule.threshold;
            if (triggered) {
              alerts.push({
                rule,
                message: `${configChanges.length} configuration changes in ${rule.time_window_minutes} minutes`,
                count: configChanges.length
              });
            }
            break;

          case 'data_export':
            const exports = windowLogs.filter(
              log => log.action_type === 'data_export'
            );
            triggered = exports.length >= rule.threshold;
            if (triggered) {
              alerts.push({
                rule,
                message: `${exports.length} data exports in ${rule.time_window_minutes} minutes`,
                count: exports.length
              });
            }
            break;

          case 'unusual_access':
            const uniqueUsers = new Set(windowLogs.map(log => log.user_email));
            triggered = uniqueUsers.size >= rule.threshold;
            if (triggered) {
              alerts.push({
                rule,
                message: `${uniqueUsers.size} different users active in ${rule.time_window_minutes} minutes`,
                count: uniqueUsers.size
              });
            }
            break;
        }

        // Update last triggered if alert fired
        if (triggered) {
          await base44.entities.AlertRule.update(rule.id, {
            last_triggered: now.toISOString()
          });
        }
      }

      return alerts;
    } catch (error) {
      console.error('[Audit] Error checking suspicious activity:', error);
      return [];
    }
  }

  /**
   * Clean up old logs
   */
  async cleanupOldLogs(organizationId) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

      const allLogs = await base44.entities.AuditLog.filter({
        organization_id: organizationId
      });

      let deletedCount = 0;
      for (const log of allLogs) {
        if (new Date(log.created_date) < cutoffDate) {
          await base44.entities.AuditLog.delete(log.id);
          deletedCount++;
        }
      }

      console.log(`[Audit] Cleaned up ${deletedCount} old logs`);
      return deletedCount;
    } catch (error) {
      console.error('[Audit] Error cleaning up logs:', error);
      return 0;
    }
  }

  /**
   * Export logs as CSV
   */
  exportLogsCSV(logs) {
    const headers = ['Timestamp', 'User', 'Action', 'Resource', 'Success', 'Details'];
    const rows = logs.map(log => [
      new Date(log.created_date).toISOString(),
      log.user_email,
      log.action_type,
      log.resource_type || '-',
      log.success ? 'Yes' : 'No',
      JSON.stringify(log.action_details || {})
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  }
}

export const auditService = new AuditService();