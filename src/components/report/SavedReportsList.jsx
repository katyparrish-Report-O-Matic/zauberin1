import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Trash2, Mail, Download } from "lucide-react";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function SavedReportsList({ 
  reports, 
  onLoadReport, 
  onDeleteReport, 
  onEmailReport,
  onDownloadPDF,
  canDelete = true,
  accounts = []
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');

  if (!reports || reports.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saved Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 text-center py-6">
            No saved reports yet. Create and save your first report!
          </p>
        </CardContent>
      </Card>
    );
  }

  // Filter reports
  const filteredReports = reports.filter(report => {
    const matchesSearch = !searchQuery || 
      report.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesAccount = accountFilter === 'all' || report.account === accountFilter;
    
    return matchesSearch && matchesAccount;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Saved Reports ({filteredReports.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Search and Filter */}
        <div className="space-y-2">
          <Input
            placeholder="Search reports..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-sm"
          />
          
          {accounts.length > 0 && (
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Filter by account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {accounts.map(account => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Reports List */}
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {filteredReports.map(report => {
            const accountName = accounts.find(a => a.id === report.account)?.name;
            
            return (
              <div
                key={report.id}
                className="border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
              >
                <button
                  onClick={() => onLoadReport(report)}
                  className="w-full p-3 text-left"
                >
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900">{report.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{report.description}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <p className="text-xs text-gray-400">
                          {format(new Date(report.created_date), "MMM dd, yyyy")}
                        </p>
                        {accountName && (
                          <Badge variant="outline" className="text-xs">
                            {accountName}
                          </Badge>
                        )}
                        {report.configuration?.chart_type && (
                          <Badge variant="secondary" className="text-xs">
                            {report.configuration.chart_type}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
                
                <div className="flex gap-1 px-3 pb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => onDownloadPDF(report)}
                  >
                    <Download className="w-3 h-3" />
                    PDF
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => onEmailReport(report)}
                  >
                    <Mail className="w-3 h-3" />
                    Email
                  </Button>
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => onDeleteReport(report.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        
        {filteredReports.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">
            No reports match your filters
          </p>
        )}
      </CardContent>
    </Card>
  );
}