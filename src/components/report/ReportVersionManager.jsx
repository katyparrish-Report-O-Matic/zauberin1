import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, RotateCcw, Eye } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ReportVersionManager({ reportId, currentConfig, onRestore, compact = true }) {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState(null);

  // Fetch versions for this report
  const { data: versions } = useQuery({
    queryKey: ['reportVersions', reportId],
    queryFn: async () => {
      if (!reportId) return [];
      return await base44.entities.ReportVersion.filter(
        { report_request_id: reportId },
        '-version_number'
      );
    },
    enabled: !!reportId,
    initialData: []
  });

  // Create new version
  const createVersionMutation = useMutation({
    mutationFn: async ({ reportId, config, changeSummary, organizationId }) => {
      // Mark all previous versions as not current
      for (const version of versions) {
        if (version.is_current) {
          await base44.entities.ReportVersion.update(version.id, { is_current: false });
        }
      }

      // Create new version
      const nextVersion = versions.length > 0 ? Math.max(...versions.map(v => v.version_number)) + 1 : 1;
      
      return await base44.entities.ReportVersion.create({
        organization_id: organizationId,
        report_request_id: reportId,
        version_number: nextVersion,
        configuration_snapshot: config,
        change_summary: changeSummary || 'Configuration updated',
        changed_fields: detectChanges(versions[0]?.configuration_snapshot, config),
        is_current: true
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportVersions'] });
      toast.success('Version saved');
    }
  });

  // Restore version
  const restoreVersionMutation = useMutation({
    mutationFn: async (version) => {
      // Mark as current
      for (const v of versions) {
        await base44.entities.ReportVersion.update(v.id, { is_current: v.id === version.id });
      }
      
      return version;
    },
    onSuccess: (version) => {
      queryClient.invalidateQueries({ queryKey: ['reportVersions'] });
      if (onRestore) {
        onRestore(version.configuration_snapshot);
      }
      toast.success('Version restored');
      setShowDialog(false);
    }
  });

  const detectChanges = (oldConfig, newConfig) => {
    if (!oldConfig) return ['initial_version'];
    
    const changes = [];
    const keys = new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)]);
    
    keys.forEach(key => {
      if (JSON.stringify(oldConfig[key]) !== JSON.stringify(newConfig[key])) {
        changes.push(key);
      }
    });
    
    return changes;
  };

  const handleViewVersion = (version) => {
    setSelectedVersion(version);
    setShowDialog(true);
  };

  const handleRestore = () => {
    if (selectedVersion) {
      restoreVersionMutation.mutate(selectedVersion);
    }
  };

  if (compact) {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={() => setShowDialog(true)}
        >
          <History className="w-4 h-4" />
          {versions.length} Versions
        </Button>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Version History</DialogTitle>
              <DialogDescription>
                View and restore previous versions of this report
              </DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {versions.map((version) => (
                  <Card key={version.id} className={version.is_current ? 'border-blue-500' : ''}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold">Version {version.version_number}</span>
                            {version.is_current && (
                              <Badge className="bg-blue-600">Current</Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{version.change_summary}</p>
                          <div className="flex flex-wrap gap-1 mb-2">
                            {version.changed_fields?.map(field => (
                              <Badge key={field} variant="outline" className="text-xs">
                                {field}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-xs text-gray-500">
                            {format(new Date(version.created_date), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                        {!version.is_current && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedVersion(version);
                              handleRestore();
                            }}
                            className="gap-2"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Restore
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return null;
}

// Export helper to create versions
export async function saveReportVersion(reportId, config, changeSummary, organizationId) {
  const versions = await base44.entities.ReportVersion.filter(
    { report_request_id: reportId },
    '-version_number'
  );

  // Mark previous versions as not current
  for (const version of versions) {
    if (version.is_current) {
      await base44.entities.ReportVersion.update(version.id, { is_current: false });
    }
  }

  const nextVersion = versions.length > 0 ? Math.max(...versions.map(v => v.version_number)) + 1 : 1;
  
  return await base44.entities.ReportVersion.create({
    organization_id: organizationId,
    report_request_id: reportId,
    version_number: nextVersion,
    configuration_snapshot: config,
    change_summary: changeSummary || 'Configuration updated',
    changed_fields: [],
    is_current: true
  });
}