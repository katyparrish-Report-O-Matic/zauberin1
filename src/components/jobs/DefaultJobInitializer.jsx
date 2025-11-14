import React, { useEffect } from 'react';
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * Default Job Initializer
 * Creates default scheduled jobs on first load if they don't exist
 */
export default function DefaultJobInitializer() {
  
  const { data: organizations = [] } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      return await base44.entities.Organization.list();
    },
    staleTime: 300000 // 5 minutes
  });

  const { data: existingJobs = [] } = useQuery({
    queryKey: ['scheduledJobs'],
    queryFn: async () => {
      return await base44.entities.ScheduledJob.list();
    },
    staleTime: 60000 // 1 minute
  });

  useEffect(() => {
    const initializeDefaultJobs = async () => {
      if (organizations.length === 0) return;

      for (const org of organizations) {
        try {
          // Check if daily transformation job exists for this org
          const transformJobExists = existingJobs.some(
            job => job.organization_id === org.id && job.job_type === 'data_transformation'
          );

          if (!transformJobExists) {
            console.log(`[JobInitializer] Creating daily transformation job for ${org.name}`);
            
            // Calculate next midnight
            const nextRun = new Date();
            nextRun.setDate(nextRun.getDate() + 1);
            nextRun.setHours(0, 0, 0, 0);

            await base44.entities.ScheduledJob.create({
              organization_id: org.id,
              job_name: `Daily Transformation - ${org.name}`,
              job_type: 'data_transformation',
              schedule: 'daily',
              configuration: {
                description: 'Automatically transforms yesterday\'s CallRecords into TransformedMetrics'
              },
              enabled: true,
              next_run: nextRun.toISOString()
            });

            console.log(`[JobInitializer] ✅ Created daily transformation job for ${org.name}`);
          }

          // Check if quality check job exists for this org
          const qualityJobExists = existingJobs.some(
            job => job.organization_id === org.id && job.job_type === 'quality_check'
          );

          if (!qualityJobExists) {
            console.log(`[JobInitializer] Creating quality check job for ${org.name}`);
            
            // Calculate next hour
            const nextRun = new Date();
            nextRun.setHours(nextRun.getHours() + 1, 0, 0, 0);

            await base44.entities.ScheduledJob.create({
              organization_id: org.id,
              job_name: `Quality Check - ${org.name}`,
              job_type: 'quality_check',
              schedule: 'hourly',
              configuration: {
                description: 'Checks for data quality issues in metrics and call records'
              },
              enabled: true,
              next_run: nextRun.toISOString()
            });

            console.log(`[JobInitializer] ✅ Created quality check job for ${org.name}`);
          }

          // Check if cleanup job exists for this org
          const cleanupJobExists = existingJobs.some(
            job => job.organization_id === org.id && job.job_type === 'data_cleanup'
          );

          if (!cleanupJobExists) {
            console.log(`[JobInitializer] Creating cleanup job for ${org.name}`);
            
            // Calculate next week
            const nextRun = new Date();
            nextRun.setDate(nextRun.getDate() + 7);
            nextRun.setHours(2, 0, 0, 0); // 2 AM

            await base44.entities.ScheduledJob.create({
              organization_id: org.id,
              job_name: `Weekly Cleanup - ${org.name}`,
              job_type: 'data_cleanup',
              schedule: 'weekly',
              configuration: {
                cleanup_days: 90,
                description: 'Cleans up old job execution logs older than 90 days'
              },
              enabled: true,
              next_run: nextRun.toISOString()
            });

            console.log(`[JobInitializer] ✅ Created cleanup job for ${org.name}`);
          }

        } catch (error) {
          console.error(`[JobInitializer] ❌ Failed to create jobs for ${org.name}:`, error);
        }
      }
    };

    if (organizations.length > 0 && existingJobs !== undefined) {
      initializeDefaultJobs();
    }
  }, [organizations, existingJobs]);

  return null; // This is a background service, no UI
}