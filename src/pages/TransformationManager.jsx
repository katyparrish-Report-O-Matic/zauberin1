import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Calendar, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "../components/auth/usePermissions";
import PermissionGuard from "../components/auth/PermissionGuard";
import OrganizationSelector from "../components/org/OrganizationSelector";

export default function TransformationManager() {
  const queryClient = useQueryClient();
  const { currentUser, isAgency } = usePermissions();
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [targetDate, setTargetDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const orgId = selectedOrgId || currentUser?.organization_id;

  // Fetch data sources
  const { data: dataSources = [] } = useQuery({
    queryKey: ['dataSources', orgId],
    queryFn: async () => {
      if (!orgId || orgId === 'all') return [];
      return await base44.entities.DataSource.filter({
        organization_id: orgId,
        platform_type: 'call_tracking',
        enabled: true
      });
    },
    enabled: !!orgId && orgId !== 'all'
  });

  // Fetch recent job executions
  const { data: recentExecutions = [] } = useQuery({
    queryKey: ['jobExecutions'],
    queryFn: async () => {
      const executions = await base44.entities.JobExecution.list('-started_at', 20);
      return executions.filter(e => e.job_name?.includes('transformation') || e.job_name?.includes('transform'));
    },
    refetchInterval: 10000
  });

  // Transform single date mutation - USING BACKEND FUNCTION
  const transformSingleMutation = useMutation({
    mutationFn: async ({ dataSourceId, date }) => {
      const response = await base44.functions.invoke('runTransformation', {
        organizationId: orgId,
        dataSourceId,
        targetDate: date,
        mode: 'single'
      });
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Transformation failed');
      }
      
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['jobExecutions'] });
      queryClient.invalidateQueries({ queryKey: ['transformedMetrics'] });
      
      if (result.metricsCreated === 0) {
        toast.info(result.message || 'No data to transform for this date');
      } else {
        toast.success(`✅ ${result.metricsCreated} metrics created for ${result.accountsProcessed} accounts`);
      }
    },
    onError: (error) => {
      toast.error(`❌ Transformation failed: ${error.message}`);
      console.error('[Transform Error]', error);
    }
  });

  // Transform date range mutation - USING BACKEND FUNCTION
  const transformRangeMutation = useMutation({
    mutationFn: async ({ dataSourceId, startDate, endDate }) => {
      const response = await base44.functions.invoke('runTransformation', {
        organizationId: orgId,
        dataSourceId,
        startDate,
        endDate,
        mode: 'range'
      });
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Range transformation failed');
      }
      
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['jobExecutions'] });
      queryClient.invalidateQueries({ queryKey: ['transformedMetrics'] });
      toast.success(`✅ ${result.totalMetricsCreated} metrics created across ${result.daysSuccessful}/${result.daysProcessed} days`);
    },
    onError: (error) => {
      toast.error(`❌ Range transformation failed: ${error.message}`);
      console.error('[Transform Error]', error);
    }
  });

  // Transform all organization mutation - USING BACKEND FUNCTION
  const transformOrgMutation = useMutation({
    mutationFn: async ({ date }) => {
      const response = await base44.functions.invoke('runTransformation', {
        organizationId: orgId,
        targetDate: date,
        mode: 'organization'
      });
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Organization transformation failed');
      }
      
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['jobExecutions'] });
      queryClient.invalidateQueries({ queryKey: ['transformedMetrics'] });
      
      if (result.totalMetricsCreated === 0) {
        toast.info(result.message || 'No data to transform');
      } else {
        toast.success(`✅ ${result.totalMetricsCreated} metrics created from ${result.dataSourcesSuccessful} sources`);
      }
    },
    onError: (error) => {
      toast.error(`❌ Organization transformation failed: ${error.message}`);
      console.error('[Transform Error]', error);
    }
  });

  const handleTransformYesterday = (dataSourceId) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    console.log('[Transform] Triggering yesterday transformation:', dateStr);
    transformSingleMutation.mutate({ dataSourceId, date: dateStr });
  };

  const handleTransformDate = (dataSourceId) => {
    if (!targetDate) {
      toast.error('Please select a date');
      return;
    }
    console.log('[Transform] Triggering date transformation:', targetDate);
    transformSingleMutation.mutate({ dataSourceId, date: targetDate });
  };

  const handleTransformRange = (dataSourceId) => {
    if (!startDate || !endDate) {
      toast.error('Please select both start and end dates');
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      toast.error('Start date must be before end date');
      return;
    }
    console.log('[Transform] Triggering range transformation:', startDate, 'to', endDate);
    transformRangeMutation.mutate({ dataSourceId, startDate, endDate });
  };

  const handleTransformAllYesterday = () => {
    if (!orgId || orgId === 'all') {
      toast.error('Please select an organization');
      return;
    }
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    console.log('[Transform] Triggering organization transformation:', dateStr);
    transformOrgMutation.mutate({ date: dateStr });
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const isTransforming = transformSingleMutation.isPending || transformRangeMutation.isPending || transformOrgMutation.isPending;

  return (
    <PermissionGuard requiredLevel="editor">
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Data Transformation</h1>
              <p className="text-gray-600 mt-1">
                Transform CallRecords into aggregated TransformedMetrics
              </p>
            </div>
            {isAgency && (
              <OrganizationSelector
                value={orgId}
                onChange={setSelectedOrgId}
              />
            )}
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Two-Step Architecture:</strong> First sync raw data (CallRecords), then transform into metrics (TransformedMetrics). 
              This separates data collection from aggregation for better reliability and debugging.
            </AlertDescription>
          </Alert>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Transform data for all data sources at once</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <Button
                  onClick={handleTransformAllYesterday}
                  disabled={isTransforming || !orgId || orgId === 'all'}
                  className="gap-2"
                  size="lg"
                >
                  {transformOrgMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Transforming...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Transform Yesterday (All Sources)
                    </>
                  )}
                </Button>
              </div>
              {(!orgId || orgId === 'all') && (
                <p className="text-sm text-red-600">⚠️ Please select an organization first</p>
              )}
              {isTransforming && (
                <p className="text-sm text-blue-600">🔄 Transformation in progress... This may take 30-60 seconds.</p>
              )}
            </CardContent>
          </Card>

          {/* Data Sources */}
          {dataSources.length > 0 ? (
            <div className="grid gap-6">
              {dataSources.map((dataSource) => (
                <Card key={dataSource.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle>{dataSource.name}</CardTitle>
                        <CardDescription>
                          Platform: {dataSource.platform_type} | 
                          Accounts: {dataSource.account_ids?.length || 0}
                        </CardDescription>
                      </div>
                      <Badge variant={dataSource.enabled ? "default" : "secondary"}>
                        {dataSource.enabled ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Transform Yesterday */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Transform Yesterday's Data</Label>
                      <Button
                        onClick={() => handleTransformYesterday(dataSource.id)}
                        disabled={isTransforming}
                        variant="outline"
                        className="gap-2"
                      >
                        {transformSingleMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Transforming...
                          </>
                        ) : (
                          <>
                            <Calendar className="w-4 h-4" />
                            Transform Yesterday
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Transform Specific Date */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Transform Specific Date</Label>
                      <div className="flex gap-2">
                        <Input
                          type="date"
                          value={targetDate}
                          onChange={(e) => setTargetDate(e.target.value)}
                          className="max-w-xs"
                        />
                        <Button
                          onClick={() => handleTransformDate(dataSource.id)}
                          disabled={isTransforming || !targetDate}
                          variant="outline"
                        >
                          Transform
                        </Button>
                      </div>
                    </div>

                    {/* Transform Date Range */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Transform Date Range</Label>
                      <div className="flex gap-2 flex-wrap">
                        <Input
                          type="date"
                          placeholder="Start date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="max-w-xs"
                        />
                        <Input
                          type="date"
                          placeholder="End date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="max-w-xs"
                        />
                        <Button
                          onClick={() => handleTransformRange(dataSource.id)}
                          disabled={isTransforming || !startDate || !endDate}
                          variant="outline"
                        >
                          Transform Range
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-gray-500">
                  {!orgId || orgId === 'all' 
                    ? 'Please select an organization' 
                    : 'No call tracking data sources found for this organization'}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Recent Executions */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Transformation Jobs</CardTitle>
              <CardDescription>Latest transformation executions and their results</CardDescription>
            </CardHeader>
            <CardContent>
              {recentExecutions.length > 0 ? (
                <div className="space-y-2">
                  {recentExecutions.map((execution) => (
                    <div
                      key={execution.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {getStatusIcon(execution.status)}
                        <div>
                          <p className="font-medium text-sm">{execution.job_name || 'Transformation Job'}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(execution.started_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {execution.records_processed > 0 && (
                          <Badge variant="outline">
                            {execution.records_processed} metrics
                          </Badge>
                        )}
                        {execution.duration_ms && (
                          <span className="text-xs text-gray-500">
                            {(execution.duration_ms / 1000).toFixed(1)}s
                          </span>
                        )}
                        <Badge
                          variant={execution.status === 'completed' ? 'default' : 'destructive'}
                        >
                          {execution.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500 py-8">
                  No recent transformation jobs found
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PermissionGuard>
  );
}