import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Download, Save, AlertCircle, BookTemplate } from "lucide-react";
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
import AdvancedTableGenerator from "../components/report/AdvancedTableGenerator";
import SavedReportsList from "../components/report/SavedReportsList";
import DataQualityIndicator from "../components/data/DataQualityIndicator";
import OrganizationSelector from "../components/org/OrganizationSelector";
import AccountFilter from "../components/report/AccountFilter";
import { usePermissions } from "../components/auth/usePermissions";
import RateLimitIndicator from "../components/api/RateLimitIndicator";
import { auditService } from "../components/audit/AuditService";
import { cacheService } from "../components/cache/CacheService";
import DataFreshnessIndicator from "../components/report/DataFreshnessIndicator";
import AnnotationManager from "../components/report/AnnotationManager";
import ReportVersionManager, { saveReportVersion } from "../components/report/ReportVersionManager";
import { tableQueryService } from "../components/report/TableQueryService";

export default function ReportBuilder() {
  const queryClient = useQueryClient();
  const [currentReport, setCurrentReport] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState('all');
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState('');
  const [templateData, setTemplateData] = useState({
    name: '',
    description: ''
  });

  const { currentUser, isAgency, hasPermission } = usePermissions();

  const canEdit = currentUser?.permission_level === 'admin' || hasPermission('editor');
  const canDelete = currentUser?.permission_level === 'admin' || hasPermission('admin');

  // Fetch API settings
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

  // Fetch saved reports
  const { data: savedReports = [] } = useQuery({
    queryKey: ['reportRequests', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      
      const cacheKey = cacheService.generateKey('report', { 
        organization_id: orgId,
        view: isAgency && selectedOrgId === 'all' ? 'all' : 'filtered'
      });

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
          ttl: 7200
        }
      );
    },
    initialData: [],
    staleTime: 5 * 60 * 1000
  });

  // Save report mutation
  const saveReportMutation = useMutation({
    mutationFn: async (report) => {
      const savedReport = await base44.entities.ReportRequest.create(report);
      
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

  // Update report mutation
  const updateReportMutation = useMutation({
    mutationFn: async ({ reportId, updates, changeSummary }) => {
      const updated = await base44.entities.ReportRequest.update(reportId, updates);
      
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
        metric_configs: currentReport.configuration.columns?.map(col => ({
          metric_name: col.key,
          display_type: 'table',
          grouping: currentReport.configuration.groupBy || []
        })) || [],
        filter_presets: {},
        chart_settings: {
          display_type: 'table',
          grouping: currentReport.configuration.groupBy || []
        },
        is_public: false,
        usage_count: 0,
        tags: ['custom', 'data_report']
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

    try {
      console.log('[ReportBuilder] 🚀 Generating report from real data...');
      console.log('[ReportBuilder] 🎯 Selected account:', selectedAccountId);

      // Build date range context
      let dateContext = '';
      if (request.dateRange?.from) {
        if (request.dateRange.to) {
          dateContext = `Date range: ${format(request.dateRange.from, 'yyyy-MM-dd')} to ${format(request.dateRange.to, 'yyyy-MM-dd')}`;
        } else {
          dateContext = `Start date: ${format(request.dateRange.from, 'yyyy-MM-dd')}`;
        }
      } else {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 30);
        dateContext = `Date range: ${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`;
      }

      // Use TableQueryService to generate table config from natural language
      console.log('[ReportBuilder] 📝 Translating natural language to query...');
      const tableConfig = await tableQueryService.generateTableFromRequest(
        request.description,
        orgId,
        dateContext
      );

      console.log('[ReportBuilder] 🔍 Querying real data...');
      
      // Execute query to get real data - pass selected account filter
      const realData = await tableQueryService.executeTableQuery(
        tableConfig, 
        orgId,
        selectedAccountId
      );

      console.log(`[ReportBuilder] ✅ Retrieved ${realData.length} real records`);

      if (realData.length === 0) {
        toast.warning('No data found for the specified criteria');
      }

      setCurrentReport({
        ...request,
        organization_id: orgId,
        configuration: tableConfig,
        status: 'generated'
      });
      setReportData({
        config: tableConfig,
        data: realData
      });
      
      toast.success(`Report generated with ${realData.length} records`);
    } catch (error) {
      toast.error('Failed to generate report');
      console.error('[ReportBuilder] ❌ Error:', error);
    }

    setIsGenerating(false);
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
    
    try {
      console.log('[ReportBuilder] 🔄 Loading saved report...');
      const realData = await tableQueryService.executeTableQuery(
        report.configuration,
        report.organization_id,
        selectedAccountId
      );
      
      setReportData({
        config: report.configuration,
        data: realData
      });
      
      toast.success(`Loaded: ${report.title} (${realData.length} records)`);
    } catch (error) {
      toast.error('Failed to load report data');
      console.error('[ReportBuilder] Load error:', error);
    }
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
    if (!reportData?.data || reportData.data.length === 0) {
      toast.info('No data to export.');
      return;
    }

    const csvContent = [
      Object.keys(reportData.data[0]).join(','),
      ...reportData.data.map(row => Object.values(row).map(value => {
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
        reportData.data.length
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

  const handleRestoreVersion = async (configuration) => {
    if (currentReport && currentReport.id) {
      updateReportMutation.mutate({
        reportId: currentReport.id,
        updates: {
          ...currentReport,
          configuration
        },
        changeSummary: 'Restored previous version'
      });
      
      try {
        const realData = await tableQueryService.executeTableQuery(
          configuration,
          currentReport.organization_id,
          selectedAccountId
        );
        setReportData({
          config: configuration,
          data: realData
        });
      } catch (error) {
        console.error('[ReportBuilder] Restore error:', error);
      }
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
              <h1 className="text-3xl font-bold text-gray-900">Report Builder</h1>
              <p className="text-gray-600 mt-1">
                Describe what you want to see from your data
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
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
                API not fully configured. Some features may be limited.{' '}
                {canDelete && (
                  <a href="/settings" className="underline font-medium">Configure API settings</a>
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
                disabled={!canEdit}
                organizationId={selectedOrgId || currentUser?.organization_id}
                selectedAccountId={selectedAccountId}
                onAccountChange={setSelectedAccountId}
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
              />
            </div>

            {/* Right Panel */}
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
                      disabled={!reportData?.data || reportData.data.length === 0}
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

              {reportData ? (
                <AdvancedTableGenerator 
                  config={reportData.config}
                  data={reportData.data}
                />
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
                  <div className="text-gray-400 mb-2">
                    <svg className="w-16 h-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 1 0 01-2 2z" />
                    </svg>
                    <p className="text-lg font-medium text-gray-600">No report generated yet</p>
                    <p className="text-sm text-gray-500 mt-1">Describe what you want to see from your data</p>
                  </div>
                </div>
              )}
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
                placeholder="e.g., Data by Region Report"
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