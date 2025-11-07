import React from 'react';
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { usePermissions } from "../auth/usePermissions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";

export default function OrganizationSelector({ value, onChange, showLabel = true }) {
  const { isAgency, currentUser } = usePermissions();

  const { data: organizations } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => base44.entities.Organization.list(),
    enabled: isAgency,
    initialData: []
  });

  // If not agency, show current org only
  if (!isAgency) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Building2 className="w-4 h-4" />
        <span>Organization</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {showLabel && (
        <>
          <Building2 className="w-4 h-4 text-gray-600" />
          <span className="text-sm text-gray-600">View as:</span>
        </>
      )}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Select organization" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Organizations</SelectItem>
          {organizations.map(org => (
            <SelectItem key={org.id} value={org.id}>
              {org.name} {org.is_agency && '(Agency)'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}