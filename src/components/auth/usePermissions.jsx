import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const PERMISSION_HIERARCHY = {
  viewer: 1,
  editor: 2,
  admin: 3
};

export function usePermissions() {
  const { data: currentUser, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch {
        return null;
      }
    }
  });

  const { data: userOrg, isLoading: orgLoading } = useQuery({
    queryKey: ['userOrganization', currentUser?.organization_id],
    queryFn: async () => {
      if (!currentUser?.organization_id) return null;
      const orgs = await base44.entities.Organization.list();
      return orgs.find(o => o.id === currentUser.organization_id);
    },
    enabled: !!currentUser?.organization_id
  });

  const hasPermission = (requiredLevel) => {
    if (!currentUser) return false;
    
    // Check custom permission_level first, then fall back to built-in role
    const userPermissionLevel = currentUser.permission_level || 
                                (currentUser.role === 'admin' ? 'admin' : 'viewer');
    
    const userLevel = PERMISSION_HIERARCHY[userPermissionLevel] || 0;
    const required = PERMISSION_HIERARCHY[requiredLevel] || 999;
    
    return userLevel >= required;
  };

  const isAgency = () => {
    return userOrg?.is_agency === true;
  };

  const canAccessOrganization = (orgId) => {
    if (!currentUser) return false;
    
    // Agency can access all organizations
    if (isAgency()) return true;
    
    // Users can access their own organization
    return currentUser.organization_id === orgId;
  };

  // Determine effective permission level (custom or built-in)
  const effectivePermissionLevel = currentUser?.permission_level || 
                                   (currentUser?.role === 'admin' ? 'admin' : 'viewer');

  return {
    currentUser: currentUser ? {
      ...currentUser,
      permission_level: effectivePermissionLevel
    } : null,
    userOrg,
    hasPermission,
    isAgency: isAgency(),
    canAccessOrganization,
    isLoading: userLoading || orgLoading
  };
}