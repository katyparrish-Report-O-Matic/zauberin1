import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, TrendingUp, BarChart3, PieChart, Table, PlayCircle, Calendar as CalendarIcon, Trash2, Archive, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import PermissionGuard from "../components/auth/PermissionGuard";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Label } from "@/components/ui/label";

export default function ReportTemplates() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState(null);

  // Fetch current user's templates
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: userTemplates } = useQuery({
    queryKey: ['userTemplates', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return [];
      return await base44.entities.ReportTemplate.filter(
        { created_by: currentUser.email, is_archived: false },
        '-created_date'
      );
    },
    enabled: !!currentUser?.email,
    initialData: []
  });

  // Archive mutation
  const archiveTemplateMutation = useMutation({
    mutationFn: (templateId) => 
      base44.entities.ReportTemplate.update(templateId, { is_archived: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userTemplates'] });
      toast.success('Template archived');
    },
    onError: () => {
      toast.error('Failed to archive template');
    }
  });

  // Delete mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: (templateId) => 
      base44.entities.ReportTemplate.delete(templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userTemplates'] });
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
      toast.success('Template deleted');
    },
    onError: () => {
      toast.error('Failed to delete template');
    }
  });

  // Mock accounts
  const mockAccounts = [
    { id: 'acc1', name: 'Main Account' },
    { id: 'acc2', name: 'Secondary Account' },
    { id: 'acc3', name: 'Test Account' }
  ];

  // Use template mutation
  const useTemplateMutation = useMutation({
    mutationFn: async (template) => {
      // Increment usage count
      if (template.id) {
        await base44.entities.ReportTemplate.update(template.id, {
          usage_count: (template.usage_count || 0) + 1
        });
      }

      // Create new report request from template
      return await base44.entities.ReportRequest.create({
        organization_id: currentUser?.organization_id,
        title: template.name,
        description: template.description || 'Generated from template',
        configuration: {
          chart_type: template.chart_settings?.chart_type || 'bar',
          metrics: template.metric_configs?.map(m => m.metric_name) || [],
          segment_by: template.chart_settings?.segment_by || [],
          date_range: template.chart_settings?.date_range || { period: 'last_30_days', granularity: 'daily' },
          filters: template.filter_presets || {}
        },
        status: 'generated'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportRequests'] });
      queryClient.invalidateQueries({ queryKey: ['userTemplates'] });
      toast.success('Report created from template');
      navigate(createPageUrl('ReportBuilder'));
    }
  });

  const handleUseTemplate = (template) => {
    if (!currentUser?.organization_id) {
      toast.error('You must be part of an organization to create reports');
      return;
    }
    
    useTemplateMutation.mutate(template);
  };

  // Popular template definitions
  const popularTemplates = [
    {
      name: "Revenue by Branch",
      description: "Compare revenue performance across different branches",
      icon: BarChart3,
      color: "bg-blue-100 text-blue-700",
      chart_type: "bar",
      metrics: ["revenue"],
      segment_by: ["branch"]
    },
    {
      name: "Regional Sales Trends",
      description: "Track sales performance over time by region",
      icon: TrendingUp,
      color: "bg-green-100 text-green-700",
      chart_type: "line",
      metrics: ["sales"],
      segment_by: ["region"]
    },
    {
      name: "Conversion Distribution",
      description: "See conversion breakdown by location",
      icon: PieChart,
      color: "bg-purple-100 text-purple-700",
      chart_type: "pie",
      metrics: ["conversions"],
      segment_by: ["branch"]
    },
    {
      name: "Detailed Analytics Table",
      description: "View comprehensive metrics across branches and regions",
      icon: Table,
      color: "bg-orange-100 text-orange-700",
      chart_type: "table",
      metrics: ["revenue", "users", "conversions"],
      segment_by: ["branch", "region"]
    }
  ];

  const getIconForChartType = (chartType) => {
    switch (chartType) {
      case 'bar': return BarChart3;
      case 'line': return TrendingUp;
      case 'pie': return PieChart;
      case 'table': return Table;
      default: return FlaskConical;
    }
  };

  return (
    <PermissionGuard requiredLevel="viewer">
      <div className="min-h-screen bg-gray-50">
        <div className="p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <FlaskConical className="w-8 h-8" />
                Report Templates
              </h1>
              <p className="text-gray-600 mt-1">Quick-start your reports with pre-configured templates</p>
            </div>

            {/* Date Range and Account Picker */}
            <Card>
              <CardHeader>
                <CardTitle>Report Settings</CardTitle>
                <CardDescription>Configure default settings for reports created from templates</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Account</Label>
                    <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Accounts</SelectItem>
                        {mockAccounts.map(account => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Date Range</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateRange.from ? (
                            dateRange.to ? (
                              <>
                                {format(dateRange.from, "MMM d, yyyy")} - {format(dateRange.to, "MMM d, yyyy")}
                              </>
                            ) : (
                              format(dateRange.from, "MMM d, yyyy")
                            )
                          ) : (
                            <span>Pick a date range</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="range"
                          selected={dateRange}
                          onSelect={(range) => setDateRange(range || { from: null, to: null })}
                          numberOfMonths={2}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Popular Templates */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Popular Templates</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                {popularTemplates.map((template, idx) => {
                  const Icon = template.icon;
                  return (
                    <Card key={idx} className="hover:shadow-lg transition-shadow cursor-pointer">
                      <CardHeader>
                        <div className={`w-12 h-12 rounded-lg ${template.color} flex items-center justify-center mb-3`}>
                          <Icon className="w-6 h-6" />
                        </div>
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                        <CardDescription className="text-sm">{template.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline" className="text-xs">{template.chart_type}</Badge>
                            {template.metrics.map(metric => (
                              <Badge key={metric} variant="outline" className="text-xs">{metric}</Badge>
                            ))}
                          </div>
                          <Button 
                            onClick={() => handleUseTemplate(template)}
                            className="w-full gap-2"
                            size="sm"
                          >
                            <PlayCircle className="w-4 h-4" />
                            Use Template
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* My Templates */}
            {userTemplates.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">My Templates</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {userTemplates.map((template) => {
                    const Icon = getIconForChartType(template.chart_settings?.chart_type);
                    return (
                      <Card key={template.id} className="hover:shadow-lg transition-shadow">
                        <CardHeader>
                          <div className="w-12 h-12 rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center mb-3">
                            <Icon className="w-6 h-6" />
                          </div>
                          <CardTitle className="text-lg">{template.name}</CardTitle>
                          <CardDescription className="text-sm">{template.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="outline" className="text-xs">
                                {template.chart_settings?.chart_type || 'custom'}
                              </Badge>
                              {template.usage_count > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  Used {template.usage_count}x
                                </Badge>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                onClick={() => handleUseTemplate(template)}
                                className="flex-1 gap-2"
                                size="sm"
                              >
                                <PlayCircle className="w-4 h-4" />
                                Use
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    <MoreVertical className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem 
                                    onClick={() => archiveTemplateMutation.mutate(template.id)}
                                    disabled={archiveTemplateMutation.isPending}
                                  >
                                    <Archive className="w-4 h-4 mr-2" />
                                    Archive
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => {
                                      setTemplateToDelete(template);
                                      setDeleteDialogOpen(true);
                                    }}
                                    className="text-red-600"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Info Card */}
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-6">
                <h3 className="font-semibold text-blue-900 mb-2">About Templates</h3>
                <p className="text-sm text-blue-800">
                  Templates provide pre-configured report setups that you can use instantly. 
                  Create your own custom templates from the Report Builder using the "Save as Template" button.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{templateToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTemplateMutation.mutate(templateToDelete?.id)}
              disabled={deleteTemplateMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteTemplateMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </PermissionGuard>
  );
}