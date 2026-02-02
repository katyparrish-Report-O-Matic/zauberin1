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
import { Database, Plus, CheckCircle, XCircle, RefreshCw, Settings as SettingsIcon, Pencil, Trash2, AlertCircle, Loader2, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
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
  
  // Multi-step form state
  const [currentStep, setCurrentStep] = useState(1);
  const [availableAccounts, setAvailableAccounts] = useState([]);
  const [isTesting, setIsTesting] = useState(false);
  const [connectionTested, setConnectionTested] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    platform_type: 'call_tracking',
    auth_type: 'api_key',
    api_url: 'https://api.calltrackingmetrics.com/api/v1',
    api_key: '',
    account_ids: [],
    property_ids: '',
    customer_id: '',
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
      if (orgId === 'all' && isAgency) {
        return await base44.entities.DataSource.list('-created_date');
      }
      if (orgId && orgId !== 'all') {
        return await base44.entities.DataSource.filter(
          { organization_id: orgId },
          '-created_date'
        );
      }
      return await base44.entities.DataSource.list('-created_date');
    },
    initialData: []
  });

  // Fetch sync jobs for selected source - WITH AUTO REFRESH
  const { data: syncJobs = [] } = useQuery({ // Changed to provide default empty array
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
    initialData: [],
    refetchInterval: (data) => {
      // Auto-refresh every 2 seconds if any job is in progress
      const hasActiveJobs = Array.isArray(data) && data.some(job => job.status === 'in_progress'); // Added Array.isArray(data) check
      return hasActiveJobs ? 2000 : false;
    }
  });

  // Fetch last sync job for each data source (for display on cards)
  const { data: lastSyncJobs = {} } = useQuery({
    queryKey: ['lastSyncJobsPerSource', dataSources?.map(s => s.id).join(',')],
    queryFn: async () => {
      if (!dataSources || dataSources.length === 0) return {};
      
      const jobs = {};
      for (const source of dataSources) {
        const result = await base44.entities.SyncJob.filter(
          { data_source_id: source.id },
          '-created_date',
          1
        );
        if (result.length > 0) {
          jobs[source.id] = result[0];
        }
      }
      return jobs;
    },
    enabled: !!dataSources && dataSources.length > 0
  });

  // Test connection and fetch accounts
  const testConnectionMutation = useMutation({
    mutationFn: async (credentials) => {
      console.log('[DataSourceManager] Testing connection...');
      const result = await base44.functions.invoke('testCtmConnection', {
        apiKey: credentials.api_key
      });
      
      console.log('[DataSourceManager] Test result:', result.data);
      
      if (!result.data.success) {
        throw new Error(result.data.error || 'Connection test failed');
      }
      
      return result.data;
    },
    onSuccess: (data) => {
      console.log('[DataSourceManager] Connection successful, accounts:', data.accounts?.length);
      setAvailableAccounts(data.accounts || []);
      setConnectionTested(true);
      setCurrentStep(2);
      toast.success(`Connection successful! Found ${data.accounts_found} account(s)`);
    },
    onError: (error) => {
      console.error('[DataSourceManager] Connection test failed:', error);
      toast.error(`Connection failed: ${error.message}`);
      setConnectionTested(false);
      setAvailableAccounts([]);
    }
  });

  // Create/Update data source mutation
  const saveSourceMutation = useMutation({
    mutationFn: async (data) => {
      console.log('[DataSourceManager] Starting save mutation...');
      console.log('[DataSourceManager] Form data:', data);
      
      const orgId = selectedOrgId || currentUser?.organization_id;
      console.log('[DataSourceManager] Organization ID:', orgId);

      const credentials = {};
      if (data.auth_type === 'api_key') {
        credentials.api_key = data.api_key;
      } else if (data.auth_type === 'bearer_token') {
        credentials.access_token = data.api_key;
      }

      const payload = {
        organization_id: orgId,
        name: data.name,
        platform_type: data.platform_type,
        auth_type: data.auth_type,
        credentials,
        account_ids: data.account_ids.map(id => String(id)), // 🔥 CONVERT TO STRINGS!
        property_ids: data.property_ids ? data.property_ids.split(',').map(s => s.trim()) : [],
        sync_config: {
          schedule: data.schedule,
          backfill_days: parseInt(data.backfill_days),
          incremental_only: false
        },
        enabled: data.enabled !== undefined ? data.enabled : true,
        last_sync_status: data.last_sync_status || 'pending',
        metadata: {
          api_url: data.api_url || null,
          access_level: data.platform_type === 'call_tracking' ? 'agency' : null,
          customer_id: data.customer_id || null
        }
      };

      console.log('[DataSourceManager] Payload to save:', payload);
      console.log('[DataSourceManager] account_ids converted to strings:', payload.account_ids);

      if (editingSource) {
        console.log('[DataSourceManager] Updating existing source:', editingSource.id);
        return await base44.entities.DataSource.update(editingSource.id, payload);
      } else {
        console.log('[DataSourceManager] Creating new source');
        return await base44.entities.DataSource.create(payload);
      }
    },
    onSuccess: (result) => {
      console.log('[DataSourceManager] ✅ Save successful:', result);
      queryClient.invalidateQueries({ queryKey: ['dataSources'] });
      toast.success(editingSource ? 'Data source updated' : 'Data source created');
      setShowDialog(false);
      setEditingSource(null);
      resetForm();
    },
    onError: (error) => {
      console.error('[DataSourceManager] ❌ Save error:', error);
      console.error('[DataSourceManager] Error details:', {
        message: error.message,
        stack: error.stack,
        response: error.response
      });
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

  // Check if any sync is currently running
  const isAnySyncRunning = syncJobs.some(job => job.status === 'in_progress');

  const resetForm = () => {
    setFormData({
      name: '',
      platform_type: 'call_tracking',
      auth_type: 'api_key',
      api_url: 'https://api.calltrackingmetrics.com/api/v1',
      api_key: '',
      account_ids: [],
      property_ids: '',
      customer_id: '',
      schedule: 'hourly',
      backfill_days: 90
    });
    setCurrentStep(1);
    setAvailableAccounts([]);
    setConnectionTested(false);
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
      account_ids: source.account_ids || [],
      property_ids: source.property_ids?.join(', ') || '',
      customer_id: source.metadata?.customer_id || '',
      schedule: source.sync_config?.schedule || 'hourly',
      backfill_days: source.sync_config?.backfill_days || 90,
      enabled: source.enabled,
      last_sync_status: source.last_sync_status
    });
    // When editing, skip to step 2 if we have accounts
    setCurrentStep(source.account_ids?.length > 0 ? 2 : 1);
    setConnectionTested(source.account_ids?.length > 0);
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

  const handleTestConnection = () => {
    const orgId = selectedOrgId || currentUser?.organization_id;
    
    if (!orgId || orgId === 'all') {
      toast.error('Please select an organization');
      return;
    }

    if (!formData.name.trim()) {
      toast.error('Please enter a name for this data source');
      return;
    }

    if (!formData.api_key.trim()) {
      toast.error('Please enter your API credentials');
      return;
    }

    // Additional validation based on platform type
    if (formData.platform_type === 'google_ads' && !formData.customer_id.trim()) {
      toast.error('Please enter your Google Ads Customer ID');
      return;
    }

    if (formData.platform_type === 'google_analytics_4' && !formData.property_ids.trim()) {
      toast.error('Please enter at least one GA4 Property ID');
      return;
    }

    console.log('[DataSourceManager] Testing connection with:', {
      name: formData.name,
      platform: formData.platform_type,
      hasApiKey: !!formData.api_key
    });

    // For Google Ads, GA4, and Salesforce, skip test and go directly to step 2 (manual config)
    if (formData.platform_type === 'google_ads' || 
        formData.platform_type === 'google_analytics_4' || 
        formData.platform_type === 'salesforce') {
      setConnectionTested(true);
      setCurrentStep(2);
      toast.success('Credentials saved - configure sync settings');
      return;
    }

    // For Call Tracking, test connection
    testConnectionMutation.mutate(formData);
  };

  const handleAccountToggle = (accountId) => {
    console.log('[DataSourceManager] Toggling account:', accountId);
    console.log('[DataSourceManager] Current account_ids BEFORE toggle:', formData.account_ids);
    
    setFormData(prev => {
      const newAccountIds = prev.account_ids.includes(accountId)
        ? prev.account_ids.filter(id => id !== accountId)
        : [...prev.account_ids, accountId];
      
      console.log('[DataSourceManager] New account_ids AFTER toggle:', newAccountIds);
      return {
        ...prev,
        account_ids: newAccountIds
      };
    });
  };

  const handleSelectAllAccounts = () => {
    if (formData.account_ids.length === availableAccounts.length) {
      // Deselect all
      setFormData(prev => ({ ...prev, account_ids: [] }));
    } else {
      // Select all
      setFormData(prev => ({
        ...prev,
        account_ids: availableAccounts.map(acc => acc.id)
      }));
    }
  };

  const handleSave = () => {
    console.log('========================================');
    console.log('[DataSourceManager] ✅ SAVE BUTTON CLICKED!');
    console.log('[DataSourceManager] Current formData:', JSON.stringify(formData, null, 2));
    console.log('[DataSourceManager] account_ids:', formData.account_ids);
    console.log('[DataSourceManager] account_ids length:', formData.account_ids.length);
    console.log('[DataSourceManager] account_ids type:', typeof formData.account_ids);
    console.log('========================================');
    
    const orgId = selectedOrgId || currentUser?.organization_id;
    
    if (!orgId || orgId === 'all') {
      console.error('[DataSourceManager] ❌ Validation failed: No organization');
      toast.error('Please select an organization');
      return;
    }

    if (!formData.name) {
      console.error('[DataSourceManager] ❌ Validation failed: No name');
      toast.error('Name is required');
      return;
    }

    if (!formData.api_key) {
      console.error('[DataSourceManager] ❌ Validation failed: No API key');
      toast.error('API credentials are required');
      return;
    }

    if (!Array.isArray(formData.account_ids)) {
      console.error('[DataSourceManager] ❌ account_ids is not an array!', formData.account_ids);
      toast.error('Invalid account selection');
      return;
    }

    // Only require account_ids for call tracking
    if (formData.platform_type === 'call_tracking' && formData.account_ids.length === 0) {
      console.error('[DataSourceManager] ❌ Validation failed: No accounts selected');
      toast.error('Please select at least one account to sync');
      return;
    }

    // Validate Google Ads
    if (formData.platform_type === 'google_ads' && !formData.customer_id) {
      console.error('[DataSourceManager] ❌ Validation failed: No customer ID');
      toast.error('Customer ID is required for Google Ads');
      return;
    }

    // Validate GA4
    if (formData.platform_type === 'google_analytics_4' && !formData.property_ids) {
      console.error('[DataSourceManager] ❌ Validation failed: No property IDs');
      toast.error('Property IDs are required for Google Analytics 4');
      return;
    }

    console.log('[DataSourceManager] ✅ All validations passed!');
    console.log('[DataSourceManager] Calling saveSourceMutation...');
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
      facebook_ads: 'Facebook Ads',
      salesforce: 'Salesforce'
    };
    return labels[type] || type;
  };

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
                    {source.account_ids?.length > 0 && (
                      <div className="text-sm">
                        <span className="text-gray-600">Accounts:</span>
                        <p className="font-medium">{source.account_ids.length} connected</p>
                      </div>
                    )}
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
                        disabled={!source.enabled || triggerSyncMutation.isPending || isAnySyncRunning}
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
                      <CardDescription>
                        Recent synchronization jobs
                        {Array.isArray(syncJobs) && syncJobs.some(j => j.status === 'in_progress') && ( // Added Array.isArray(syncJobs) check
                          <span className="ml-2 text-blue-600 font-medium">
                            • Live updates every 2s
                          </span>
                        )}
                      </CardDescription>
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
                        className="flex flex-col gap-2 p-4 border border-gray-200 rounded-lg"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {job.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-600" />}
                            {job.status === 'failed' && <XCircle className="w-5 h-5 text-red-600" />}
                            {job.status === 'in_progress' && <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />}
                            {job.status === 'pending' && <AlertCircle className="w-5 h-5 text-gray-400" />}
                            <div>
                              <p className="font-medium capitalize">{job.sync_type} Sync</p>
                              <p className="text-sm text-gray-600">
                                {job.date_range?.start_date} to {job.date_range?.end_date}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">
                              {job.records_synced || 0} records
                              {job.status === 'in_progress' && ` (${job.progress_percentage}%)`}
                            </p>
                            {job.completed_at && (
                              <p className="text-xs text-gray-500">
                                {format(new Date(job.completed_at), "MMM d, h:mm a")}
                                {job.duration_seconds && ` (${job.duration_seconds}s)`}
                              </p>
                            )}
                          </div>
                        </div>
                        
                        {/* Progress bar for active jobs */}
                        {job.status === 'in_progress' && (
                          <div className="space-y-1">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${job.progress_percentage || 0}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-600">{job.current_step || 'Processing...'}</p>
                          </div>
                        )}
                        
                        {/* Error message */}
                        {job.status === 'failed' && job.error_message && (
                          <div className="bg-red-50 border border-red-200 rounded p-2">
                            <p className="text-xs text-red-800">{job.error_message}</p>
                          </div>
                        )}
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
        <Dialog open={showDialog} onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) resetForm();
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingSource ? 'Edit Data Source' : 'Add Data Source'}
                {currentStep === 2 && ' - Select Accounts'}
              </DialogTitle>
              <DialogDescription>
                {currentStep === 1 && 'Enter your API credentials to connect'}
                {currentStep === 2 && 'Choose which accounts to sync data from'}
              </DialogDescription>
            </DialogHeader>

            {/* Step 1: Credentials */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Adtrak Call Tracking"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="platform_type">Platform Type *</Label>
                  <Select
                    value={formData.platform_type}
                    onValueChange={(value) => setFormData({ ...formData, platform_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call_tracking">Call Tracking Metrics</SelectItem>
                      <SelectItem value="google_ads">Google Ads</SelectItem>
                      <SelectItem value="google_analytics_4">Google Analytics 4</SelectItem>
                      <SelectItem value="salesforce">Salesforce</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.platform_type === 'call_tracking' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="api_key">API Credentials (Access Key:Secret Key) *</Label>
                      <Input
                        id="api_key"
                        type="password"
                        placeholder="access_key_here:secret_key_here"
                        value={formData.api_key}
                        onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                      />
                      <p className="text-xs text-gray-500">
                        Format: access_key:secret_key (found in CTM Agency Settings → API Access)
                      </p>
                    </div>
                  </>
                )}

                {formData.platform_type === 'google_ads' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="customer_id">Customer ID *</Label>
                      <Input
                        id="customer_id"
                        placeholder="123-456-7890"
                        value={formData.customer_id}
                        onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                      />
                      <p className="text-xs text-gray-500">
                        Your Google Ads Customer ID (format: 123-456-7890)
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="api_key">Developer Token or API Key *</Label>
                      <Input
                        id="api_key"
                        type="password"
                        placeholder="Your Google Ads API credentials"
                        value={formData.api_key}
                        onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                      />
                      <p className="text-xs text-gray-500">
                        Google Ads API Developer Token or Service Account credentials
                      </p>
                    </div>
                  </>
                )}

                {formData.platform_type === 'google_analytics_4' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="property_ids">GA4 Property IDs *</Label>
                      <Input
                        id="property_ids"
                        placeholder="123456789, 987654321"
                        value={formData.property_ids}
                        onChange={(e) => setFormData({ ...formData, property_ids: e.target.value })}
                      />
                      <p className="text-xs text-gray-500">
                        Comma-separated GA4 property IDs (found in Admin → Property Settings)
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="api_key">Service Account Key or API Token *</Label>
                      <Input
                        id="api_key"
                        type="password"
                        placeholder="Your GA4 API credentials"
                        value={formData.api_key}
                        onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                      />
                      <p className="text-xs text-gray-500">
                        Service Account JSON key or OAuth access token
                      </p>
                    </div>
                  </>
                )}

                {formData.platform_type === 'salesforce' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-900 font-semibold mb-2">🔗 OAuth Connection</p>
                    <p className="text-sm text-blue-800">
                      Salesforce uses OAuth authentication. Click "Continue" to proceed with authorization.
                    </p>
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

                {formData.platform_type === 'call_tracking' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-900 font-semibold mb-2">🔑 Agency-Level Access</p>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• Get credentials from CTM → Agency Settings → API Access</li>
                      <li>• Format: access_key:secret_key (with colon separator)</li>
                      <li>• We'll test connection and show available accounts</li>
                      <li>• You can then select which accounts to sync</li>
                    </ul>
                  </div>
                )}

                {formData.platform_type === 'google_ads' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-900 font-semibold mb-2">🔑 Google Ads Setup</p>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• Customer ID: Found in your Google Ads account (top right)</li>
                      <li>• Developer Token: Apply for API access in Google Ads</li>
                      <li>• Or use Service Account credentials (JSON key)</li>
                      <li>• Manual setup - no automatic account discovery</li>
                    </ul>
                  </div>
                )}

                {formData.platform_type === 'google_analytics_4' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-900 font-semibold mb-2">🔑 GA4 Setup</p>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• Property ID: Admin → Property Settings → Property ID</li>
                      <li>• Use Service Account with Analytics Viewer permissions</li>
                      <li>• Or OAuth token with analytics.readonly scope</li>
                      <li>• Add multiple properties separated by commas</li>
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Account Selection / Configuration */}
            {currentStep === 2 && (
              <div className="space-y-4">
                {formData.platform_type === 'call_tracking' && (
                  <>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                      <CheckCheck className="w-5 h-5 text-green-600 mt-0.5" />
                      <div>
                        <p className="text-sm text-green-900 font-semibold">Connection Successful</p>
                        <p className="text-sm text-green-800">Found {availableAccounts.length} account(s)</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Select Accounts to Sync *</Label>
                        {availableAccounts.length > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleSelectAllAccounts}
                          >
                            {formData.account_ids.length === availableAccounts.length 
                              ? 'Deselect All' 
                              : 'Select All'}
                          </Button>
                        )}
                      </div>
                      <div className="border border-gray-200 rounded-lg p-4 space-y-3 max-h-80 overflow-y-auto">
                        {availableAccounts.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-4">
                            No accounts found. Make sure your agency has sub-accounts configured.
                          </p>
                        ) : (
                          availableAccounts.map(account => (
                            <div
                              key={account.id}
                              className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                            >
                              <Checkbox
                                id={`account-${account.id}`}
                                checked={formData.account_ids.includes(account.id)}
                                onCheckedChange={() => handleAccountToggle(account.id)}
                              />
                              <div className="flex-1">
                                <label
                                  htmlFor={`account-${account.id}`}
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                >
                                  {account.name}
                                </label>
                                <p className="text-xs text-gray-500 mt-1">
                                  ID: {account.id} • Status: {account.status}
                                </p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {formData.account_ids.length} account(s) selected
                      </p>
                    </div>
                  </>
                )}

                {(formData.platform_type === 'google_ads' || formData.platform_type === 'google_analytics_4' || formData.platform_type === 'salesforce') && (
                  <>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm text-blue-900 font-semibold mb-2">✓ Credentials Saved</p>
                      <p className="text-sm text-blue-800">
                        {formData.platform_type === 'google_ads' && `Customer ID: ${formData.customer_id}`}
                        {formData.platform_type === 'google_analytics_4' && `Property IDs: ${formData.property_ids}`}
                        {formData.platform_type === 'salesforce' && 'Salesforce OAuth will be configured'}
                      </p>
                    </div>

                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {formData.platform_type === 'google_ads' && 'Google Ads sync requires backend function setup. Click Create to save this data source.'}
                        {formData.platform_type === 'google_analytics_4' && 'GA4 sync requires backend function setup. Click Create to save this data source.'}
                        {formData.platform_type === 'salesforce' && 'Click Create to save this data source and authorize Salesforce access.'}
                      </AlertDescription>
                    </Alert>
                  </>
                )}

                <Button
                  variant="outline"
                  onClick={() => {
                    setCurrentStep(1);
                    setConnectionTested(false);
                  }}
                  className="w-full"
                >
                  ← Back to Credentials
                </Button>
              </div>
            )}

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  console.log('[DataSourceManager] Cancel clicked');
                  setShowDialog(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              
              {currentStep === 1 && (
                <Button 
                  onClick={handleTestConnection} 
                  disabled={testConnectionMutation.isPending || !formData.api_key || !formData.name}
                >
                  {testConnectionMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Testing Connection...
                    </>
                  ) : formData.platform_type === 'call_tracking' ? (
                    'Test Connection & Fetch Accounts'
                  ) : (
                    'Continue →'
                  )}
                </Button>
              )}
              
              {currentStep === 2 && (
                <>
                  {formData.platform_type === 'call_tracking' && (
                    <div className="text-xs text-gray-500 mr-auto">
                      Debug: {formData.account_ids.length} selected, {availableAccounts.length} available
                    </div>
                  )}
                  <Button 
                    onClick={() => {
                      console.log('[DataSourceManager] 🔴 CREATE BUTTON CLICKED!');
                      console.log('[DataSourceManager] isPending:', saveSourceMutation.isPending);
                      console.log('[DataSourceManager] platform_type:', formData.platform_type);
                      handleSave();
                    }}
                    disabled={saveSourceMutation.isPending || (formData.platform_type === 'call_tracking' && formData.account_ids.length === 0)}
                  >
                    {saveSourceMutation.isPending ? 'Saving...' : editingSource ? 'Update Data Source' : 'Create Data Source'}
                  </Button>
                </>
              )}
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