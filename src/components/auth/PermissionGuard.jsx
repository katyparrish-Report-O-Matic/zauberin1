import React from 'react';
import { usePermissions } from './usePermissions';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export default function PermissionGuard({ children, requiredLevel, fallback }) {
  const { hasPermission, isLoading } = usePermissions();

  if (isLoading) {
    return null;
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