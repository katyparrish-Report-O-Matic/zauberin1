import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Database, Download, Upload, RotateCcw, Plus, 
  CheckCircle, XCircle, Clock, Trash2, FileJson
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { usePermissions } from "../components/auth/usePermissions";
import OrganizationSelector from "../components/org/OrganizationSelector";
import PermissionGuard from "../components/auth/PermissionGuard";
import { backupService } from "../components/backup/BackupService";

export default function BackupManager() {
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [backupName, setBackupName] = useState('');
  
  const [restoreOptions, setRestoreOptions] = useState({
    restoreReports: true,
    restoreDashboards: true,
    restoreTemplates: true,
    restoreWebhooks: true,
    restoreAlerts: true
  });

  const { currentUser, isAgency } = usePermissions();

  // Fetch backups
  const { data: backups } = useQuery({
    queryKey: ['backups', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      if (!orgId || orgId === 'all') return [];
      
      return await base44.entities.Backup.filter({
        organization_id: orgId
      }, '-created_date');
    },
    initialData: []
  });

  // Fetch backup summary
  const { data: summary } = useQuery({
    queryKey: ['backupSummary', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      if (!orgId || orgId === 'all') return null;
      
      return await backupService.getBackupSummary(orgId);
    }
  });

  // Create backup mutation
  const createBackupMutation = useMutation({
    mutationFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      return await backupService.createFullBackup(orgId, backupName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      queryClient.invalidateQueries({ queryKey: ['backupSummary'] });
      toast.success('Backup created successfully');
      setShowCreateDialog(false);
      setBackupName('');
    },
    onError: (error) => {
      toast.error(`Backup failed: ${error.message}`);
    }
  });

  // Restore backup mutation
  const restoreBackupMutation = useMutation({
    mutationFn: async () => {
      return await backupService.restoreFromBackup(selectedBackup.id, restoreOptions);
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries();
      toast.success(`Restored: ${results.reports} reports, ${results.dashboards} dashboards, ${results.templates} templates`);
      setShowRestoreDialog(false);
      setSelectedBackup(null);
    },
    onError: (error) => {
      toast.error(`Restore failed: ${error.message}`);
    }
  });

  // Delete backup mutation
  const deleteBackupMutation = useMutation({
    mutationFn: (id) => base44.entities.Backup.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      queryClient.invalidateQueries({ queryKey: ['backupSummary'] });
      toast.success('Backup deleted');
    }
  });

  // Import backup mutation
  const importBackupMutation = useMutation({
    mutationFn: async (fileContent) => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      return await backupService.importBackup(fileContent, orgId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      toast.success('Backup imported successfully');
      setShowImportDialog(false);
      setImportFile(null);
    },
    onError: (error) => {
      toast.error(`Import failed: ${error.message}`);
    }
  });

  const handleExportBackup = async (backup) => {
    try {
      const { url, filename } = await backupService.exportBackup(backup.id);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success('Backup exported');
    } catch (error) {
      toast.error(`Export failed: ${error.message}`);
    }
  };

  const handleImportFile = () => {
    if (!importFile) {
      toast.error('Please select a file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      importBackupMutation.mutate(content);
    };
    reader.readAsText(importFile);
  };

  const getStatusIcon = (status) => {
    const icons = {
      completed: CheckCircle,
      failed: XCircle,
      in_progress: Clock
    };
    return icons[status] || Clock;
  };

  const getStatusColor = (status) => {
    const colors = {
      completed: 'text-green-600',
      failed: 'text-red-600',
      in_progress: 'text-blue-600'
    };
    return colors[status] || 'text-gray-600';
  };

  return (
    <PermissionGuard requiredLevel="admin">
      <div className="min-h-screen bg-gray-50">
        <div className="p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <Database className="w-8 h-8" />
                  Backup & Recovery
                </h1>
                <p className="text-gray-600 mt-1">Automated backups with disaster recovery</p>
              </div>
              <div className="flex gap-3">
                {isAgency && (
                  <OrganizationSelector
                    value={selectedOrgId || currentUser?.organization_id}
                    onChange={setSelectedOrgId}
                    showLabel={false}
                  />
                )}
                <Button variant="outline" onClick={() => setShowImportDialog(true)} className="gap-2">
                  <Upload className="w-4 h-4" />
                  Import
                </Button>
                <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Create Backup
                </Button>
              </div>
            </div>

            {/* Summary Cards */}
            {summary && (
              <div className="grid md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-gray-600">Total Backups</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-gray-900">{summary.total_backups}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-gray-600">Successful</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-green-600">{summary.successful_backups}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-gray-600">Total Size</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-gray-900">{summary.total_size_formatted}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-gray-600">Latest Backup</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-900">
                      {summary.latest_backup 
                        ? format(new Date(summary.latest_backup.created_date), 'MMM d, h:mm a')
                        : 'No backups'
                      }
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Backup List */}
            <Card>
              <CardHeader>
                <CardTitle>Backup History</CardTitle>
                <CardDescription>
                  {backups.length} backup{backups.length !== 1 ? 's' : ''} available
                </CardDescription>
              </CardHeader>
              <CardContent>
                {backups.length === 0 ? (
                  <div className="text-center py-12">
                    <Database className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600">No backups yet. Create your first backup!</p>
                    <Button onClick={() => setShowCreateDialog(true)} className="mt-4">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Backup
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {backups.map(backup => {
                      const StatusIcon = getStatusIcon(backup.status);
                      const statusColor = getStatusColor(backup.status);

                      return (
                        <div
                          key={backup.id}
                          className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                        >
                          <div className="flex items-start gap-3 flex-1">
                            <StatusIcon className={`w-5 h-5 mt-0.5 ${statusColor}`} />
                            
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-gray-900">{backup.backup_name}</h3>
                                <Badge variant="outline" className="capitalize">
                                  {backup.backup_type}
                                </Badge>
                                {backup.status === 'completed' && (
                                  <Badge className="bg-green-600">Complete</Badge>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                                <span>{format(new Date(backup.created_date), "MMM d, yyyy 'at' h:mm a")}</span>
                                <span>•</span>
                                <span>{backupService.formatBytes(backup.size_bytes || 0)}</span>
                                {backup.snapshot.reports && (
                                  <>
                                    <span>•</span>
                                    <span>{backup.snapshot.reports.length} reports</span>
                                  </>
                                )}
                              </div>

                              {backup.expires_at && (
                                <p className="text-xs text-gray-500 mt-1">
                                  Expires: {format(new Date(backup.expires_at), 'MMM d, yyyy')}
                                </p>
                              )}

                              {backup.error_message && (
                                <p className="text-xs text-red-600 mt-1">
                                  Error: {backup.error_message}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedBackup(backup);
                                setShowRestoreDialog(true);
                              }}
                              disabled={backup.status !== 'completed'}
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />
                              Restore
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleExportBackup(backup)}
                              disabled={backup.status !== 'completed'}
                            >
                              <Download className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteBackupMutation.mutate(backup.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Disaster Recovery Info */}
            <Card>
              <CardHeader>
                <CardTitle>Disaster Recovery</CardTitle>
                <CardDescription>Best practices for data protection</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm text-gray-600">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                    <p>Automated daily backups with 30-day retention</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                    <p>Export backups as JSON for external storage</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                    <p>Selective restore - choose what data to recover</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                    <p>Version history for dashboards and reports</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <FileJson className="w-4 h-4 text-blue-600 mt-0.5" />
                    <p><strong>Note:</strong> API credentials are masked in backups for security. You'll need to reconfigure them after restore.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Create Backup Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Backup</DialogTitle>
              <DialogDescription>
                Create a full backup of all reports, dashboards, and settings
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="backup-name">Backup Name (optional)</Label>
                <Input
                  id="backup-name"
                  placeholder="e.g., Before Q4 Changes"
                  value={backupName}
                  onChange={(e) => setBackupName(e.target.value)}
                />
              </div>
              <p className="text-sm text-gray-600">
                This will create a complete snapshot of:
              </p>
              <ul className="text-sm text-gray-600 space-y-1 ml-4">
                <li>• All reports and configurations</li>
                <li>• Dashboards and templates</li>
                <li>• Webhook endpoints</li>
                <li>• Scheduled jobs</li>
                <li>• Alert rules</li>
              </ul>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={() => createBackupMutation.mutate()}>
                Create Backup
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Restore Dialog */}
        <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Restore from Backup</DialogTitle>
              <DialogDescription>
                Choose what to restore from: {selectedBackup?.backup_name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Reports</Label>
                  <Switch
                    checked={restoreOptions.restoreReports}
                    onCheckedChange={(checked) => 
                      setRestoreOptions({ ...restoreOptions, restoreReports: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Dashboards</Label>
                  <Switch
                    checked={restoreOptions.restoreDashboards}
                    onCheckedChange={(checked) => 
                      setRestoreOptions({ ...restoreOptions, restoreDashboards: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Templates</Label>
                  <Switch
                    checked={restoreOptions.restoreTemplates}
                    onCheckedChange={(checked) => 
                      setRestoreOptions({ ...restoreOptions, restoreTemplates: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Webhooks</Label>
                  <Switch
                    checked={restoreOptions.restoreWebhooks}
                    onCheckedChange={(checked) => 
                      setRestoreOptions({ ...restoreOptions, restoreWebhooks: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Alert Rules</Label>
                  <Switch
                    checked={restoreOptions.restoreAlerts}
                    onCheckedChange={(checked) => 
                      setRestoreOptions({ ...restoreOptions, restoreAlerts: checked })
                    }
                  />
                </div>
              </div>
              
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-xs text-yellow-800">
                  <strong>Warning:</strong> Restoring will create new records. Existing data will not be deleted.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRestoreDialog(false)}>
                Cancel
              </Button>
              <Button onClick={() => restoreBackupMutation.mutate()}>
                Restore Selected
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Import Dialog */}
        <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import Backup</DialogTitle>
              <DialogDescription>
                Upload a backup JSON file
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="import-file">Backup File</Label>
                <Input
                  id="import-file"
                  type="file"
                  accept=".json"
                  onChange={(e) => setImportFile(e.target.files[0])}
                />
              </div>
              {importFile && (
                <p className="text-sm text-gray-600">
                  Selected: {importFile.name} ({(importFile.size / 1024).toFixed(2)} KB)
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowImportDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleImportFile} disabled={!importFile}>
                Import Backup
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
}