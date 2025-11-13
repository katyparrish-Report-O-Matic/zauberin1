import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Plus, Eye, Edit, Trash2, FileText, Calendar as CalendarIcon } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { usePermissions } from "../components/auth/usePermissions";
import OrganizationSelector from "../components/org/OrganizationSelector";
import PermissionGuard from "../components/auth/PermissionGuard";
import AccountSelector from "../components/books/AccountSelector";

export default function ReportLibrary() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deletingBook, setDeletingBook] = useState(null);
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [newBook, setNewBook] = useState({
    title: '',
    description: '',
    cover_color: 'blue',
    account_id: 'all',
    account_name: '',
    dateRange: { from: null, to: null }
  });

  const { currentUser, isAgency, hasPermission } = usePermissions();
  const canEdit = hasPermission('editor');
  const canDelete = hasPermission('admin');

  // Fetch accounts for the organization
  const { data: allAccounts } = useQuery({
    queryKey: ['organizationAccounts', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      if (!orgId || orgId === 'all') return [];
      
      // This will be populated from AccountHierarchy when data sources sync
      const accounts = await base44.entities.AccountHierarchy.filter({
        organization_id: orgId,
        hierarchy_level: 'account',
        status: 'active'
      });
      
      return accounts;
    },
    enabled: !!(selectedOrgId || currentUser?.organization_id),
    initialData: []
  });

  // Fetch books
  const { data: books } = useQuery({
    queryKey: ['reportBooks', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      
      if (isAgency && selectedOrgId === 'all') {
        return await base44.entities.ReportBook.list('-created_date');
      }
      
      if (!orgId || orgId === 'all') return [];
      
      return await base44.entities.ReportBook.filter(
        { organization_id: orgId },
        '-created_date'
      );
    },
    initialData: []
  });

  // Create book mutation
  const createBookMutation = useMutation({
    mutationFn: (bookData) => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      
      return base44.entities.ReportBook.create({
        organization_id: orgId,
        title: bookData.title,
        description: bookData.description,
        cover_color: bookData.cover_color,
        account_id: bookData.account_id,
        account_name: bookData.account_name,
        date_range: bookData.dateRange.from ? {
          from: bookData.dateRange.from.toISOString().split('T')[0],
          to: bookData.dateRange.to?.toISOString().split('T')[0]
        } : null,
        reports: [],
        status: 'draft',
        shared_with: [],
        tags: []
      });
    },
    onSuccess: (createdBook) => {
      queryClient.invalidateQueries({ queryKey: ['reportBooks'] });
      toast.success('Book created successfully');
      setShowCreateDialog(false);
      setNewBook({
        title: '',
        description: '',
        cover_color: 'blue',
        account_id: 'all',
        account_name: '',
        dateRange: { from: null, to: null }
      });
      
      // Navigate to book editor
      navigate(createPageUrl('BookEditor') + `?bookId=${createdBook.id}`);
    },
    onError: (error) => {
      toast.error('Failed to create book');
      console.error(error);
    }
  });

  // Delete book mutation
  const deleteBookMutation = useMutation({
    mutationFn: (id) => base44.entities.ReportBook.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportBooks'] });
      toast.success('Book deleted');
      setDeletingBook(null);
    },
    onError: (error) => {
      toast.error('Failed to delete book');
    }
  });

  const handleCreateBook = () => {
    if (!newBook.title.trim()) {
      toast.error('Book title is required');
      return;
    }

    const orgId = selectedOrgId || currentUser?.organization_id;
    if (!orgId || orgId === 'all') {
      toast.error('Please select an organization');
      return;
    }

    if (!newBook.dateRange.from) {
      toast.error('Please select a date range for the book');
      return;
    }

    // Get account name
    let accountName = 'All Accounts';
    if (newBook.account_id !== 'all') {
      const account = allAccounts.find(a => a.external_id === newBook.account_id || a.id === newBook.account_id);
      accountName = account?.name || newBook.account_id;
    }

    createBookMutation.mutate({
      ...newBook,
      account_name: accountName
    });
  };

  const handleViewBook = (book) => {
    navigate(createPageUrl('BookViewer') + `?bookId=${book.id}`);
  };

  const handleEditBook = (book) => {
    navigate(createPageUrl('BookEditor') + `?bookId=${book.id}`);
  };

  const handleDeleteBook = (book) => {
    setDeletingBook(book);
  };

  const confirmDelete = () => {
    if (deletingBook) {
      deleteBookMutation.mutate(deletingBook.id);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'published':
        return 'bg-green-600';
      case 'draft':
        return 'bg-yellow-600';
      case 'archived':
        return 'bg-gray-600';
      default:
        return 'bg-blue-600';
    }
  };

  const getCoverColorClass = (color) => {
    const colors = {
      blue: 'from-blue-500 to-blue-600',
      green: 'from-green-500 to-green-600',
      purple: 'from-purple-500 to-purple-600',
      red: 'from-red-500 to-red-600',
      orange: 'from-orange-500 to-orange-600',
      teal: 'from-teal-500 to-teal-600'
    };
    return colors[color] || colors.blue;
  };

  return (
    <PermissionGuard requiredLevel="viewer">
      <div className="min-h-screen bg-gray-50">
        <div className="p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <BookOpen className="w-8 h-8" />
                  Report Library
                </h1>
                <p className="text-gray-600 mt-1">
                  Create comprehensive report books containing multiple reports for clients
                </p>
              </div>
              <div className="flex gap-3">
                {isAgency && (
                  <OrganizationSelector
                    value={selectedOrgId || currentUser?.organization_id}
                    onChange={setSelectedOrgId}
                    showLabel={false}
                  />
                )}
                <Button 
                  onClick={() => setShowCreateDialog(true)}
                  disabled={!canEdit}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  New Book
                </Button>
              </div>
            </div>

            {/* Books Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {books.map(book => (
                <Card key={book.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className={`h-32 -mx-6 -mt-6 mb-4 rounded-t-lg bg-gradient-to-br ${getCoverColorClass(book.cover_color)} flex items-center justify-center`}>
                      <BookOpen className="w-16 h-16 text-white opacity-90" />
                    </div>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{book.title}</CardTitle>
                        <CardDescription className="mt-1">
                          {book.description || 'No description'}
                        </CardDescription>
                      </div>
                      <Badge className={getStatusColor(book.status)}>
                        {book.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm space-y-1">
                      {book.account_name && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <FileText className="w-4 h-4" />
                          <span>{book.account_name}</span>
                        </div>
                      )}
                      {book.date_range?.from && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <CalendarIcon className="w-4 h-4" />
                          <span>
                            {format(new Date(book.date_range.from), "MMM d, yyyy")}
                            {book.date_range.to && ` - ${format(new Date(book.date_range.to), "MMM d, yyyy")}`}
                          </span>
                        </div>
                      )}
                      <div className="text-gray-600">
                        {book.reports?.length || 0} reports
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2"
                        onClick={() => handleViewBook(book)}
                      >
                        <Eye className="w-3 h-3" />
                        View
                      </Button>
                      {canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditBook(book)}
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteBook(book)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {books.length === 0 && (
              <Card>
                <CardContent className="p-12 text-center">
                  <BookOpen className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-2">No report books yet</p>
                  <p className="text-sm text-gray-500">
                    Create your first book to organize multiple reports for clients
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Create Book Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Report Book</DialogTitle>
              <DialogDescription>
                A book contains multiple reports organized for a specific client or account
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="book-title">Book Title *</Label>
                <Input
                  id="book-title"
                  placeholder="e.g., Q4 2025 Performance Review - Adtrak"
                  value={newBook.title}
                  onChange={(e) => setNewBook({ ...newBook, title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="book-description">Description</Label>
                <Textarea
                  id="book-description"
                  placeholder="Describe what this book contains..."
                  value={newBook.description}
                  onChange={(e) => setNewBook({ ...newBook, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cover-color">Cover Color</Label>
                  <Select
                    value={newBook.cover_color}
                    onValueChange={(value) => setNewBook({ ...newBook, cover_color: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="blue">Blue</SelectItem>
                      <SelectItem value="green">Green</SelectItem>
                      <SelectItem value="purple">Purple</SelectItem>
                      <SelectItem value="red">Red</SelectItem>
                      <SelectItem value="orange">Orange</SelectItem>
                      <SelectItem value="teal">Teal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <AccountSelector
                  organizationId={selectedOrgId || currentUser?.organization_id}
                  value={newBook.account_id}
                  onChange={(value) => setNewBook({ ...newBook, account_id: value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Date Range *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newBook.dateRange.from ? (
                        newBook.dateRange.to ? (
                          <>
                            {format(newBook.dateRange.from, "MMM d, yyyy")} - {format(newBook.dateRange.to, "MMM d, yyyy")}
                          </>
                        ) : (
                          format(newBook.dateRange.from, "MMM d, yyyy")
                        )
                      ) : (
                        <span>Pick a date range</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={newBook.dateRange}
                      onSelect={(range) => setNewBook({ ...newBook, dateRange: range || { from: null, to: null }})}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-gray-500">
                  All reports added to this book will use this date range
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateBook} disabled={createBookMutation.isPending}>
                {createBookMutation.isPending ? 'Creating...' : 'Create Book'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deletingBook} onOpenChange={() => setDeletingBook(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Book</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deletingBook?.title}"? This will not delete the individual reports, just this book collection.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete Book
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PermissionGuard>
  );
}