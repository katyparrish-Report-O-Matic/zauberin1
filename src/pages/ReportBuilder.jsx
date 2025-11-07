import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Download, Save, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

import ReportRequestPanel from "../components/report/ReportRequestPanel";
import ReportCanvas from "../components/report/ReportCanvas";
import SavedReportsList from "../components/report/SavedReportsList";

export default function ReportBuilder() {
  const queryClient = useQueryClient();
  const [currentReport, setCurrentReport] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

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
        prompt: `You are a data visualization expert. A user wants to create a report with this request:

"${request.description}"

Based on this request, generate a report configuration with:
1. Appropriate chart type (line, bar, pie, or table)
2. Metrics to display
3. Time range if mentioned
4. Any filters mentioned

Respond with a JSON configuration for the report. Be practical - if the user doesn't specify a chart type, choose the most appropriate one based on the request.`,
        response_json_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            chart_type: { type: "string", enum: ["line", "bar", "pie", "table"] },
            metrics: { type: "array", items: { type: "string" } },
            date_range: { 
              type: "object",
              properties: {
                start: { type: "string" },
                end: { type: "string" }
              }
            },
            filters: { type: "object" }
          }
        }
      });

      // Generate mock data based on configuration
      const mockData = generateMockData(response);

      setCurrentReport({
        ...request,
        configuration: response,
        status: 'generated'
      });
      setReportData(mockData);
      
      toast.success('Report generated successfully');
    } catch (error) {
      toast.error('Failed to generate report');
      console.error(error);
    }

    setIsGenerating(false);
  };

  const generateMockData = (config) => {
    // Generate appropriate mock data based on chart type
    const days = 30;
    
    if (config.chart_type === 'pie') {
      return [
        { name: 'Category A', value: 400 },
        { name: 'Category B', value: 300 },
        { name: 'Category C', value: 200 },
        { name: 'Category D', value: 100 }
      ];
    }

    if (config.chart_type === 'table') {
      return Array.from({ length: 10 }, (_, i) => ({
        date: `2025-11-${String(i + 1).padStart(2, '0')}`,
        ...(config.metrics?.reduce((acc, metric) => ({
          ...acc,
          [metric]: Math.floor(Math.random() * 1000)
        }), {}) || { value: Math.floor(Math.random() * 1000) })
      }));
    }

    // Line or bar chart
    return Array.from({ length: days }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (days - i));
      
      return {
        date: date.toISOString().split('T')[0],
        ...(config.metrics?.reduce((acc, metric) => ({
          ...acc,
          [metric]: Math.floor(Math.random() * 1000) + 500
        }), {}) || { value: Math.floor(Math.random() * 1000) + 500 })
      };
    });
  };

  const handleSaveReport = () => {
    if (!currentReport) return;
    saveReportMutation.mutate(currentReport);
  };

  const handleLoadReport = (report) => {
    setCurrentReport(report);
    setReportData(generateMockData(report.configuration));
    toast.success(`Loaded: ${report.title}`);
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
    
    toast.success('Report exported');
  };

  const isApiConfigured = apiSettings?.api_url && apiSettings?.api_token;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Bespoke Report Builder</h1>
            <p className="text-gray-600 mt-1">
              Describe what you want to visualize and we'll create a custom report for you
            </p>
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
            {/* Left Panel - Request Builder */}
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

            {/* Right Panel - Report Display */}
            <div className="lg:col-span-8 space-y-4">
              {currentReport && (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={handleExport}
                    disabled={!reportData}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Export CSV
                  </Button>
                  <Button
                    onClick={handleSaveReport}
                    disabled={!currentReport || currentReport.id}
                    className="gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Save Report
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
    </div>
  );
}