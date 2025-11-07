import { useEffect } from 'react';
import { alertManager } from './AlertManager';
import { statusChecker } from './StatusChecker';
import { monitoringService } from './MonitoringService';
import { usePermissions } from '../auth/usePermissions';

/**
 * Monitoring Initializer Component
 * Starts monitoring services when app loads
 */
export default function MonitoringInitializer() {
  const { hasPermission } = usePermissions();

  useEffect(() => {
    // Only start monitoring for admin users (to reduce overhead)
    if (!hasPermission('admin')) return;

    // Start alert manager
    alertManager.start();

    // Start status checker
    statusChecker.start();

    // Track page performance
    if (window.performance) {
      const perfData = window.performance.timing;
      const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
      
      if (pageLoadTime > 0) {
        monitoringService.trackPageLoad(window.location.pathname, pageLoadTime);
      }
    }

    return () => {
      // Cleanup on unmount
      alertManager.stop();
      statusChecker.stop();
    };
  }, [hasPermission]);

  // Track route changes
  useEffect(() => {
    const startTime = Date.now();

    return () => {
      const duration = Date.now() - startTime;
      if (duration > 100) { // Only track if user spent time on page
        monitoringService.trackPageLoad(window.location.pathname, duration);
      }
    };
  }, [window.location.pathname]);

  return null; // This component doesn't render anything
}