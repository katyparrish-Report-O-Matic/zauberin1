import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Activity, AlertTriangle, CheckCircle, Clock, 
  TrendingUp, Users, Zap, XCircle
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from "date-fns";
import PermissionGuard from "../components/auth/PermissionGuard";
import { monitoringService } from "../components/monitoring/MonitoringService";
import { alertManager } from "../components/monitoring/AlertManager";
import { statusChecker } from "../components/monitoring/StatusChecker";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function MonitoringDashboard() {
  const queryClient = useQueryClient();
  const [timeRange, setTimeRange] = useState(3600000); // 1 hour default

  // Fetch metrics summary
  const { data: summary } = useQuery({
    queryKey: ['metricsSummary', timeRange],
    queryFn: () => monitoringService.getMetricsSummary(timeRange),
    refetchInterval: 30000,
    initialData: null
  });

  // Fetch active alerts
  const { data: activeAlerts } = useQuery({
    queryKey: ['activeAlerts'],
    queryFn: () => alertManager.getActiveAlerts(),
    refetchInterval: 30000,
    initialData: []
  });

  // Fetch system status
  const { data: systemStatus } = useQuery({
    queryKey: ['systemStatus'],
    queryFn: () => statusChecker.getOverallStatus(),
    refetchInterval: 60000,
    initialData: null
  });

  // Fetch API response time series
  const { data: apiTimeSeries } = useQuery({
    queryKey: ['apiTimeSeries'],
    queryFn: () => monitoringService.getMetricsTimeSeries('api_response_time', 24),
    refetchInterval: 60000,
    initialData: []
  });

  // Acknowledge alert mutation
  const acknowledgeAlertMutation = useMutation({
    mutationFn: ({ alertId, user }) => alertManager.acknowledgeAlert(alertId, user),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeAlerts'] });
      toast.success('Alert acknowledged');
    }
  });

  // Resolve alert mutation
  const resolveAlertMutation = useMutation({
    mutationFn: (alertId) => alertManager.resolveAlert(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeAlerts'] });
      toast.success('Alert resolved');
    }
  });

  const getStatusColor = (status) => {
    const colors = {
      operational: 'bg-green-600',
      degraded: 'bg-yellow-600',
      partial_outage: 'bg-orange-600',
      major_outage: 'bg-red-600',
      maintenance: 'bg-blue-600'
    };
    return colors[status] || 'bg-gray-600';
  };

  const getSeverityColor = (severity) => {
    const colors = {
      info: 'bg-blue-600',
      warning: 'bg-yellow-600',
      critical: 'bg-red-600'
    };
    return colors[severity] || 'bg-gray-600';
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
                  <Activity className="w-8 h-8" />
                  System Monitoring
                </h1>
                <p className="text-gray-600 mt-1">Real-time application health and performance metrics</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={timeRange === 3600000 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTimeRange(3600000)}
                >
                  1H
                </Button>
                <Button
                  variant={timeRange === 14400000 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTimeRange(14400000)}
                >
                  4H
                </Button>
                <Button
                  variant={timeRange === 86400000 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTimeRange(86400000)}
                >
                  24H
                </Button>
              </div>
            </div>

            {/* System Status Overview */}
            {systemStatus && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>System Status</CardTitle>
                    <Badge className={getStatusColor(systemStatus.status)}>
                      {systemStatus.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </div>
                  <CardDescription>{systemStatus.message}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {systemStatus.components?.map(component => (
                      <div key={component.component_name} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium capitalize">
                            {component.component_name.replace('_', ' ')}
                          </span>
                          <Badge
                            variant="outline"
                            className={component.status === 'operational' ? 'border-green-600 text-green-600' : 'border-yellow-600 text-yellow-600'}
                          >
                            {component.status === 'operational' ? (
                              <CheckCircle className="w-3 h-3" />
                            ) : (
                              <AlertTriangle className="w-3 h-3" />
                            )}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-600">
                          {component.response_time_avg_ms}ms
                        </p>
                        {component.uptime_percentage && (
                          <p className="text-xs text-gray-500">
                            {component.uptime_percentage.toFixed(2)}% uptime
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Active Alerts */}
            {activeAlerts.length > 0 && (
              <Card className="border-red-200 bg-red-50">
                <CardHeader>
                  <CardTitle className="text-red-900 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Active Alerts ({activeAlerts.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {activeAlerts.map(alert => (
                    <div key={alert.id} className="p-4 bg-white rounded-lg border border-red-200">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className={getSeverityColor(alert.severity)}>
                              {alert.severity}
                            </Badge>
                            <Badge variant="outline">{alert.alert_type.replace('_', ' ')}</Badge>
                          </div>
                          <p className="font-medium text-gray-900">{alert.message}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Triggered: {format(new Date(alert.triggered_at), 'MMM d, h:mm a')}
                          </p>
                          {alert.details && (
                            <details className="mt-2">
                              <summary className="text-xs text-gray-600 cursor-pointer">View details</summary>
                              <pre className="text-xs bg-gray-50 p-2 rounded mt-1 overflow-auto">
                                {JSON.stringify(alert.details, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {alert.status === 'active' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => acknowledgeAlertMutation.mutate({
                                  alertId: alert.id,
                                  user: 'admin'
                                })}
                              >
                                Acknowledge
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => resolveAlertMutation.mutate(alert.id)}
                              >
                                Resolve
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Metrics Grid */}
            {summary && (
              <div className="grid md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      API Response Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-gray-900">
                      {summary.api_response_time.avg}ms
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Max: {summary.api_response_time.max}ms
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                      <XCircle className="w-4 h-4" />
                      Error Rate
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className={`text-3xl font-bold ${summary.error_rate.percentage > 5 ? 'text-red-600' : 'text-green-600'}`}>
                      {summary.error_rate.percentage.toFixed(2)}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {summary.error_rate.total} errors
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      Page Load Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-gray-900">
                      {summary.page_load_time.avg}ms
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {summary.page_load_time.count} loads tracked
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      User Activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-gray-900">
                      {summary.user_activity.unique_users}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {summary.user_activity.total} total actions
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Performance Chart */}
            <Card>
              <CardHeader>
                <CardTitle>API Response Time (24h)</CardTitle>
                <CardDescription>Average response time per hour</CardDescription>
              </CardHeader>
              <CardContent>
                {apiTimeSeries.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={apiTimeSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="timestamp" 
                        stroke="#6b7280" 
                        style={{ fontSize: '12px' }}
                        tickFormatter={(time) => format(new Date(time), 'HH:mm')}
                      />
                      <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                      <Tooltip 
                        labelFormatter={(time) => format(new Date(time), 'MMM d, HH:mm')}
                        formatter={(value) => [`${Math.round(value)}ms`, 'Response Time']}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#6b7280" 
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-gray-500 py-12">
                    No performance data available yet
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Cache Performance */}
            {summary && (
              <Card>
                <CardHeader>
                  <CardTitle>Cache Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-600">Hit Rate</span>
                        <span className="font-medium">
                          {summary.cache_hit_rate.percentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-600 h-2 rounded-full"
                          style={{ width: `${summary.cache_hit_rate.percentage}%` }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600">Cache Hits</p>
                        <p className="text-2xl font-bold text-green-600">
                          {summary.cache_hit_rate.hits}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Cache Misses</p>
                        <p className="text-2xl font-bold text-orange-600">
                          {summary.cache_hit_rate.misses}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </PermissionGuard>
  );
}