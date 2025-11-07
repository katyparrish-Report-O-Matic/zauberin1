import React from 'react';
import { usePermissions } from './usePermissions';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export default function PermissionGuard({ children, requiredLevel, fallback }) {
  const { hasPermission, isLoading, currentUser } = usePermissions();

  if (isLoading) {
    return null;
  }

  // Admins can access everything - bypass all permission checks
  if (currentUser?.permission_level === 'admin') {
    return children;
  }

  if (!hasPermission(requiredLevel)) {
    if (fallback) {
      return fallback;
    }

    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          You don't have permission to access this feature. Required: {requiredLevel}
        </AlertDescription>
      </Alert>
    );
  }

  return children;
}