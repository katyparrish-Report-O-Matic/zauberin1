import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Shield, Download, Search, AlertTriangle, CheckCircle, 
  XCircle, Clock, User, Settings as SettingsIcon, Plus
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
import { usePermissions } from "../components/auth/usePermissions";
import OrganizationSelector from "../components/org/OrganizationSelector";
import PermissionGuard from "../components/auth/PermissionGuard";
import { auditService } from "../components/audit/AuditService";

export default function AuditLogs() {
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [showCreateAlertDialog, setShowCreateAlertDialog] = useState(false);
  const [filters, setFilters] = useState({
    userEmail: '',
    actionType: '',
    startDate: '',
    endDate: ''
  });

  const [newAlertRule, setNewAlertRule] = useState({
    name: '',
    rule_type: 'failed_api_calls',
    threshold: 5,
    time_window_minutes: 60,
    notification_channels: []
  });

  const { currentUser, isAgency } = usePermissions();

  // Fetch audit logs
  const { data: auditLogs, refetch: refetchLogs } = useQuery({
    queryKey: ['auditLogs', selectedOrgId || currentUser?.organization_id, filters],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      if (!orgId || orgId === 'all') return [];
      
      return await auditService.getRecentLogs(orgId, 100, filters);
    },
    initialData: []
  });

  // Fetch alert rules
  const { data: alertRules } = useQuery({
    queryKey: ['alertRules', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      if (!orgId || orgId === 'all') return [];
      
      return await base44.entities.AlertRule.filter({ organization_id: orgId });
    },
    initialData: []
  });

  // Check for alerts
  const { data: activeAlerts } = useQuery({
    queryKey: ['activeAlerts', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      if (!orgId || orgId === 'all') return [];
      
      return await auditService.checkSuspiciousActivity(orgId);
    },
    refetchInterval: 60000, // Check every minute
    initialData: []
  });

  // Create alert rule mutation
  const createAlertMutation = useMutation({
    mutationFn: async (ruleData) => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      return await base44.entities.AlertRule.create({
        ...ruleData,
        organization_id: orgId,
        enabled: true
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRules'] });
      toast.success('Alert rule created');
      setShowCreateAlertDialog(false);
      setNewAlertRule({
        name: '',
        rule_type: 'failed_api_calls',
        threshold: 5,
        time_window_minutes: 60,
        notification_channels: []
      });
    }
  });

  // Toggle alert rule
  const toggleAlertMutation = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.AlertRule.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRules'] });
      toast.success('Alert rule updated');
    }
  });

  const handleExportLogs = () => {
    const csvContent = auditService.exportLogsCSV(auditLogs);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success('Audit logs exported');
  };

  const handleCreateAlert = () => {
    if (!newAlertRule.name) {
      toast.error('Alert name is required');
      return;
    }
    createAlertMutation.mutate(newAlertRule);
  };

  const getActionIcon = (actionType) => {
    const icons = {
      api_call: Clock,
      report_created: Plus,
      report_updated: SettingsIcon,
      report_deleted: XCircle,
      settings_changed: SettingsIcon,
      user_login: User,
      data_export: Download
    };
    return icons[actionType] || Clock;
  };

  const getActionColor = (actionType, success) => {
    if (!success) return 'text-red-600';
    
    const colors = {
      report_created: 'text-green-600',
      report_deleted: 'text-red-600',
      settings_changed: 'text-orange-600',
      data_export: 'text-blue-600'
    };
    return colors[actionType] || 'text-gray-600';
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
                  <Shield className="w-8 h-8" />
                  Audit Logs
                </h1>
                <p className="text-gray-600 mt-1">Track all system activities and security events</p>
              </div>
              <div className="flex gap-3">
                {isAgency && (
                  <OrganizationSelector
                    value={selectedOrgId || currentUser?.organization_id}
                    onChange={setSelectedOrgId}
                    showLabel={false}
                  />
                )}
                <Button variant="outline" onClick={handleExportLogs} className="gap-2">
                  <Download className="w-4 h-4" />
                  Export CSV
                </Button>
                <Button onClick={() => setShowCreateAlertDialog(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Create Alert Rule
                </Button>
              </div>
            </div>

            {/* Active Alerts */}
            {activeAlerts.length > 0 && (
              <Card className="border-red-200 bg-red-50">
                <CardHeader>
                  <CardTitle className="text-red-900 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Active Security Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {activeAlerts.map((alert, idx) => (
                    <div key={idx} className="p-3 bg-white rounded-lg border border-red-200">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-red-900">{alert.rule.name}</p>
                          <p className="text-sm text-red-700 mt-1">{alert.message}</p>
                        </div>
                        <Badge variant="destructive">{alert.count}</Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Filter Logs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="user-filter">User Email</Label>
                    <Input
                      id="user-filter"
                      placeholder="user@example.com"
                      value={filters.userEmail}
                      onChange={(e) => setFilters({ ...filters, userEmail: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="action-filter">Action Type</Label>
                    <Select
                      value={filters.actionType}
                      onValueChange={(value) => setFilters({ ...filters, actionType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All actions" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>All actions</SelectItem>
                        <SelectItem value="api_call">API Call</SelectItem>
                        <SelectItem value="report_created">Report Created</SelectItem>
                        <SelectItem value="report_updated">Report Updated</SelectItem>
                        <SelectItem value="report_deleted">Report Deleted</SelectItem>
                        <SelectItem value="settings_changed">Settings Changed</SelectItem>
                        <SelectItem value="data_export">Data Export</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="start-date">Start Date</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={filters.startDate}
                      onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end-date">End Date</Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={filters.endDate}
                      onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <Button onClick={() => refetchLogs()}>Apply Filters</Button>
                </div>
              </CardContent>
            </Card>

            {/* Audit Log Table */}
            <Card>
              <CardHeader>
                <CardTitle>Activity Log</CardTitle>
                <CardDescription>
                  Recent system activities (showing last 100 entries)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {auditLogs.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No audit logs found</p>
                ) : (
                  <div className="space-y-2">
                    {auditLogs.map((log) => {
                      const Icon = getActionIcon(log.action_type);
                      const iconColor = getActionColor(log.action_type, log.success);

                      return (
                        <div
                          key={log.id}
                          className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                        >
                          <Icon className={`w-5 h-5 mt-0.5 ${iconColor}`} />
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm text-gray-900">
                                {log.user_email}
                              </p>
                              <Badge variant="outline" className="text-xs">
                                {log.action_type.replace('_', ' ')}
                              </Badge>
                              {!log.success && (
                                <Badge variant="destructive" className="text-xs">Failed</Badge>
                              )}
                            </div>
                            
                            <p className="text-xs text-gray-600 mt-1">
                              {format(new Date(log.created_date), "MMM d, yyyy 'at' h:mm:ss a")}
                            </p>

                            {log.resource_type && (
                              <p className="text-xs text-gray-500 mt-1">
                                Resource: {log.resource_type}
                                {log.resource_id && ` (${log.resource_id.substring(0, 8)}...)`}
                              </p>
                            )}

                            {log.error_message && (
                              <p className="text-xs text-red-600 mt-1">
                                Error: {log.error_message}
                              </p>
                            )}

                            {log.action_details && Object.keys(log.action_details).length > 0 && (
                              <details className="mt-2">
                                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                                  View details
                                </summary>
                                <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                                  {JSON.stringify(log.action_details, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>

                          <div className="text-right text-xs text-gray-500">
                            {log.ip_address && <p>IP: {log.ip_address}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Alert Rules */}
            <Card>
              <CardHeader>
                <CardTitle>Alert Rules</CardTitle>
                <CardDescription>Configure automated alerts for suspicious activity</CardDescription>
              </CardHeader>
              <CardContent>
                {alertRules.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    No alert rules configured
                  </p>
                ) : (
                  <div className="space-y-3">
                    {alertRules.map(rule => (
                      <div
                        key={rule.id}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-gray-900">{rule.name}</h3>
                            <Badge variant="outline">{rule.rule_type.replace('_', ' ')}</Badge>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            Triggers when threshold of {rule.threshold} is exceeded in {rule.time_window_minutes} minutes
                          </p>
                          {rule.last_triggered && (
                            <p className="text-xs text-gray-500 mt-1">
                              Last triggered: {format(new Date(rule.last_triggered), "MMM d, h:mm a")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={rule.enabled ? "default" : "outline"}>
                            {rule.enabled ? 'Active' : 'Disabled'}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleAlertMutation.mutate({
                              id: rule.id,
                              enabled: !rule.enabled
                            })}
                          >
                            {rule.enabled ? 'Disable' : 'Enable'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Create Alert Rule Dialog */}
        <Dialog open={showCreateAlertDialog} onOpenChange={setShowCreateAlertDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Alert Rule</DialogTitle>
              <DialogDescription>
                Set up automated monitoring for suspicious activities
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="alert-name">Alert Name *</Label>
                <Input
                  id="alert-name"
                  placeholder="e.g., Multiple Failed API Calls"
                  value={newAlertRule.name}
                  onChange={(e) => setNewAlertRule({ ...newAlertRule, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rule-type">Rule Type *</Label>
                <Select
                  value={newAlertRule.rule_type}
                  onValueChange={(value) => setNewAlertRule({ ...newAlertRule, rule_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="failed_api_calls">Failed API Calls</SelectItem>
                    <SelectItem value="unusual_access">Unusual Access Patterns</SelectItem>
                    <SelectItem value="config_changes">Configuration Changes</SelectItem>
                    <SelectItem value="data_export">Data Exports</SelectItem>
                    <SelectItem value="permission_changes">Permission Changes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="threshold">Threshold *</Label>
                  <Input
                    id="threshold"
                    type="number"
                    min="1"
                    value={newAlertRule.threshold}
                    onChange={(e) => setNewAlertRule({ 
                      ...newAlertRule, 
                      threshold: parseInt(e.target.value) || 1 
                    })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="time-window">Time Window (minutes) *</Label>
                  <Input
                    id="time-window"
                    type="number"
                    min="1"
                    value={newAlertRule.time_window_minutes}
                    onChange={(e) => setNewAlertRule({ 
                      ...newAlertRule, 
                      time_window_minutes: parseInt(e.target.value) || 60 
                    })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notification-emails">Notification Emails (comma-separated)</Label>
                <Input
                  id="notification-emails"
                  placeholder="admin@example.com, security@example.com"
                  onChange={(e) => setNewAlertRule({ 
                    ...newAlertRule, 
                    notification_channels: e.target.value.split(',').map(e => e.trim()).filter(Boolean)
                  })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateAlertDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateAlert}>Create Alert Rule</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
}