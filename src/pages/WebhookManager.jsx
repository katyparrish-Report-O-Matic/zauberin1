
import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Webhook, Plus, Copy, CheckCircle, XCircle, Activity, Send } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "../components/auth/usePermissions";
import OrganizationSelector from "../components/org/OrganizationSelector";
import PermissionGuard from "../components/auth/PermissionGuard";
import { webhookProcessor } from "../components/webhooks/WebhookProcessor";

export default function WebhookManager() {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState(null);
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [testPayload, setTestPayload] = useState('{\n  "value": 1250,\n  "metric_name": "revenue",\n  "timestamp": "2025-01-07T12:00:00Z"\n}');
  
  const [newWebhook, setNewWebhook] = useState({
    name: '',
    metric_mappings: {}
  });

  const { currentUser, isAgency } = usePermissions();

  // Fetch webhooks
  const { data: webhooks } = useQuery({
    queryKey: ['webhooks', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      if (!orgId || orgId === 'all') {
        if (isAgency && selectedOrgId === 'all') {
          return await base44.entities.WebhookEndpoint.list('-created_date');
        }
        return [];
      }
      return await base44.entities.WebhookEndpoint.filter(
        { organization_id: orgId },
        '-created_date'
      );
    },
    initialData: []
  });

  // Fetch activity for selected webhook
  const { data: activities } = useQuery({
    queryKey: ['webhookActivity', selectedWebhook?.id],
    queryFn: async () => {
      if (!selectedWebhook) return [];
      return await webhookProcessor.getRecentActivity(selectedWebhook.id, 20);
    },
    enabled: !!selectedWebhook,
    initialData: []
  });

  // Create webhook mutation
  const createWebhookMutation = useMutation({
    mutationFn: async (webhookData) => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      
      // Generate webhook URL and secret
      const webhookId = Math.random().toString(36).substring(7);
      const webhookUrl = `https://api.zauberin.app/webhooks/${webhookId}`;
      const secretKey = Math.random().toString(36).substring(2) + Date.now().toString(36);

      return await base44.entities.WebhookEndpoint.create({
        ...webhookData,
        organization_id: orgId,
        webhook_url: webhookUrl,
        secret_key: secretKey,
        enabled: true,
        total_requests: 0
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook created');
      setShowCreateDialog(false);
      setNewWebhook({ name: '', metric_mappings: {} });
    }
  });

  // Toggle webhook mutation
  const toggleWebhookMutation = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.WebhookEndpoint.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook updated');
    }
  });

  // Test webhook mutation
  const testWebhookMutation = useMutation({
    mutationFn: async ({ webhookId, payload }) => {
      const parsedPayload = JSON.parse(payload);
      const result = await webhookProcessor.processWebhook(webhookId, parsedPayload);
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['webhookActivity'] });
      toast.success(`Test successful! Created ${result.recordsCreated} record(s) in ${result.processingTime}ms`);
      setShowTestDialog(false);
    },
    onError: (error) => {
      toast.error(`Test failed: ${error.message}`);
    }
  });

  const handleCreateWebhook = () => {
    if (!newWebhook.name) {
      toast.error('Webhook name is required');
      return;
    }
    createWebhookMutation.mutate(newWebhook);
  };

  const handleTestWebhook = () => {
    if (!selectedWebhook) return;
    
    try {
      JSON.parse(testPayload); // Validate JSON
      testWebhookMutation.mutate({
        webhookId: selectedWebhook.id,
        payload: testPayload
      });
    } catch (error) {
      toast.error('Invalid JSON payload');
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
                  <Webhook className="w-8 h-8" />
                  Webhook Manager
                </h1>
                <p className="text-gray-600 mt-1">Receive real-time metric data via webhooks</p>
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
                  Create Webhook
                </Button>
              </div>
            </div>

            {/* Webhooks Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {webhooks.map(webhook => (
                <Card key={webhook.id} className="cursor-pointer hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          {webhook.name}
                          {webhook.enabled ? (
                            <Badge className="bg-green-600">Active</Badge>
                          ) : (
                            <Badge variant="outline">Disabled</Badge>
                          )}
                        </CardTitle>
                      </div>
                      <Switch
                        checked={webhook.enabled}
                        onCheckedChange={(enabled) =>
                          toggleWebhookMutation.mutate({ id: webhook.id, enabled })
                        }
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-600">Webhook URL</Label>
                      <div className="flex gap-2">
                        <Input
                          value={webhook.webhook_url}
                          readOnly
                          className="text-xs font-mono"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => copyToClipboard(webhook.webhook_url)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-gray-600">Secret Key</Label>
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          value={webhook.secret_key}
                          readOnly
                          className="text-xs font-mono"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => copyToClipboard(webhook.secret_key)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="pt-3 border-t space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Total Requests</span>
                        <span className="font-medium">{webhook.total_requests || 0}</span>
                      </div>
                      {webhook.last_triggered && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Last Triggered</span>
                          <span className="font-medium text-xs">
                            {format(new Date(webhook.last_triggered), "MMM d, h:mm a")}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setSelectedWebhook(webhook);
                        }}
                      >
                        <Activity className="w-3 h-3 mr-1" />
                        View Activity
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setSelectedWebhook(webhook);
                          setShowTestDialog(true);
                        }}
                      >
                        <Send className="w-3 h-3 mr-1" />
                        Test
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {webhooks.length === 0 && (
              <Card>
                <CardContent className="p-12 text-center">
                  <Webhook className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">No webhooks configured. Create your first webhook to start receiving data!</p>
                </CardContent>
              </Card>
            )}

            {/* Activity Log */}
            {selectedWebhook && (
              <Card>
                <CardHeader>
                  <CardTitle>Activity Log: {selectedWebhook.name}</CardTitle>
                  <CardDescription>Recent webhook requests and their processing status</CardDescription>
                </CardHeader>
                <CardContent>
                  {activities.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No activity yet</p>
                  ) : (
                    <div className="space-y-2">
                      {activities.map(activity => (
                        <div
                          key={activity.id}
                          className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                        >
                          <div className="flex items-start gap-3 flex-1">
                            {activity.status === 'success' && (
                              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                            )}
                            {activity.status === 'failed' && (
                              <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
                            )}
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-gray-900">
                                  {format(new Date(activity.created_date), "MMM d, h:mm:ss a")}
                                </p>
                                {activity.signature_valid !== undefined && (
                                  <Badge variant="outline" className="text-xs">
                                    {activity.signature_valid ? 'Signature Valid' : 'Invalid Signature'}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                                {activity.records_created > 0 && (
                                  <span>{activity.records_created} records created</span>
                                )}
                                {activity.processing_time_ms && (
                                  <span>• {activity.processing_time_ms}ms</span>
                                )}
                              </div>
                              {activity.error_message && (
                                <p className="text-xs text-red-600 mt-1">{activity.error_message}</p>
                              )}
                              <details className="mt-2">
                                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                                  View payload
                                </summary>
                                <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                                  {JSON.stringify(activity.payload, null, 2)}
                                </pre>
                              </details>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Create Webhook Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Webhook</DialogTitle>
              <DialogDescription>
                Set up a new webhook endpoint to receive real-time metric data
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="webhook-name">Webhook Name</Label>
                <Input
                  id="webhook-name"
                  placeholder="e.g., Sales Data Webhook"
                  value={newWebhook.name}
                  onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })}
                />
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-sm text-blue-900 mb-2">How it works</h4>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>A unique webhook URL and secret key will be generated</li>
                  <li>Configure your data source to send POST requests to this URL</li>
                  <li>Include the secret key in the X-Webhook-Signature header</li>
                  <li>Data will be automatically processed and stored</li>
                </ol>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateWebhook}>Create Webhook</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Test Webhook Dialog */}
        <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Test Webhook: {selectedWebhook?.name}</DialogTitle>
              <DialogDescription>
                Send a test payload to verify your webhook is working correctly
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="test-payload">JSON Payload</Label>
                <Textarea
                  id="test-payload"
                  value={testPayload}
                  onChange={(e) => setTestPayload(e.target.value)}
                  rows={12}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500">
                  Tip: Include "value", "metric_name", and "timestamp" fields
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTestDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleTestWebhook}
                disabled={testWebhookMutation.isPending}
              >
                {testWebhookMutation.isPending ? 'Sending...' : 'Send Test'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
}
