
import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings as SettingsIcon, Loader2, CheckCircle, AlertCircle, Plus, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { usePermissions } from "../components/auth/usePermissions";
import OrganizationSelector from "../components/org/OrganizationSelector";
import PermissionGuard from "../components/auth/PermissionGuard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { environmentConfig } from "../components/config/EnvironmentConfig";
import { productionApiService } from "../components/api/ProductionApiService";

export default function Settings() {
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingApi, setEditingApi] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    api_url: '',
    auth_method: 'bearer_token',
    api_token: '',
    priority: 1,
    rate_limit_per_hour: null,
    is_active: true
  });

  const [testingConnection, setTestingConnection] = useState(null);

  const { currentUser, isAgency } = usePermissions();

  const { data: apiConfigs, isLoading } = useQuery({
    queryKey: ['apiSettings', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      if (!orgId) return [];
      
      return await base44.entities.ApiSettings.filter({ organization_id: orgId });
    },
    enabled: !!(selectedOrgId || currentUser?.organization_id),
    initialData: []
  });

  const saveApiMutation = useMutation({
    mutationFn: async (data) => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      
      if (editingApi) {
        return await base44.entities.ApiSettings.update(editingApi.id, data);
      }
      return await base44.entities.ApiSettings.create({
        ...data,
        organization_id: orgId,
        current_usage: 0,
        usage_reset_at: new Date(Date.now() + 3600000).toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiSettings'] });
      toast.success(editingApi ? 'API updated' : 'API added');
      handleCloseDialog();
    }
  });

  const deleteApiMutation = useMutation({
    mutationFn: (id) => base44.entities.ApiSettings.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiSettings'] });
      toast.success('API deleted');
    }
  });

  const toggleApiMutation = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.ApiSettings.update(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiSettings'] });
      toast.success('API status updated');
    }
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async (api) => {
      setTestingConnection(api.id);
      try {
        const result = await productionApiService.testConnection(
          api.api_url,
          api.api_token,
          api.auth_method
        );
        setTestingConnection(null);
        return result;
      } catch (error) {
        setTestingConnection(null);
        // It's possible for productionApiService.testConnection to throw directly
        // if there's a network error or other unhandled exception.
        // We catch it here to ensure setTestingConnection is called.
        return { success: false, error: error.message };
      }
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Connection successful! (${result.duration}ms)`);
      } else {
        toast.error(`Connection failed: ${result.error || 'Unknown error'}`);
      }
    },
    onError: (error) => {
      setTestingConnection(null);
      toast.error(`Connection test failed unexpectedly: ${error.message}`);
    }
  });

  const handleOpenCreate = () => {
    setEditingApi(null);
    setFormData({
      name: '',
      api_url: '',
      auth_method: 'bearer_token',
      api_token: '',
      priority: apiConfigs.length + 1,
      rate_limit_per_hour: null,
      is_active: true
    });
    setShowCreateDialog(true);
  };

  const handleOpenEdit = (api) => {
    setEditingApi(api);
    setFormData({
      name: api.name || '',
      api_url: api.api_url || '',
      auth_method: api.auth_method || 'bearer_token',
      api_token: api.api_token || '',
      priority: api.priority || 1,
      rate_limit_per_hour: api.rate_limit_per_hour || null,
      is_active: api.is_active !== false
    });
    setShowCreateDialog(true);
  };

  const handleCloseDialog = () => {
    setShowCreateDialog(false);
    setEditingApi(null);
  };

  const handleSave = () => {
    if (!formData.name || !formData.api_url || !formData.api_token) {
      toast.error('Please fill in all required fields');
      return;
    }
    saveApiMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
      </div>
    );
  }

  const validation = environmentConfig.validateEnvironment();
  const envConfig = environmentConfig.getConfig();

  return (
    <PermissionGuard requiredLevel="admin">
      <div className="min-h-screen bg-gray-50">
        <div className="p-6 md:p-8">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <SettingsIcon className="w-8 h-8" />
                  API Settings
                </h1>
                <p className="text-gray-600 mt-1">Configure multiple APIs with intelligent rate limiting</p>
              </div>
              <div className="flex gap-3">
                {isAgency && (
                  <OrganizationSelector
                    value={selectedOrgId || currentUser?.organization_id}
                    onChange={setSelectedOrgId}
                    showLabel={false}
                  />
                )}
                <Button onClick={handleOpenCreate} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add API
                </Button>
              </div>
            </div>

            {/* Environment Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SettingsIcon className="w-5 h-5" />
                  Environment Configuration
                </CardTitle>
                <CardDescription>
                  Current environment: {environmentConfig.getEnvironmentName()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Environment</p>
                    <p className="font-medium capitalize">{environmentConfig.getEnvironment()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Mock Data</p>
                    <p className="font-medium">{envConfig.useMockData ? 'Enabled' : 'Disabled'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Debug Mode</p>
                    <p className="font-medium">{envConfig.enableDebugMode ? 'On' : 'Off'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Log Level</p>
                    <p className="font-medium capitalize">{envConfig.monitoring.logLevel}</p>
                  </div>
                </div>

                {!validation.valid && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800 font-medium mb-2">Configuration Issues:</p>
                    <ul className="list-disc list-inside text-sm text-red-700">
                      {validation.issues.map((issue, idx) => (
                        <li key={idx}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-3 border-t">
                  <p className="text-xs text-gray-500">
                    API Base URL: <span className="font-mono">{envConfig.apiBaseUrl}</span>
                  </p>
                </div>
              </CardContent>
            </Card>

            {apiConfigs.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <AlertCircle className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">No API configurations yet. Add your first API to get started!</p>
                  <Button onClick={handleOpenCreate} className="mt-4 bg-teal-600 hover:bg-teal-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Add First API
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {apiConfigs.map((api, idx) => (
                  <Card key={api.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <CardTitle className="text-lg">{api.name}</CardTitle>
                            <span className="text-sm text-gray-500">Priority: {api.priority}</span>
                            {api.connection_status === 'connected' && (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            )}
                            {api.connection_status === 'error' && (
                              <AlertCircle className="w-4 h-4 text-red-600" />
                            )}
                          </div>
                          <CardDescription className="mt-1">{api.api_url}</CardDescription>
                        </div>
                        <div className="flex items-center gap-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => testConnectionMutation.mutate(api)}
                            disabled={testingConnection === api.id || testConnectionMutation.isLoading}
                            className="gap-2"
                          >
                            {testingConnection === api.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle className="w-4 h-4" />
                            )}
                            Test
                          </Button>
                          <Switch
                            checked={api.is_active !== false}
                            onCheckedChange={(is_active) =>
                              toggleApiMutation.mutate({ id: api.id, is_active })
                            }
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenEdit(api)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteApiMutation.mutate(api.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Auth Method</span>
                          <p className="font-medium capitalize">{api.auth_method?.replace('_', ' ')}</p>
                        </div>
                        {api.rate_limit_per_hour && (
                          <div>
                            <span className="text-gray-600">Rate Limit</span>
                            <p className="font-medium">{api.rate_limit_per_hour} / hour</p>
                          </div>
                        )}
                        {api.current_usage !== undefined && (
                          <div>
                            <span className="text-gray-600">Current Usage</span>
                            <p className="font-medium">
                              {api.current_usage} 
                              {api.rate_limit_per_hour && ` / ${api.rate_limit_per_hour}`}
                            </p>
                          </div>
                        )}
                        {api.connection_status && (
                          <div>
                            <span className="text-gray-600">Status</span>
                            <p className={`font-medium ${api.connection_status === 'connected' ? 'text-green-600' : 'text-red-600'}`}>
                              {api.connection_status === 'connected' ? 'Connected' : 'Error'}
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {apiConfigs.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Multi-API Configuration</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p>✓ APIs are tried in priority order (1 = highest)</p>
                    <p>✓ Automatic rotation when rate limits are reached</p>
                    <p>✓ Requests are queued and distributed across APIs</p>
                    <p>✓ Failed requests automatically fallback to next API</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Create/Edit Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingApi ? 'Edit API' : 'Add API Configuration'}</DialogTitle>
              <DialogDescription>
                Configure API endpoint with rate limiting
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="api-name">API Name *</Label>
                <Input
                  id="api-name"
                  placeholder="e.g., Primary API"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="api_url">API Base URL *</Label>
                <Input
                  id="api_url"
                  placeholder="https://api.example.com"
                  value={formData.api_url}
                  onChange={(e) => setFormData({ ...formData, api_url: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="auth_method">Authentication</Label>
                  <Select
                    value={formData.auth_method}
                    onValueChange={(value) => setFormData({ ...formData, auth_method: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bearer_token">Bearer Token</SelectItem>
                      <SelectItem value="api_key">API Key</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Priority (1 = highest)</Label>
                  <Input
                    id="priority"
                    type="number"
                    min="1"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="api_token">
                  {formData.auth_method === 'bearer_token' ? 'Token' : 'API Key'} *
                </Label>
                <Input
                  id="api_token"
                  type="password"
                  value={formData.api_token}
                  onChange={(e) => setFormData({ ...formData, api_token: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rate_limit">Rate Limit (requests per hour)</Label>
                <Input
                  id="rate_limit"
                  type="number"
                  placeholder="e.g., 1000"
                  value={formData.rate_limit_per_hour || ''}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    rate_limit_per_hour: e.target.value ? parseInt(e.target.value) : null 
                  })}
                />
                <p className="text-xs text-gray-500">
                  Leave empty if no rate limit. System will auto-detect from headers.
                </p>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <Label>Active</Label>
                  <p className="text-xs text-gray-500">Enable this API for requests</p>
                </div>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(is_active) => setFormData({ ...formData, is_active })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                {editingApi ? 'Update' : 'Create'} API
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
}
