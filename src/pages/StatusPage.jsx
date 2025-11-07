import React from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, XCircle, Clock, Wrench } from "lucide-react";
import { format } from "date-fns";
import { statusChecker } from "../components/monitoring/StatusChecker";
import { base44 } from "@/api/base44Client";

export default function StatusPage() {
  // Fetch system status
  const { data: systemStatus } = useQuery({
    queryKey: ['publicSystemStatus'],
    queryFn: () => statusChecker.getOverallStatus(),
    refetchInterval: 60000,
    initialData: null
  });

  // Fetch recent incidents
  const { data: incidents } = useQuery({
    queryKey: ['publicIncidents'],
    queryFn: async () => {
      const allIncidents = await base44.entities.IncidentReport.filter({
        is_public: true
      }, '-started_at', 10);
      return allIncidents;
    },
    refetchInterval: 120000,
    initialData: []
  });

  // Fetch upcoming maintenance
  const { data: maintenance } = useQuery({
    queryKey: ['upcomingMaintenance'],
    queryFn: async () => {
      const allMaintenance = await base44.entities.MaintenanceWindow.filter({
        status: 'scheduled',
        is_public: true
      }, 'scheduled_start');
      
      // Filter for future maintenance
      const now = new Date();
      return allMaintenance.filter(m => new Date(m.scheduled_start) > now);
    },
    refetchInterval: 300000,
    initialData: []
  });

  const getStatusIcon = (status) => {
    const icons = {
      operational: CheckCircle,
      degraded: AlertTriangle,
      partial_outage: AlertTriangle,
      major_outage: XCircle,
      maintenance: Wrench
    };
    return icons[status] || Clock;
  };

  const getStatusColor = (status) => {
    const colors = {
      operational: 'text-green-600',
      degraded: 'text-yellow-600',
      partial_outage: 'text-orange-600',
      major_outage: 'text-red-600',
      maintenance: 'text-blue-600'
    };
    return colors[status] || 'text-gray-600';
  };

  const getIncidentSeverityColor = (severity) => {
    const colors = {
      minor: 'bg-blue-600',
      major: 'bg-orange-600',
      critical: 'bg-red-600'
    };
    return colors[severity] || 'bg-gray-600';
  };

  const getIncidentStatusColor = (status) => {
    const colors = {
      investigating: 'bg-yellow-600',
      identified: 'bg-orange-600',
      monitoring: 'bg-blue-600',
      resolved: 'bg-green-600'
    };
    return colors[status] || 'bg-gray-600';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold text-gray-900">MetricFlow Status</h1>
            <p className="text-gray-600">Current system status and uptime information</p>
          </div>

          {/* Overall Status */}
          {systemStatus && (
            <Card>
              <CardContent className="p-8">
                <div className="flex items-center justify-center gap-4">
                  {React.createElement(getStatusIcon(systemStatus.status), {
                    className: `w-12 h-12 ${getStatusColor(systemStatus.status)}`
                  })}
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 capitalize">
                      {systemStatus.status.replace('_', ' ')}
                    </h2>
                    <p className="text-gray-600">{systemStatus.message}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Components Status */}
          <Card>
            <CardHeader>
              <CardTitle>System Components</CardTitle>
              <CardDescription>Current status of all services</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {systemStatus?.components?.map(component => {
                  const Icon = getStatusIcon(component.status);
                  const color = getStatusColor(component.status);

                  return (
                    <div key={component.component_name} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Icon className={`w-5 h-5 ${color}`} />
                        <div>
                          <p className="font-medium text-gray-900 capitalize">
                            {component.component_name.replace('_', ' ')}
                          </p>
                          <p className="text-sm text-gray-600">{component.status_message}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {component.uptime_percentage && (
                          <p className="text-sm font-medium text-gray-900">
                            {component.uptime_percentage.toFixed(2)}% uptime
                          </p>
                        )}
                        <p className="text-xs text-gray-500">
                          {component.response_time_avg_ms}ms avg
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Maintenance */}
          {maintenance.length > 0 && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-blue-900 flex items-center gap-2">
                  <Wrench className="w-5 h-5" />
                  Scheduled Maintenance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {maintenance.map(maint => (
                  <div key={maint.id} className="p-4 bg-white rounded-lg border border-blue-200">
                    <h3 className="font-semibold text-blue-900">{maint.title}</h3>
                    <p className="text-sm text-blue-800 mt-1">{maint.description}</p>
                    <div className="flex items-center gap-4 mt-3 text-sm text-blue-700">
                      <span>
                        <strong>Start:</strong> {format(new Date(maint.scheduled_start), 'MMM d, yyyy h:mm a')}
                      </span>
                      <span>
                        <strong>End:</strong> {format(new Date(maint.scheduled_end), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                    {maint.affected_components && maint.affected_components.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-blue-600">
                          Affected: {maint.affected_components.join(', ')}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Recent Incidents */}
          {incidents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Incidents</CardTitle>
                <CardDescription>Past incidents and their resolutions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {incidents.map(incident => (
                  <div key={incident.id} className="border-l-4 border-gray-300 pl-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">{incident.title}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={getIncidentSeverityColor(incident.severity)}>
                            {incident.severity}
                          </Badge>
                          <Badge className={getIncidentStatusColor(incident.status)}>
                            {incident.status}
                          </Badge>
                        </div>
                      </div>
                      <span className="text-sm text-gray-500">
                        {format(new Date(incident.started_at), 'MMM d, yyyy')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{incident.description}</p>
                    
                    {incident.updates && incident.updates.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-700">Updates:</p>
                        {incident.updates.map((update, idx) => (
                          <div key={idx} className="text-sm">
                            <p className="text-xs text-gray-500">
                              {format(new Date(update.timestamp), 'MMM d, h:mm a')}
                            </p>
                            <p className="text-gray-700">{update.message}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {incident.status === 'resolved' && incident.resolved_at && (
                      <p className="text-xs text-green-600 mt-2">
                        Resolved on {format(new Date(incident.resolved_at), 'MMM d, yyyy h:mm a')}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Footer */}
          <div className="text-center text-sm text-gray-500">
            <p>Last updated: {new Date().toLocaleString()}</p>
            <p className="mt-1">Status page refreshes automatically every minute</p>
          </div>
        </div>
      </div>
    </div>
  );
}