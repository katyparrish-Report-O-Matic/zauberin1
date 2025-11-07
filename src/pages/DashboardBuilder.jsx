import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Save, Eye, History, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "../components/auth/usePermissions";
import OrganizationSelector from "../components/org/OrganizationSelector";
import PermissionGuard from "../components/auth/PermissionGuard";
import ComponentLibrary from "../components/dashboard/ComponentLibrary";
import DashboardGrid from "../components/dashboard/DashboardGrid";
import ComponentConfigPanel from "../components/dashboard/ComponentConfigPanel";

export default function DashboardBuilder() {
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [configuringComponent, setConfiguringComponent] = useState(null);

  const [currentDashboard, setCurrentDashboard] = useState({
    id: null,
    name: 'New Dashboard',
    description: '',
    components: [],
    version: 1
  });

  const { currentUser, isAgency } = usePermissions();

  // Fetch user's dashboards
  const { data: dashboards } = useQuery({
    queryKey: ['dashboards', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      if (!orgId || orgId === 'all') return [];

      return await base44.entities.Dashboard.filter({
        organization_id: orgId
      }, '-created_date');
    },
    initialData: []
  });

  // Fetch version history for current dashboard
  const { data: versions } = useQuery({
    queryKey: ['dashboardVersions', currentDashboard.id],
    queryFn: async () => {
      if (!currentDashboard.id) return [];
      return await base44.entities.DashboardVersion.filter({
        dashboard_id: currentDashboard.id
      }, '-version_number');
    },
    enabled: !!currentDashboard.id,
    initialData: []
  });

  // Save dashboard mutation
  const saveDashboardMutation = useMutation({
    mutationFn: async (dashboardData) => {
      const orgId = selectedOrgId || currentUser?.organization_id;

      // Create version snapshot
      const snapshot = {
        name: dashboardData.name,
        description: dashboardData.description,
        components: dashboardData.components,
        layout: dashboardData.layout || { columns: 12, rowHeight: 100 }
      };

      if (dashboardData.id) {
        // Update existing
        const updated = await base44.entities.Dashboard.update(dashboardData.id, {
          name: dashboardData.name,
          description: dashboardData.description,
          components: dashboardData.components,
          version: (dashboardData.version || 1) + 1
        });

        // Save version
        await base44.entities.DashboardVersion.create({
          dashboard_id: dashboardData.id,
          version_number: updated.version,
          snapshot,
          change_description: 'Dashboard updated',
          created_by_user: currentUser?.email
        });

        return updated;
      } else {
        // Create new
        const created = await base44.entities.Dashboard.create({
          ...dashboardData,
          organization_id: orgId,
          layout: { columns: 12, rowHeight: 100 },
          global_settings: { refresh_interval: 60000 },
          version: 1
        });

        // Save initial version
        await base44.entities.DashboardVersion.create({
          dashboard_id: created.id,
          version_number: 1,
          snapshot,
          change_description: 'Dashboard created',
          created_by_user: currentUser?.email
        });

        return created;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardVersions'] });
      setCurrentDashboard({ ...currentDashboard, id: data.id, version: data.version });
      toast.success('Dashboard saved');
      setShowSaveDialog(false);
    }
  });

  const handleAddComponent = (componentType) => {
    const newComponent = {
      id: `component-${Date.now()}`,
      type: componentType.id,
      name: componentType.name,
      position: {
        x: 0,
        y: currentDashboard.components.length > 0
          ? Math.max(...currentDashboard.components.map(c => c.position.y + c.position.h))
          : 0,
        w: componentType.defaultSize.w,
        h: componentType.defaultSize.h
      },
      config: {
        metric: null,
        filters: {},
        refreshInterval: 60000
      }
    };

    setCurrentDashboard({
      ...currentDashboard,
      components: [...currentDashboard.components, newComponent]
    });
  };

  const handleUpdateComponents = (updatedComponents) => {
    setCurrentDashboard({
      ...currentDashboard,
      components: updatedComponents
    });
  };

  const handleRemoveComponent = (componentId) => {
    setCurrentDashboard({
      ...currentDashboard,
      components: currentDashboard.components.filter(c => c.id !== componentId)
    });
  };

  const handleConfigureComponent = (component) => {
    setConfiguringComponent(component);
  };

  const handleSaveComponentConfig = (componentId, config) => {
    const updated = currentDashboard.components.map(comp =>
      comp.id === componentId ? { ...comp, config } : comp
    );
    setCurrentDashboard({
      ...currentDashboard,
      components: updated
    });
  };

  const handleLoadDashboard = (dashboard) => {
    setCurrentDashboard({
      id: dashboard.id,
      name: dashboard.name,
      description: dashboard.description,
      components: dashboard.components,
      version: dashboard.version
    });
    setShowLoadDialog(false);
    toast.success(`Loaded: ${dashboard.name}`);
  };

  const handleRevertToVersion = (version) => {
    setCurrentDashboard({
      ...currentDashboard,
      name: version.snapshot.name,
      description: version.snapshot.description,
      components: version.snapshot.components
    });
    setShowVersionHistory(false);
    toast.success(`Reverted to version ${version.version_number}`);
  };

  const handleSave = () => {
    if (!currentDashboard.name) {
      toast.error('Dashboard name is required');
      return;
    }
    saveDashboardMutation.mutate(currentDashboard);
  };

  return (
    <PermissionGuard requiredLevel="editor">
      <div className="min-h-screen bg-gray-50">
        <div className="p-6">
          <div className="max-w-[1800px] mx-auto space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold text-gray-900">{currentDashboard.name}</h1>
                  {currentDashboard.id && (
                    <Badge variant="outline">v{currentDashboard.version}</Badge>
                  )}
                </div>
                <p className="text-gray-600 mt-1">
                  {currentDashboard.description || 'Drag components to build your custom dashboard'}
                </p>
              </div>
              <div className="flex gap-3">
                {isAgency && (
                  <OrganizationSelector
                    value={selectedOrgId || currentUser?.organization_id}
                    onChange={setSelectedOrgId}
                    showLabel={false}
                  />
                )}
                <Button variant="outline" onClick={() => setShowLoadDialog(true)} className="gap-2">
                  <Eye className="w-4 h-4" />
                  Load
                </Button>
                {currentDashboard.id && (
                  <Button variant="outline" onClick={() => setShowVersionHistory(true)} className="gap-2">
                    <History className="w-4 h-4" />
                    History
                  </Button>
                )}
                <Button onClick={() => setShowSaveDialog(true)} className="gap-2">
                  <Save className="w-4 h-4" />
                  Save
                </Button>
              </div>
            </div>

            {/* Main Layout */}
            <div className="grid grid-cols-12 gap-6">
              {/* Left Sidebar - Component Library */}
              <div className="col-span-2">
                <ComponentLibrary onAddComponent={handleAddComponent} />
              </div>

              {/* Center - Dashboard Grid */}
              <div className={configuringComponent ? "col-span-7" : "col-span-10"}>
                <DashboardGrid
                  components={currentDashboard.components}
                  onUpdateComponents={handleUpdateComponents}
                  onRemoveComponent={handleRemoveComponent}
                  onConfigureComponent={handleConfigureComponent}
                />
              </div>

              {/* Right Sidebar - Configuration Panel */}
              {configuringComponent && (
                <div className="col-span-3">
                  <ComponentConfigPanel
                    component={configuringComponent}
                    onSave={handleSaveComponentConfig}
                    onClose={() => setConfiguringComponent(null)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Save Dialog */}
        <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{currentDashboard.id ? 'Update' : 'Save'} Dashboard</DialogTitle>
              <DialogDescription>
                {currentDashboard.id ? 'Create a new version of this dashboard' : 'Save your dashboard configuration'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="dashboard-name">Dashboard Name *</Label>
                <Input
                  id="dashboard-name"
                  value={currentDashboard.name}
                  onChange={(e) => setCurrentDashboard({ ...currentDashboard, name: e.target.value })}
                  placeholder="e.g., Sales Overview Dashboard"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dashboard-description">Description</Label>
                <Input
                  id="dashboard-description"
                  value={currentDashboard.description}
                  onChange={(e) => setCurrentDashboard({ ...currentDashboard, description: e.target.value })}
                  placeholder="What does this dashboard show?"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saveDashboardMutation.isPending}>
                {saveDashboardMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Dashboard
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Load Dashboard Dialog */}
        <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Load Dashboard</DialogTitle>
              <DialogDescription>Choose a dashboard to edit</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {dashboards.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No saved dashboards</p>
              ) : (
                dashboards.map(dashboard => (
                  <button
                    key={dashboard.id}
                    onClick={() => handleLoadDashboard(dashboard)}
                    className="w-full text-left p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{dashboard.name}</p>
                        <p className="text-sm text-gray-500">{dashboard.description}</p>
                      </div>
                      <Badge variant="outline">v{dashboard.version}</Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      {dashboard.components?.length || 0} components
                    </p>
                  </button>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Version History Dialog */}
        <Dialog open={showVersionHistory} onOpenChange={setShowVersionHistory}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Version History</DialogTitle>
              <DialogDescription>Revert to a previous version</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {versions.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No version history</p>
              ) : (
                versions.map(version => (
                  <button
                    key={version.id}
                    onClick={() => handleRevertToVersion(version)}
                    className="w-full text-left p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">Version {version.version_number}</p>
                        <p className="text-sm text-gray-500">{version.change_description}</p>
                      </div>
                      <Badge variant="outline">
                        {new Date(version.created_date).toLocaleDateString()}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">By: {version.created_by_user}</p>
                  </button>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
}