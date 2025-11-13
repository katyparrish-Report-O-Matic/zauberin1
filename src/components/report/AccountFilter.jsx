import React from 'react';
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";

export default function AccountFilter({ organizationId, value, onChange, showLabel = true }) {
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts', organizationId],
    queryFn: async () => {
      if (!organizationId || organizationId === 'all') return [];
      
      // Get unique accounts from CallRecords
      const calls = await base44.entities.CallRecord.filter(
        { organization_id: organizationId },
        '-start_time',
        1000
      );
      
      // Extract unique account_id and account_name combinations
      const accountMap = new Map();
      calls.forEach(call => {
        if (call.account_id && call.account_name) {
          accountMap.set(call.account_id, call.account_name);
        }
      });
      
      return Array.from(accountMap.entries()).map(([id, name]) => ({
        account_id: id,
        account_name: name
      }));
    },
    enabled: !!organizationId && organizationId !== 'all',
    initialData: []
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Building2 className="w-4 h-4" />
        Loading accounts...
      </div>
    );
  }

  if (accounts.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {showLabel && (
        <>
          <Building2 className="w-4 h-4 text-gray-600" />
          <span className="text-sm text-gray-600">Account:</span>
        </>
      )}
      <Select value={value || 'all'} onValueChange={onChange}>
        <SelectTrigger className="w-[250px]">
          <SelectValue placeholder="Select account" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Accounts</SelectItem>
          {accounts.map(account => (
            <SelectItem key={account.account_id} value={account.account_id}>
              {account.account_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}