import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Download, Save, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

import ReportRequestPanel from "../components/report/ReportRequestPanel";
import ReportCanvas from "../components/report/ReportCanvas";
import SavedReportsList from "../components/report/SavedReportsList";
import ApiHealthIndicator from "../components/api/ApiHealthIndicator";
import QueueProgressIndicator from "../components/api/QueueProgressIndicator";
import { apiService } from "../components/api/ApiService";

export default function ReportBuilder() {
  const queryClient = useQueryClient();
  const [currentReport, setCurrentReport] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [queueProgress, setQueueProgress] = useState({ current: 0, total: 0, visible: false });

  // Fetch API settings
  const { data: apiSettings } = useQuery({
    queryKey: ['apiSettings'],
    queryFn: async () => {
      const settings = await base44.entities.ApiSettings.list();
      return settings[0] || null;
    }
  });

  // Fetch saved reports
  const { data: savedReports } = useQuery({
    queryKey: ['reportRequests'],
    queryFn: () => base44.entities.ReportRequest.list('-created_date'),
    initialData: []
  });

  // Save report mutation
  const saveReportMutation = useMutation({
    mutationFn: (report) => base44.entities.ReportRequest.create(report),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportRequests'] });
      toast.success('Report saved successfully');
    }
  });

  // Delete report mutation
  const deleteReportMutation = useMutation({
    mutationFn: (id) => base44.entities.ReportRequest.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportRequests'] });
      toast.success('Report deleted');
    }
  });

  const generateReport = async (request) => {
    setIsGenerating(true);

    try {
      // Use LLM to interpret the request and generate configuration
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a business intelligence expert helping staff create data visualizations.

User's request: "${request.description}"

IMPORTANT INSTRUCTIONS:
1. Identify what metrics they want to see (revenue, users, conversions, engagement, etc.)
2. Detect if they want data SEGMENTED by dimensions like:
   - Branch/Location (e.g., "by branch", "per location", "each store")
   - Region (e.g., "by region", "regional breakdown", "per territory")
   - Time period (e.g., "monthly", "weekly", "daily trends")
   - Category/Product (e.g., "by product", "per category")
3. Choose the most appropriate visualization:
   - Line chart: for trends over time
   - Bar chart: for comparing categories, branches, regions
   - Pie chart: for showing proportions/distribution
   - Table: for detailed data with multiple dimensions
4. If they mention segmentation (branch, region, etc.), make sure to include that as a "segment_by" field
5. Default to a reasonable time range if not specified (last 30 days)

Generate a complete report configuration that captures their intent.`,
        response_json_schema: {
          type: "object",
          properties: {
            title: { type: "string", description: "A clear title for the report" },
            description: { type: "string", description: "What the report shows" },
            chart_type: { 
              type: "string", 
              enum: ["line", "bar", "pie", "table"],
              description: "Most appropriate chart type for the request"
            },
            metrics: { 
              type: "array", 
              items: { type: "string" },
              description: "List of metrics to display (e.g., revenue, users, conversions)"
            },
            segment_by: {
              type: "array",
              items: { type: "string" },
              description: "Dimensions to segment by: branch, region, category, product, channel, etc."
            },
            date_range: { 
              type: "object",
              properties: {
                period: { type: "string", description: "e.g., last_30_days, this_month, last_quarter" },
                granularity: { type: "string", enum: ["daily", "weekly", "monthly"], description: "Time grouping" }
              }
            },
            filters: { 
              type: "object",
              description: "Any specific filters mentioned"
            }
          },
          required: ["title", "chart_type", "metrics"]
        }
      });

      // Fetch data using API service with queuing
      const mockData = await fetchReportData(response);

      setCurrentReport({
        ...request,
        configuration: response,
        status: 'generated'
      });
      setReportData(mockData);
      
      toast.success('Report generated successfully');
    } catch (error) {
      toast.error('Failed to generate report: ' + error.message);
      console.error(error);
    }

    setIsGenerating(false);
  };

  const fetchReportData = async (config) => {
    // Simulate queued API requests
    const metrics = config.metrics || ['value'];
    const totalRequests = metrics.length;

    setQueueProgress({ current: 0, total: totalRequests, visible: true });

    try {
      const results = [];

      for (let i = 0; i < metrics.length; i++) {
        const metric = metrics[i];
        
        // Queue the request
        const data = await apiService.queueRequest(
          async () => {
            // Simulate API call with delay
            await new Promise(resolve => setTimeout(resolve, 800));
            return generateMockData(config, metric);
          },
          { name: `Fetch ${metric} data` }
        );

        results.push(data);
        setQueueProgress(prev => ({ ...prev, current: i + 1 }));
      }

      // Combine results
      const combinedData = combineMetricData(results, config);
      
      return combinedData;

    } finally {
      // Hide progress after a short delay
      setTimeout(() => {
        setQueueProgress({ current: 0, total: 0, visible: false });
      }, 1000);
    }
  };

  const combineMetricData = (results, config) => {
    if (results.length === 1) return results[0];
    
    // Merge multiple metric results
    const combined = results[0].map((row, idx) => {
      const mergedRow = { ...row };
      for (let i = 1; i < results.length; i++) {
        const metric = config.metrics[i];
        mergedRow[metric] = results[i][idx]?.[config.metrics[i]] || results[i][idx]?.value || 0;
      }
      return mergedRow;
    });

    return combined;
  };

  const generateMockData = (config, metricName) => {
    const branches = ['North Branch', 'South Branch', 'East Branch', 'West Branch', 'Central Branch'];
    const regions = ['North America', 'Europe', 'Asia Pacific', 'Latin America'];
    const hasSegmentation = config.segment_by && config.segment_by.length > 0;
    
    // For pie charts with segmentation
    if (config.chart_type === 'pie' && hasSegmentation) {
      const segmentDimension = config.segment_by[0];
      const categories = segmentDimension === 'branch' ? branches : 
                        segmentDimension === 'region' ? regions :
                        ['Category A', 'Category B', 'Category C', 'Category D', 'Category E'];
      
      // Generate proportional data that adds up correctly
      const total = 10000;
      const values = [];
      let remaining = total;
      
      categories.forEach((cat, idx) => {
        if (idx === categories.length - 1) {
          values.push(remaining);
        } else {
          const value = Math.floor(remaining * (Math.random() * 0.3 + 0.1));
          values.push(value);
          remaining -= value;
        }
      });
      
      return categories.map((name, idx) => ({
        name,
        value: values[idx]
      }));
    }
    
    // For pie charts without segmentation
    if (config.chart_type === 'pie') {
      return [
        { name: 'Category A', value: 4000 },
        { name: 'Category B', value: 3000 },
        { name: 'Category C', value: 2000 },
        { name: 'Category D', value: 1000 }
      ];
    }

    // For tables with segmentation
    if (config.chart_type === 'table' && hasSegmentation) {
      const rows = [];
      const numDays = 10;
      
      if (config.segment_by.includes('branch')) {
        branches.forEach(branch => {
          for (let i = 0; i < numDays; i++) {
            const baseValue = 500 + Math.floor(Math.random() * 300);
            rows.push({
              date: `2025-11-${String(i + 1).padStart(2, '0')}`,
              branch,
              [metricName]: baseValue + Math.floor(Math.random() * 200)
            });
          }
        });
      } else if (config.segment_by.includes('region')) {
        regions.forEach(region => {
          for (let i = 0; i < numDays; i++) {
            const baseValue = 1000 + Math.floor(Math.random() * 500);
            rows.push({
              date: `2025-11-${String(i + 1).padStart(2, '0')}`,
              region,
              [metricName]: baseValue + Math.floor(Math.random() * 300)
            });
          }
        });
      }
      
      return rows;
    }

    // For tables without segmentation
    if (config.chart_type === 'table') {
      return Array.from({ length: 10 }, (_, i) => ({
        date: `2025-11-${String(i + 1).padStart(2, '0')}`,
        [metricName]: 500 + Math.floor(Math.random() * 500)
      }));
    }

    // For line/bar charts with segmentation
    if (hasSegmentation && (config.chart_type === 'line' || config.chart_type === 'bar')) {
      const days = 30;
      const data = [];
      
      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - (days - i));
        const dateStr = date.toISOString().split('T')[0];
        
        const row = { date: dateStr };
        
        // Add segmented data
        if (config.segment_by.includes('branch')) {
          branches.forEach(branch => {
            const baseValue = 100 + Math.floor(Math.random() * 100);
            row[branch] = baseValue;
          });
        } else if (config.segment_by.includes('region')) {
          regions.forEach(region => {
            const baseValue = 200 + Math.floor(Math.random() * 150);
            row[region] = baseValue;
          });
        }
        
        data.push(row);
      }
      
      return data;
    }

    // Default line/bar chart without segmentation
    const days = 30;
    return Array.from({ length: days }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (days - i));
      const baseValue = 500 + Math.floor(Math.random() * 300);
      
      return {
        date: date.toISOString().split('T')[0],
        [metricName]: baseValue + Math.floor(Math.random() * 200)
      };
    });
  };

  const handleSaveReport = () => {
    if (!currentReport) return;
    saveReportMutation.mutate(currentReport);
  };

  const handleLoadReport = async (report) => {
    setCurrentReport(report);
    const data = await fetchReportData(report.configuration);
    setReportData(data);
    toast.success(`Loaded: ${report.title}`);
  };

  const handleRefreshData = async () => {
    if (!currentReport) return;
    
    toast.info('Refreshing data...');
    
    // Clear cache for this report
    await apiService.clearCache();
    
    // Re-fetch data
    const data = await fetchReportData(currentReport.configuration);
    setReportData(data);
    
    toast.success('Data refreshed');
  };

  const handleExport = () => {
    if (!reportData) return;

    const csvContent = [
      Object.keys(reportData[0]).join(','),
      ...reportData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `report_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success('Report exported');
  };

  const isApiConfigured = apiSettings?.api_url && apiSettings?.api_token;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Bespoke Report Builder</h1>
              <p className="text-gray-600 mt-1">
                Describe what you want to visualize and we'll create a custom report
              </p>
            </div>
            <ApiHealthIndicator />
          </div>

          {!isApiConfigured && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                API not configured. Currently using mock data.{' '}
                <a href="/settings" className="underline font-medium">Configure API settings</a>
              </AlertDescription>
            </Alert>
          )}

          {/* Main Layout */}
          <div className="grid lg:grid-cols-12 gap-6">
            {/* Left Panel */}
            <div className="lg:col-span-4 space-y-6">
              <ReportRequestPanel 
                onGenerateReport={generateReport}
                isGenerating={isGenerating}
              />
              
              <SavedReportsList
                reports={savedReports}
                onLoadReport={handleLoadReport}
                onDeleteReport={(id) => deleteReportMutation.mutate(id)}
                onShareReport={(report) => toast.info('Sharing feature coming soon')}
              />
            </div>

            {/* Right Panel */}
            <div className="lg:col-span-8 space-y-4">
              {currentReport && (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={handleRefreshData}
                    disabled={isGenerating}
                    className="gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleExport}
                    disabled={!reportData}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Export
                  </Button>
                  <Button
                    onClick={handleSaveReport}
                    disabled={!currentReport || currentReport.id}
                    className="gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Save
                  </Button>
                </div>
              )}

              <ReportCanvas 
                config={currentReport?.configuration} 
                data={reportData}
              />
            </div>
          </div>
        </div>
      </div>

      <QueueProgressIndicator 
        current={queueProgress.current}
        total={queueProgress.total}
        isVisible={queueProgress.visible}
      />
    </div>
  );
}