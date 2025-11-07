import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, differenceInHours } from "date-fns";
import { AlertCircle } from "lucide-react";

export default function DataGapsChart({ gaps }) {
  if (!gaps || gaps.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Data Gaps</CardTitle>
          <CardDescription>No data gaps detected in the last 7 days</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-3 bg-green-50 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-gray-600">All data points are present</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-orange-600" />
          Data Gaps Detected
        </CardTitle>
        <CardDescription>
          {gaps.length} gap{gaps.length !== 1 ? 's' : ''} found in the last 7 days
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {gaps.map((gap, idx) => {
            const duration = differenceInHours(
              new Date(gap.end_time),
              new Date(gap.start_time)
            );
            
            const severity = duration >= 24 ? 'critical' : duration >= 6 ? 'high' : 'medium';
            const severityColors = {
              critical: 'border-red-200 bg-red-50',
              high: 'border-orange-200 bg-orange-50',
              medium: 'border-yellow-200 bg-yellow-50'
            };

            return (
              <div
                key={idx}
                className={`p-4 border rounded-lg ${severityColors[severity]}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="font-medium text-gray-900">{gap.metric_name}</p>
                      <Badge variant={severity === 'critical' ? 'destructive' : 'outline'}>
                        {duration}h gap
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>
                        <strong>From:</strong> {format(new Date(gap.start_time), 'MMM d, h:mm a')}
                      </p>
                      <p>
                        <strong>To:</strong> {format(new Date(gap.end_time), 'MMM d, h:mm a')}
                      </p>
                      {gap.expected_records && (
                        <p>
                          <strong>Missing:</strong> {gap.expected_records} records
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}