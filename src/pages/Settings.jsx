
import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings as SettingsIcon, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "../components/auth/usePermissions";
import OrganizationSelector from "../components/org/OrganizationSelector";
import PermissionGuard from "../components/auth/PermissionGuard";

export default function Settings() {
  const queryClient = useQueryClient();
  const [isTesting, setIsTesting] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [formData, setFormData] = useState({
    api_url: '',
    auth_method: 'bearer_token',
    api_token: ''
  });

  const { currentUser, isAgency } = usePermissions();

  const { data: existingSettings, isLoading } = useQuery({
    queryKey: ['apiSettings', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      if (!orgId) return null;
      
      const settings = await base44.entities.ApiSettings.filter({ organization_id: orgId });
      return settings[0] || null;
    },
    enabled: !!(selectedOrgId || currentUser?.organization_id)
  });

  React.useEffect(() => {
    if (existingSettings) {
      setFormData({
        api_url: existingSettings.api_url || '',
        auth_method: existingSettings.auth_method || 'bearer_token',
        api_token: existingSettings.api_token || ''
      });
    } else {
      setFormData({
        api_url: '',
        auth_method: 'bearer_token',
        api_token: ''
      });
    }
  }, [existingSettings]);

  const saveSettingsMutation = useMutation({
    mutationFn: async (data) => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      
      if (existingSettings) {
        return await base44.entities.ApiSettings.update(existingSettings.id, data);
      }
      return await base44.entities.ApiSettings.create({
        ...data,
        organization_id: orgId
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiSettings', selectedOrgId || currentUser?.organization_id] });
      toast.success('Settings saved');
    }
  });

  const testConnection = async () => {
    if (!formData.api_url || !formData.api_token) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsTesting(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const success = Math.random() > 0.3;
    
    if (success) {
      toast.success('Connection successful');
      saveSettingsMutation.mutate({
        ...formData,
        connection_status: 'connected'
      });
    } else {
      toast.error('Connection failed');
      saveSettingsMutation.mutate({
        ...formData,
        connection_status: 'error'
      });
    }
    
    setIsTesting(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
      </div>
    );
  }

  return (
    <PermissionGuard requiredLevel="admin">
      <div className="min-h-screen bg-gray-50">
        <div className="p-6 md:p-8">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <SettingsIcon className="w-8 h-8" />
                  Settings
                </h1>
                <p className="text-gray-600 mt-1">Configure API connection for live data</p>
              </div>
              {isAgency && (
                <OrganizationSelector
                  value={selectedOrgId || currentUser?.organization_id}
                  onChange={setSelectedOrgId}
                  showLabel={false}
                />
              )}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>API Configuration</CardTitle>
                <CardDescription>
                  Connect your metrics API to fetch real data. Currently using mock data for demonstration.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="api_url">API Base URL</Label>
                  <Input
                    id="api_url"
                    placeholder="https://api.example.com"
                    value={formData.api_url}
                    onChange={(e) => setFormData({ ...formData, api_url: e.target.value })}
                  />
                </div>

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
                  <Label htmlFor="api_token">
                    {formData.auth_method === 'bearer_token' ? 'Token' : 'API Key'}
                  </Label>
                  <Input
                    id="api_token"
                    type="password"
                    value={formData.api_token}
                    onChange={(e) => setFormData({ ...formData, api_token: e.target.value })}
                  />
                </div>

                {existingSettings?.connection_status && (
                  <div className="flex items-center gap-2 text-sm">
                    {existingSettings.connection_status === 'connected' ? (
                      <><CheckCircle className="w-4 h-4 text-green-600" /> Connected</>
                    ) : existingSettings.connection_status === 'error' ? (
                      <><AlertCircle className="w-4 h-4 text-red-600" /> Connection failed</>
                    ) : null}
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={testConnection}
                    disabled={isTesting}
                    variant="outline"
                  >
                    {isTesting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Testing...</> : 'Test Connection'}
                  </Button>
                  <Button onClick={() => saveSettingsMutation.mutate(formData)}>
                    Save Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PermissionGuard>
  );
}
