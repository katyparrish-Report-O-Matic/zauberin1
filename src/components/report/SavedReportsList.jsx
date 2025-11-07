
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Trash2, Share2 } from "lucide-react";
import { format } from "date-fns";

export default function SavedReportsList({ reports, onLoadReport, onDeleteReport, onShareReport, canDelete = true }) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Saved Reports</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {reports.map(report => (
            <div
              key={report.id}
              className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <button
                onClick={() => onLoadReport(report)}
                className="flex-1 text-left"
              >
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm text-gray-900">{report.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{report.description}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {format(new Date(report.created_date), "MMM dd, yyyy")}
                    </p>
                  </div>
                </div>
              </button>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onShareReport(report)}
                >
                  <Share2 className="w-3.5 h-3.5" />
                </Button>
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-600 hover:text-red-700"
                    onClick={() => onDeleteReport(report.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
