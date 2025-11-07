import React, { useEffect } from 'react';
import { backgroundJobService } from './BackgroundJobService';

/**
 * Job Scheduler Component
 * Polls and executes background jobs
 */
export default function JobScheduler() {
  useEffect(() => {
    console.log('[JobScheduler] Starting background job scheduler');

    // Check jobs every 5 minutes
    const interval = setInterval(() => {
      backgroundJobService.checkAndExecuteJobs();
    }, 5 * 60 * 1000);

    // Run immediately on mount
    backgroundJobService.checkAndExecuteJobs();

    return () => {
      console.log('[JobScheduler] Stopping background job scheduler');
      clearInterval(interval);
    };
  }, []);

  return null; // This component doesn't render anything
}