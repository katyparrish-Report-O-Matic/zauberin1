import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Database, Plus, CheckCircle, XCircle, RefreshCw, Settings as SettingsIcon } from "lucide-react";
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
import { usePermissions } from "../components/auth/usePermissions";
import OrganizationSelector from "../components/org/OrganizationSelector";
import PermissionGuard from "../components/auth/PermissionGuard";
import { dataSyncService } from "../components/sync/DataSyncService";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function DataSourceManager() {
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedSource, setSelectedSource] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    platform_type: 'google_ads',
    auth_type: 'oauth2',
    account_ids: '',
    property_ids: '',
    api_key: '',
    schedule: 'daily',
    backfill_days: 90
  });

  const { currentUser, isAgency } = usePermissions();

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

  // Create data source mutation
  const createSourceMutation = useMutation({
    mutationFn: async (data) => {
      const orgId = selectedOrgId || currentUser?.organization_id;

      const credentials = {};
      if (data.auth_type === 'api_key') {
        credentials.api_key = data.api_key;
      }

      const accountIds = data.account_ids ? data.account_ids.split(',').map(s => s.trim()) : [];
      const propertyIds = data.property_ids ? data.property_ids.split(',').map(s => s.trim()) : [];

      return await base44.entities.DataSource.create({
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
        enabled: true,
        last_sync_status: 'pending'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dataSources'] });
      toast.success('Data source created');
      setShowCreateDialog(false);
      resetForm();
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
      platform_type: 'google_ads',
      auth_type: 'oauth2',
      account_ids: '',
      property_ids: '',
      api_key: '',
      schedule: 'daily',
      backfill_days: 90
    });
  };

  const handleCreate = () => {
    if (!formData.name) {
      toast.error('Name is required');
      return;
    }

    createSourceMutation.mutate(formData);
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
                <p className="text-gray-600 mt-1">Connect and sync data from Google Ads, GA4, and call tracking</p>
              </div>
              <div className="flex gap-3">
                {isAgency && (
                  <OrganizationSelector
                    value={selectedOrgId || currentUser?.organization_id}
                    onChange={setSelectedOrgId}
                    showLabel={false}
                  />
                )}
                <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Data Source
                </Button>
              </div>
            </div>

            {/* Data Sources Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dataSources.map(source => (
                <Card key={source.id} className="hover:shadow-lg transition-shadow cursor-pointer"
                      onClick={() => setSelectedSource(source)}>
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
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerSyncMutation.mutate(source.id);
                      }}
                      disabled={!source.enabled || triggerSyncMutation.isPending}
                    >
                      <RefreshCw className="w-3 h-3" />
                      Sync Now
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {dataSources.length === 0 && (
              <Card>
                <CardContent className="p-12 text-center">
                  <Database className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">No data sources configured. Add your first data source to start syncing!</p>
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

        {/* Create Data Source Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Data Source</DialogTitle>
              <DialogDescription>
                Connect a new data platform to sync metrics
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Main Google Ads Account"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="platform">Platform *</Label>
                  <Select
                    value={formData.platform_type}
                    onValueChange={(value) => setFormData({ ...formData, platform_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="google_ads">Google Ads</SelectItem>
                      <SelectItem value="google_analytics_4">Google Analytics 4</SelectItem>
                      <SelectItem value="call_tracking">Call Tracking</SelectItem>
                      <SelectItem value="facebook_ads">Facebook Ads</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

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

              {formData.platform_type === 'google_ads' && (
                <div className="space-y-2">
                  <Label htmlFor="account_ids">Account IDs (comma-separated)</Label>
                  <Input
                    id="account_ids"
                    placeholder="e.g., 123-456-7890, 098-765-4321"
                    value={formData.account_ids}
                    onChange={(e) => setFormData({ ...formData, account_ids: e.target.value })}
                  />
                </div>
              )}

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
                      <SelectItem value="hourly">Hourly</SelectItem>
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
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> After creating the data source, you'll need to complete OAuth authentication 
                  if using OAuth 2.0. The initial sync will fetch the last {formData.backfill_days} days of data.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createSourceMutation.isPending}>
                {createSourceMutation.isPending ? 'Creating...' : 'Create Data Source'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
}