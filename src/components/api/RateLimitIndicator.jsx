import React from 'react';
import { useQuery } from "@tanstack/react-query";
import { apiService } from "./ApiService";
import { Activity, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { usePermissions } from "../auth/usePermissions";

export default function RateLimitIndicator() {
  const { currentUser } = usePermissions();

  const { data: rateLimitStatus } = useQuery({
    queryKey: ['rateLimitStatus', currentUser?.organization_id],
    queryFn: () => apiService.getRateLimitStatus(currentUser?.organization_id),
    refetchInterval: 30000, // Refresh every 30s
    initialData: [],
    enabled: !!currentUser?.organization_id
  });

  // Ensure rateLimitStatus is always an array
  const apiConfigs = Array.isArray(rateLimitStatus) ? rateLimitStatus : [];

  if (apiConfigs.length === 0) {
    return null;
  }

  // Get overall status
  const hasWarning = apiConfigs.some(api => api.status === 'warning');
  const hasCritical = apiConfigs.some(api => api.status === 'critical');
  
  const overallStatus = hasCritical ? 'critical' : hasWarning ? 'warning' : 'healthy';
  
  const statusConfig = {
    healthy: {
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-50',
      border: 'border-green-200'
    },
    warning: {
      icon: AlertTriangle,
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
      border: 'border-yellow-200'
    },
    critical: {
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-200'
    }
  };

  const config = statusConfig[overallStatus];
  const Icon = config.icon;

  // Calculate total usage across all APIs
  const totalUsed = apiConfigs.reduce((sum, api) => sum + api.used, 0);
  const totalLimit = apiConfigs.reduce((sum, api) => sum + (api.total || 0), 0);

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
          <Activity className="w-4 h-4" />
          <span className="hidden sm:inline">
            {totalLimit > 0 ? `${totalUsed}/${totalLimit}` : `${totalUsed} calls`}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-sm mb-1">API Rate Limits</h4>
            <p className="text-xs text-gray-600">
              {apiConfigs.length} API{apiConfigs.length !== 1 ? 's' : ''} configured
            </p>
          </div>

          <div className="space-y-3">
            {apiConfigs.map((api, idx) => {
              const apiConfig = statusConfig[api.status];
              const ApiIcon = apiConfig.icon;

              return (
                <div
                  key={idx}
                  className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ApiIcon className={cn("w-4 h-4", apiConfig.color)} />
                      <span className="font-medium text-sm">{api.name}</span>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs capitalize",
                        apiConfig.color,
                        apiConfig.border
                      )}
                    >
                      {api.status}
                    </Badge>
                  </div>

                  {api.total && (
                    <>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-gray-600">
                          <span>Usage</span>
                          <span className="font-medium">
                            {api.used} / {api.total} ({api.percentage}%)
                          </span>
                        </div>
                        <Progress value={api.percentage} className="h-2" />
                      </div>

                      {api.remaining !== null && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-600">Remaining</span>
                          <span className={cn(
                            "font-medium",
                            api.remaining < 50 ? "text-red-600" : "text-gray-900"
                          )}>
                            {api.remaining} requests
                          </span>
                        </div>
                      )}

                      {api.resetAt && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-600">Resets at</span>
                          <span className="font-medium">
                            {format(new Date(api.resetAt), "h:mm a")}
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {!api.total && (
                    <p className="text-xs text-gray-500">
                      {api.used} requests (no limit configured)
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {hasCritical && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-800">
                <strong>Warning:</strong> One or more APIs are approaching rate limits. 
                Requests may be delayed or queued.
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}