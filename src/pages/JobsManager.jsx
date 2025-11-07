import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Clock, Play, CheckCircle, XCircle, Loader2, Plus } from "lucide-react";
import { backgroundJobService } from "../components/jobs/BackgroundJobService";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function JobsManager() {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newJob, setNewJob] = useState({
    job_name: '',
    job_type: 'data_fetch',
    schedule: 'hourly',
    configuration: {}
  });

  // Fetch jobs
  const { data: jobs } = useQuery({
    queryKey: ['scheduledJobs'],
    queryFn: () => base44.entities.ScheduledJob.list('-created_date'),
    initialData: []
  });

  // Fetch recent executions
  const { data: executions } = useQuery({
    queryKey: ['jobExecutions'],
    queryFn: () => base44.entities.JobExecution.list('-created_date', 20),
    initialData: [],
    refetchInterval: 30000 // Refresh every 30s
  });

  // Create job mutation
  const createJobMutation = useMutation({
    mutationFn: (jobData) => {
      const nextRun = new Date();
      if (jobData.schedule === 'hourly') nextRun.setHours(nextRun.getHours() + 1);
      else if (jobData.schedule === 'daily') nextRun.setDate(nextRun.getDate() + 1);
      else if (jobData.schedule === 'weekly') nextRun.setDate(nextRun.getDate() + 7);

      return base44.entities.ScheduledJob.create({
        ...jobData,
        enabled: true,
        next_run: jobData.schedule !== 'manual' ? nextRun.toISOString() : null
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduledJobs'] });
      toast.success('Job created');
      setShowCreateDialog(false);
      setNewJob({ job_name: '', job_type: 'data_fetch', schedule: 'hourly', configuration: {} });
    }
  });

  // Toggle job mutation
  const toggleJobMutation = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.ScheduledJob.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduledJobs'] });
      toast.success('Job updated');
    }
  });

  // Trigger job manually
  const triggerJobMutation = useMutation({
    mutationFn: (jobId) => backgroundJobService.triggerJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobExecutions'] });
      toast.success('Job triggered');
    }
  });

  const getJobTypeLabel = (type) => {
    const labels = {
      data_fetch: 'Data Fetch',
      report_generation: 'Report Generation',
      data_cleanup: 'Data Cleanup'
    };
    return labels[type] || type;
  };

  const getScheduleLabel = (schedule) => {
    const labels = {
      hourly: 'Every Hour',
      daily: 'Daily',
      weekly: 'Weekly',
      manual: 'Manual Only'
    };
    return labels[schedule] || schedule;
  };

  const handleCreateJob = () => {
    if (!newJob.job_name) {
      toast.error('Job name is required');
      return;
    }
    createJobMutation.mutate(newJob);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Background Jobs</h1>
              <p className="text-gray-600 mt-1">Manage scheduled data fetching, reports, and cleanup</p>
            </div>
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Create Job
            </Button>
          </div>

          {/* Jobs List */}
          <Card>
            <CardHeader>
              <CardTitle>Scheduled Jobs</CardTitle>
              <CardDescription>Configure automated background tasks</CardDescription>
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  No jobs configured. Create your first background job.
                </p>
              ) : (
                <div className="space-y-3">
                  {jobs.map(job => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-gray-900">{job.job_name}</h3>
                          <Badge variant="outline">{getJobTypeLabel(job.job_type)}</Badge>
                          <Badge variant="outline">{getScheduleLabel(job.schedule)}</Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                          {job.last_run && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Last: {format(new Date(job.last_run), "MMM d, h:mm a")}
                            </span>
                          )}
                          {job.next_run && job.enabled && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Next: {format(new Date(job.next_run), "MMM d, h:mm a")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => triggerJobMutation.mutate(job.id)}
                          disabled={triggerJobMutation.isPending}
                        >
                          <Play className="w-3 h-3 mr-1" />
                          Run Now
                        </Button>
                        <Switch
                          checked={job.enabled}
                          onCheckedChange={(enabled) => 
                            toggleJobMutation.mutate({ id: job.id, enabled })
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Executions */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Executions</CardTitle>
              <CardDescription>Last 20 job runs</CardDescription>
            </CardHeader>
            <CardContent>
              {executions.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No job executions yet</p>
              ) : (
                <div className="space-y-2">
                  {executions.map(execution => (
                    <div
                      key={execution.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <div className="flex items-center gap-3">
                        {execution.status === 'completed' && (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        )}
                        {execution.status === 'failed' && (
                          <XCircle className="w-5 h-5 text-red-600" />
                        )}
                        {execution.status === 'running' && (
                          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                        )}
                        <div>
                          <p className="font-medium text-sm text-gray-900">{execution.job_name}</p>
                          <p className="text-xs text-gray-500">
                            {format(new Date(execution.started_at), "MMM d, h:mm a")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        {execution.duration_ms && (
                          <span className="text-gray-600">{execution.duration_ms}ms</span>
                        )}
                        {execution.records_processed !== undefined && (
                          <span className="text-gray-600">{execution.records_processed} records</span>
                        )}
                        {execution.error_message && (
                          <span className="text-red-600 text-xs max-w-xs truncate">
                            {execution.error_message}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create Job Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Background Job</DialogTitle>
            <DialogDescription>
              Configure a new scheduled task
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="job-name">Job Name</Label>
              <Input
                id="job-name"
                placeholder="e.g., Hourly Sales Data Fetch"
                value={newJob.job_name}
                onChange={(e) => setNewJob({ ...newJob, job_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="job-type">Job Type</Label>
              <Select
                value={newJob.job_type}
                onValueChange={(value) => setNewJob({ ...newJob, job_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="data_fetch">Data Fetch</SelectItem>
                  <SelectItem value="report_generation">Report Generation</SelectItem>
                  <SelectItem value="data_cleanup">Data Cleanup</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule">Schedule</Label>
              <Select
                value={newJob.schedule}
                onValueChange={(value) => setNewJob({ ...newJob, schedule: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="manual">Manual Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateJob}>Create Job</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}