import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Download, Mail, Trash2, FileBarChart } from "lucide-react";
import { format } from 'date-fns';
import AccountSelector from "../books/AccountSelector";

export default function SavedReportsList({ 
  reports, 
  onLoadReport, 
  onDeleteReport, 
  onEmailReport, 
  onDownloadPDF,
  canDelete,
  organizationId
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');

  if (!reports || reports.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Saved Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 text-center py-4">
            No saved reports yet. Generate and save your first report!
          </p>
        </CardContent>
      </Card>
    );
  }

  const filteredReports = reports.filter(report => {
    const matchesSearch = !searchQuery || 
      report.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesAccount = accountFilter === 'all' || 
      report.configuration?.filters?.account === accountFilter;
    
    return matchesSearch && matchesAccount;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved Reports ({reports.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <Input
            placeholder="Search reports..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full"
          />
          
          <AccountSelector
            organizationId={organizationId}
            value={accountFilter}
            onChange={setAccountFilter}
            showLabel={false}
          />
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredReports.map(report => (
            <div
              key={report.id}
              className="group p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer"
              onClick={() => onLoadReport(report)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm text-gray-900 truncate">
                    {report.title}
                  </h3>
                  {report.description && (
                    <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                      {report.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <span>{format(new Date(report.created_date), 'MMM d, yyyy')}</span>
                    {report.configuration?.chart_type && (
                      <>
                        <span>•</span>
                        <span className="capitalize">{report.configuration.chart_type}</span>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownloadPDF(report);
                    }}
                    className="h-8 w-8 p-0"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEmailReport(report);
                    }}
                    className="h-8 w-8 p-0"
                  >
                    <Mail className="w-4 h-4" />
                  </Button>
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteReport(report.id);
                      }}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {filteredReports.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              No reports match your filters
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}