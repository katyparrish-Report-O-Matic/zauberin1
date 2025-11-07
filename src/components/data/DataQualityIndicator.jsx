import React from 'react';
import { useQuery } from "@tanstack/react-query";
import { dataTransformationService } from "./DataTransformationService";
import { AlertTriangle, CheckCircle, XCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

export default function DataQualityIndicator() {
  const { data: qualityIssues } = useQuery({
    queryKey: ['dataQualityIssues'],
    queryFn: () => dataTransformationService.getQualityIssues(10),
    refetchInterval: 60000,
    initialData: []
  });

  const criticalIssues = qualityIssues.filter(i => i.severity === 'critical');
  const highIssues = qualityIssues.filter(i => i.severity === 'high');
  const totalIssues = qualityIssues.length;

  if (totalIssues === 0) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-green-700 text-sm">
        <CheckCircle className="w-4 h-4" />
        <span className="hidden sm:inline">Data Quality: Good</span>
      </div>
    );
  }

  const getSeverityConfig = (severity) => {
    const configs = {
      critical: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
      high: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
      medium: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
      low: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' }
    };
    return configs[severity] || configs.low;
  };

  const overallSeverity = criticalIssues.length > 0 ? 'critical' : highIssues.length > 0 ? 'high' : 'medium';
  const config = getSeverityConfig(overallSeverity);
  const Icon = config.icon;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors hover:opacity-80",
            config.bg,
            config.border,
            config.color
          )}
        >
          <Icon className="w-4 h-4" />
          <span className="hidden sm:inline">{totalIssues} Data Issue{totalIssues !== 1 ? 's' : ''}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-sm mb-1">Data Quality Issues</h4>
            <p className="text-xs text-gray-600">
              {totalIssues} unresolved issue{totalIssues !== 1 ? 's' : ''} detected
            </p>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {qualityIssues.map((issue, idx) => {
              const issueConfig = getSeverityConfig(issue.severity);
              const IssueIcon = issueConfig.icon;
              
              return (
                <div
                  key={idx}
                  className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1">
                      <IssueIcon className={cn("w-4 h-4 mt-0.5", issueConfig.color)} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900">{issue.metric_name}</p>
                        <p className="text-xs text-gray-600 mt-0.5">{issue.description}</p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs capitalize",
                        issueConfig.color,
                        issueConfig.border
                      )}
                    >
                      {issue.severity}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>Type: {issue.issue_type.replace('_', ' ')}</span>
                    {issue.affected_records && (
                      <span>• {issue.affected_records} records</span>
                    )}
                    {issue.auto_fixed && (
                      <span className="text-green-600">• Auto-fixed</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {totalIssues > 10 && (
            <p className="text-xs text-gray-500 text-center">
              Showing 10 most recent issues
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}