import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Zap, AlertTriangle, CheckCircle, Database, 
  Archive, RefreshCw, TrendingDown, HardDrive
} from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "../components/auth/usePermissions";
import OrganizationSelector from "../components/org/OrganizationSelector";
import PermissionGuard from "../components/auth/PermissionGuard";
import { dbOptimizationService } from "../components/performance/DatabaseOptimizationService";
import { archivalService } from "../components/performance/ArchivalService";

export default function PerformanceMonitor() {
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState(null);

  const { currentUser, isAgency } = usePermissions();

  // Fetch query stats
  const { data: queryStats } = useQuery({
    queryKey: ['queryStats'],
    queryFn: () => dbOptimizationService.getQueryStats(),
    refetchInterval: 10000, // Refresh every 10s
    initialData: null
  });

  // Fetch recommendations
  const { data: recommendations, refetch: refetchRecommendations } = useQuery({
    queryKey: ['dbRecommendations', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      return await dbOptimizationService.generateRecommendations(orgId);
    },
    initialData: []
  });

  // Fetch archival stats
  const { data: archivalStats } = useQuery({
    queryKey: ['archivalStats', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      return await archivalService.getArchivalStats(orgId === 'all' ? null : orgId);
    },
    initialData: null
  });

  // Run archival mutation
  const runArchivalMutation = useMutation({
    mutationFn: async (entityName) => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      if (entityName === 'all') {
        return await archivalService.runFullArchival(orgId === 'all' ? null : orgId);
      }
      return await archivalService.archiveEntity(entityName, orgId === 'all' ? null : orgId);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['archivalStats'] });
      queryClient.invalidateQueries({ queryKey: ['dbRecommendations'] });
      
      const totalArchived = typeof result.archived === 'number' 
        ? result.archived 
        : Object.values(result).reduce((sum, r) => sum + (r.archived || 0), 0);
      
      toast.success(`Archived ${totalArchived} records`);
    },
    onError: (error) => {
      toast.error(`Archival failed: ${error.message}`);
    }
  });

  const indexRecommendations = dbOptimizationService.getIndexRecommendations();

  const getPriorityColor = (priority) => {
    const colors = {
      critical: 'text-red-600 bg-red-50 border-red-200',
      high: 'text-orange-600 bg-orange-50 border-orange-200',
      medium: 'text-yellow-600 bg-yellow-50 border-yellow-200',
      low: 'text-blue-600 bg-blue-50 border-blue-200'
    };
    return colors[priority] || colors.medium;
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
                  <Zap className="w-8 h-8" />
                  Performance Monitor
                </h1>
                <p className="text-gray-600 mt-1">Database optimization and query performance</p>
              </div>
              <div className="flex gap-3">
                {isAgency && (
                  <OrganizationSelector
                    value={selectedOrgId || currentUser?.organization_id}
                    onChange={setSelectedOrgId}
                    showLabel={false}
                  />
                )}
                <Button 
                  variant="outline" 
                  onClick={() => refetchRecommendations()}
                  className="gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </Button>
              </div>
            </div>

            {/* Query Performance Stats */}
            {queryStats && (
              <div className="grid md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-gray-600">Total Queries</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-gray-900">{queryStats.total_queries}</p>
                    <p className="text-xs text-gray-500 mt-1">Monitored queries</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-gray-600">Avg Duration</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-gray-900">{queryStats.avg_duration_ms}ms</p>
                    <p className="text-xs text-gray-500 mt-1">Average query time</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-gray-600">Slow Queries</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className={`text-3xl font-bold ${queryStats.slow_queries > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {queryStats.slow_queries}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">&gt;1s queries</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-gray-600">Peak Duration</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-orange-600">{queryStats.max_duration_ms}ms</p>
                    <p className="text-xs text-gray-500 mt-1">Slowest query</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Archival Statistics */}
            {archivalStats && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Archive className="w-5 h-5" />
                    Data Archival
                  </CardTitle>
                  <CardDescription>Archived data statistics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Total Archives</p>
                      <p className="text-2xl font-bold text-gray-900">{archivalStats.total_archives}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Archived Records</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {archivalStats.total_archived_records.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Archive Size</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {archivalService.formatBytes(archivalStats.total_size_bytes)}
                      </p>
                    </div>
                  </div>

                  {Object.keys(archivalStats.by_entity).length > 0 && (
                    <div className="space-y-2">
                      <p className="font-semibold text-sm">By Entity:</p>
                      {Object.entries(archivalStats.by_entity).map(([entity, stats]) => (
                        <div key={entity} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium text-sm">{entity}</p>
                            <p className="text-xs text-gray-600">
                              {stats.records.toLocaleString()} records • {archivalService.formatBytes(stats.size)}
                            </p>
                          </div>
                          <Badge>{stats.count} archives</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Optimization Recommendations */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      Optimization Recommendations
                    </CardTitle>
                    <CardDescription>
                      {recommendations.length} recommendation{recommendations.length !== 1 ? 's' : ''} found
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => runArchivalMutation.mutate('all')}
                    disabled={runArchivalMutation.isPending}
                    className="gap-2"
                  >
                    <Archive className="w-4 h-4" />
                    Run Full Archival
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {recommendations.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-16 h-16 mx-auto text-green-600 mb-3" />
                    <p className="text-gray-600">All systems optimized! No recommendations at this time.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recommendations.map((rec, idx) => (
                      <div
                        key={idx}
                        className={`p-4 border rounded-lg ${getPriorityColor(rec.priority)}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="capitalize">
                              {rec.priority}
                            </Badge>
                            <Badge variant="outline">{rec.category.replace('_', ' ')}</Badge>
                            {rec.entity && <Badge variant="outline">{rec.entity}</Badge>}
                          </div>
                          {rec.entity && rec.category === 'data_volume' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => runArchivalMutation.mutate(rec.entity)}
                              disabled={runArchivalMutation.isPending}
                            >
                              Archive Now
                            </Button>
                          )}
                        </div>
                        <p className="font-semibold text-sm mb-1">{rec.issue}</p>
                        <p className="text-sm mb-2">
                          <strong>Action:</strong> {rec.action}
                        </p>
                        <p className="text-xs">
                          <strong>Impact:</strong> {rec.estimated_impact}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Index Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  Recommended Indexes
                </CardTitle>
                <CardDescription>
                  Suggested database indexes for optimal query performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {indexRecommendations.map((index, idx) => (
                    <div key={idx} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{index.entity}</span>
                          <Badge variant="outline" className="capitalize">{index.type}</Badge>
                        </div>
                      </div>
                      <p className="text-sm font-mono text-gray-700 mb-2">
                        Fields: {index.fields.join(', ')}
                      </p>
                      <p className="text-xs text-gray-600">{index.reason}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-800">
                    <strong>Note:</strong> These are recommendations for the Base44 platform team. 
                    Indexes may already be implemented or will be added based on usage patterns.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Query Performance by Entity */}
            {queryStats && Object.keys(queryStats.by_entity).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Query Performance by Entity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(queryStats.by_entity).map(([entity, stats]) => {
                      const avgDuration = stats.totalDuration / stats.count;
                      const performance = avgDuration < 200 ? 'good' : avgDuration < 1000 ? 'moderate' : 'slow';
                      
                      return (
                        <div key={entity} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold">{entity}</span>
                            <div className="flex items-center gap-3">
                              {performance === 'good' && (
                                <Badge className="bg-green-600">Fast</Badge>
                              )}
                              {performance === 'moderate' && (
                                <Badge className="bg-yellow-600">Moderate</Badge>
                              )}
                              {performance === 'slow' && (
                                <Badge variant="destructive">Slow</Badge>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-gray-600">Queries</p>
                              <p className="font-medium">{stats.count}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Avg Time</p>
                              <p className="font-medium">{Math.round(avgDuration)}ms</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Slow Queries</p>
                              <p className="font-medium text-red-600">{stats.slowCount}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Best Practices */}
            <Card>
              <CardHeader>
                <CardTitle>Performance Best Practices</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-gray-600">
                <div className="flex items-start gap-2">
                  <TrendingDown className="w-4 h-4 text-green-600 mt-0.5" />
                  <p><strong>Always use pagination:</strong> Limit queries to 50-100 records max</p>
                </div>
                <div className="flex items-start gap-2">
                  <TrendingDown className="w-4 h-4 text-green-600 mt-0.5" />
                  <p><strong>Archive old data:</strong> Move records older than 90 days to archives</p>
                </div>
                <div className="flex items-start gap-2">
                  <TrendingDown className="w-4 h-4 text-green-600 mt-0.5" />
                  <p><strong>Use caching:</strong> Cache frequently accessed data</p>
                </div>
                <div className="flex items-start gap-2">
                  <TrendingDown className="w-4 h-4 text-green-600 mt-0.5" />
                  <p><strong>Filter efficiently:</strong> Use specific filters instead of loading all records</p>
                </div>
                <div className="flex items-start gap-2">
                  <TrendingDown className="w-4 h-4 text-green-600 mt-0.5" />
                  <p><strong>Monitor slow queries:</strong> Optimize queries that take &gt;1 second</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PermissionGuard>
  );
}