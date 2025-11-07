import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Trash2, Search, Plus, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function SavedReportsSidebar({ 
  organizationId, 
  onLoadReport, 
  onCreateNew,
  currentReportId 
}) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch saved reports
  const { data: savedReports, isLoading } = useQuery({
    queryKey: ['savedReports', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      return await base44.entities.ReportRequest.filter(
        { organization_id: organizationId },
        '-created_date',
        50
      );
    },
    enabled: !!organizationId,
    initialData: []
  });

  // Delete report mutation
  const deleteReportMutation = useMutation({
    mutationFn: (id) => base44.entities.ReportRequest.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savedReports'] });
      toast.success('Report deleted');
    },
    onError: () => {
      toast.error('Failed to delete report');
    }
  });

  // Filter reports by search
  const filteredReports = savedReports.filter(report =>
    report.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    report.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Card className="h-[calc(100vh-12rem)] flex flex-col">
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between mb-3">
          <CardTitle className="text-base">Saved Reports</CardTitle>
          <Button
            size="sm"
            onClick={onCreateNew}
            className="gap-2 bg-teal-600 hover:bg-teal-700"
          >
            <Plus className="w-4 h-4" />
            New
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search reports..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-y-auto p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <FileText className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-sm text-gray-600 mb-1">
              {searchQuery ? 'No reports found' : 'No saved reports yet'}
            </p>
            <p className="text-xs text-gray-500">
              {searchQuery ? 'Try a different search term' : 'Create your first report to get started'}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredReports.map(report => (
              <div
                key={report.id}
                className={cn(
                  "group hover:bg-gray-50 transition-colors cursor-pointer",
                  currentReportId === report.id && "bg-teal-50 border-l-4 border-teal-600"
                )}
              >
                <div
                  onClick={() => onLoadReport(report)}
                  className="p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <h3 className="font-medium text-sm text-gray-900 truncate">
                          {report.title}
                        </h3>
                      </div>
                      {report.description && (
                        <p className="text-xs text-gray-500 line-clamp-2 mb-2">
                          {report.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-400">
                        {format(new Date(report.created_date), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Delete this report?')) {
                          deleteReportMutation.mutate(report.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      
      {filteredReports.length > 0 && (
        <div className="p-3 border-t bg-gray-50 text-center text-xs text-gray-500">
          {filteredReports.length} report{filteredReports.length !== 1 ? 's' : ''}
        </div>
      )}
    </Card>
  );
}