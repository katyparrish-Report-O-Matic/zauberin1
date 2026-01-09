import React, { useState } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Settings, AlertTriangle } from "lucide-react";
import { environmentConfig } from "./EnvironmentConfig";
import { usePermissions } from "../auth/usePermissions";
import { cn } from "@/lib/utils";

export default function EnvironmentIndicator() {
  const { hasPermission } = usePermissions();
  const [showDetails, setShowDetails] = useState(false);

  const config = environmentConfig.getConfig();

  if (!hasPermission('admin')) {
    return null;
  }

  return (
    <Popover open={showDetails} onOpenChange={setShowDetails}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium text-white transition-all hover:opacity-90 bg-green-600">
          <Settings className="w-3 h-3" />
          <span>Config</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-sm mb-1">Configuration</h4>
          </div>

          <div className="space-y-2">
            <h5 className="font-semibold text-xs text-gray-700">Settings</h5>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-gray-50 rounded">
                <p className="text-gray-600">Mock Data</p>
                <p className="font-medium">{config.useMockData ? 'Enabled' : 'Disabled'}</p>
              </div>
              <div className="p-2 bg-gray-50 rounded">
                <p className="text-gray-600">Debug Mode</p>
                <p className="font-medium">{config.enableDebugMode ? 'On' : 'Off'}</p>
              </div>
              <div className="p-2 bg-gray-50 rounded">
                <p className="text-gray-600">Log Level</p>
                <p className="font-medium capitalize">{config.monitoring.logLevel}</p>
              </div>
              <div className="p-2 bg-gray-50 rounded">
                <p className="text-gray-600">Cache TTL</p>
                <p className="font-medium">{config.cacheTTL.query}s</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h5 className="font-semibold text-xs text-gray-700">Rate Limits</h5>
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">API Calls/Hour</span>
                <span className="font-medium">{config.rateLimits.apiCallsPerHour}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Reports/Day</span>
                <span className="font-medium">{config.rateLimits.reportsPerDay}</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const exported = environmentConfig.exportConfig();
                console.log('Environment Config:', exported);
                navigator.clipboard.writeText(JSON.stringify(exported, null, 2));
              }}
              className="w-full text-xs"
            >
              Copy Config to Clipboard
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}