import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { templateService } from "./TemplateService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Download, 
  Upload, 
  Trash2, 
  Share2, 
  Copy,
  Layout
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

export default function TemplateManager({ orgId, currentReport }) {
  const queryClient = useQueryClient();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    description: '',
    category: 'general'
  });

  const { data: templates } = useQuery({
    queryKey: ['reportTemplates', orgId],
    queryFn: () => templateService.getTemplates(orgId),
    enabled: !!orgId,
    initialData: []
  });

  // Save template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: async (data) => {
      if (!currentReport?.configuration) {
        throw new Error('No report to save as template');
      }
      return await templateService.createFromReport(
        orgId,
        data.name,
        data.description,
        currentReport.configuration,
        data.category
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportTemplates'] });
      toast.success('Template saved');
      setShowSaveDialog(false);
      setNewTemplate({ name: '', description: '', category: 'general' });
    },
    onError: (error) => {
      toast.error('Failed to save template: ' + error.message);
    }
  });

  // Import template mutation
  const importTemplateMutation = useMutation({
    mutationFn: (jsonString) => templateService.importTemplate(orgId, jsonString),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportTemplates'] });
      toast.success('Template imported');
      setShowImportDialog(false);
      setImportJson('');
    },
    onError: (error) => {
      toast.error('Failed to import template: ' + error.message);
    }
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: (id) => templateService.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportTemplates'] });
      toast.success('Template deleted');
    }
  });

  // Share template mutation
  const shareTemplateMutation = useMutation({
    mutationFn: ({ id, isPublic }) => templateService.shareTemplate(id, isPublic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportTemplates'] });
      toast.success('Template sharing updated');
    }
  });

  const handleExportTemplate = (template) => {
    const json = templateService.exportTemplate(template);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${template.name.toLowerCase().replace(/\s+/g, '-')}-template.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Template exported');
  };

  const handleSaveTemplate = () => {
    if (!newTemplate.name) {
      toast.error('Template name is required');
      return;
    }
    saveTemplateMutation.mutate(newTemplate);
  };

  const handleImportTemplate = () => {
    if (!importJson.trim()) {
      toast.error('Please paste template JSON');
      return;
    }
    importTemplateMutation.mutate(importJson);
  };

  const customTemplates = templates.filter(t => !t.is_system);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Templates</h2>
          <p className="text-gray-600 mt-1">
            Manage your custom report templates
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowImportDialog(true)}
            className="gap-2"
          >
            <Upload className="w-4 h-4" />
            Import
          </Button>
          <Button
            onClick={() => setShowSaveDialog(true)}
            disabled={!currentReport}
            className="gap-2"
          >
            <Copy className="w-4 h-4" />
            Save Current as Template
          </Button>
        </div>
      </div>

      {/* Custom Templates List */}
      {customTemplates.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Layout className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 mb-4">No custom templates yet</p>
            <Button onClick={() => setShowSaveDialog(true)} disabled={!currentReport}>
              <Copy className="w-4 h-4 mr-2" />
              Create First Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {customTemplates.map(template => (
            <Card key={template.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <Badge variant="outline" className="capitalize">
                        {template.category}
                      </Badge>
                      {template.is_public && (
                        <Badge className="bg-blue-600">Shared</Badge>
                      )}
                    </div>
                    <CardDescription className="mt-1">
                      {template.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {template.configuration.metrics?.length || 0} metrics • 
                    {' '}{template.usage_count || 0} uses
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600 text-xs">Share with team:</span>
                    <Switch
                      checked={template.is_public}
                      onCheckedChange={(checked) =>
                        shareTemplateMutation.mutate({ id: template.id, isPublic: checked })
                      }
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExportTemplate(template)}
                    className="gap-2"
                  >
                    <Download className="w-3 h-3" />
                    Export
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteTemplateMutation.mutate(template.id)}
                    className="gap-2 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Save Template Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
            <DialogDescription>
              Create a reusable template from your current report
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                placeholder="e.g., Monthly Sales Dashboard"
                value={newTemplate.name}
                onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-description">Description</Label>
              <Textarea
                id="template-description"
                placeholder="What is this template for?"
                value={newTemplate.description}
                onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-category">Category</Label>
              <Select
                value={newTemplate.category}
                onValueChange={(value) => setNewTemplate({ ...newTemplate, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="operations">Operations</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate}>Save Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Template Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Template</DialogTitle>
            <DialogDescription>
              Paste the JSON of an exported template
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="import-json">Template JSON</Label>
            <Textarea
              id="import-json"
              placeholder='{"name": "Template Name", ...}'
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              rows={12}
              className="font-mono text-sm"
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
  );
}