import { base44 } from "@/api/base44Client";

/**
 * Archival Service
 * Manages data archiving and retrieval for performance optimization
 */
class ArchivalService {
  constructor() {
    this.archivalPolicies = {
      ReportRequest: { days: 365, keepRecentCount: 100 },
      TransformedMetric: { days: 90, keepRecentCount: 10000 },
      AuditLog: { days: 180, keepRecentCount: 5000 },
      JobExecution: { days: 30, keepRecentCount: 500 },
      DataQualityLog: { days: 60, keepRecentCount: 1000 },
      ApiUsage: { days: 90, keepRecentCount: 10000 },
      WebhookActivity: { days: 90, keepRecentCount: 5000 }
    };
  }

  /**
   * Archive old records for an entity
   */
  async archiveEntity(entityName, organizationId = null) {
    try {
      const policy = this.archivalPolicies[entityName];
      
      if (!policy) {
        console.log(`[Archival] No policy defined for ${entityName}`);
        return { archived: 0 };
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.days);

      console.log(`[Archival] Archiving ${entityName} older than ${cutoffDate.toISOString()}`);

      // Get all records
      let records;
      if (organizationId) {
        records = await base44.entities[entityName].filter({
          organization_id: organizationId
        });
      } else {
        records = await base44.entities[entityName].list();
      }

      // Sort by created_date descending
      records.sort((a, b) => 
        new Date(b.created_date) - new Date(a.created_date)
      );

      // Identify records to archive
      const toArchive = [];
      
      records.forEach((record, idx) => {
        const recordDate = new Date(record.created_date);
        
        // Keep recent records based on keepRecentCount
        if (idx >= policy.keepRecentCount && recordDate < cutoffDate) {
          toArchive.push(record);
        }
      });

      if (toArchive.length === 0) {
        console.log(`[Archival] No ${entityName} records to archive`);
        return { archived: 0 };
      }

      // Create archive snapshot
      const archive = await this.createArchiveSnapshot(
        entityName,
        toArchive,
        organizationId
      );

      // Delete archived records from main table
      let deletedCount = 0;
      for (const record of toArchive) {
        try {
          await base44.entities[entityName].delete(record.id);
          deletedCount++;
        } catch (error) {
          console.error(`[Archival] Failed to delete ${entityName} ${record.id}:`, error);
        }
      }

      console.log(`[Archival] Archived ${deletedCount} ${entityName} records`);

      return {
        archived: deletedCount,
        archive_id: archive.id,
        cutoff_date: cutoffDate.toISOString()
      };

    } catch (error) {
      console.error(`[Archival] Error archiving ${entityName}:`, error);
      throw error;
    }
  }

