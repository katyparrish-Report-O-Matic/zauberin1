import React from 'react';
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export default function DataFreshnessIndicator({ organizationId, compact = true }) {
  const { data: dataSources, refetch } = useQuery({
    queryKey: ['dataSourcesFreshness', organizationId],
    queryFn: async () => {
      if (!organizationId || organizationId === 'all') return [];
      return await base44.entities.DataSource.filter({ organization_id: organizationId });
    },
    refetchInterval: 60000, // Refresh every minute
    initialData: []
  });

  if (!dataSources || dataSources.length === 0) {
    return null;
  }

  // Calculate overall freshness status
  const now = new Date();
  const freshnessStatus = dataSources.map(source => {
    if (!source.last_sync_at) {
      return { source, status: 'never', minutesAgo: Infinity };
    }

    const lastSync = new Date(source.last_sync_at);
    const minutesAgo = Math.floor((now - lastSync) / (1000 * 60));

    let status = 'fresh';
    if (minutesAgo > 60) status = 'stale';
    if (minutesAgo > 240) status = 'very_stale'; // 4 hours

    return { source, status, minutesAgo, lastSync };
  });

  const overallStatus = freshnessStatus.reduce((worst, current) => {
    if (current.status === 'never') return 'never';
    if (current.status === 'very_stale' && worst !== 'never') return 'very_stale';
    if (current.status === 'stale' && worst !== 'never' && worst !== 'very_stale') return 'stale';
    return worst;
  }, 'fresh');

  const getStatusConfig = (status) => {
    switch (status) {
      case 'fresh':
        return {
          icon: CheckCircle,
          color: 'bg-green-600',
          textColor: 'text-green-700',
          label: 'Data Fresh',
          description: 'All data sources synced recently'
        };
      case 'stale':
        return {
          icon: Clock,
          color: 'bg-yellow-600',
          textColor: 'text-yellow-700',
          label: 'Data Aging',
          description: 'Some data sources need refresh'
        };
      case 'very_stale':
      case 'never':
        return {
          icon: AlertTriangle,
          color: 'bg-red-600',
          textColor: 'text-red-700',
          label: 'Data Stale',
          description: 'Data sources need sync'
        };
      default:
        return {
          icon: Clock,
          color: 'bg-gray-600',
          textColor: 'text-gray-700',
          label: 'Unknown',
          description: 'Unable to determine freshness'
        };
    }
  };

  const config = getStatusConfig(overallStatus);
  const Icon = config.icon;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Icon className="w-4 h-4" />
          <Badge className={config.color + " text-white"}>{config.label}</Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-3">
          <div>
            <h4 className="font-semibold text-sm">Data Freshness</h4>
            <p className="text-xs text-gray-600 mt-1">{config.description}</p>
          </div>
          <div className="space-y-2">
            {freshnessStatus.map(({ source, status, minutesAgo, lastSync }) => {
              const sourceConfig = getStatusConfig(status);
              const SourceIcon = sourceConfig.icon;
              
              return (
                <div key={source.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <SourceIcon className={`w-3 h-3 ${sourceConfig.textColor}`} />
                    <span className="font-medium">{source.name}</span>
                  </div>
                  <span className="text-gray-600">
                    {lastSync ? formatDistanceToNow(lastSync, { addSuffix: true }) : 'Never synced'}
                  </span>
                </div>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={() => refetch()}
          >
            <RefreshCw className="w-3 h-3" />
            Check Now
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}