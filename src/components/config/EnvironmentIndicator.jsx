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

  const environment = environmentConfig.getEnvironment();
  const environmentName = environmentConfig.getEnvironmentName();
  const config = environmentConfig.getConfig();
  const warning = environmentConfig.getEnvironmentWarning();

  // Don't show in production unless admin
  if (environment === 'production' && !hasPermission('admin')) {
    return null;
  }

  const handleSwitchEnvironment = (newEnv) => {
    if (confirm(`Switch to ${newEnv} environment? This will reload the page.`)) {
      environmentConfig.switchEnvironment(newEnv);
    }
  };

  return (
    <Popover open={showDetails} onOpenChange={setShowDetails}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium text-white transition-all hover:opacity-90",
            environmentConfig.getEnvironmentColor()
          )}
        >
          <Settings className="w-3 h-3 animate-spin" style={{ animationDuration: '3s' }} />
          <span>{environmentName}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-sm mb-1">Environment Configuration</h4>
            <p className="text-xs text-gray-600">
              Current: <span className="font-mono">{environment}</span>
            </p>
          </div>

          {warning && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
              <p className="text-xs text-yellow-800">{warning}</p>
            </div>
          )}

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
            <h5 className="font-semibold text-xs text-gray-700">API Configuration</h5>
            <div className="p-2 bg-gray-50 rounded text-xs">
              <p className="text-gray-600">Base URL</p>
              <p className="font-mono text-xs break-all">{config.apiBaseUrl}</p>
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

          {hasPermission('admin') && (
            <div className="space-y-2 pt-2 border-t">
              <h5 className="font-semibold text-xs text-gray-700">Switch Environment</h5>
              <div className="grid grid-cols-3 gap-2">
                {environmentConfig.getAvailableEnvironments().map(env => (
                  <Button
                    key={env.key}
                    variant={env.current ? "default" : "outline"}
                    size="sm"
                    onClick={() => !env.current && handleSwitchEnvironment(env.key)}
                    disabled={env.current}
                    className="text-xs"
                  >
                    {env.name}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-gray-500">
                Switching will reload the page
              </p>
            </div>
          )}

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