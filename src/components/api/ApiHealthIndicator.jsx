import React, { useEffect, useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { apiService } from "./ApiService";
import { CheckCircle, AlertTriangle, XCircle, Activity, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";

export default function ApiHealthIndicator() {
  const [isChecking, setIsChecking] = useState(false);

  // Fetch health status
  const { data: healthStatus, refetch } = useQuery({
    queryKey: ['apiHealth'],
    queryFn: () => apiService.getHealthStatus(),
    refetchInterval: 60000, // Refetch every minute
    initialData: { status: 'unknown' }
  });

  const handleManualCheck = async () => {
    setIsChecking(true);
    await apiService.performHealthCheck();
    await refetch();
    setIsChecking(false);
  };

  const statusConfig = {
    healthy: {
      icon: CheckCircle,
      text: "API Healthy",
      color: "text-green-600",
      bg: "bg-green-50",
      border: "border-green-200",
      description: "All systems operational"
    },
    degraded: {
      icon: AlertTriangle,
      text: "API Slow",
      color: "text-yellow-600",
      bg: "bg-yellow-50",
      border: "border-yellow-200",
      description: "API responding slowly"
    },
    down: {
      icon: XCircle,
      text: "API Down",
      color: "text-red-600",
      bg: "bg-red-50",
      border: "border-red-200",
      description: "Cannot connect to API"
    },
    unknown: {
      icon: Activity,
      text: "Status Unknown",
      color: "text-gray-500",
      bg: "bg-gray-50",
      border: "border-gray-200",
      description: "No health checks performed"
    }
  };

  const config = statusConfig[healthStatus.status] || statusConfig.unknown;
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
          <span className="hidden sm:inline">{config.text}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-sm mb-1">API Health Status</h4>
            <p className="text-sm text-gray-600">{config.description}</p>
          </div>

          {healthStatus.last_checked && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Last Checked:</span>
                <span className="font-medium">
                  {format(new Date(healthStatus.last_checked), "MMM d, h:mm a")}
                </span>
              </div>
              {healthStatus.response_time_ms && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Response Time:</span>
                  <span className="font-medium">{healthStatus.response_time_ms}ms</span>
                </div>
              )}
              {healthStatus.consecutive_failures > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Failed Attempts:</span>
                  <span className="font-medium text-red-600">
                    {healthStatus.consecutive_failures}
                  </span>
                </div>
              )}
              {healthStatus.error_message && (
                <div className="pt-2 border-t">
                  <span className="text-gray-600">Error:</span>
                  <p className="text-xs text-red-600 mt-1">{healthStatus.error_message}</p>
                </div>
              )}
            </div>
          )}

          <Button
            onClick={handleManualCheck}
            disabled={isChecking}
            variant="outline"
            size="sm"
            className="w-full gap-2"
          >
            {isChecking ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3" />
                Check Now
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}