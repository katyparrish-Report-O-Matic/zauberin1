
import React, { useState, useEffect } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Database, Plus, CheckCircle, XCircle, RefreshCw, Settings as SettingsIcon, Pencil, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePermissions } from "../components/auth/usePermissions";
import OrganizationSelector from "../components/org/OrganizationSelector";
import PermissionGuard from "../components/auth/PermissionGuard";
import { dataSyncService } from "../components/sync/DataSyncService";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function DataSourceManager() {
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editingSource, setEditingSource] = useState(null);
  const [deletingSource, setDeletingSource] = useState(null);
  const [selectedSource, setSelectedSource] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    platform_type: 'call_tracking',
    auth_type: 'api_key',
    api_url: 'https://api.calltrackingmetrics.com/api/v1',
    api_key: '',
    account_ids: '',
    property_ids: '',
    schedule: 'hourly',
    backfill_days: 90
  });

  const { currentUser, isAgency } = usePermissions();

  // Auto-select organization when user loads
  useEffect(() => {
    if (currentUser?.organization_id && !selectedOrgId) {
      setSelectedOrgId(currentUser.organization_id);
    }
  }, [currentUser, selectedOrgId]);

  // Fetch data sources
  const { data: dataSources } = useQuery({
    queryKey: ['dataSources', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      if (!orgId || orgId === 'all') {
        if (isAgency && selectedOrgId === 'all') {
          return await base44.entities.DataSource.list('-created_date');
        }
        return [];
      }
      return await base44.entities.DataSource.filter(
        { organization_id: orgId },
        '-created_date'
      );
    },
    initialData: []
  });

  // Fetch sync jobs for selected source
  const { data: syncJobs } = useQuery({
    queryKey: ['syncJobs', selectedSource?.id],
    queryFn: async () => {
      if (!selectedSource) return [];
      return await base44.entities.SyncJob.filter(
        { data_source_id: selectedSource.id },
        '-created_date',
        10
      );
    },
    enabled: !!selectedSource,
    initialData: []
  });

  // Create/Update data source mutation
  const saveSourceMutation = useMutation({
    mutationFn: async (data) => {
      const orgId = selectedOrgId || currentUser?.organization_id;

      // Debug logging
      console.log('[DataSourceManager] Saving with orgId:', orgId);
      console.log('[DataSourceManager] Form data:', data);

      const credentials = {};
      if (data.auth_type === 'api_key') {
        credentials.api_key = data.api_key;
      } else if (data.auth_type === 'bearer_token') {
        credentials.access_token = data.api_key;
      }

      const accountIds = data.account_ids ? data.account_ids.split(',').map(s => s.trim()) : [];
      const propertyIds = data.property_ids ? data.property_ids.split(',').map(s => s.trim()) : [];

      const payload = {
        organization_id: orgId,
        name: data.name,
        platform_type: data.platform_type,
        auth_type: data.auth_type,
        credentials,
        account_ids: accountIds,
        property_ids: propertyIds,
        sync_config: {
          schedule: data.schedule,
          backfill_days: parseInt(data.backfill_days),
          incremental_only: false
        },
        enabled: data.enabled !== undefined ? data.enabled : true,
        last_sync_status: data.last_sync_status || 'pending',
        metadata: {
          api_url: data.api_url || null
        }
      };

      console.log('[DataSourceManager] Payload:', payload);

      if (editingSource) {
        return await base44.entities.DataSource.update(editingSource.id, payload);
      } else {
        return await base44.entities.DataSource.create(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dataSources'] });
      toast.success(editingSource ? 'Data source updated' : 'Data source created');
      setShowDialog(false);
      setEditingSource(null);
      resetForm();
    },
    onError: (error) => {
      console.error('[DataSourceManager] Save error:', error);
      toast.error(`Failed to save data source: ${error.message}`);
    }
  });

  // Delete data source mutation
  const deleteSourceMutation = useMutation({
    mutationFn: (id) => base44.entities.DataSource.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dataSources'] });
      toast.success('Data source deleted');
      setDeletingSource(null);
      if (selectedSource?.id === deletingSource?.id) {
        setSelectedSource(null);
      }
    },
    onError: (error) => {
      toast.error(`Failed to delete data source: ${error.message}`);
    }
  });

  // Toggle data source mutation
  const toggleSourceMutation = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.DataSource.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dataSources'] });
      toast.success('Data source updated');
    }
  });

  // Trigger sync mutation
  const triggerSyncMutation = useMutation({
    mutationFn: async (dataSourceId) => {
      return await dataSyncService.initializeSync(dataSourceId, 'manual');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['syncJobs'] });
      toast.success('Sync started');
    },
    onError: (error) => {
      toast.error(`Sync failed: ${error.message}`);
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      platform_type: 'call_tracking',
      auth_type: 'api_key',
      api_url: 'https://api.calltrackingmetrics.com/api/v1',
      api_key: '',
      account_ids: '',
      property_ids: '',
      schedule: 'hourly',
      backfill_days: 90
    });
  };

  const handleCreate = () => {
    setEditingSource(null);
    resetForm();
    setShowDialog(true);
  };

  const handleEdit = (source) => {
    setEditingSource(source);
    setFormData({
      name: source.name,
      platform_type: source.platform_type,
      auth_type: source.auth_type,
      api_url: source.metadata?.api_url || 'https://api.calltrackingmetrics.com/api/v1',
      api_key: source.credentials?.api_key || source.credentials?.access_token || '',
      account_ids: source.account_ids?.join(', ') || '',
      property_ids: source.property_ids?.join(', ') || '',
      schedule: source.sync_config?.schedule || 'hourly',
      backfill_days: source.sync_config?.backfill_days || 90,
      enabled: source.enabled,
      last_sync_status: source.last_sync_status
    });
    setShowDialog(true);
  };

  const handleDelete = (source) => {
    setDeletingSource(source);
  };

  const confirmDelete = () => {
    if (deletingSource) {
      deleteSourceMutation.mutate(deletingSource.id);
    }
  };

  const handleSave = () => {
    const orgId = selectedOrgId || currentUser?.organization_id;
    
    console.log('[DataSourceManager] handleSave called');
    console.log('[DataSourceManager] Organization ID:', orgId);
    console.log('[DataSourceManager] Form data:', formData);
    
    // Check organization
    if (!orgId || orgId === 'all') {
      toast.error('Please select an organization');
      return;
    }

    if (!formData.name) {
      toast.error('Name is required');
      return;
    }

    if (formData.platform_type === 'call_tracking') {
      if (!formData.api_url) {
        toast.error('API URL is required for Call Tracking');
        return;
      }
      if (!formData.api_key) {
        toast.error('API Key/Token is required');
        return;
      }
      if (!formData.account_ids) {
        toast.error('Account ID is required for Call Tracking');
        return;
      }
    }

    console.log('[DataSourceManager] Validation passed, calling mutation');
    saveSourceMutation.mutate(formData);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success':
      case 'connected':
        return 'bg-green-600';
      case 'failed':
      case 'error':
        return 'bg-red-600';
      case 'in_progress':
        return 'bg-blue-600';
      default:
        return 'bg-gray-600';
    }
  };

  const getPlatformLabel = (type) => {
    const labels = {
      google_ads: 'Google Ads',
      google_analytics_4: 'Google Analytics 4',
      call_tracking: 'Call Tracking',
      facebook_ads: 'Facebook Ads'
    };
    return labels[type] || type;
  };

  // Get platform-specific defaults
  const getPlatformDefaults = (platformType) => {
    switch (platformType) {
      case 'call_tracking':
        return {
          api_url: 'https://api.calltrackingmetrics.com/api/v1',
          auth_type: 'api_key',
          schedule: 'hourly'
        };
      case 'google_ads':
        return {
          auth_type: 'oauth2',
          schedule: 'daily'
        };
      case 'google_analytics_4':
        return {
          auth_type: 'oauth2',
          schedule: 'daily'
        };
      default:
        return {
          auth_type: 'api_key',
          schedule: 'daily'
        };
    }
  };

  const handlePlatformChange = (platformType) => {
    const defaults = getPlatformDefaults(platformType);
    setFormData({
      ...formData,
      platform_type: platformType,
      ...defaults
    });
  };

  // Check if user has organization
  const hasOrganization = currentUser?.organization_id && currentUser.organization_id !== 'none';

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
                  Data Sources
                </h1>
                <p className="text-gray-600 mt-1">Connect and sync data from Call Tracking, Google Ads, and GA4</p>
              </div>
              <div className="flex gap-3">
                {isAgency && (
                  <OrganizationSelector
                    value={selectedOrgId || currentUser?.organization_id}
                    onChange={setSelectedOrgId}
                    showLabel={false}
                  />
                )}
                <Button onClick={handleCreate} className="gap-2" disabled={!hasOrganization}>
                  <Plus className="w-4 h-4" />
                  Add Data Source
                </Button>
              </div>
            </div>

            {/* No Organization Warning */}
            {!hasOrganization && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You need to be assigned to an organization to create data sources. 
                  Please contact your administrator.
                </AlertDescription>
              </Alert>
            )}

            {/* Data Sources Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dataSources.map(source => (
                <Card key={source.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {source.name}
                          <Badge className={getStatusColor(source.last_sync_status)}>
                            {source.last_sync_status}
                          </Badge>
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {getPlatformLabel(source.platform_type)}
                        </CardDescription>
                      </div>
                      <Switch
                        checked={source.enabled}
                        onCheckedChange={(enabled) =>
                          toggleSourceMutation.mutate({ id: source.id, enabled })
                        }
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {source.last_sync_at && (
                      <div className="text-sm">
                        <span className="text-gray-600">Last sync:</span>
                        <p className="font-medium">{format(new Date(source.last_sync_at), "MMM d, h:mm a")}</p>
                      </div>
                    )}
                    <div className="text-sm">
                      <span className="text-gray-600">Schedule:</span>
                      <p className="font-medium capitalize">{source.sync_config?.schedule || 'manual'}</p>
                    </div>
                    {source.total_records_synced > 0 && (
                      <div className="text-sm">
                        <span className="text-gray-600">Total records:</span>
                        <p className="font-medium">{source.total_records_synced.toLocaleString()}</p>
                      </div>
                    )}
                    
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2"
                        onClick={() => triggerSyncMutation.mutate(source.id)}
                        disabled={!source.enabled || triggerSyncMutation.isPending}
                      >
                        <RefreshCw className="w-3 h-3" />
                        Sync
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(source)}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(source)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => setSelectedSource(source)}
                    >
                      <SettingsIcon className="w-3 h-3" />
                      View Sync History
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {dataSources.length === 0 && hasOrganization && (
              <Card>
                <CardContent className="p-12 text-center">
                  <Database className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-2">No data sources configured yet.</p>
                  <p className="text-sm text-gray-500">Add Call Tracking Metrics to start syncing call data!</p>
                </CardContent>
              </Card>
            )}

            {/* Selected Source Details */}
            {selectedSource && (
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{selectedSource.name} - Sync History</CardTitle>
                      <CardDescription>Recent synchronization jobs</CardDescription>
                    </div>
                    <Button variant="outline" onClick={() => setSelectedSource(null)}>
                      Close
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {syncJobs.map(job => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {job.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-600" />}
                          {job.status === 'failed' && <XCircle className="w-5 h-5 text-red-600" />}
                          {job.status === 'in_progress' && <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />}
                          <div>
                            <p className="font-medium capitalize">{job.sync_type} Sync</p>
                            <p className="text-sm text-gray-600">
                              {job.date_range?.start_date} to {job.date_range?.end_date}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{job.records_synced || 0} records</p>
                          {job.completed_at && (
                            <p className="text-xs text-gray-500">
                              {format(new Date(job.completed_at), "MMM d, h:mm a")}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {syncJobs.length === 0 && (
                      <p className="text-center text-gray-500 py-8">No sync history yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Create/Edit Data Source Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingSource ? 'Edit Data Source' : 'Add Data Source'}</DialogTitle>
              <DialogDescription>
                {editingSource ? 'Update your data source configuration' : 'Connect Call Tracking Metrics or other data platforms'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Client Name - Call Tracking"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="platform">Platform Type *</Label>
                <Select
                  value={formData.platform_type}
                  onValueChange={handlePlatformChange}
                  disabled={!!editingSource}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call_tracking">Call Tracking Metrics</SelectItem>
                    <SelectItem value="google_ads">Google Ads</SelectItem>
                    <SelectItem value="google_analytics_4">Google Analytics 4</SelectItem>
                    <SelectItem value="facebook_ads">Facebook Ads</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Call Tracking Specific Fields */}
              {formData.platform_type === 'call_tracking' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="api_url">API Base URL *</Label>
                    <Input
                      id="api_url"
                      placeholder="https://api.calltrackingmetrics.com/api/v1"
                      value={formData.api_url}
                      onChange={(e) => setFormData({ ...formData, api_url: e.target.value })}
                    />
                    <p className="text-xs text-gray-500">
                      Default: https://api.calltrackingmetrics.com/api/v1
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="auth_type">Authentication Method *</Label>
                    <Select
                      value={formData.auth_type}
                      onValueChange={(value) => setFormData({ ...formData, auth_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="api_key">API Key</SelectItem>
                        <SelectItem value="bearer_token">Bearer Token</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="api_key">
                      {formData.auth_type === 'bearer_token' ? 'Access Token *' : 'API Key *'}
                    </Label>
                    <Input
                      id="api_key"
                      type="password"
                      placeholder="Paste your API key or token here"
                      value={formData.api_key}
                      onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                    />
                    <p className="text-xs text-gray-500">
                      Find this in your Call Tracking Metrics account settings
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="account_ids">Account ID *</Label>
                    <Input
                      id="account_ids"
                      placeholder="e.g., 12345"
                      value={formData.account_ids}
                      onChange={(e) => setFormData({ ...formData, account_ids: e.target.value })}
                    />
                    <p className="text-xs text-gray-500">
                      Your Call Tracking Metrics account ID (found in account settings)
                    </p>
                  </div>
                </>
              )}

              {/* Google Ads Fields */}
              {formData.platform_type === 'google_ads' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="auth_type">Authentication</Label>
                    <Select
                      value={formData.auth_type}
                      onValueChange={(value) => setFormData({ ...formData, auth_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                        <SelectItem value="api_key">API Key</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.auth_type === 'api_key' && (
                    <div className="space-y-2">
                      <Label htmlFor="api_key">API Key</Label>
                      <Input
                        id="api_key"
                        type="password"
                        value={formData.api_key}
                        onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="account_ids">Account IDs (comma-separated)</Label>
                    <Input
                      id="account_ids"
                      placeholder="e.g., 123-456-7890, 098-765-4321"
                      value={formData.account_ids}
                      onChange={(e) => setFormData({ ...formData, account_ids: e.target.value })}
                    />
                  </div>
                </>
              )}

              {/* GA4 Fields */}
              {formData.platform_type === 'google_analytics_4' && (
                <div className="space-y-2">
                  <Label htmlFor="property_ids">Property IDs (comma-separated)</Label>
                  <Input
                    id="property_ids"
                    placeholder="e.g., 123456789, 987654321"
                    value={formData.property_ids}
                    onChange={(e) => setFormData({ ...formData, property_ids: e.target.value })}
                  />
                </div>
              )}

              {/* Common Sync Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="schedule">Sync Schedule</Label>
                  <Select
                    value={formData.schedule}
                    onValueChange={(value) => setFormData({ ...formData, schedule: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly (Recommended for calls)</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="manual">Manual Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="backfill_days">Historical Days</Label>
                  <Input
                    id="backfill_days"
                    type="number"
                    value={formData.backfill_days}
                    onChange={(e) => setFormData({ ...formData, backfill_days: e.target.value })}
                  />
                  <p className="text-xs text-gray-500">How many days back to sync</p>
                </div>
              </div>

              {/* Platform-specific help text */}
              {formData.platform_type === 'call_tracking' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-900 font-semibold mb-2">📞 Call Tracking Setup</p>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• API credentials found in CTM Settings → API Access</li>
                    <li>• Account ID found in CTM Settings → Account Info</li>
                    <li>• Initial sync will fetch calls from last {formData.backfill_days} days</li>
                    <li>• Hourly sync recommended for real-time call tracking</li>
                  </ul>
                </div>
              )}

              {formData.platform_type !== 'call_tracking' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>Note:</strong> After creating the data source, you'll need to complete OAuth authentication 
                    if using OAuth 2.0. The initial sync will fetch the last {formData.backfill_days} days of data.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowDialog(false);
                setEditingSource(null);
                resetForm();
              }}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saveSourceMutation.isPending}>
                {saveSourceMutation.isPending ? 'Saving...' : editingSource ? 'Update' : 'Create Data Source'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deletingSource} onOpenChange={() => setDeletingSource(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Data Source</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deletingSource?.name}"? This will also delete all associated sync history. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PermissionGuard>
  );
}
