import React, { useState, useEffect } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BookOpen, Plus, ArrowLeft, Save, FileText, Trash2, GripVertical, X } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";
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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import PermissionGuard from "../components/auth/PermissionGuard";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

export default function BookEditor() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const bookId = searchParams.get('bookId');

  const [bookReports, setBookReports] = useState([]);
  const [showAddReportDialog, setShowAddReportDialog] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportNotes, setReportNotes] = useState('');

  // Fetch book
  const { data: book, isLoading: bookLoading } = useQuery({
    queryKey: ['reportBook', bookId],
    queryFn: async () => {
      const books = await base44.entities.ReportBook.list();
      return books.find(b => b.id === bookId);
    },
    enabled: !!bookId
  });

  // Fetch saved reports
  const { data: savedReports } = useQuery({
    queryKey: ['reportRequests', book?.organization_id],
    queryFn: async () => {
      if (!book?.organization_id) return [];
      return await base44.entities.ReportRequest.filter(
        { organization_id: book.organization_id },
        '-created_date'
      );
    },
    enabled: !!book?.organization_id,
    initialData: []
  });

  // Fetch templates
  const { data: templates } = useQuery({
    queryKey: ['reportTemplates'],
    queryFn: () => base44.entities.ReportTemplate.list('-created_date'),
    initialData: []
  });

  // Initialize book reports from book data
  useEffect(() => {
    if (book?.reports) {
      setBookReports(book.reports.sort((a, b) => a.order - b.order));
    }
  }, [book]);

  // Update book mutation
  const updateBookMutation = useMutation({
    mutationFn: ({ bookId, updates }) => base44.entities.ReportBook.update(bookId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportBook'] });
      queryClient.invalidateQueries({ queryKey: ['reportBooks'] });
      toast.success('Book updated');
    }
  });

  const handleSaveBook = () => {
    if (!book) return;

    // Renumber reports after any changes
    const orderedReports = bookReports.map((report, idx) => ({
      ...report,
      order: idx
    }));

    updateBookMutation.mutate({
      bookId: book.id,
      updates: {
        reports: orderedReports
      }
    });
  };

  const handleAddReport = (source, sourceType) => {
    if (!source) return;

    const newReport = {
      order: bookReports.length,
      [sourceType === 'saved' ? 'report_id' : 'template_id']: source.id,
      notes: reportNotes,
      title: source.title || source.name,
      config: source.configuration || source
    };

    setBookReports([...bookReports, newReport]);
    setShowAddReportDialog(false);
    setSelectedReport(null);
    setReportNotes('');
    
    toast.success('Report added to book');
  };

  const handleRemoveReport = (index) => {
    const updated = bookReports.filter((_, idx) => idx !== index);
    setBookReports(updated);
    toast.success('Report removed');
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(bookReports);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setBookReports(items);
  };

  const handlePublish = () => {
    if (!book) return;

    // Save reports first
    const orderedReports = bookReports.map((report, idx) => ({
      ...report,
      order: idx
    }));

    updateBookMutation.mutate({
      bookId: book.id,
      updates: {
        reports: orderedReports,
        status: 'published'
      }
    });

    toast.success('Book published!');
  };

  if (bookLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <BookOpen className="w-16 h-16 mx-auto text-gray-400 mb-4 animate-pulse" />
          <p className="text-gray-600">Loading book...</p>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600">Book not found</p>
          <Button onClick={() => navigate(createPageUrl('ReportLibrary'))} className="mt-4">
            Back to Library
          </Button>
        </div>
      </div>
    );
  }

  return (
    <PermissionGuard requiredLevel="editor">
      <div className="min-h-screen bg-gray-50">
        <div className="p-6 md:p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigate(createPageUrl('ReportLibrary'))}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                    <BookOpen className="w-8 h-8" />
                    Edit Book
                  </h1>
                  <p className="text-gray-600 mt-1">{book.title}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleSaveBook}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
                <Button onClick={handlePublish} disabled={bookReports.length === 0}>
                  <FileText className="w-4 h-4 mr-2" />
                  Publish Book
                </Button>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Main Editor */}
              <div className="lg:col-span-2 space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle>Book Contents</CardTitle>
                        <CardDescription>
                          {bookReports.length} reports • Drag to reorder
                        </CardDescription>
                      </div>
                      <Button onClick={() => setShowAddReportDialog(true)} size="sm" className="gap-2">
                        <Plus className="w-4 h-4" />
                        Add Report
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {bookReports.length === 0 ? (
                      <div className="text-center py-12">
                        <FileText className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                        <p className="text-gray-600 mb-2">No reports added yet</p>
                        <p className="text-sm text-gray-500">Click "Add Report" to get started</p>
                      </div>
                    ) : (
                      <DragDropContext onDragEnd={handleDragEnd}>
                        <Droppable droppableId="reports">
                          {(provided) => (
                            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                              {bookReports.map((report, index) => (
                                <Draggable key={`report-${index}`} draggableId={`report-${index}`} index={index}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      className={`flex items-center gap-3 p-4 rounded-lg border ${
                                        snapshot.isDragging ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'
                                      }`}
                                    >
                                      <div {...provided.dragHandleProps} className="cursor-grab">
                                        <GripVertical className="w-5 h-5 text-gray-400" />
                                      </div>
                                      <div className="flex-1">
                                        <div className="font-medium">{report.title}</div>
                                        {report.notes && (
                                          <p className="text-sm text-gray-500 mt-1">{report.notes}</p>
                                        )}
                                        <div className="flex gap-2 mt-2">
                                          {report.report_id && <Badge variant="outline">Saved Report</Badge>}
                                          {report.template_id && <Badge variant="outline">Template</Badge>}
                                        </div>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleRemoveReport(index)}
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </DragDropContext>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar - Book Info */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Book Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-xs text-gray-500">Status</Label>
                      <div className="mt-1">
                        <Badge className={book.status === 'published' ? 'bg-green-600' : 'bg-yellow-600'}>
                          {book.status}
                        </Badge>
                      </div>
                    </div>
                    {book.account_name && (
                      <div>
                        <Label className="text-xs text-gray-500">Account</Label>
                        <p className="mt-1 font-medium">{book.account_name}</p>
                      </div>
                    )}
                    {book.description && (
                      <div>
                        <Label className="text-xs text-gray-500">Description</Label>
                        <p className="mt-1 text-sm">{book.description}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-xs text-gray-500">Reports</Label>
                      <p className="mt-1 font-medium">{bookReports.length}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>

        {/* Add Report Dialog */}
        <Dialog open={showAddReportDialog} onOpenChange={setShowAddReportDialog}>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Add Report to Book</DialogTitle>
              <DialogDescription>
                Choose from saved reports or templates
              </DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="saved" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="saved">Saved Reports ({savedReports.length})</TabsTrigger>
                <TabsTrigger value="templates">Templates ({templates.length})</TabsTrigger>
              </TabsList>
              
              <TabsContent value="saved" className="mt-4">
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-2">
                    {savedReports.map(report => (
                      <Card 
                        key={report.id}
                        className={`cursor-pointer hover:shadow-md transition-shadow ${
                          selectedReport?.id === report.id ? 'border-blue-500 border-2' : ''
                        }`}
                        onClick={() => setSelectedReport(report)}
                      >
                        <CardHeader className="p-4">
                          <CardTitle className="text-base">{report.title}</CardTitle>
                          {report.description && (
                            <CardDescription className="text-sm">{report.description}</CardDescription>
                          )}
                        </CardHeader>
                      </Card>
                    ))}
                    {savedReports.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        No saved reports available
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="templates" className="mt-4">
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-2">
                    {templates.map(template => (
                      <Card 
                        key={template.id}
                        className={`cursor-pointer hover:shadow-md transition-shadow ${
                          selectedReport?.id === template.id ? 'border-blue-500 border-2' : ''
                        }`}
                        onClick={() => setSelectedReport(template)}
                      >
                        <CardHeader className="p-4">
                          <CardTitle className="text-base">{template.name}</CardTitle>
                          {template.description && (
                            <CardDescription className="text-sm">{template.description}</CardDescription>
                          )}
                        </CardHeader>
                      </Card>
                    ))}
                    {templates.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        No templates available
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>

            {selectedReport && (
              <div className="space-y-2 pt-4 border-t">
                <Label htmlFor="report-notes">Notes (optional)</Label>
                <Textarea
                  id="report-notes"
                  placeholder="Add any notes or context for this report..."
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                  rows={2}
                />
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowAddReportDialog(false);
                setSelectedReport(null);
                setReportNotes('');
              }}>
                Cancel
              </Button>
              <Button 
                onClick={() => handleAddReport(selectedReport, savedReports.includes(selectedReport) ? 'saved' : 'template')}
                disabled={!selectedReport}
              >
                Add to Book
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
}