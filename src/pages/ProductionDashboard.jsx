import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Calendar as CalendarIcon, Download, Save, TrendingUp, TrendingDown, Activity, BarChart3, Loader2, AlertCircle } from "lucide-react";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { productionApiService } from "../components/api/ProductionApiService";
import { usePermissions } from "../components/auth/usePermissions";
import OrganizationSelector from "../components/org/OrganizationSelector";
import PermissionGuard from "../components/auth/PermissionGuard";
import { Input } from "@/components/ui/input";

export default function ProductionDashboard() {
  const queryClient = useQueryClient();
  const { currentUser, isAgency } = usePermissions();
  const [selectedOrgId, setSelectedOrgId] = useState(null);

  // Date range state
  const [dateRange, setDateRange] = useState({
    from: subDays(new Date(), 7),
    to: new Date()
  });

  // Filters
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [category, setCategory] = useState('all');
  const [channel, setChannel] = useState('all');
  const [region, setRegion] = useState('all');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 25;

  // Save report state
  const [reportName, setReportName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const orgId = selectedOrgId || currentUser?.organization_id;

  // Fetch available metrics
  const { data: availableMetrics, isLoading: metricsLoading, error: metricsError } = useQuery({
    queryKey: ['availableMetrics', orgId],
    queryFn: () => productionApiService.fetchMetricsList(orgId),
    enabled: !!orgId,
    retry: 2,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });

  // Fetch metric data
  const { data: metricData, isLoading: dataLoading, error: dataError, refetch } = useQuery({
    queryKey: ['metricData', orgId, selectedMetric, dateRange],
    queryFn: async () => {
      if (!selectedMetric) return null;

      const startDate = format(dateRange.from, 'yyyy-MM-dd');
      const endDate = format(dateRange.to, 'yyyy-MM-dd');

      const data = await productionApiService.fetchMetricData(
        orgId,
        selectedMetric,
        startDate,
        endDate
      );

      return data;
    },
    enabled: !!orgId && !!selectedMetric,
    retry: 1
  });

  // Auto-select first metric
  React.useEffect(() => {
    if (availableMetrics && availableMetrics.length > 0 && !selectedMetric) {
      const firstMetric = availableMetrics[0];
      setSelectedMetric(typeof firstMetric === 'string' ? firstMetric : firstMetric.name);
    }
  }, [availableMetrics, selectedMetric]);

  // Calculate KPIs
  const kpis = React.useMemo(() => {
    if (!metricData || !Array.isArray(metricData)) {
      return { total: 0, average: 0, min: 0, max: 0 };
    }

    const values = metricData.map(d => d.value || 0);
    const total = values.reduce((sum, v) => sum + v, 0);
    const average = values.length > 0 ? total / values.length : 0;
    const min = values.length > 0 ? Math.min(...values) : 0;
    const max = values.length > 0 ? Math.max(...values) : 0;

    return { total, average, min, max };
  }, [metricData]);

  // Filter data
  const filteredData = React.useMemo(() => {
    if (!metricData || !Array.isArray(metricData)) return [];

    return metricData.filter(item => {
      if (category !== 'all' && item.category !== category) return false;
      if (channel !== 'all' && item.channel !== channel) return false;
      if (region !== 'all' && item.region !== region) return false;
      return true;
    });
  }, [metricData, category, channel, region]);

  // Paginate data
  const paginatedData = React.useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return filteredData.slice(startIndex, endIndex);
  }, [filteredData, currentPage]);

  const totalPages = Math.ceil(filteredData.length / rowsPerPage);

  // Save report mutation
  const saveReportMutation = useMutation({
    mutationFn: async () => {
      return await base44.entities.ReportRequest.create({
        organization_id: orgId,
        title: reportName || `${selectedMetric} Report`,
        description: `Report for ${selectedMetric} from ${format(dateRange.from, 'MMM d')} to ${format(dateRange.to, 'MMM d')}`,
        configuration: {
          metric: selectedMetric,
          dateRange: {
            from: dateRange.from.toISOString(),
            to: dateRange.to.toISOString()
          },
          filters: { category, channel, region }
        },
        status: 'saved'
      });
    },
    onSuccess: () => {
      toast.success('Report saved successfully');
      setShowSaveDialog(false);
      setReportName('');
      queryClient.invalidateQueries({ queryKey: ['reportRequests'] });
    }
  });

  // Export to CSV
  const handleExport = () => {
    if (!filteredData || filteredData.length === 0) {
      toast.info('No data to export');
      return;
    }

    const headers = Object.keys(filteredData[0]).join(',');
    const rows = filteredData.map(row => 
      Object.values(row).map(val => 
        typeof val === 'string' && val.includes(',') ? `"${val}"` : val
      ).join(',')
    );

    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedMetric}_${format(dateRange.from, 'yyyy-MM-dd')}_to_${format(dateRange.to, 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('Data exported to CSV');
  };

  const isLoading = metricsLoading || dataLoading;
  const hasError = metricsError || dataError;

  return (
    <PermissionGuard requiredLevel="viewer">
      <div className="min-h-screen bg-gray-50">
        <div className="p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Metrics Dashboard</h1>
                <p className="text-gray-600 mt-1">Production metrics reporting and analysis</p>
              </div>
              <div className="flex gap-3">
                {isAgency && (
                  <OrganizationSelector
                    value={orgId}
                    onChange={setSelectedOrgId}
                    showLabel={false}
                  />
                )}
                <Button variant="outline" onClick={handleExport} className="gap-2" disabled={!filteredData || filteredData.length === 0}>
                  <Download className="w-4 h-4" />
                  Export CSV
                </Button>
                <Button onClick={() => setShowSaveDialog(true)} className="gap-2 bg-teal-600 hover:bg-teal-700" disabled={!selectedMetric}>
                  <Save className="w-4 h-4" />
                  Save Report
                </Button>
              </div>
            </div>

            {/* Error Alert */}
            {hasError && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="p-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-900">Unable to load data</p>
                      <p className="text-sm text-red-700 mt-1">
                        {metricsError?.message || dataError?.message || 'Please check your API configuration'}
                      </p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => refetch()}
                        className="mt-2"
                      >
                        Retry
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Filters Row */}
            <Card>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  {/* Date Range Picker */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date Range</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateRange.from ? (
                            dateRange.to ? (
                              <>
                                {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d")}
                              </>
                            ) : (
                              format(dateRange.from, "MMM d, yyyy")
                            )
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          initialFocus
                          mode="range"
                          defaultMonth={dateRange.from}
                          selected={dateRange}
                          onSelect={setDateRange}
                          numberOfMonths={2}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Metric Selector */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Metric</label>
                    <Select value={selectedMetric} onValueChange={setSelectedMetric} disabled={metricsLoading}>
                      <SelectTrigger>
                        <SelectValue placeholder={metricsLoading ? "Loading..." : "Select metric"} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableMetrics?.map((metric, idx) => {
                          const metricValue = typeof metric === 'string' ? metric : metric.name;
                          return (
                            <SelectItem key={idx} value={metricValue}>
                              {metricValue}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Category Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Category</label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        <SelectItem value="sales">Sales</SelectItem>
                        <SelectItem value="marketing">Marketing</SelectItem>
                        <SelectItem value="operations">Operations</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Channel Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Channel</label>
                    <Select value={channel} onValueChange={setChannel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Channels</SelectItem>
                        <SelectItem value="online">Online</SelectItem>
                        <SelectItem value="retail">Retail</SelectItem>
                        <SelectItem value="wholesale">Wholesale</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Region Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Region</label>
                    <Select value={region} onValueChange={setRegion}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Regions</SelectItem>
                        <SelectItem value="north">North</SelectItem>
                        <SelectItem value="south">South</SelectItem>
                        <SelectItem value="east">East</SelectItem>
                        <SelectItem value="west">West</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total</p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">
                        {isLoading ? <Loader2 className="w-8 h-8 animate-spin" /> : kpis.total.toLocaleString()}
                      </p>
                    </div>
                    <div className="h-12 w-12 bg-teal-100 rounded-full flex items-center justify-center">
                      <Activity className="w-6 h-6 text-teal-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Average</p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">
                        {isLoading ? <Loader2 className="w-8 h-8 animate-spin" /> : Math.round(kpis.average).toLocaleString()}
                      </p>
                    </div>
                    <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <BarChart3 className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Minimum</p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">
                        {isLoading ? <Loader2 className="w-8 h-8 animate-spin" /> : kpis.min.toLocaleString()}
                      </p>
                    </div>
                    <div className="h-12 w-12 bg-orange-100 rounded-full flex items-center justify-center">
                      <TrendingDown className="w-6 h-6 text-orange-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Maximum</p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">
                        {isLoading ? <Loader2 className="w-8 h-8 animate-spin" /> : kpis.max.toLocaleString()}
                      </p>
                    </div>
                    <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Chart */}
            <Card>
              <CardHeader>
                <CardTitle>{selectedMetric || 'Metric'} Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center h-96">
                    <Loader2 className="w-12 h-12 animate-spin text-gray-400" />
                  </div>
                ) : filteredData && filteredData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={filteredData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="date" 
                        stroke="#6b7280"
                        style={{ fontSize: '12px' }}
                        tickFormatter={(date) => format(new Date(date), 'MMM d')}
                      />
                      <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'white',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#14b8a6" 
                        strokeWidth={2}
                        dot={{ fill: '#14b8a6', r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-96 text-gray-500">
                    <BarChart3 className="w-16 h-16 mb-4 text-gray-400" />
                    <p>No data available for selected filters</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Data Table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Data Table</CardTitle>
                  <p className="text-sm text-gray-600">
                    {filteredData.length} records • Page {currentPage} of {totalPages || 1}
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-12 h-12 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Value</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Channel</TableHead>
                            <TableHead>Region</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedData.map((row, idx) => (
                            <TableRow key={idx}>
                              <TableCell>{row.date ? format(new Date(row.date), 'MMM d, yyyy') : '-'}</TableCell>
                              <TableCell className="font-medium">{row.value?.toLocaleString() || '0'}</TableCell>
                              <TableCell>{row.category || '-'}</TableCell>
                              <TableCell>{row.channel || '-'}</TableCell>
                              <TableCell>{row.region || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4">
                        <Button
                          variant="outline"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          Previous
                        </Button>
                        <span className="text-sm text-gray-600">
                          Page {currentPage} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Save Report Dialog */}
        {showSaveDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>Save Report</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Report Name</label>
                  <Input
                    placeholder={`${selectedMetric} Report`}
                    value={reportName}
                    onChange={(e) => setReportName(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => saveReportMutation.mutate()}
                    disabled={saveReportMutation.isPending}
                    className="bg-teal-600 hover:bg-teal-700"
                  >
                    {saveReportMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}