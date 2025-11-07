
import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Download, Save, AlertCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

import ReportRequestPanel from "../components/report/ReportRequestPanel";
import ReportCanvas from "../components/report/ReportCanvas";
import SavedReportsList from "../components/report/SavedReportsList";
import ApiHealthIndicator from "../components/api/ApiHealthIndicator";
import QueueProgressIndicator from "../components/api/QueueProgressIndicator";
import DataQualityIndicator from "../components/data/DataQualityIndicator";
import { apiService } from "../components/api/ApiService";
import { dataTransformationService } from "../components/data/DataTransformationService";

export default function ReportBuilder() {
  const queryClient = useQueryClient();
  const [currentReport, setCurrentReport] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [queueProgress, setQueueProgress] = useState({ current: 0, total: 0, visible: false });
  const [dataQuality, setDataQuality] = useState(null);

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

  // Helper to combine data from multiple metrics into a single dataset for charting
  const combineMetricData = (results, config) => {
    if (!results || results.length === 0) return [];

    if (config.chart_type === 'pie') {
      // For pie charts, we typically have one value per category/segment.
      // Sum values for the same segment if multiple metrics are provided, or pick one.
      // For simplicity here, we'll assume the first metric's data is primary for pie,
      // or if multiple, they are aggregated somehow (though pie usually shows one total distribution).
      // A more robust solution might require specifying how to combine.
      return results[0]; // Assuming pie chart visualizes a single metric's distribution
    }

    // For line, bar, table charts, combine by common dimensions (date, segment_by)
    const combinedMap = new Map();
    const primaryKey = config.segment_by && config.segment_by.length > 0 ? 'segment' : 'date'; // Simplified key for merging

    results.forEach(metricDataArray => {
      metricDataArray.forEach(item => {
        let key;
        if (primaryKey === 'date') {
          key = item.date;
        } else {
          // If segmented, create a composite key. E.g., "date|branch_name"
          // Assuming segment_by always results in a property like 'branch' or 'region'
          const segmentDimension = config.segment_by[0]; // Take the first segment_by for keying
          key = `${item.date || ''}|${item[segmentDimension] || ''}`;
        }

        if (!combinedMap.has(key)) {
          combinedMap.set(key, {});
          if (item.date) combinedMap.get(key).date = item.date;
          if (config.segment_by && config.segment_by.length > 0) {
            const segmentDimension = config.segment_by[0];
            if (item[segmentDimension]) combinedMap.get(key)[segmentDimension] = item[segmentDimension];
          }
        }
        
        // Merge metric specific fields
        Object.keys(item).forEach(k => {
          if (k !== 'date' && k !== config.segment_by?.[0]) { // Avoid overwriting date/segment keys
            combinedMap.get(key)[k] = item[k];
          }
        });
      });
    });

    return Array.from(combinedMap.values());
  };

  const generateMockData = (config, metricName) => {
    const branches = ['North Branch', 'South Branch', 'East Branch', 'West Branch', 'Central Branch'];
    const regions = ['North America', 'Europe', 'Asia Pacific', 'Latin America'];
    const hasSegmentation = config.segment_by && config.segment_by.length > 0;
    const currentMetric = metricName || 'value';

    // For pie charts
    if (config.chart_type === 'pie') {
      let categories = ['Category A', 'Category B', 'Category C', 'Category D', 'Category E'];
      if (hasSegmentation) {
        const segmentDimension = config.segment_by[0];
        if (segmentDimension === 'branch') categories = branches;
        if (segmentDimension === 'region') categories = regions;
      }

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
        [currentMetric]: values[idx]
      }));
    }

    // For time-series/table charts
    const days = 30; // Default for line/bar/table
    const data = [];

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - i));
      const dateStr = date.toISOString().split('T')[0];
      const baseValue = 500 + Math.floor(Math.random() * 300);

      if (hasSegmentation) {
        const segmentDimension = config.segment_by[0];
        if (segmentDimension === 'branch') {
          branches.forEach(branch => {
            data.push({
              date: dateStr,
              branch,
              [currentMetric]: baseValue + Math.floor(Math.random() * 200)
            });
          });
        } else if (segmentDimension === 'region') {
          regions.forEach(region => {
            data.push({
              date: dateStr,
              region,
              [currentMetric]: baseValue + Math.floor(Math.random() * 200)
            });
          });
        } else {
          // Generic segmentation
          ['Segment 1', 'Segment 2', 'Segment 3'].forEach(segment => {
            data.push({
              date: dateStr,
              [segmentDimension]: segment,
              [currentMetric]: baseValue + Math.floor(Math.random() * 200)
            });
          });
        }
      } else {
        // No segmentation
        data.push({
          date: dateStr,
          [currentMetric]: baseValue + Math.floor(Math.random() * 200)
        });
      }
    }
    return data;
  };

  const fetchAndTransformData = async (config) => {
    const metrics = config.metrics && config.metrics.length > 0 ? config.metrics : ['value'];
    const totalRequests = metrics.length;
    const timePeriod = config.date_range?.granularity || 'daily';

    setQueueProgress({ current: 0, total: totalRequests, visible: true });

    try {
      const results = [];
      let allQualityIssues = [];

      for (let i = 0; i < metrics.length; i++) {
        const metric = metrics[i];
        
        // Check for cached transformed data
        // For simplicity, we are using a fixed date range here. In a real app,
        // this would be dynamic based on config.date_range.
        const cacheStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const cacheEndDate = new Date();

        const cached = await dataTransformationService.getCachedData(
          metric,
          timePeriod,
          cacheStartDate,
          cacheEndDate,
          config.segment_by?.[0] // Pass segment dimension for cache key
        );

        let transformedData;
        
        if (cached && cached.data && cached.data.length > 0) {
          console.log(`[ReportBuilder] Using cached transformed data for ${metric}`);
          transformedData = cached; // Cached already contains data, quality, issues
        } else {
          // Fetch raw data using apiService (simulated here with generateMockData)
          const rawData = await apiService.queueRequest(
            async () => {
              // Simulate API call delay
              await new Promise(resolve => setTimeout(resolve, 800));
              return generateMockData(config, metric);
            },
            { name: `Fetch ${metric} data` }
          );

          // Transform the data
          transformedData = await dataTransformationService.transformData(rawData, {
            metric_name: metric,
            time_period: timePeriod,
            segment_by: config.segment_by,
            start_date: cacheStartDate, // Pass for caching
            end_date: cacheEndDate, // Pass for caching
          });
          // Cache the transformed data
          await dataTransformationService.cacheData(
            metric,
            timePeriod,
            cacheStartDate,
            cacheEndDate,
            config.segment_by?.[0],
            transformedData
          );
        }

        results.push(transformedData.data);
        allQualityIssues.push(...transformedData.quality_issues);
        setQueueProgress(prev => ({ ...prev, current: i + 1 }));
      }

      const combinedData = combineMetricData(results, config);
      const overallQuality = dataTransformationService.calculateOverallQuality(
        allQualityIssues,
        combinedData.length
      );

      return {
        data: combinedData,
        quality: {
          quality_score: overallQuality,
          issues: allQualityIssues
        }
      };

    } finally {
      setTimeout(() => {
        setQueueProgress({ current: 0, total: 0, visible: false });
      }, 1000); // Keep visible for a short period after completion
    }
  };

  const generateReport = async (request) => {
    setIsGenerating(true);
    setDataQuality(null); // Clear previous data quality warnings

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

      // Fetch and transform data
      const result = await fetchAndTransformData(response);

      setCurrentReport({
        ...request,
        configuration: response,
        status: 'generated'
      });
      setReportData(result.data);
      setDataQuality(result.quality);
      
      if (result.quality.quality_score < 80) {
        toast.warning(`Data quality: ${result.quality.quality_score}/100. Check quality issues.`);
      } else {
        toast.success('Report generated successfully');
      }
    } catch (error) {
      toast.error('Failed to generate report: ' + error.message);
      console.error(error);
    }

    setIsGenerating(false);
  };

  const handleSaveReport = () => {
    if (!currentReport) return;
    saveReportMutation.mutate(currentReport);
  };

  const handleLoadReport = async (report) => {
    setCurrentReport(report);
    const result = await fetchAndTransformData(report.configuration);
    setReportData(result.data);
    setDataQuality(result.quality);
    toast.success(`Loaded: ${report.title}`);
  };

  const handleRefreshData = async () => {
    if (!currentReport) return;
    
    toast.info('Refreshing data...');
    setIsGenerating(true);
    
    try {
      // Clear cache specifically for this report's configuration
      await dataTransformationService.clearCacheForConfig(currentReport.configuration);
      await apiService.clearAllQueues(); // Clear all pending API requests as well
      
      // Re-fetch and transform data
      const result = await fetchAndTransformData(currentReport.configuration);
      setReportData(result.data);
      setDataQuality(result.quality);
      
      toast.success('Data refreshed');
    } catch (error) {
      toast.error('Failed to refresh data: ' + error.message);
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = () => {
    if (!reportData || reportData.length === 0) {
      toast.error('No data to export.');
      return;
    }

    // For pie charts, 'name' and the metric name are keys.
    // For other charts, it could be 'date', segment_by, and metric names.
    const keys = new Set();
    reportData.forEach(row => {
        Object.keys(row).forEach(key => keys.add(key));
    });
    const headers = Array.from(keys);

    const csvContent = [
      headers.join(','),
      ...reportData.map(row => headers.map(header => {
        const value = row[header];
        // Handle potential commas or quotes in values
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `report_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url); // Clean up the URL object
    
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
            <div className="flex items-center gap-3">
              <DataQualityIndicator dataQuality={dataQuality} />
              <ApiHealthIndicator />
            </div>
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

          {dataQuality && dataQuality.quality_score < 80 && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Data quality score: {dataQuality.quality_score}/100. 
                {dataQuality.issues.length > 0 && ` Found ${dataQuality.issues.length} issue(s).`}
                {dataQuality.issues.length > 0 && (
                    <ul className="list-disc pl-5 mt-2 text-sm">
                        {dataQuality.issues.slice(0, 3).map((issue, index) => (
                            <li key={index}>{issue.description}</li>
                        ))}
                        {dataQuality.issues.length > 3 && <li>And {dataQuality.issues.length - 3} more...</li>}
                    </ul>
                )}
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
                    disabled={!reportData || reportData.length === 0}
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
