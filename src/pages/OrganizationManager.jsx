import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Users, Shield, Settings, UserPlus, Pencil, Trash2, Mail } from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PermissionGuard from "../components/auth/PermissionGuard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function OrganizationManager() {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showUsersDialog, setShowUsersDialog] = useState(false);
  const [showEditUserDialog, setShowEditUserDialog] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [removingUser, setRemovingUser] = useState(null);
  const [newOrg, setNewOrg] = useState({
    name: '',
    slug: '',
    is_agency: false
  });
  const [editUserData, setEditUserData] = useState({
    permission_level: 'viewer'
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

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
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

  const assignUserMutation = useMutation({
    mutationFn: async ({ userId, orgId }) => {
      await base44.auth.updateMe({ 
        organization_id: orgId,
        permission_level: 'admin'
      });
      return orgId;
    },
    onSuccess: (orgId) => {
      queryClient.invalidateQueries({ queryKey: ['allUsers'] });
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      toast.success('You are now an admin of this organization!');
      setShowAssignDialog(false);
      setSelectedOrg(null);
    },
    onError: (error) => {
      toast.error('Failed to assign user: ' + error.message);
    }
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, updates }) => {
      return await base44.entities.User.update(userId, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allUsers'] });
      toast.success('User updated successfully');
      setShowEditUserDialog(false);
      setSelectedUser(null);
    },
    onError: (error) => {
      toast.error('Failed to update user: ' + error.message);
    }
  });

  const removeUserMutation = useMutation({
    mutationFn: async (userId) => {
      return await base44.entities.User.update(userId, { 
        organization_id: null,
        permission_level: 'viewer'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allUsers'] });
      toast.success('User removed from organization');
      setRemovingUser(null);
    },
    onError: (error) => {
      toast.error('Failed to remove user: ' + error.message);
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

  const handleAssignCurrentUser = (org) => {
    setSelectedOrg(org);
    setShowAssignDialog(true);
  };

  const confirmAssignUser = () => {
    if (!currentUser?.id || !selectedOrg?.id) return;
    assignUserMutation.mutate({
      userId: currentUser.id,
      orgId: selectedOrg.id
    });
  };

  const handleManageUsers = (org) => {
    setSelectedOrg(org);
    setShowUsersDialog(true);
  };

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setEditUserData({
      permission_level: user.permission_level || 'viewer'
    });
    setShowEditUserDialog(true);
  };

  const handleUpdateUser = () => {
    if (!selectedUser) return;
    updateUserMutation.mutate({
      userId: selectedUser.id,
      updates: editUserData
    });
  };

  const handleRemoveUser = (user) => {
    setRemovingUser(user);
  };

  const confirmRemoveUser = () => {
    if (!removingUser) return;
    removeUserMutation.mutate(removingUser.id);
  };

  const getPermissionBadgeColor = (level) => {
    switch (level) {
      case 'admin':
        return 'bg-purple-600';
      case 'editor':
        return 'bg-blue-600';
      default:
        return 'bg-gray-600';
    }
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

            {!currentUser?.organization_id && (
              <Card className="border-yellow-500 bg-yellow-50">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-yellow-900">
                        You're not assigned to an organization
                      </p>
                      <p className="text-sm text-yellow-800 mt-1">
                        Click "Assign Me" on an organization to gain access
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {organizations.map(org => {
                const users = getUsersForOrg(org.id);
                const admins = users.filter(u => u.permission_level === 'admin');
                const isCurrentUserOrg = currentUser?.organization_id === org.id;

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
                            {isCurrentUserOrg && (
                              <Badge variant="outline" className="bg-green-50 border-green-600 text-green-700">
                                Your Org
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
                      
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-2"
                          onClick={() => handleManageUsers(org)}
                        >
                          <Settings className="w-3 h-3" />
                          Manage Users
                        </Button>
                      </div>

                      {!isCurrentUserOrg && !currentUser?.organization_id && (
                        <Button
                          size="sm"
                          variant="default"
                          className="w-full gap-2"
                          onClick={() => handleAssignCurrentUser(org)}
                        >
                          <UserPlus className="w-3 h-3" />
                          Assign Me
                        </Button>
                      )}
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

        {/* Create Organization Dialog */}
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

        {/* Assign User Dialog */}
        <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign to Organization</DialogTitle>
              <DialogDescription>
                This will assign your user account to {selectedOrg?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-gray-600">
                Your email: <span className="font-medium">{currentUser?.email}</span>
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Organization: <span className="font-medium">{selectedOrg?.name}</span>
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
                Cancel
              </Button>
              <Button onClick={confirmAssignUser}>
                Confirm Assignment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Manage Users Dialog */}
        <Dialog open={showUsersDialog} onOpenChange={setShowUsersDialog}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{selectedOrg?.name} - Users</DialogTitle>
              <DialogDescription>
                Manage users and their permissions for this organization
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[500px] pr-4">
              <div className="space-y-3">
                {getUsersForOrg(selectedOrg?.id).map(user => (
                  <Card key={user.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Mail className="w-4 h-4 text-gray-400" />
                            <span className="font-medium">{user.email}</span>
                            <Badge className={getPermissionBadgeColor(user.permission_level)}>
                              {user.permission_level || 'viewer'}
                            </Badge>
                          </div>
                          {user.full_name && (
                            <p className="text-sm text-gray-600">{user.full_name}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditUser(user)}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveUser(user)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {getUsersForOrg(selectedOrg?.id).length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No users in this organization yet
                  </div>
                )}
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowUsersDialog(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog open={showEditUserDialog} onOpenChange={setShowEditUserDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User Permissions</DialogTitle>
              <DialogDescription>
                Update {selectedUser?.email}'s access level
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="permission-level">Permission Level</Label>
                <Select
                  value={editUserData.permission_level}
                  onValueChange={(value) => setEditUserData({ ...editUserData, permission_level: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin - Full access</SelectItem>
                    <SelectItem value="editor">Editor - Can create & edit</SelectItem>
                    <SelectItem value="viewer">Viewer - Read only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                <p className="text-blue-900 font-medium mb-1">Permission Levels:</p>
                <ul className="text-blue-800 space-y-1 text-xs">
                  <li>• <strong>Admin:</strong> Full access including settings and user management</li>
                  <li>• <strong>Editor:</strong> Can create reports, data sources, and templates</li>
                  <li>• <strong>Viewer:</strong> Can view reports and dashboards only</li>
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditUserDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateUser} disabled={updateUserMutation.isPending}>
                {updateUserMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Remove User Confirmation Dialog */}
        <AlertDialog open={!!removingUser} onOpenChange={() => setRemovingUser(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove User from Organization</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove {removingUser?.email} from this organization? 
                They will lose access to all organization data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmRemoveUser}
                className="bg-red-600 hover:bg-red-700"
              >
                Remove User
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PermissionGuard>
  );
}