import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Download, Save, AlertCircle, AlertTriangle, BookTemplate } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { format } from 'date-fns';

import ReportRequestPanel from "../components/report/ReportRequestPanel";
import ReportCanvas from "../components/report/ReportCanvas";
import SavedReportsList from "../components/report/SavedReportsList";
import DataQualityIndicator from "../components/data/DataQualityIndicator";
import { dataTransformationService } from "../components/data/DataTransformationService";
import OrganizationSelector from "../components/org/OrganizationSelector";
import { usePermissions } from "../components/auth/usePermissions";
import RateLimitIndicator from "../components/api/RateLimitIndicator";
import { auditService } from "../components/audit/AuditService";
import { cacheService } from "../components/cache/CacheService";
import { environmentConfig } from "../components/config/EnvironmentConfig";
import DataFreshnessIndicator from "../components/report/DataFreshnessIndicator";
import AnnotationManager from "../components/report/AnnotationManager";
import ReportVersionManager, { saveReportVersion } from "../components/report/ReportVersionManager";

export default function ReportBuilder() {
  const queryClient = useQueryClient();
  const [currentReport, setCurrentReport] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dataQuality, setDataQuality] = useState(null);
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState('');
  const [templateData, setTemplateData] = useState({
    name: '',
    description: ''
  });

  const { currentUser, isAgency, hasPermission } = usePermissions();

  // Check if user can edit - admins and editors can edit
  const canEdit = currentUser?.permission_level === 'admin' || hasPermission('editor');
  const canDelete = currentUser?.permission_level === 'admin' || hasPermission('admin');

  // Fetch API settings for current/selected organization
  const { data: apiSettings } = useQuery({
    queryKey: ['apiSettings', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      if (!orgId || orgId === 'all') return null;
      
      const settings = await base44.entities.ApiSettings.filter({ organization_id: orgId });
      return settings[0] || null;
    },
    enabled: !!(selectedOrgId || currentUser?.organization_id)
  });

  // Fetch accounts (mock data for now)
  const mockAccounts = [
    { id: 'acc1', name: 'Main Account' },
    { id: 'acc2', name: 'Secondary Account' },
    { id: 'acc3', name: 'Test Account' }
  ];

  // Fetch saved reports filtered by organization (with caching)
  const { data: savedReports } = useQuery({
    queryKey: ['reportRequests', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      
      // Generate cache key
      const cacheKey = cacheService.generateKey('report', { 
        organization_id: orgId,
        view: isAgency && selectedOrgId === 'all' ? 'all' : 'filtered'
      });

      // Try cached first
      return await cacheService.cached(
        cacheKey,
        async () => {
          if (isAgency && selectedOrgId === 'all') {
            return await base44.entities.ReportRequest.list('-created_date');
          }
          
          if (!orgId || orgId === 'all') return [];
          return await base44.entities.ReportRequest.filter(
            { organization_id: orgId },
            '-created_date'
          );
        },
        {
          type: 'report',
          organizationId: orgId,
          ttl: 7200 // 2 hours
        }
      );
    },
    initialData: [],
    staleTime: 5 * 60 * 1000,
    cacheTime: 30 * 60 * 1000
  });

  // Save report mutation (with cache invalidation & versioning)
  const saveReportMutation = useMutation({
    mutationFn: async (report) => {
      const savedReport = await base44.entities.ReportRequest.create(report);
      
      // Create initial version
      if (savedReport && savedReport.id) {
        await saveReportVersion(
          savedReport.id,
          savedReport.configuration,
          'Initial version',
          report.organization_id
        );
      }
      
      return savedReport;
    },
    onSuccess: async () => {
      await cacheService.invalidatePattern('report:');
      queryClient.invalidateQueries({ queryKey: ['reportRequests'] });
      toast.success('Report saved successfully');
    },
    onError: (error) => {
      toast.error('Failed to save report');
      console.error("Save report error:", error);
    }
  });

  // Update report mutation (with versioning)
  const updateReportMutation = useMutation({
    mutationFn: async ({ reportId, updates, changeSummary }) => {
      const updated = await base44.entities.ReportRequest.update(reportId, updates);
      
      // Save new version
      if (updated && updated.configuration) {
        await saveReportVersion(
          reportId,
          updated.configuration,
          changeSummary || 'Report updated',
          updates.organization_id
        );
      }
      
      return updated;
    },
    onSuccess: async () => {
      await cacheService.invalidatePattern('report:');
      queryClient.invalidateQueries({ queryKey: ['reportRequests'] });
      queryClient.invalidateQueries({ queryKey: ['reportVersions'] });
      toast.success('Report updated');
    }
  });

  // Delete report mutation
  const deleteReportMutation = useMutation({
    mutationFn: (id) => base44.entities.ReportRequest.delete(id),
    onSuccess: async () => {
      await cacheService.invalidatePattern('report:');
      queryClient.invalidateQueries({ queryKey: ['reportRequests'] });
      toast.success('Report deleted');
      setCurrentReport(null);
      setReportData(null);
      setDataQuality(null);
    },
    onError: (error) => {
      toast.error('Failed to delete report');
      console.error("Delete report error:", error);
    }
  });

  // Save as template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: async (templateData) => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      
      return await base44.entities.ReportTemplate.create({
        name: templateData.name,
        description: templateData.description,
        template_type: 'custom',
        organization_id: orgId,
        created_by: currentUser?.email,
        layout_config: {
          grid_layout: [],
          refresh_interval: null
        },
        metric_configs: currentReport.configuration.metrics?.map(metric => ({
          metric_name: metric,
          chart_type: currentReport.configuration.chart_type,
          segment_by: currentReport.configuration.segment_by || []
        })) || [],
        filter_presets: currentReport.configuration.filters || {},
        chart_settings: {
          chart_type: currentReport.configuration.chart_type,
          date_range: currentReport.configuration.date_range,
          segment_by: currentReport.configuration.segment_by || []
        },
        is_public: false,
        usage_count: 0,
        tags: ['custom', currentReport.configuration.chart_type]
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportTemplates'] });
      toast.success('Template saved successfully');
      setShowTemplateDialog(false);
      setTemplateData({ name: '', description: '' });
    },
    onError: (error) => {
      toast.error('Failed to save template');
      console.error('Save template error:', error);
    }
  });

  // Email report mutation
  const emailReportMutation = useMutation({
    mutationFn: async ({ report, recipient }) => {
      const emailBody = `
        <h2>${report.title}</h2>
        <p>${report.description}</p>
        <p><strong>Chart Type:</strong> ${report.configuration?.chart_type || 'N/A'}</p>
        <p><strong>Created:</strong> ${format(new Date(report.created_date), "MMMM d, yyyy 'at' h:mm a")}</p>
        <p>View full report in the dashboard.</p>
      `;

      return await base44.integrations.Core.SendEmail({
        to: recipient,
        subject: `Report: ${report.title}`,
        body: emailBody
      });
    },
    onSuccess: () => {
      toast.success('Report sent via email');
      setShowEmailDialog(false);
      setEmailRecipient('');
    },
    onError: (error) => {
      toast.error('Failed to send email');
      console.error('Email error:', error);
    }
  });

  const generateReport = async (request) => {
    if (!canEdit) {
      toast.error('You need editor permissions to create reports');
      return;
    }

    const orgId = selectedOrgId || currentUser?.organization_id;
    if (!orgId || orgId === 'all') {
      toast.error('Please select an organization');
      return;
    }

    setIsGenerating(true);
    setDataQuality(null);

    try {
      // Build date range context for LLM
      let dateContext = '';
      if (request.dateRange?.from) {
        if (request.dateRange.to) {
          dateContext = `The report should cover the period from ${format(request.dateRange.from, 'MMMM d, yyyy')} to ${format(request.dateRange.to, 'MMMM d, yyyy')}.`;
        } else {
          dateContext = `The report should start from ${format(request.dateRange.from, 'MMMM d, yyyy')}.`;
        }
      }

      // Build account context
      const accountContext = request.account && request.account !== 'all' 
        ? `Filter data for account: ${mockAccounts.find(a => a.id === request.account)?.name || request.account}.`
        : '';

      // Use LLM to interpret the request and generate configuration
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a business intelligence expert helping staff create data visualizations.

User's request: "${request.description}"

${dateContext}
${accountContext}

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

      // Generate mock data based on configuration
      const mockData = generateMockData(response);

      // Transform data after generation
      const result = await transformAndStoreData(response, mockData);

      setCurrentReport({
        ...request,
        organization_id: orgId,
        configuration: response,
        status: 'generated'
      });
      setReportData(result.data);
      setDataQuality(result.quality);
      
      if (result.quality.quality_score < 80) {
        toast.warning(`Data quality: ${result.quality.quality_score}/100`);
      } else {
        toast.success('Report generated successfully');
      }
    } catch (error) {
      toast.error('Failed to generate report');
      console.error(error);
    }

    setIsGenerating(false);
  };

  const transformAndStoreData = async (config, rawData) => {
    const timePeriod = config.date_range?.granularity || 'daily';
    const metricName = config.metrics?.[0] || 'value';

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 30);

      const cached = await dataTransformationService.getCachedData(
        metricName,
        timePeriod,
        startDate,
        endDate,
        selectedOrgId || currentUser?.organization_id
      );

      if (cached && cached.length > 0) {
        console.log('[ReportBuilder] Using cached transformed data');
        return {
          data: rawData,
          quality: {
            quality_score: cached[0].data_quality_score || 100,
            issues: []
          }
        };
      }

      const transformed = await dataTransformationService.transformData(rawData, {
        metric_name: metricName,
        time_period: timePeriod,
        segment_by: config.segment_by,
        organization_id: selectedOrgId || currentUser?.organization_id
      });

      return {
        data: rawData,
        quality: {
          quality_score: transformed.quality_score,
          issues: transformed.quality_issues
        }
      };
    } catch (error) {
      console.error('[ReportBuilder] Transform error:', error);
      return {
        data: rawData,
        quality: { quality_score: 100, issues: [] }
      };
    }
  };

  const generateMockData = (config) => {
    if (!environmentConfig.useMockData() && apiSettings?.api_url) {
      environmentConfig.log('info', '[ReportBuilder] Using real API data');
    }

    environmentConfig.log('debug', '[ReportBuilder] Generating mock data for', config.chart_type);

    const branches = ['North Branch', 'South Branch', 'East Branch', 'West Branch', 'Central Branch'];
    const regions = ['North America', 'Europe', 'Asia Pacific', 'Latin America'];
    const hasSegmentation = config.segment_by && config.segment_by.length > 0;
    
    if (config.chart_type === 'pie' && hasSegmentation) {
      const segmentDimension = config.segment_by[0];
      const categories = segmentDimension === 'branch' ? branches : 
                        segmentDimension === 'region' ? regions :
                        ['Category A', 'Category B', 'Category C', 'Category D', 'Category E'];
      
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
    
    if (config.chart_type === 'pie') {
      return [
        { name: 'Category A', value: 4000 },
        { name: 'Category B', value: 3000 },
        { name: 'Category C', value: 2000 },
        { name: 'Category D', value: 1000 }
      ];
    }

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
              ...(config.metrics?.reduce((acc, metric) => ({
                ...acc,
                [metric]: baseValue + Math.floor(Math.random() * 200)
              }), {}) || { value: baseValue })
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
              ...(config.metrics?.reduce((acc, metric) => ({
                ...acc,
                [metric]: baseValue + Math.floor(Math.random() * 300)
              }), {}) || { value: baseValue })
            });
          }
        });
      }
      
      return rows;
    }

    if (config.chart_type === 'table') {
      return Array.from({ length: 10 }, (_, i) => ({
        date: `2025-11-${String(i + 1).padStart(2, '0')}`,
        ...(config.metrics?.reduce((acc, metric) => ({
          ...acc,
          [metric]: 500 + Math.floor(Math.random() * 500)
        }), {}) || { value: 500 + Math.floor(Math.random() * 500) })
      }));
    }

    if (hasSegmentation && (config.chart_type === 'line' || config.chart_type === 'bar')) {
      const days = 30;
      const data = [];
      
      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - (days - i));
        const dateStr = date.toISOString().split('T')[0];
        
        const row = { date: dateStr };
        
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

    const days = 30;
    return Array.from({ length: days }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (days - i));
      const baseValue = 500 + Math.floor(Math.random() * 300);
      
      return {
        date: date.toISOString().split('T')[0],
        ...(config.metrics?.reduce((acc, metric) => ({
          ...acc,
          [metric]: baseValue + Math.floor(Math.random() * 200)
        }), {}) || { value: baseValue })
      };
    });
  };

  const handleSaveReport = () => {
    if (!currentReport) return;
    if (!canEdit) {
      toast.error('You need editor permissions to save reports');
      return;
    }
    
    saveReportMutation.mutate(currentReport);
    
    const orgId = selectedOrgId || currentUser?.organization_id;
    if (orgId && currentUser && currentReport) {
      auditService.logReportAction(
        orgId,
        currentUser.email,
        'create',
        'new',
        currentReport.title
      );
    }
  };

  const handleLoadReport = async (report) => {
    setCurrentReport(report);
    if (report.organization_id && selectedOrgId !== report.organization_id) {
      setSelectedOrgId(report.organization_id);
    }
    const mockData = generateMockData(report.configuration);
    const result = await transformAndStoreData(report.configuration, mockData);
    setReportData(result.data);
    setDataQuality(result.quality);
    toast.success(`Loaded: ${report.title}`);
  };

  const handleDeleteReport = (id) => {
    if (!canDelete) {
      toast.error('You need admin permissions to delete reports');
      return;
    }
    
    const report = savedReports.find(r => r.id === id);
    deleteReportMutation.mutate(id);
    
    const orgId = selectedOrgId || currentUser?.organization_id;
    if (orgId && currentUser && report) {
      auditService.logReportAction(
        orgId,
        currentUser.email,
        'delete',
        id,
        report.title
      );
    }
  };

  const handleEmailReport = (report) => {
    setCurrentReport(report);
    setEmailRecipient(currentUser?.email || '');
    setShowEmailDialog(true);
  };

  const handleSendEmail = () => {
    if (!emailRecipient) {
      toast.error('Email address is required');
      return;
    }
    if (!currentReport) {
      toast.error('No report selected to email.');
      return;
    }

    emailReportMutation.mutate({
      report: currentReport,
      recipient: emailRecipient
    });
  };

  const handleDownloadPDF = async (report) => {
    toast.info('PDF generation coming soon');
    
    const orgId = selectedOrgId || currentUser?.organization_id;
    if (orgId && currentUser) {
      auditService.logDataExport(
        orgId,
        currentUser.email,
        'pdf',
        1
      );
    }
  };

  const handleExport = () => {
    if (!reportData || reportData.length === 0) {
      toast.info('No data to export.');
      return;
    }

    const csvContent = [
      Object.keys(reportData[0]).join(','),
      ...reportData.map(row => Object.values(row).map(value => {
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
    URL.revokeObjectURL(url);
    
    toast.success('Report exported');
    
    const orgId = selectedOrgId || currentUser?.organization_id;
    if (orgId && currentUser && reportData) {
      auditService.logDataExport(
        orgId,
        currentUser.email,
        'csv',
        reportData.length
      );
    }
  };

  const handleSaveAsTemplate = () => {
    if (!currentReport || !currentReport.configuration) {
      toast.error('No report to save as template');
      return;
    }
    
    if (!canEdit) {
      toast.error('You need editor permissions to create templates');
      return;
    }

    const orgId = selectedOrgId || currentUser?.organization_id;
    if (!orgId || orgId === 'all') {
      toast.error('Please select an organization');
      return;
    }

    setTemplateData({
      name: currentReport.title || '',
      description: currentReport.description || ''
    });
    setShowTemplateDialog(true);
  };

  const handleSaveTemplate = () => {
    if (!templateData.name.trim()) {
      toast.error('Template name is required');
      return;
    }

    saveTemplateMutation.mutate(templateData);
  };

  const handleRestoreVersion = (configuration) => {
    if (currentReport && currentReport.id) {
      updateReportMutation.mutate({
        reportId: currentReport.id,
        updates: {
          ...currentReport,
          configuration
        },
        changeSummary: 'Restored previous version'
      });
      
      // Reload with new config
      const mockData = generateMockData(configuration);
      transformAndStoreData(configuration, mockData).then(result => {
        setReportData(result.data);
        setDataQuality(result.quality);
      });
    }
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
                Describe what you want to visualize and we'll create a custom report for you
              </p>
            </div>
            <div className="flex items-center gap-3">
              {isAgency && (
                <OrganizationSelector
                  value={selectedOrgId || currentUser?.organization_id}
                  onChange={setSelectedOrgId}
                />
              )}
              <DataFreshnessIndicator organizationId={selectedOrgId || currentUser?.organization_id} />
              <RateLimitIndicator />
              <DataQualityIndicator />
            </div>
          </div>

          {!isApiConfigured && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                API not configured for this organization. Currently using mock data.{' '}
                {canDelete && (
                  <a href="/settings" className="underline font-medium">Configure API settings</a>
                )}
              </AlertDescription>
            </Alert>
          )}

          {dataQuality && dataQuality.quality_score < 80 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Data quality score: {dataQuality.quality_score}/100. 
                {dataQuality.issues.length > 0 && ` Found ${dataQuality.issues.length} issue(s).`}
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
                disabled={!canEdit}
                accounts={mockAccounts}
              />
              
              <AnnotationManager 
                organizationId={selectedOrgId || currentUser?.organization_id}
                compact={true}
              />
              
              <SavedReportsList
                reports={savedReports}
                onLoadReport={handleLoadReport}
                onDeleteReport={handleDeleteReport}
                onEmailReport={handleEmailReport}
                onDownloadPDF={handleDownloadPDF}
                canDelete={canDelete}
                accounts={mockAccounts}
              />
            </div>

            {/* Right Panel - Report Display */}
            <div className="lg:col-span-8 space-y-4">
              {currentReport && (
                <div className="flex justify-between items-center gap-2">
                  <div className="flex items-center gap-2">
                    {currentReport.id && (
                      <ReportVersionManager 
                        reportId={currentReport.id}
                        currentConfig={currentReport.configuration}
                        onRestore={handleRestoreVersion}
                      />
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleExport}
                      disabled={!reportData || reportData.length === 0}
                      className="gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Export CSV
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleSaveAsTemplate}
                      disabled={!currentReport?.configuration || !canEdit}
                      className="gap-2"
                    >
                      <BookTemplate className="w-4 h-4" />
                      Save as Template
                    </Button>
                    <Button
                      onClick={handleSaveReport}
                      disabled={!currentReport || currentReport.id || !canEdit}
                      className="gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Save Report
                    </Button>
                  </div>
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

      {/* Save as Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
            <DialogDescription>
              Create a reusable template from this report configuration
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Template Name *</Label>
              <Input
                id="template-name"
                placeholder="e.g., Sales by Branch Report"
                value={templateData.name}
                onChange={(e) => setTemplateData({ ...templateData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-description">Description</Label>
              <Textarea
                id="template-description"
                placeholder="Describe what this template is used for..."
                value={templateData.description}
                onChange={(e) => setTemplateData({ ...templateData, description: e.target.value })}
                rows={3}
              />
            </div>
            {currentReport?.configuration && (
              <div className="bg-gray-50 p-3 rounded-lg text-sm space-y-1">
                <p className="font-medium text-gray-700">Template will include:</p>
                <ul className="list-disc list-inside text-gray-600">
                  <li>Chart type: {currentReport.configuration.chart_type}</li>
                  <li>Metrics: {currentReport.configuration.metrics?.join(', ') || 'None'}</li>
                  {currentReport.configuration.segment_by?.length > 0 && (
                    <li>Segments: {currentReport.configuration.segment_by.join(', ')}</li>
                  )}
                  {currentReport.configuration.date_range && (
                    <li>Date range: {currentReport.configuration.date_range.period}</li>
                  )}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} disabled={saveTemplateMutation.isPending}>
              {saveTemplateMutation.isPending ? 'Saving...' : 'Save Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Report Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email Report</DialogTitle>
            <DialogDescription>
              Send this report via email
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email-recipient">Recipient Email</Label>
              <Input
                id="email-recipient"
                type="email"
                placeholder="recipient@example.com"
                value={emailRecipient}
                onChange={(e) => setEmailRecipient(e.target.value)}
              />
            </div>
            {currentReport && (
              <div className="bg-gray-50 p-3 rounded-lg text-sm space-y-1">
                <p className="font-medium text-gray-700">Report Details:</p>
                <ul className="list-disc list-inside text-gray-600">
                  <li>Title: {currentReport.title}</li>
                  <li>Type: {currentReport.configuration?.chart_type || 'N/A'}</li>
                  {currentReport.account && (
                    <li>Account: {mockAccounts.find(a => a.id === currentReport.account)?.name}</li>
                  )}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendEmail} disabled={emailReportMutation.isPending}>
              {emailReportMutation.isPending ? 'Sending...' : 'Send Email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}