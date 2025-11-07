import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Users, Shield } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import PermissionGuard from "../components/auth/PermissionGuard";

export default function OrganizationManager() {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newOrg, setNewOrg] = useState({
    name: '',
    slug: '',
    is_agency: false
  });

  const { data: organizations } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => base44.entities.Organization.list('-created_date'),
    initialData: []
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
    initialData: []
  });

  const createOrgMutation = useMutation({
    mutationFn: (orgData) => base44.entities.Organization.create(orgData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toast.success('Organization created');
      setShowCreateDialog(false);
      setNewOrg({ name: '', slug: '', is_agency: false });
    }
  });

  const handleCreateOrg = () => {
    if (!newOrg.name || !newOrg.slug) {
      toast.error('Name and slug are required');
      return;
    }
    createOrgMutation.mutate(newOrg);
  };

  const handleSlugGeneration = (name) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    setNewOrg({ ...newOrg, name, slug });
  };

  const getUsersForOrg = (orgId) => {
    return allUsers.filter(u => u.organization_id === orgId);
  };

  return (
    <PermissionGuard requiredLevel="admin">
      <div className="min-h-screen bg-gray-50">
        <div className="p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <Building2 className="w-8 h-8" />
                  Organizations
                </h1>
                <p className="text-gray-600 mt-1">Manage client organizations and access</p>
              </div>
              <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                New Organization
              </Button>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {organizations.map(org => {
                const users = getUsersForOrg(org.id);
                const admins = users.filter(u => u.permission_level === 'admin');

                return (
                  <Card key={org.id} className={org.is_agency ? 'border-2 border-blue-500' : ''}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="flex items-center gap-2">
                            {org.name}
                            {org.is_agency && (
                              <Badge variant="default" className="bg-blue-600">
                                <Shield className="w-3 h-3 mr-1" />
                                Agency
                              </Badge>
                            )}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            @{org.slug}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          Users
                        </span>
                        <span className="font-medium">{users.length}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Admins</span>
                        <span className="font-medium">{admins.length}</span>
                      </div>
                      <div className="pt-2 border-t">
                        <Badge variant="outline">{org.subscription_tier || 'free'}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {organizations.length === 0 && (
              <Card>
                <CardContent className="p-12 text-center">
                  <Building2 className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">No organizations yet. Create your first one!</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Organization</DialogTitle>
              <DialogDescription>
                Add a new client organization
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization Name</Label>
                <Input
                  id="org-name"
                  placeholder="e.g., Acme Corporation"
                  value={newOrg.name}
                  onChange={(e) => handleSlugGeneration(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-slug">Slug</Label>
                <Input
                  id="org-slug"
                  placeholder="e.g., acme-corp"
                  value={newOrg.slug}
                  onChange={(e) => setNewOrg({ ...newOrg, slug: e.target.value })}
                />
                <p className="text-xs text-gray-500">URL-friendly identifier</p>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Agency Organization</Label>
                  <p className="text-xs text-gray-500">
                    Agency orgs can access all client data
                  </p>
                </div>
                <Switch
                  checked={newOrg.is_agency}
                  onCheckedChange={(checked) => setNewOrg({ ...newOrg, is_agency: checked })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateOrg}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
}