import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, RefreshCw, Settings, Bell, CheckCircle,
  XCircle, AlertTriangle, TrendingUp, Download
} from "lucide-react";
import { toast } from "sonner";
import { format, subDays } from "date-fns";
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
import QualityMetrics from "../components/data/QualityMetrics";
import DataGapsChart from "../components/data/DataGapsChart";
import { dataTransformationService } from "../components/data/DataTransformationService";

export default function DataQuality() {
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [showAlertDialog, setShowAlertDialog] = useState(false);
  const [newAlert, setNewAlert] = useState({
    name: '',
    metric_name: '',
    threshold: 80,
    notification_emails: []
  });

  const { currentUser, isAgency } = usePermissions();

  // Fetch quality issues
  const { data: qualityIssues, refetch: refetchIssues } = useQuery({
    queryKey: ['qualityIssues', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      return await dataTransformationService.getQualityIssues(50);
    },
    refetchInterval: 60000,
    initialData: []
  });

  // Fetch quality metrics
  const { data: qualityMetrics } = useQuery({
    queryKey: ['qualityMetrics', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      
      // Get all transformed metrics
      const metrics = await base44.entities.TransformedMetric.list('-created_date', 1000);
      
      // Calculate completeness
      const expectedDataPoints = 30 * 24; // 30 days * 24 hours
      const actualDataPoints = metrics.length;
      const completeness = Math.min((actualDataPoints / expectedDataPoints) * 100, 100);
      
      // Get rate limit logs for error rate
      const rateLogs = await base44.entities.RateLimitLog.filter(
        { organization_id: orgId },
        '-created_date',
        100
      );
      
      const failedRequests = rateLogs.filter(log => log.limit_remaining === 0).length;
      const errorRate = rateLogs.length > 0 ? (failedRequests / rateLogs.length) * 100 : 0;
      
      // Calculate overall score
      const qualityScores = metrics.map(m => m.data_quality_score || 100);
      const avgQuality = qualityScores.length > 0 
        ? qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length 
        : 100;
      
      // Get last sync time
      const lastMetric = metrics[0];
      const lastSyncTime = lastMetric ? new Date(lastMetric.created_date) : new Date();
      const minutesSinceLastSync = Math.floor((Date.now() - lastSyncTime.getTime()) / 60000);
      
      return {
        overallScore: Math.round((avgQuality + completeness + (100 - errorRate)) / 3),
        completeness: Math.round(completeness),
        missingDataPoints: expectedDataPoints - actualDataPoints,
        errorRate,
        failedRequests,
        totalRequests: rateLogs.length,
        lastSyncTime: lastSyncTime.toISOString(),
        minutesSinceLastSync,
        isFresh: minutesSinceLastSync < 60
      };
    },
    initialData: {
      overallScore: 100,
      completeness: 100,
      missingDataPoints: 0,
      errorRate: 0,
      failedRequests: 0,
      totalRequests: 0,
      lastSyncTime: new Date().toISOString(),
      minutesSinceLastSync: 0,
      isFresh: true
    }
  });

  // Fetch data gaps
  const { data: dataGaps } = useQuery({
    queryKey: ['dataGaps', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const metrics = await base44.entities.TransformedMetric.list('-period_start', 1000);
      
      // Group by metric name
      const metricGroups = {};
      metrics.forEach(m => {
        if (!metricGroups[m.metric_name]) {
          metricGroups[m.metric_name] = [];
        }
        metricGroups[m.metric_name].push(m);
      });

      const gaps = [];
      
      // Detect gaps for each metric
      Object.entries(metricGroups).forEach(([metricName, records]) => {
        records.sort((a, b) => new Date(a.period_start) - new Date(b.period_start));
        
        for (let i = 1; i < records.length; i++) {
          const prev = records[i - 1];
          const curr = records[i];
          
          const prevEnd = new Date(prev.period_end);
          const currStart = new Date(curr.period_start);
          
          const gapHours = (currStart - prevEnd) / (1000 * 60 * 60);
          
          // If gap is more than expected interval (assuming hourly), report it
          if (gapHours > 2) {
            gaps.push({
              metric_name: metricName,
              start_time: prev.period_end,
              end_time: curr.period_start,
              expected_records: Math.floor(gapHours)
            });
          }
        }
      });
      
      return gaps;
    },
    initialData: []
  });

  // Fetch quality history for chart
  const { data: qualityHistory } = useQuery({
    queryKey: ['qualityHistory'],
    queryFn: async () => {
      const issues = await base44.entities.DataQualityLog.list('-created_date', 100);
      
      // Group by date
      const byDate = {};
      issues.forEach(issue => {
        const date = format(new Date(issue.created_date), 'MMM d');
        if (!byDate[date]) {
          byDate[date] = { date, issues: 0, critical: 0, high: 0 };
        }
        byDate[date].issues++;
        if (issue.severity === 'critical') byDate[date].critical++;
        if (issue.severity === 'high') byDate[date].high++;
      });
      
      return Object.values(byDate).reverse().slice(-7);
    },
    initialData: []
  });

  // Create quality alert mutation
  const createAlertMutation = useMutation({
    mutationFn: async (alertData) => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      
      return await base44.entities.AlertRule.create({
        organization_id: orgId,
        name: alertData.name,
        rule_type: 'data_quality',
        threshold: alertData.threshold,
        time_window_minutes: 60,
        notification_channels: alertData.notification_emails,
        enabled: true,
        metadata: {
          metric_name: alertData.metric_name
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRules'] });
      toast.success('Quality alert created');
      setShowAlertDialog(false);
      setNewAlert({
        name: '',
        metric_name: '',
        threshold: 80,
        notification_emails: []
      });
    }
  });

  const handleRefresh = () => {
    refetchIssues();
    queryClient.invalidateQueries({ queryKey: ['qualityMetrics'] });
    queryClient.invalidateQueries({ queryKey: ['dataGaps'] });
    toast.success('Quality data refreshed');
  };

  const handleExportIssues = () => {
    const csvContent = [
      ['Timestamp', 'Metric', 'Type', 'Severity', 'Description', 'Affected Records', 'Status'].join(','),
      ...qualityIssues.map(issue => [
        new Date(issue.created_date).toISOString(),
        issue.metric_name,
        issue.issue_type,
        issue.severity,
        `"${issue.description}"`,
        issue.affected_records || 0,
        issue.resolution_status
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quality-issues-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success('Issues exported');
  };

  const handleCreateAlert = () => {
    if (!newAlert.name) {
      toast.error('Alert name is required');
      return;
    }
    createAlertMutation.mutate(newAlert);
  };

  const getIssueIcon = (severity) => {
    const icons = {
      critical: XCircle,
      high: AlertTriangle,
      medium: AlertTriangle,
      low: CheckCircle
    };
    return icons[severity] || AlertTriangle;
  };

  const getIssueColor = (severity) => {
    const colors = {
      critical: 'text-red-600',
      high: 'text-orange-600',
      medium: 'text-yellow-600',
      low: 'text-blue-600'
    };
    return colors[severity] || 'text-gray-600';
  };

  return (
    <PermissionGuard requiredLevel="editor">
      <div className="min-h-screen bg-gray-50">
        <div className="p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <Shield className="w-8 h-8" />
                  Data Quality
                </h1>
                <p className="text-gray-600 mt-1">Monitor data health and detect issues automatically</p>
              </div>
              <div className="flex gap-3">
                {isAgency && (
                  <OrganizationSelector
                    value={selectedOrgId || currentUser?.organization_id}
                    onChange={setSelectedOrgId}
                    showLabel={false}
                  />
                )}
                <Button variant="outline" onClick={handleRefresh} className="gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </Button>
                <Button variant="outline" onClick={handleExportIssues} className="gap-2">
                  <Download className="w-4 h-4" />
                  Export
                </Button>
                <Button onClick={() => setShowAlertDialog(true)} className="gap-2">
                  <Bell className="w-4 h-4" />
                  Create Alert
                </Button>
              </div>
            </div>

            {/* Quality Metrics */}
            <QualityMetrics metrics={qualityMetrics} />

            {/* Quality Trend Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Quality Issues Trend
                </CardTitle>
                <CardDescription>Last 7 days</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={qualityHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '12px' }} />
                    <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="issues" 
                      stroke="#6b7280" 
                      strokeWidth={2}
                      name="Total Issues"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="critical" 
                      stroke="#dc2626" 
                      strokeWidth={2}
                      name="Critical"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="high" 
                      stroke="#f59e0b" 
                      strokeWidth={2}
                      name="High"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Data Gaps */}
            <DataGapsChart gaps={dataGaps} />

            {/* Recent Issues */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Quality Issues</CardTitle>
                <CardDescription>
                  {qualityIssues.length} issue{qualityIssues.length !== 1 ? 's' : ''} detected
                </CardDescription>
              </CardHeader>
              <CardContent>
                {qualityIssues.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-16 h-16 mx-auto text-green-600 mb-3" />
                    <p className="text-gray-600">No quality issues detected</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {qualityIssues.map((issue, idx) => {
                      const Icon = getIssueIcon(issue.severity);
                      const iconColor = getIssueColor(issue.severity);

                      return (
                        <div
                          key={idx}
                          className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200"
                        >
                          <Icon className={`w-5 h-5 mt-0.5 ${iconColor}`} />
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-gray-900">{issue.metric_name}</p>
                              <Badge variant="outline" className="text-xs">
                                {issue.issue_type.replace('_', ' ')}
                              </Badge>
                              <Badge 
                                variant={issue.severity === 'critical' ? 'destructive' : 'outline'}
                                className="text-xs"
                              >
                                {issue.severity}
                              </Badge>
                              {issue.auto_fixed && (
                                <Badge className="text-xs bg-green-600">Auto-fixed</Badge>
                              )}
                            </div>
                            
                            <p className="text-sm text-gray-600 mt-1">{issue.description}</p>
                            
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                              <span>
                                {format(new Date(issue.created_date), 'MMM d, h:mm a')}
                              </span>
                              {issue.affected_records && (
                                <span>• {issue.affected_records} records affected</span>
                              )}
                              <span>• {issue.resolution_status}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Create Alert Dialog */}
        <Dialog open={showAlertDialog} onOpenChange={setShowAlertDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Quality Alert</DialogTitle>
              <DialogDescription>
                Get notified when data quality drops below threshold
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="alert-name">Alert Name *</Label>
                <Input
                  id="alert-name"
                  placeholder="e.g., Revenue Data Quality Alert"
                  value={newAlert.name}
                  onChange={(e) => setNewAlert({ ...newAlert, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="metric-name">Metric Name (optional)</Label>
                <Input
                  id="metric-name"
                  placeholder="e.g., revenue"
                  value={newAlert.metric_name}
                  onChange={(e) => setNewAlert({ ...newAlert, metric_name: e.target.value })}
                />
                <p className="text-xs text-gray-500">
                  Leave empty to monitor all metrics
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="threshold">Quality Score Threshold *</Label>
                <Input
                  id="threshold"
                  type="number"
                  min="0"
                  max="100"
                  value={newAlert.threshold}
                  onChange={(e) => setNewAlert({ 
                    ...newAlert, 
                    threshold: parseInt(e.target.value) || 80 
                  })}
                />
                <p className="text-xs text-gray-500">
                  Alert when quality score drops below this value
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="emails">Notification Emails (comma-separated)</Label>
                <Input
                  id="emails"
                  placeholder="admin@example.com, team@example.com"
                  onChange={(e) => setNewAlert({ 
                    ...newAlert, 
                    notification_emails: e.target.value.split(',').map(e => e.trim()).filter(Boolean)
                  })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAlertDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateAlert}>Create Alert</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
}