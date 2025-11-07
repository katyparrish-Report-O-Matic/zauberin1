import { base44 } from "@/api/base44Client";

/**
 * Backup Service
 * Handles automated backups, restoration, and disaster recovery
 */
class BackupService {
  constructor() {
    this.defaultRetentionDays = 30;
  }

  /**
   * Create a full backup of all organization data
   */
  async createFullBackup(organizationId, backupName = null) {
    try {
      console.log(`[Backup] Creating full backup for org: ${organizationId}`);

      // Collect all data
      const snapshot = await this.collectSnapshot(organizationId);

      // Calculate size
      const sizeBytes = new Blob([JSON.stringify(snapshot)]).size;

      // Calculate expiration
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.defaultRetentionDays);

      const backup = await base44.entities.Backup.create({
        organization_id: organizationId,
        backup_type: 'full',
        backup_name: backupName || `Full Backup ${new Date().toISOString()}`,
        snapshot,
        size_bytes: sizeBytes,
        retention_days: this.defaultRetentionDays,
        expires_at: expiresAt.toISOString(),
        status: 'completed'
      });

      console.log(`[Backup] Created backup: ${backup.id} (${this.formatBytes(sizeBytes)})`);
      return backup;

    } catch (error) {
      console.error('[Backup] Failed to create backup:', error);
      
      await base44.entities.Backup.create({
        organization_id: organizationId,
        backup_type: 'full',
        backup_name: backupName || 'Failed Backup',
        snapshot: {},
        size_bytes: 0,
        status: 'failed',
        error_message: error.message
      });

      throw error;
    }
  }

  /**
   * Collect all data for snapshot
   */
  async collectSnapshot(organizationId) {
    const snapshot = {
      timestamp: new Date().toISOString(),
      organization_id: organizationId
    };

    // Reports
    const reports = await base44.entities.ReportRequest.filter({
      organization_id: organizationId
    });
    snapshot.reports = this.sanitizeData(reports);

    // API Settings (mask sensitive data)
    const apiSettings = await base44.entities.ApiSettings.filter({
      organization_id: organizationId
    });
    snapshot.api_settings = apiSettings.map(api => ({
      ...api,
      api_token: '***MASKED***' // Don't backup actual tokens
    }));

    // Dashboards
    const dashboards = await base44.entities.Dashboard.filter({
      organization_id: organizationId
    });
    snapshot.dashboards = this.sanitizeData(dashboards);

    // Templates
    const templates = await base44.entities.ReportTemplate.filter({
      organization_id: organizationId
    });
    snapshot.templates = this.sanitizeData(templates);

    // Webhooks
    const webhooks = await base44.entities.WebhookEndpoint.filter({
      organization_id: organizationId
    });
    snapshot.webhooks = webhooks.map(wh => ({
      ...wh,
      secret_key: '***MASKED***' // Don't backup secret keys
    }));

    // Scheduled Jobs
    const jobs = await base44.entities.ScheduledJob.list();
    const orgJobs = jobs.filter(j => 
      j.configuration?.organization_id === organizationId
    );
    snapshot.scheduled_jobs = this.sanitizeData(orgJobs);

    // Alert Rules
    const alerts = await base44.entities.AlertRule.filter({
      organization_id: organizationId
    });
    snapshot.alert_rules = this.sanitizeData(alerts);

    return snapshot;
  }

  /**
   * Restore data from backup
   */
  async restoreFromBackup(backupId, options = {}) {
    try {
      console.log(`[Backup] Restoring from backup: ${backupId}`);

      const backups = await base44.entities.Backup.list();
      const backup = backups.find(b => b.id === backupId);

      if (!backup) {
        throw new Error('Backup not found');
      }

      const snapshot = backup.snapshot;
      const results = {
        reports: 0,
        dashboards: 0,
        templates: 0,
        webhooks: 0,
        jobs: 0,
        alerts: 0
      };

      // Restore Reports
      if (options.restoreReports !== false && snapshot.reports) {
        for (const report of snapshot.reports) {
          const restored = this.prepareForRestore(report);
          await base44.entities.ReportRequest.create(restored);
          results.reports++;
        }
      }

      // Restore Dashboards
      if (options.restoreDashboards !== false && snapshot.dashboards) {
        for (const dashboard of snapshot.dashboards) {
          const restored = this.prepareForRestore(dashboard);
          await base44.entities.Dashboard.create(restored);
          results.dashboards++;
        }
      }

      // Restore Templates
      if (options.restoreTemplates !== false && snapshot.templates) {
        for (const template of snapshot.templates) {
          const restored = this.prepareForRestore(template);
          await base44.entities.ReportTemplate.create(restored);
          results.templates++;
        }
      }

      // Restore Webhooks
      if (options.restoreWebhooks !== false && snapshot.webhooks) {
        for (const webhook of snapshot.webhooks) {
          const restored = this.prepareForRestore(webhook);
          // Note: secret_key will need to be reconfigured manually
          await base44.entities.WebhookEndpoint.create(restored);
          results.webhooks++;
        }
      }

      // Restore Alert Rules
      if (options.restoreAlerts !== false && snapshot.alert_rules) {
        for (const alert of snapshot.alert_rules) {
          const restored = this.prepareForRestore(alert);
          await base44.entities.AlertRule.create(restored);
          results.alerts++;
        }
      }

      console.log('[Backup] Restore completed:', results);
      return results;

    } catch (error) {
      console.error('[Backup] Restore failed:', error);
      throw error;
    }
  }

  /**
   * Restore a single deleted report
   */
  async restoreDeletedReport(backupId, reportTitle) {
    try {
      const backups = await base44.entities.Backup.list();
      const backup = backups.find(b => b.id === backupId);

      if (!backup || !backup.snapshot.reports) {
        throw new Error('Backup or reports not found');
      }

      const report = backup.snapshot.reports.find(r => r.title === reportTitle);
      if (!report) {
        throw new Error('Report not found in backup');
      }

      const restored = this.prepareForRestore(report);
      const created = await base44.entities.ReportRequest.create(restored);

      console.log(`[Backup] Restored report: ${created.id}`);
      return created;

    } catch (error) {
      console.error('[Backup] Failed to restore report:', error);
      throw error;
    }
  }

  /**
   * Export backup as downloadable JSON
   */
  async exportBackup(backupId) {
    try {
      const backups = await base44.entities.Backup.list();
      const backup = backups.find(b => b.id === backupId);

      if (!backup) {
        throw new Error('Backup not found');
      }

      const exportData = {
        backup_info: {
          id: backup.id,
          created_date: backup.created_date,
          backup_name: backup.backup_name,
          organization_id: backup.organization_id
        },
        snapshot: backup.snapshot,
        export_date: new Date().toISOString(),
        version: '1.0'
      };

      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      return {
        url,
        filename: `backup-${backup.id}-${Date.now()}.json`,
        size: blob.size
      };

    } catch (error) {
      console.error('[Backup] Export failed:', error);
      throw error;
    }
  }

  /**
   * Import backup from JSON file
   */
  async importBackup(jsonContent, organizationId) {
    try {
      const importedData = JSON.parse(jsonContent);

      if (!importedData.snapshot) {
        throw new Error('Invalid backup format');
      }

      // Create new backup from imported data
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.defaultRetentionDays);

      const backup = await base44.entities.Backup.create({
        organization_id: organizationId,
        backup_type: 'manual',
        backup_name: `Imported: ${importedData.backup_info?.backup_name || 'Unknown'}`,
        snapshot: importedData.snapshot,
        size_bytes: new Blob([jsonContent]).size,
        retention_days: this.defaultRetentionDays,
        expires_at: expiresAt.toISOString(),
        status: 'completed'
      });

      console.log(`[Backup] Imported backup: ${backup.id}`);
      return backup;

    } catch (error) {
      console.error('[Backup] Import failed:', error);
      throw error;
    }
  }

  /**
   * Clean up expired backups
   */
  async cleanupExpiredBackups(organizationId) {
    try {
      const backups = await base44.entities.Backup.filter({
        organization_id: organizationId
      });

      const now = new Date();
      let deletedCount = 0;

      for (const backup of backups) {
        if (backup.expires_at && new Date(backup.expires_at) < now) {
          await base44.entities.Backup.delete(backup.id);
          deletedCount++;
        }
      }

      console.log(`[Backup] Cleaned up ${deletedCount} expired backups`);
      return deletedCount;

    } catch (error) {
      console.error('[Backup] Cleanup failed:', error);
      return 0;
    }
  }

  /**
   * Get backup summary for organization
   */
  async getBackupSummary(organizationId) {
    try {
      const backups = await base44.entities.Backup.filter({
        organization_id: organizationId
      });

      const totalSize = backups.reduce((sum, b) => sum + (b.size_bytes || 0), 0);
      const successfulBackups = backups.filter(b => b.status === 'completed');

      return {
        total_backups: backups.length,
        successful_backups: successfulBackups.length,
        total_size_bytes: totalSize,
        total_size_formatted: this.formatBytes(totalSize),
        latest_backup: backups[0],
        oldest_backup: backups[backups.length - 1]
      };

    } catch (error) {
      console.error('[Backup] Failed to get summary:', error);
      return null;
    }
  }

  // Helper methods
  sanitizeData(data) {
    return data.map(item => {
      const sanitized = { ...item };
      delete sanitized.id;
      delete sanitized.created_date;
      delete sanitized.updated_date;
      return sanitized;
    });
  }

  prepareForRestore(data) {
    const restored = { ...data };
    delete restored.id;
    delete restored.created_date;
    delete restored.updated_date;
    return restored;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

export const backupService = new BackupService();