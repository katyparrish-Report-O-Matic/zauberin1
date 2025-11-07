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
import {
  MessageSquare, Mail, Database, BarChart, Plus, 
  Trash2, Settings, CheckCircle, AlertCircle, Download
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "../components/auth/usePermissions";
import OrganizationSelector from "../components/org/OrganizationSelector";
import PermissionGuard from "../components/auth/PermissionGuard";
import { slackService } from "../components/integrations/SlackService";
import { emailReportService } from "../components/integrations/EmailReportService";
import { dataWarehouseService } from "../components/integrations/DataWarehouseService";

export default function IntegrationsManager() {
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [showSlackDialog, setShowSlackDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showWarehouseDialog, setShowWarehouseDialog] = useState(false);

  const { currentUser, isAgency } = usePermissions();

  // Fetch integrations
  const { data: slackIntegrations } = useQuery({
    queryKey: ['slackIntegrations', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      if (!orgId || orgId === 'all') return [];
      return await base44.entities.SlackIntegration.filter({ organization_id: orgId });
    },
    initialData: []
  });

  const { data: emailSchedules } = useQuery({
    queryKey: ['emailSchedules', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      if (!orgId || orgId === 'all') return [];
      return await base44.entities.EmailSchedule.filter({ organization_id: orgId });
    },
    initialData: []
  });

  const { data: warehouseConnections } = useQuery({
    queryKey: ['warehouseConnections', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      if (!orgId || orgId === 'all') return [];
      return await base44.entities.DataWarehouseConnection.filter({ organization_id: orgId });
    },
    initialData: []
  });

  const handleExportForBI = async (format) => {
    try {
      const exported = await dataWarehouseService.exportForBITool(format);
      
      const blob = new Blob([exported.content], { 
        type: format === 'tableau' ? 'application/xml' : 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `metricflow-export.${exported.format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success(`Exported for ${format}`);
    } catch (error) {
      toast.error(`Export failed: ${error.message}`);
    }
  };

  return (
    <PermissionGuard requiredLevel="admin">
      <div className="min-h-screen bg-gray-50">
        <div className="p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Integrations</h1>
                <p className="text-gray-600 mt-1">Connect MetricFlow with your favorite tools</p>
              </div>
              {isAgency && (
                <OrganizationSelector
                  value={selectedOrgId || currentUser?.organization_id}
                  onChange={setSelectedOrgId}
                  showLabel={false}
                />
              )}
            </div>

            <Tabs defaultValue="slack" className="space-y-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="slack">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Slack
                </TabsTrigger>
                <TabsTrigger value="email">
                  <Mail className="w-4 h-4 mr-2" />
                  Email Reports
                </TabsTrigger>
                <TabsTrigger value="warehouse">
                  <Database className="w-4 h-4 mr-2" />
                  Data Warehouse
                </TabsTrigger>
                <TabsTrigger value="bi">
                  <BarChart className="w-4 h-4 mr-2" />
                  BI Tools
                </TabsTrigger>
              </TabsList>

              {/* Slack Tab */}
              <TabsContent value="slack">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <MessageSquare className="w-5 h-5" />
                          Slack Integrations
                        </CardTitle>
                        <CardDescription>
                          Post metrics summaries and alerts to Slack channels
                        </CardDescription>
                      </div>
                      <Button onClick={() => setShowSlackDialog(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Slack Integration
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {slackIntegrations.length === 0 ? (
                      <div className="text-center py-12">
                        <MessageSquare className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-600">No Slack integrations configured</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {slackIntegrations.map(integration => (
                          <div key={integration.id} className="p-4 border rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <h3 className="font-semibold">{integration.name}</h3>
                                <p className="text-sm text-gray-600">#{integration.channel}</p>
                              </div>
                              <Switch
                                checked={integration.enabled}
                                onCheckedChange={(enabled) =>
                                  base44.entities.SlackIntegration.update(integration.id, { enabled })
                                    .then(() => {
                                      queryClient.invalidateQueries({ queryKey: ['slackIntegrations'] });
                                      toast.success('Updated');
                                    })
                                }
                              />
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs">
                              {integration.notification_types?.map(type => (
                                <Badge key={type} variant="outline">
                                  {type.replace('_', ' ')}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Features</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-gray-600">
                    <p>✓ Daily metrics summaries posted to Slack</p>
                    <p>✓ Real-time threshold breach alerts</p>
                    <p>✓ Data quality issue notifications</p>
                    <p>✓ Share report links directly to channels</p>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Email Tab */}
              <TabsContent value="email">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Mail className="w-5 h-5" />
                          Email Report Schedules
                        </CardTitle>
                        <CardDescription>
                          Automated email reports with PDF/CSV attachments
                        </CardDescription>
                      </div>
                      <Button onClick={() => setShowEmailDialog(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Schedule Report
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {emailSchedules.length === 0 ? (
                      <div className="text-center py-12">
                        <Mail className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-600">No email schedules configured</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {emailSchedules.map(schedule => (
                          <div key={schedule.id} className="p-4 border rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <h3 className="font-semibold">{schedule.name}</h3>
                                <p className="text-sm text-gray-600">
                                  {schedule.schedule} • {schedule.recipients.length} recipient(s)
                                </p>
                              </div>
                              <Switch
                                checked={schedule.enabled}
                                onCheckedChange={(enabled) =>
                                  base44.entities.EmailSchedule.update(schedule.id, { enabled })
                                    .then(() => {
                                      queryClient.invalidateQueries({ queryKey: ['emailSchedules'] });
                                      toast.success('Updated');
                                    })
                                }
                              />
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <span>Format: {schedule.format.toUpperCase()}</span>
                              {schedule.last_sent && (
                                <span>Last sent: {new Date(schedule.last_sent).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Features</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-gray-600">
                    <p>✓ Schedule daily, weekly, or monthly reports</p>
                    <p>✓ Multiple recipients per schedule</p>
                    <p>✓ PDF, CSV, or HTML format options</p>
                    <p>✓ Beautiful email templates</p>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Data Warehouse Tab */}
              <TabsContent value="warehouse">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Database className="w-5 h-5" />
                          Data Warehouse Connections
                        </CardTitle>
                        <CardDescription>
                          Sync data to Snowflake, BigQuery, Redshift, or Databricks
                        </CardDescription>
                      </div>
                      <Button onClick={() => setShowWarehouseDialog(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Connection
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {warehouseConnections.length === 0 ? (
                      <div className="text-center py-12">
                        <Database className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-600">No warehouse connections configured</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {warehouseConnections.map(connection => (
                          <div key={connection.id} className="p-4 border rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <h3 className="font-semibold flex items-center gap-2">
                                  {connection.name}
                                  {connection.sync_status === 'syncing' && (
                                    <Badge className="bg-blue-600">Syncing...</Badge>
                                  )}
                                  {connection.sync_status === 'error' && (
                                    <Badge variant="destructive">Error</Badge>
                                  )}
                                </h3>
                                <p className="text-sm text-gray-600 capitalize">
                                  {connection.warehouse_type} • {connection.sync_mode} sync
                                </p>
                              </div>
                              <Switch
                                checked={connection.enabled}
                                onCheckedChange={(enabled) =>
                                  base44.entities.DataWarehouseConnection.update(connection.id, { enabled })
                                    .then(() => {
                                      queryClient.invalidateQueries({ queryKey: ['warehouseConnections'] });
                                      toast.success('Updated');
                                    })
                                }
                              />
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <span>Schedule: {connection.sync_schedule}</span>
                              {connection.last_sync && (
                                <span>Last sync: {new Date(connection.last_sync).toLocaleString()}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Supported Warehouses</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="font-semibold">Snowflake</p>
                        <p className="text-xs text-gray-600">Cloud data warehouse</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="font-semibold">BigQuery</p>
                        <p className="text-xs text-gray-600">Google Cloud</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="font-semibold">Redshift</p>
                        <p className="text-xs text-gray-600">Amazon AWS</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="font-semibold">Databricks</p>
                        <p className="text-xs text-gray-600">Data lakehouse</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* BI Tools Tab */}
              <TabsContent value="bi">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart className="w-5 h-5" />
                      BI Tool Compatibility
                    </CardTitle>
                    <CardDescription>
                      Export data for Tableau, Power BI, and other tools
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <h3 className="font-semibold mb-3">Export Data</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          variant="outline"
                          onClick={() => handleExportForBI('tableau')}
                          className="justify-start"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Export for Tableau
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleExportForBI('powerbi')}
                          className="justify-start"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Export for Power BI
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleExportForBI('json')}
                          className="justify-start"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Export JSON
                        </Button>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold mb-3">REST API Access</h3>
                      <p className="text-sm text-gray-600 mb-3">
                        Use our REST API to connect any BI tool or custom application
                      </p>
                      <Button variant="outline" onClick={() => window.open(window.location.origin + '/ApiDocumentation', '_blank')}>
                        View API Documentation
                      </Button>
                    </div>

                    <div>
                      <h3 className="font-semibold mb-3">Dashboard Embeds</h3>
                      <p className="text-sm text-gray-600 mb-3">
                        Embed dashboards in your own applications with iframe code
                      </p>
                      <div className="p-3 bg-gray-50 rounded font-mono text-xs">
                        {`<iframe src="${window.location.origin}/embed/dashboard/{id}" width="100%" height="600"></iframe>`}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Supported Tools</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-gray-600">
                    <p>✓ Tableau - Native TDS export format</p>
                    <p>✓ Power BI - JSON data source</p>
                    <p>✓ Looker - API integration</p>
                    <p>✓ Google Data Studio - REST API connector</p>
                    <p>✓ Any tool that supports REST APIs</p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </PermissionGuard>
  );
}