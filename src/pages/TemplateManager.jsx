import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Layout, Plus, Download, Upload, Eye, Copy, Trash2, 
  TrendingUp, BarChart3, GitCompare, Activity, Star 
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissions } from "../components/auth/usePermissions";
import OrganizationSelector from "../components/org/OrganizationSelector";
import PermissionGuard from "../components/auth/PermissionGuard";

const TEMPLATE_TYPES = {
  executive_summary: {
    name: 'Executive Summary',
    icon: TrendingUp,
    description: '4 KPIs + 1 main chart for high-level overview',
    defaultConfig: {
      layout_config: {
        grid_layout: [
          { type: 'kpi', position: { x: 0, y: 0, w: 3, h: 2 } },
          { type: 'kpi', position: { x: 3, y: 0, w: 3, h: 2 } },
          { type: 'kpi', position: { x: 6, y: 0, w: 3, h: 2 } },
          { type: 'kpi', position: { x: 9, y: 0, w: 3, h: 2 } },
          { type: 'chart', position: { x: 0, y: 2, w: 12, h: 4 } }
        ],
        refresh_interval: 300000
      }
    }
  },
  detailed_analysis: {
    name: 'Detailed Analysis',
    icon: BarChart3,
    description: 'Multiple charts for deep dive into single metric',
    defaultConfig: {
      layout_config: {
        grid_layout: [
          { type: 'chart', position: { x: 0, y: 0, w: 6, h: 3 } },
          { type: 'chart', position: { x: 6, y: 0, w: 6, h: 3 } },
          { type: 'chart', position: { x: 0, y: 3, w: 12, h: 3 } }
        ],
        refresh_interval: 300000
      }
    }
  },
  comparison_view: {
    name: 'Comparison View',
    icon: GitCompare,
    description: 'Multiple metrics side-by-side for comparison',
    defaultConfig: {
      layout_config: {
        grid_layout: [
          { type: 'chart', position: { x: 0, y: 0, w: 4, h: 4 } },
          { type: 'chart', position: { x: 4, y: 0, w: 4, h: 4 } },
          { type: 'chart', position: { x: 8, y: 0, w: 4, h: 4 } }
        ],
        refresh_interval: 300000
      }
    }
  },
  realtime_monitor: {
    name: 'Real-time Monitor',
    icon: Activity,
    description: 'Auto-refreshing live feed of current metrics',
    defaultConfig: {
      layout_config: {
        grid_layout: [
          { type: 'kpi', position: { x: 0, y: 0, w: 3, h: 2 } },
          { type: 'kpi', position: { x: 3, y: 0, w: 3, h: 2 } },
          { type: 'kpi', position: { x: 6, y: 0, w: 3, h: 2 } },
          { type: 'kpi', position: { x: 9, y: 0, w: 3, h: 2 } },
          { type: 'chart', position: { x: 0, y: 2, w: 12, h: 3 } }
        ],
        refresh_interval: 30000
      }
    }
  }
};

