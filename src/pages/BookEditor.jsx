import React, { useState, useEffect } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  BookOpen, Save, Plus, Trash2, GripVertical, FileText, 
  LayoutTemplate, ArrowUp, ArrowDown, Eye 
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import PermissionGuard from "../components/auth/PermissionGuard";

export default function BookEditor() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [showAddReportDialog, setShowAddReportDialog] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [reportNotes, setReportNotes] = useState('');

  // Get book ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const bookId = urlParams.get('bookId');

  // Fetch book
  const { data: bookData, isLoading: bookLoading } = useQuery({
    queryKey: ['reportBook', bookId],
    queryFn: async () => {
      const books = await base44.entities.ReportBook.list();
      return books.find(b => b.id === bookId);
    },
    enabled: !!bookId
  });

  // Fetch saved reports
  const { data: savedReports } = useQuery({
    queryKey: ['reportRequests', bookData?.organization_id],
    queryFn: async () => {
      if (!bookData?.organization_id) return [];
      return await base44.entities.ReportRequest.filter(
        { organization_id: bookData.organization_id },
        '-created_date'
      );
    },
    enabled: !!bookData?.organization_id,
    initialData: []
  });

  // Fetch templates
  const { data: templates } = useQuery({
    queryKey: ['reportTemplates', bookData?.organization_id],
    queryFn: async () => {
      if (!bookData?.organization_id) return [];
      const allTemplates = await base44.entities.ReportTemplate.list('-created_date');
      return allTemplates.filter(t => 
        t.organization_id === bookData.organization_id || t.is_public
      );
    },
    enabled: !!bookData?.organization_id,
    initialData: []
  });

  useEffect(() => {
    if (bookData) {
      setBook(bookData);
    }
  }, [bookData]);

  // Update book mutation
  const updateBookMutation = useMutation({
    mutationFn: (updates) => base44.entities.ReportBook.update(bookId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportBook', bookId] });
      queryClient.invalidateQueries({ queryKey: ['reportBooks'] });
      toast.success('Book updated');
    }
  });

  const handleAddReport = () => {
    if (!selectedReportId && !selectedTemplateId) {
      toast.error('Please select a report or template');
      return;
    }

    const newReport = {
      order: (book.reports?.length || 0) + 1,
      report_id: selectedReportId || null,
      template_id: selectedTemplateId || null,
      notes: reportNotes,
      custom_config: null
    };

    const updatedReports = [...(book.reports || []), newReport];

    updateBookMutation.mutate({ reports: updatedReports });
    
    setShowAddReportDialog(false);
    setSelectedReportId(null);
    setSelectedTemplateId(null);
    setReportNotes('');
  };

  const handleRemoveReport = (index) => {
    const updatedReports = book.reports.filter((_, i) => i !== index);
    // Re-order
    updatedReports.forEach((r, idx) => r.order = idx + 1);
    updateBookMutation.mutate({ reports: updatedReports });
  };

  const handleMoveReport = (index, direction) => {
    const updatedReports = [...book.reports];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex < 0 || newIndex >= updatedReports.length) return;
    
    [updatedReports[index], updatedReports[newIndex]] = [updatedReports[newIndex], updatedReports[index]];
    
    // Re-order
    updatedReports.forEach((r, idx) => r.order = idx + 1);
    updateBookMutation.mutate({ reports: updatedReports });
  };

  const handlePublish = () => {
    updateBookMutation.mutate({ status: 'published' });
    toast.success('Book published! You can now share it with clients.');
  };

  const handlePreview = () => {
    navigate(createPageUrl('BookViewer') + `?bookId=${bookId}`);
  };

  const getReportName = (report) => {
    if (report.report_id) {
      const savedReport = savedReports.find(r => r.id === report.report_id);
      return savedReport?.title || 'Unknown Report';
    }
    if (report.template_id) {
      const template = templates.find(t => t.id === report.template_id);
      return template?.name || 'Unknown Template';
    }
    return 'Custom Report';
  };

  if (bookLoading) {
    return <div className="p-8 text-center">Loading book...</div>;
  }

  if (!book) {
    return <div className="p-8 text-center">Book not found</div>;
  }

  return (
    <PermissionGuard requiredLevel="editor">
      <div className="min-h-screen bg-gray-50">
        <div className="p-6 md:p-8">
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <BookOpen className="w-8 h-8" />
                  {book.title}
                </h1>
                <p className="text-gray-600 mt-1">{book.description || 'Edit your report book'}</p>
                <Badge className={book.status === 'published' ? 'bg-green-600 mt-2' : 'bg-yellow-600 mt-2'}>
                  {book.status}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handlePreview} className="gap-2">
                  <Eye className="w-4 h-4" />
                  Preview
                </Button>
                {book.status === 'draft' && (
                  <Button onClick={handlePublish} className="gap-2">
                    <Save className="w-4 h-4" />
                    Publish Book
                  </Button>
                )}
              </div>
            </div>

            {/* Reports List */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Reports in this Book</CardTitle>
                    <CardDescription>
                      Drag to reorder, or use arrows to change sequence
                    </CardDescription>
                  </div>
                  <Button onClick={() => setShowAddReportDialog(true)} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add Report
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {book.reports && book.reports.length > 0 ? (
                  <div className="space-y-3">
                    {book.reports.map((report, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        <GripVertical className="w-5 h-5 text-gray-400 cursor-move" />
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {report.report_id && <FileText className="w-4 h-4 text-blue-600" />}
                            {report.template_id && <LayoutTemplate className="w-4 h-4 text-purple-600" />}
                            <span className="font-medium">{getReportName(report)}</span>
                          </div>
                          {report.notes && (
                            <p className="text-sm text-gray-600">{report.notes}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">#{report.order}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMoveReport(index, 'up')}
                            disabled={index === 0}
                          >
                            <ArrowUp className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMoveReport(index, 'down')}
                            disabled={index === book.reports.length - 1}
                          >
                            <ArrowDown className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveReport(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600 mb-2">No reports added yet</p>
                    <p className="text-sm text-gray-500">Click "Add Report" to start building your book</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Book Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Book Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Title</Label>
                    <Input
                      value={book.title}
                      onChange={(e) => setBook({ ...book, title: e.target.value })}
                      onBlur={() => updateBookMutation.mutate({ title: book.title })}
                    />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Input value={book.status} disabled className="capitalize" />
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={book.description || ''}
                    onChange={(e) => setBook({ ...book, description: e.target.value })}
                    onBlur={() => updateBookMutation.mutate({ description: book.description })}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Add Report Dialog */}
        <Dialog open={showAddReportDialog} onOpenChange={setShowAddReportDialog}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Report to Book</DialogTitle>
              <DialogDescription>
                Choose from saved reports or templates
              </DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="saved">
              <TabsList className="w-full">
                <TabsTrigger value="saved" className="flex-1">Saved Reports</TabsTrigger>
                <TabsTrigger value="templates" className="flex-1">Templates</TabsTrigger>
              </TabsList>
              
              <TabsContent value="saved" className="space-y-3 mt-4">
                {savedReports.length > 0 ? (
                  savedReports.map(report => (
                    <div
                      key={report.id}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedReportId === report.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => {
                        setSelectedReportId(report.id);
                        setSelectedTemplateId(null);
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium">{report.title}</h4>
                          <p className="text-sm text-gray-600 mt-1">{report.description}</p>
                          {report.configuration && (
                            <div className="flex gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                {report.configuration.chart_type}
                              </Badge>
                              {report.configuration.metrics?.slice(0, 2).map(m => (
                                <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        {selectedReportId === report.id && (
                          <Badge className="bg-blue-600">Selected</Badge>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-gray-500 py-8">No saved reports available</p>
                )}
              </TabsContent>
              
              <TabsContent value="templates" className="space-y-3 mt-4">
                {templates.length > 0 ? (
                  templates.map(template => (
                    <div
                      key={template.id}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedTemplateId === template.id
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => {
                        setSelectedTemplateId(template.id);
                        setSelectedReportId(null);
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium">{template.name}</h4>
                          <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                          {template.chart_settings && (
                            <div className="flex gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                {template.chart_settings.chart_type}
                              </Badge>
                              {template.is_public && (
                                <Badge variant="secondary" className="text-xs">Public</Badge>
                              )}
                            </div>
                          )}
                        </div>
                        {selectedTemplateId === template.id && (
                          <Badge className="bg-purple-600">Selected</Badge>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-gray-500 py-8">No templates available</p>
                )}
              </TabsContent>
            </Tabs>

            <div className="space-y-2 pt-4 border-t">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Add notes about this section..."
                value={reportNotes}
                onChange={(e) => setReportNotes(e.target.value)}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddReportDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddReport}>Add to Book</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
}