  /**
   * Create archive snapshot
   */
  async createArchiveSnapshot(entityName, records, organizationId) {
    const archiveData = {
      entity_type: entityName,
      organization_id: organizationId,
      record_count: records.length,
      archived_date: new Date().toISOString(),
      records: records,
      compressed: true
    };

    // Store in Backup entity with special archive type
    return await base44.entities.Backup.create({
      organization_id: organizationId || 'system',
      backup_type: 'incremental',
      backup_name: `Archive: ${entityName} - ${new Date().toLocaleDateString()}`,
      snapshot: archiveData,
      size_bytes: new Blob([JSON.stringify(archiveData)]).size,
      retention_days: 730, // Keep archives for 2 years
      expires_at: new Date(Date.now() + 730 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'completed'
    });
  }

  /**
   * Restore archived records
   */
  async restoreFromArchive(archiveId, recordIds = []) {
    try {
      const backups = await base44.entities.Backup.list();
      const archive = backups.find(b => b.id === archiveId);

      if (!archive) {
        throw new Error('Archive not found');
      }

      const archiveData = archive.snapshot;
      const entityName = archiveData.entity_type;

      let recordsToRestore = archiveData.records;
      
      // Filter by specific record IDs if provided
      if (recordIds.length > 0) {
        recordsToRestore = recordsToRestore.filter(r => recordIds.includes(r.id));
      }

      let restoredCount = 0;
      for (const record of recordsToRestore) {
        try {
          // Remove id, created_date, updated_date before restoring
          const { id, created_date, updated_date, ...recordData } = record;
          
          await base44.entities[entityName].create({
            ...recordData,
            restored_from_archive: true,
            original_id: id,
            original_created_date: created_date
          });
          
          restoredCount++;
        } catch (error) {
          console.error(`[Archival] Failed to restore record:`, error);
        }
      }

      console.log(`[Archival] Restored ${restoredCount} ${entityName} records`);

      return {
        restored: restoredCount,
        entity_type: entityName
      };

    } catch (error) {
      console.error('[Archival] Error restoring archive:', error);
      throw error;
    }
  }

  /**
   * List available archives
   */
  async listArchives(organizationId = null) {
    try {
      const query = organizationId ? { organization_id: organizationId } : {};
      const backups = await base44.entities.Backup.filter(query);

      // Filter for archive type backups
      const archives = backups.filter(b => 
        b.snapshot?.entity_type && 
        b.snapshot?.archived_date
      );

      return archives.map(archive => ({
        id: archive.id,
        entity_type: archive.snapshot.entity_type,
        record_count: archive.snapshot.record_count,
        archived_date: archive.snapshot.archived_date,
        size_bytes: archive.size_bytes,
        expires_at: archive.expires_at
      }));

    } catch (error) {
      console.error('[Archival] Error listing archives:', error);
      return [];
    }
  }

  /**
   * Get archival statistics
   */
  async getArchivalStats(organizationId = null) {
    try {
      const archives = await this.listArchives(organizationId);

      const stats = {
        total_archives: archives.length,
        total_archived_records: 0,
        total_size_bytes: 0,
        by_entity: {}
      };

      archives.forEach(archive => {
        stats.total_archived_records += archive.record_count;
        stats.total_size_bytes += archive.size_bytes;

        if (!stats.by_entity[archive.entity_type]) {
          stats.by_entity[archive.entity_type] = {
            count: 0,
            records: 0,
            size: 0
          };
        }

        stats.by_entity[archive.entity_type].count++;
        stats.by_entity[archive.entity_type].records += archive.record_count;
        stats.by_entity[archive.entity_type].size += archive.size_bytes;
      });

      return stats;

    } catch (error) {
      console.error('[Archival] Error getting stats:', error);
      return null;
    }
  }

  /**
   * Run archival for all entities with policies
   */
  async runFullArchival(organizationId = null) {
    const results = {};

    for (const [entityName, policy] of Object.entries(this.archivalPolicies)) {
      try {
        console.log(`[Archival] Processing ${entityName}...`);
        const result = await this.archiveEntity(entityName, organizationId);
        results[entityName] = result;
      } catch (error) {
        console.error(`[Archival] Failed to archive ${entityName}:`, error);
        results[entityName] = { error: error.message };
      }
    }

    return results;
  }

  /**
   * Search archived records
   */
  async searchArchives(entityType, searchCriteria) {
    try {
      const archives = await this.listArchives();
      const matchingArchives = archives.filter(a => a.entity_type === entityType);

      const results = [];

      for (const archive of matchingArchives) {
        const backups = await base44.entities.Backup.list();
        const fullArchive = backups.find(b => b.id === archive.id);
        
        if (fullArchive) {
          const matchingRecords = fullArchive.snapshot.records.filter(record => {
            return Object.entries(searchCriteria).every(([key, value]) => {
              return record[key] === value;
            });
          });

          if (matchingRecords.length > 0) {
            results.push({
              archive_id: archive.id,
              archived_date: archive.archived_date,
              matching_records: matchingRecords
            });
          }
        }
      }

      return results;

    } catch (error) {
      console.error('[Archival] Error searching archives:', error);
      return [];
    }
  }

  /**
   * Format bytes
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

export const archivalService = new ArchivalService();