export default function TemplateManager() {
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [importJSON, setImportJSON] = useState('');
  const [activeTab, setActiveTab] = useState('my-templates');

  const [newTemplate, setNewTemplate] = useState({
    name: '',
    description: '',
    template_type: 'custom',
    tags: []
  });

  const { currentUser, isAgency, hasPermission } = usePermissions();

  // Fetch user's templates
  const { data: myTemplates } = useQuery({
    queryKey: ['templates', 'my', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      if (!orgId || orgId === 'all') return [];
      
      return await base44.entities.ReportTemplate.filter({
        organization_id: orgId
      }, '-created_date');
    },
    initialData: []
  });

  // Fetch public templates (marketplace)
  const { data: publicTemplates } = useQuery({
    queryKey: ['templates', 'public'],
    queryFn: async () => {
      return await base44.entities.ReportTemplate.filter({
        is_public: true
      }, '-usage_count');
    },
    initialData: []
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (templateData) => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      
      // Get default config based on type
      const typeConfig = TEMPLATE_TYPES[templateData.template_type];
      const defaultConfig = typeConfig?.defaultConfig || {};

      return await base44.entities.ReportTemplate.create({
        ...templateData,
        organization_id: orgId,
        created_by: currentUser?.email,
        layout_config: defaultConfig.layout_config || {},
        metric_configs: [],
        filter_presets: {},
        chart_settings: {},
        usage_count: 0
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template created');
      setShowCreateDialog(false);
      resetForm();
    }
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: (id) => base44.entities.ReportTemplate.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template deleted');
    }
  });

  // Use template mutation
  const useTemplateMutation = useMutation({
    mutationFn: async (templateId) => {
      const template = [...myTemplates, ...publicTemplates].find(t => t.id === templateId);
      if (!template) throw new Error('Template not found');

      // Increment usage count
      await base44.entities.ReportTemplate.update(templateId, {
        usage_count: (template.usage_count || 0) + 1
      });

      return template;
    },
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success(`Applied template: ${template.name}`);
      // Navigate to report builder with template
      window.location.href = `/report-builder?template=${template.id}`;
    }
  });

  const resetForm = () => {
    setNewTemplate({
      name: '',
      description: '',
      template_type: 'custom',
      tags: []
    });
  };

  const handleCreateTemplate = () => {
    if (!newTemplate.name || !newTemplate.template_type) {
      toast.error('Name and type are required');
      return;
    }
    createTemplateMutation.mutate(newTemplate);
  };

  const handleExportTemplate = (template) => {
    const exportData = {
      ...template,
      exported_at: new Date().toISOString(),
      version: '1.0'
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `template-${template.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('Template exported');
  };

  const handleImportTemplate = () => {
    try {
      const templateData = JSON.parse(importJSON);
      
      // Validate required fields
      if (!templateData.name || !templateData.layout_config) {
        toast.error('Invalid template format');
        return;
      }

      // Remove id and timestamps
      delete templateData.id;
      delete templateData.created_date;
      delete templateData.updated_date;
      delete templateData.exported_at;

      createTemplateMutation.mutate({
        ...templateData,
        usage_count: 0
      });

      setShowImportDialog(false);
      setImportJSON('');
    } catch (error) {
      toast.error('Invalid JSON format');
    }
  };

  const handleDuplicateTemplate = async (template) => {
    const duplicatedTemplate = {
      ...template,
      name: `${template.name} (Copy)`,
      usage_count: 0
    };

    delete duplicatedTemplate.id;
    delete duplicatedTemplate.created_date;
    delete duplicatedTemplate.updated_date;

    createTemplateMutation.mutate(duplicatedTemplate);
  };

  const renderTemplateCard = (template, showActions = true) => {
    const typeInfo = TEMPLATE_TYPES[template.template_type];
    const Icon = typeInfo?.icon || Layout;

    return (
      <Card key={template.id} className="hover:shadow-lg transition-shadow">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Icon className="w-5 h-5 text-gray-600" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-lg">{template.name}</CardTitle>
                <CardDescription className="mt-1">{template.description}</CardDescription>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge variant="outline">
              {typeInfo?.name || template.template_type}
            </Badge>
            {template.is_public && (
              <Badge className="bg-blue-600">
                <Star className="w-3 h-3 mr-1" />
                Public
              </Badge>
            )}
            {template.tags?.map(tag => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Usage: {template.usage_count || 0} times</span>
            {template.created_by && (
              <span className="text-xs">By: {template.created_by.split('@')[0]}</span>
            )}
          </div>

          {showActions && (
            <div className="flex gap-2 pt-2">
              <Button
                variant="default"
                size="sm"
                className="flex-1"
                onClick={() => useTemplateMutation.mutate(template.id)}
              >
                <Eye className="w-3 h-3 mr-1" />
                Use Template
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDuplicateTemplate(template)}
              >
                <Copy className="w-3 h-3" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportTemplate(template)}
              >
                <Download className="w-3 h-3" />
              </Button>
              {template.organization_id === (selectedOrgId || currentUser?.organization_id) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteTemplateMutation.mutate(template.id)}
                  className="text-red-600"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <PermissionGuard requiredLevel="editor">
      <div className="min-h-screen bg-gray-50">
        <div className="p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <Layout className="w-8 h-8" />
                  Report Templates
                </h1>
                <p className="text-gray-600 mt-1">Pre-configured dashboard layouts for quick insights</p>
              </div>
              <div className="flex gap-3">
                {isAgency && (
                  <OrganizationSelector
                    value={selectedOrgId || currentUser?.organization_id}
                    onChange={setSelectedOrgId}
                    showLabel={false}
                  />
                )}
                <Button variant="outline" onClick={() => setShowImportDialog(true)} className="gap-2">
                  <Upload className="w-4 h-4" />
                  Import
                </Button>
                <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Create Template
                </Button>
              </div>
            </div>

            {/* Quick Start Templates */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Start Templates</CardTitle>
                <CardDescription>Pre-built templates for common use cases</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {Object.entries(TEMPLATE_TYPES).map(([key, type]) => {
                    const Icon = type.icon;
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          setNewTemplate({
                            ...newTemplate,
                            name: type.name,
                            template_type: key,
                            description: type.description
                          });
                          setShowCreateDialog(true);
                        }}
                        className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all text-left"
                      >
                        <Icon className="w-8 h-8 text-gray-600 mb-2" />
                        <h3 className="font-semibold text-sm text-gray-900">{type.name}</h3>
                        <p className="text-xs text-gray-600 mt-1">{type.description}</p>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Templates Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="my-templates">
                  My Templates ({myTemplates.length})
                </TabsTrigger>
                <TabsTrigger value="marketplace">
                  Marketplace ({publicTemplates.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="my-templates" className="mt-6">
                {myTemplates.length === 0 ? (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <Layout className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                      <p className="text-gray-600">No templates yet. Create your first template!</p>
                      <Button onClick={() => setShowCreateDialog(true)} className="mt-4">
                        <Plus className="w-4 h-4 mr-2" />
                        Create Template
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {myTemplates.map(template => renderTemplateCard(template))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="marketplace" className="mt-6">
                {publicTemplates.length === 0 ? (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <Star className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                      <p className="text-gray-600">No public templates available yet</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {publicTemplates.map(template => renderTemplateCard(template, true))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Create Template Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Report Template</DialogTitle>
              <DialogDescription>
                Define a reusable dashboard layout
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="template-name">Template Name *</Label>
                <Input
                  id="template-name"
                  placeholder="e.g., Monthly Sales Dashboard"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-type">Template Type *</Label>
                <Select
                  value={newTemplate.template_type}
                  onValueChange={(value) => setNewTemplate({ ...newTemplate, template_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TEMPLATE_TYPES).map(([key, type]) => (
                      <SelectItem key={key} value={key}>
                        {type.name} - {type.description}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom Layout</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-description">Description</Label>
                <Textarea
                  id="template-description"
                  placeholder="What does this template show?"
                  value={newTemplate.description}
                  onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-tags">Tags (comma-separated)</Label>
                <Input
                  id="template-tags"
                  placeholder="e.g., sales, executive, monthly"
                  onChange={(e) => setNewTemplate({ 
                    ...newTemplate, 
                    tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                  })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateTemplate}>Create Template</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Import Template Dialog */}
        <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Import Template</DialogTitle>
              <DialogDescription>
                Paste the JSON template configuration
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                placeholder='{"name": "Template Name", "template_type": "custom", ...}'
                value={importJSON}
                onChange={(e) => setImportJSON(e.target.value)}
                rows={15}
                className="font-mono text-xs"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowImportDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleImportTemplate}>Import Template</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
}