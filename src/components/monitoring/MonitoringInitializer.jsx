import React, { useEffect } from 'react';
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { environmentConfig } from "../config/EnvironmentConfig";
import { productionApiService } from "../api/ProductionApiService";
import { usePermissions } from "../auth/usePermissions";

/**
 * Monitoring Initializer Component
 * Runs health checks and monitoring tasks on app load
 */
export default function MonitoringInitializer() {
  const { currentUser } = usePermissions();

  // Check API health on mount
  useEffect(() => {
    if (!currentUser?.organization_id) return;

    const initMonitoring = async () => {
      try {
        environmentConfig.log('info', '[Monitoring] Initializing system monitoring');

        // Check API health
        const apiHealth = await productionApiService.checkApiHealth(currentUser.organization_id);
        
        if (!apiHealth.healthy) {
          environmentConfig.log('warn', '[Monitoring] API health check failed:', apiHealth.error);
        } else {
          environmentConfig.log('info', '[Monitoring] API health check passed');
        }

        // Prefetch dashboard data in background
        if (environmentConfig.get('features').analytics) {
          productionApiService.prefetchDashboardData(currentUser.organization_id).catch(err => {
            environmentConfig.log('warn', '[Monitoring] Prefetch failed:', err);
          });
        }

      } catch (error) {
        environmentConfig.log('error', '[Monitoring] Initialization error:', error);
      }
    };

    initMonitoring();
  }, [currentUser?.organization_id]);

  // Periodic health check
  useQuery({
    queryKey: ['systemHealth', currentUser?.organization_id],
    queryFn: async () => {
      if (!currentUser?.organization_id) return null;
      
      const health = await productionApiService.checkApiHealth(currentUser.organization_id);
      
      if (!health.healthy) {
        environmentConfig.log('warn', '[Monitoring] Periodic health check failed');
      }
      
      return health;
    },
    refetchInterval: 5 * 60 * 1000, // Check every 5 minutes
    enabled: !!currentUser?.organization_id && environmentConfig.isMonitoringEnabled()
  });

  return null; // This component doesn't render anything
}