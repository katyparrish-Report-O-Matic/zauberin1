import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Download, Share2, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import ReportCanvas from "../components/report/ReportCanvas";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function BookViewer() {
  const navigate = useNavigate();
  const [currentReportIndex, setCurrentReportIndex] = useState(0);

  // Get book ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const bookId = urlParams.get('bookId');

  // Fetch book
  const { data: book, isLoading: bookLoading } = useQuery({
    queryKey: ['reportBook', bookId],
    queryFn: async () => {
      const books = await base44.entities.ReportBook.list();
      return books.find(b => b.id === bookId);
    },
    enabled: !!bookId
  });

  // Fetch all reports and templates data
  const { data: savedReports } = useQuery({
    queryKey: ['reportRequests', book?.organization_id],
    queryFn: async () => {
      if (!book?.organization_id) return [];
      return await base44.entities.ReportRequest.filter(
        { organization_id: book.organization_id }
      );
    },
    enabled: !!book?.organization_id,
    initialData: []
  });

  const { data: templates } = useQuery({
    queryKey: ['reportTemplates', book?.organization_id],
    queryFn: async () => {
      if (!book?.organization_id) return [];
      return await base44.entities.ReportTemplate.list();
    },
    enabled: !!book?.organization_id,
    initialData: []
  });

  const currentReport = book?.reports?.[currentReportIndex];

  const getReportData = () => {
    if (!currentReport) return null;

    if (currentReport.report_id) {
      const savedReport = savedReports.find(r => r.id === currentReport.report_id);
      
      // Override saved report's date range and accounts with book's settings
      const configuration = {
        ...savedReport?.configuration,
        date_range: book.date_range ? {
          from: book.date_range.from,
          to: book.date_range.to,
          period: 'custom',
          granularity: savedReport?.configuration?.date_range?.granularity || 'daily'
        } : savedReport?.configuration?.date_range,
        account_ids: book.account_ids && book.account_ids.length > 0 ? book.account_ids : null
      };

      return {
        title: savedReport?.title || 'Report',
        configuration,
        notes: currentReport.notes
      };
    }

    if (currentReport.template_id) {
      const template = templates.find(t => t.id === currentReport.template_id);
      
      // Apply book's date range and accounts to template
      return {
        title: template?.name || 'Template Report',
        configuration: {
          chart_type: template?.chart_settings?.chart_type || 'bar',
          metrics: template?.metric_configs?.map(m => m.metric_name) || [],
          segment_by: template?.chart_settings?.segment_by || [],
          date_range: book.date_range ? {
            from: book.date_range.from,
            to: book.date_range.to,
            period: 'custom',
            granularity: template?.chart_settings?.date_range?.granularity || 'daily'
          } : template?.chart_settings?.date_range,
          account_ids: book.account_ids && book.account_ids.length > 0 ? book.account_ids : null
        },
        notes: currentReport.notes
      };
    }

    return null;
  };

  // Generate mock data for the current report using book's date range
  const generateMockDataForReport = (config) => {
    if (!config || !book?.date_range?.from) return null;

    const startDate = new Date(book.date_range.from);
    const endDate = book.date_range.to ? new Date(book.date_range.to) : new Date();
    
    // Calculate number of days
    const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const days = Math.min(daysDiff, 90); // Cap at 90 days for display

    const hasSegmentation = config.segment_by && config.segment_by.length > 0;
    const branches = ['North Branch', 'South Branch', 'East Branch', 'West Branch'];
    const regions = ['North America', 'Europe', 'Asia Pacific'];

    if (config.chart_type === 'pie' && hasSegmentation) {
      const segmentDimension = config.segment_by[0];
      const categories = segmentDimension === 'branch' ? branches : 
                        segmentDimension === 'region' ? regions :
                        ['Category A', 'Category B', 'Category C', 'Category D'];
      
      return categories.map(name => ({
        name,
        value: Math.floor(Math.random() * 5000) + 1000
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
      const data = [];
      const segments = config.segment_by.includes('branch') ? branches : regions;
      
      for (let i = 0; i < Math.min(days, 10); i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        
        segments.forEach(segment => {
          data.push({
            date: date.toISOString().split('T')[0],
            [config.segment_by[0]]: segment,
            ...(config.metrics?.reduce((acc, metric) => ({
              ...acc,
              [metric]: Math.floor(Math.random() * 500) + 100
            }), {}) || { value: Math.floor(Math.random() * 500) + 100 })
          });
        });
      }
      
      return data;
    }

    if (hasSegmentation && (config.chart_type === 'line' || config.chart_type === 'bar')) {
      const data = [];
      const segments = config.segment_by.includes('branch') ? branches : 
                      config.segment_by.includes('region') ? regions : ['Group A', 'Group B'];
      
      for (let i = 0; i < days; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        
        const row = { date: dateStr };
        segments.forEach(segment => {
          row[segment] = Math.floor(Math.random() * 300) + 100;
        });
        
        data.push(row);
      }
      
      return data;
    }

    // Default time series data
    const data = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      
      data.push({
        date: date.toISOString().split('T')[0],
        ...(config.metrics?.reduce((acc, metric) => ({
          ...acc,
          [metric]: Math.floor(Math.random() * 500) + 100
        }), {}) || { value: Math.floor(Math.random() * 500) + 100 })
      });
    }
    
    return data;
  };

  const handleNext = () => {
    if (currentReportIndex < (book?.reports?.length || 0) - 1) {
      setCurrentReportIndex(currentReportIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentReportIndex > 0) {
      setCurrentReportIndex(currentReportIndex - 1);
    }
  };

  const handleDownloadBook = () => {
    toast.info('PDF download coming soon');
  };

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
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

  const getAccountsDisplay = () => {
    if (!book.account_names || book.account_names.length === 0) {
      return 'All Accounts';
    }
    return book.account_names.join(', ');
  };

  if (bookLoading) {
    return <div className="p-8 text-center">Loading book...</div>;
  }

  if (!book) {
    return <div className="p-8 text-center">Book not found</div>;
  }

  const reportData = getReportData();
  const mockData = reportData ? generateMockDataForReport(reportData.configuration) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Book Cover */}
          <Card className="overflow-hidden">
            <div className={`h-48 bg-gradient-to-br ${getCoverColorClass(book.cover_color)} flex items-center justify-center relative`}>
              <div className="text-center text-white">
                <BookOpen className="w-20 h-20 mx-auto mb-4 opacity-90" />
                <h1 className="text-4xl font-bold">{book.title}</h1>
                {book.description && (
                  <p className="mt-2 text-lg opacity-90">{book.description}</p>
                )}
              </div>
              <div className="absolute top-4 right-4 flex gap-2">
                <Button variant="secondary" onClick={handleShare} className="gap-2">
                  <Share2 className="w-4 h-4" />
                  Share
                </Button>
                <Button variant="secondary" onClick={handleDownloadBook} className="gap-2">
                  <Download className="w-4 h-4" />
                  Download PDF
                </Button>
              </div>
            </div>
            <CardContent className="p-6">
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                <div>
                  <span className="font-medium">Accounts:</span> {getAccountsDisplay()}
                </div>
                {book.date_range?.from && (
                  <div className="flex items-center gap-1">
                    <CalendarIcon className="w-4 h-4" />
                    <span>
                      {format(new Date(book.date_range.from), "MMM d, yyyy")}
                      {book.date_range.to && ` - ${format(new Date(book.date_range.to), "MMM d, yyyy")}`}
                    </span>
                  </div>
                )}
                <div>
                  <span className="font-medium">Reports:</span> {book.reports?.length || 0}
                </div>
                <Badge className={book.status === 'published' ? 'bg-green-600' : 'bg-yellow-600'}>
                  {book.status}
                </Badge>
              </div>
              {book.account_names && book.account_names.length > 1 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {book.account_names.map((name, idx) => (
                    <Badge key={idx} variant="outline">
                      {name}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Navigation */}
          {book.reports && book.reports.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={handlePrevious}
                    disabled={currentReportIndex === 0}
                    className="gap-2"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </Button>
                  
                  <div className="text-center">
                    <p className="text-sm text-gray-600">
                      Report {currentReportIndex + 1} of {book.reports.length}
                    </p>
                    {reportData && (
                      <p className="font-medium">{reportData.title}</p>
                    )}
                  </div>
                  
                  <Button
                    variant="outline"
                    onClick={handleNext}
                    disabled={currentReportIndex === book.reports.length - 1}
                    className="gap-2"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Current Report Display */}
          {reportData ? (
            <div className="space-y-4">
              {reportData.notes && (
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="p-4">
                    <p className="text-sm text-blue-900">{reportData.notes}</p>
                  </CardContent>
                </Card>
              )}
              
              <Card>
                <CardHeader>
                  <CardTitle>{reportData.title}</CardTitle>
                  <CardDescription>
                    {getAccountsDisplay()}
                    {book.date_range?.from && (
                      <span className="ml-4">
                        {format(new Date(book.date_range.from), "MMM d, yyyy")}
                        {book.date_range.to && ` - ${format(new Date(book.date_range.to), "MMM d, yyyy")}`}
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ReportCanvas 
                    config={reportData.configuration}
                    data={mockData}
                  />
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <BookOpen className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600">No reports in this book yet</p>
              </CardContent>
            </Card>
          )}

          {/* Table of Contents */}
          <Card>
            <CardHeader>
              <CardTitle>Table of Contents</CardTitle>
              <CardDescription>Jump to any section</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {book.reports?.map((report, index) => {
                  const isActive = index === currentReportIndex;
                  const reportName = report.report_id
                    ? savedReports.find(r => r.id === report.report_id)?.title
                    : templates.find(t => t.id === report.template_id)?.name;
                  
                  return (
                    <button
                      key={index}
                      onClick={() => setCurrentReportIndex(index)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-blue-100 border-2 border-blue-500'
                          : 'hover:bg-gray-100 border-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-500">#{index + 1}</span>
                        <div className="flex-1">
                          <p className="font-medium">{reportName || 'Report'}</p>
                          {report.notes && (
                            <p className="text-sm text-gray-600">{report.notes}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}