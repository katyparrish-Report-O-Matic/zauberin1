import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Key, Plus, Copy, Eye, EyeOff, Trash2, TrendingUp, Activity } from "lucide-react";
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
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { usePermissions } from "../components/auth/usePermissions";
import OrganizationSelector from "../components/org/OrganizationSelector";
import PermissionGuard from "../components/auth/PermissionGuard";
import { apiKeyService } from "../components/api/ApiKeyService";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function ApiKeysManager() {
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [showAnalyticsDialog, setShowAnalyticsDialog] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const [newKeyData, setNewKeyData] = useState(null);
  
  const [newKey, setNewKey] = useState({
    name: '',
    permissions: ['reports:read'],
    rate_limit_per_hour: 1000,
    expires_in_days: null
  });

  const { currentUser, isAgency } = usePermissions();

  const availablePermissions = [
    { value: 'reports:read', label: 'Read Reports' },
    { value: 'reports:write', label: 'Create/Update Reports' },
    { value: 'reports:delete', label: 'Delete Reports' },
    { value: 'data:read', label: 'Read Data' },
    { value: 'data:export', label: 'Export Data' }
  ];

  // Fetch API keys
  const { data: apiKeys } = useQuery({
    queryKey: ['apiKeys', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      if (!orgId || orgId === 'all') return [];
      
      return await apiKeyService.getKeysForOrganization(orgId);
    },
    initialData: []
  });

  // Fetch analytics for selected key
  const { data: analytics } = useQuery({
    queryKey: ['apiKeyAnalytics', selectedKey?.id],
    queryFn: async () => {
      if (!selectedKey) return null;
      return await apiKeyService.getUsageAnalytics(selectedKey.id, 7);
    },
    enabled: !!selectedKey && showAnalyticsDialog
  });

  // Create API key mutation
  const createKeyMutation = useMutation({
    mutationFn: async (keyData) => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      return await apiKeyService.createApiKey(
        orgId,
        keyData.name,
        keyData.permissions,
        keyData.rate_limit_per_hour,
        keyData.expires_in_days
      );
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
      setNewKeyData(data);
      setShowKeyDialog(true);
      setShowCreateDialog(false);
      setNewKey({
        name: '',
        permissions: ['reports:read'],
        rate_limit_per_hour: 1000,
        expires_in_days: null
      });
      toast.success('API key created');
    }
  });

  // Toggle key mutation
  const toggleKeyMutation = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.ApiKey.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
      toast.success('API key updated');
    }
  });

  // Delete key mutation
  const deleteKeyMutation = useMutation({
    mutationFn: (id) => base44.entities.ApiKey.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
      toast.success('API key deleted');
    }
  });

  const handleCreateKey = () => {
    if (!newKey.name) {
      toast.error('API key name is required');
      return;
    }
    if (newKey.permissions.length === 0) {
      toast.error('At least one permission is required');
      return;
    }
    createKeyMutation.mutate(newKey);
  };

  const handlePermissionToggle = (permission) => {
    const current = newKey.permissions;
    if (current.includes(permission)) {
      setNewKey({
        ...newKey,
        permissions: current.filter(p => p !== permission)
      });
    } else {
      setNewKey({
        ...newKey,
        permissions: [...current, permission]
      });
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
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
                  <Key className="w-8 h-8" />
                  API Keys
                </h1>
                <p className="text-gray-600 mt-1">Manage programmatic access to your MetricFlow data</p>
              </div>
              <div className="flex gap-3">
                {isAgency && (
                  <OrganizationSelector
                    value={selectedOrgId || currentUser?.organization_id}
                    onChange={setSelectedOrgId}
                    showLabel={false}
                  />
                )}
                <Link to={createPageUrl("ApiDocumentation")}>
                  <Button variant="outline" className="gap-2">
                    View Documentation
                  </Button>
                </Link>
                <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Create API Key
                </Button>
              </div>
            </div>

            {/* API Keys Grid */}
            <div className="grid gap-4">
              {apiKeys.map(key => (
                <Card key={key.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <CardTitle className="text-lg">{key.name}</CardTitle>
                          {key.enabled ? (
                            <Badge className="bg-green-600">Active</Badge>
                          ) : (
                            <Badge variant="outline">Disabled</Badge>
                          )}
                          {key.expires_at && new Date(key.expires_at) < new Date() && (
                            <Badge variant="destructive">Expired</Badge>
                          )}
                        </div>
                        <CardDescription className="mt-1 font-mono text-xs">
                          {key.key_prefix}...
                        </CardDescription>
                      </div>
                      <Switch
                        checked={key.enabled}
                        onCheckedChange={(enabled) =>
                          toggleKeyMutation.mutate({ id: key.id, enabled })
                        }
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Rate Limit</span>
                        <p className="font-medium">{key.rate_limit_per_hour}/hour</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Last Used</span>
                        <p className="font-medium text-xs">
                          {key.last_used 
                            ? format(new Date(key.last_used), "MMM d, h:mm a")
                            : 'Never'
                          }
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-600">Created</span>
                        <p className="font-medium text-xs">
                          {format(new Date(key.created_date), "MMM d, yyyy")}
                        </p>
                      </div>
                      {key.expires_at && (
                        <div>
                          <span className="text-gray-600">Expires</span>
                          <p className="font-medium text-xs">
                            {format(new Date(key.expires_at), "MMM d, yyyy")}
                          </p>
                        </div>
                      )}
                    </div>

                    <div>
                      <span className="text-sm text-gray-600">Permissions</span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {key.permissions.map(perm => (
                          <Badge key={perm} variant="outline" className="text-xs">
                            {perm}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedKey(key);
                          setShowAnalyticsDialog(true);
                        }}
                        className="gap-2"
                      >
                        <TrendingUp className="w-4 h-4" />
                        Analytics
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteKeyMutation.mutate(key.id)}
                        className="text-red-600 gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {apiKeys.length === 0 && (
              <Card>
                <CardContent className="p-12 text-center">
                  <Key className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-4">No API keys yet. Create your first key to enable programmatic access.</p>
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create First API Key
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Info Card */}
            <Card>
              <CardHeader>
                <CardTitle>About API Keys</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-gray-600">
                <p>✓ API keys allow external applications to access your MetricFlow data</p>
                <p>✓ Each key can have specific permissions and rate limits</p>
                <p>✓ Keys can be revoked at any time</p>
                <p>✓ Usage is tracked and can be monitored</p>
                <p>✓ Keys are hashed and cannot be recovered if lost</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Create Key Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create API Key</DialogTitle>
              <DialogDescription>
                Generate a new API key for programmatic access
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="key-name">Key Name *</Label>
                <Input
                  id="key-name"
                  placeholder="e.g., Production Server"
                  value={newKey.name}
                  onChange={(e) => setNewKey({ ...newKey, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Permissions *</Label>
                <div className="space-y-2">
                  {availablePermissions.map(perm => (
                    <div key={perm.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={perm.value}
                        checked={newKey.permissions.includes(perm.value)}
                        onCheckedChange={() => handlePermissionToggle(perm.value)}
                      />
                      <Label htmlFor={perm.value} className="text-sm font-normal cursor-pointer">
                        {perm.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rate-limit">Rate Limit (requests per hour)</Label>
                <Input
                  id="rate-limit"
                  type="number"
                  min="1"
                  value={newKey.rate_limit_per_hour}
                  onChange={(e) => setNewKey({ 
                    ...newKey, 
                    rate_limit_per_hour: parseInt(e.target.value) || 1000 
                  })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expires">Expires In (days, optional)</Label>
                <Input
                  id="expires"
                  type="number"
                  min="1"
                  placeholder="Leave empty for no expiration"
                  value={newKey.expires_in_days || ''}
                  onChange={(e) => setNewKey({ 
                    ...newKey, 
                    expires_in_days: e.target.value ? parseInt(e.target.value) : null 
                  })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateKey}>Create Key</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Show New Key Dialog */}
        <Dialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>API Key Created</DialogTitle>
              <DialogDescription>
                Save this key now - you won't be able to see it again!
              </DialogDescription>
            </DialogHeader>
            {newKeyData && (
              <div className="space-y-4">
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800 font-medium mb-2">
                    ⚠️ Make sure to copy your API key now. You won't be able to see it again!
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newKeyData.plainKey}
                      readOnly
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(newKeyData.plainKey)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => {
                setShowKeyDialog(false);
                setNewKeyData(null);
              }}>
                I've Saved the Key
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Analytics Dialog */}
        <Dialog open={showAnalyticsDialog} onOpenChange={setShowAnalyticsDialog}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>API Key Analytics: {selectedKey?.name}</DialogTitle>
              <DialogDescription>
                Usage statistics for the last 7 days
              </DialogDescription>
            </DialogHeader>
            {analytics && (
              <div className="space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-gray-900">{analytics.totalRequests}</p>
                        <p className="text-sm text-gray-600 mt-1">Total Requests</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-green-600">
                          {analytics.successRate.toFixed(1)}%
                        </p>
                        <p className="text-sm text-gray-600 mt-1">Success Rate</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-gray-900">{analytics.avgResponseTime}ms</p>
                        <p className="text-sm text-gray-600 mt-1">Avg Response</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Usage Over Time Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Requests Over Time</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={analytics.byDate}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis 
                          dataKey="date" 
                          stroke="#6b7280" 
                          style={{ fontSize: '12px' }}
                          tickFormatter={(date) => format(new Date(date), 'MMM d')}
                        />
                        <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="total" stroke="#6b7280" strokeWidth={2} name="Total" />
                        <Line type="monotone" dataKey="success" stroke="#10b981" strokeWidth={2} name="Success" />
                        <Line type="monotone" dataKey="errors" stroke="#ef4444" strokeWidth={2} name="Errors" />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Top Endpoints */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Top Endpoints</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {analytics.byEndpoint.slice(0, 5).map((endpoint, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="text-sm font-mono">{endpoint.endpoint}</span>
                          <Badge>{endpoint.count} requests</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
}