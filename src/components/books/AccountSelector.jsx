import React, { useState, useEffect } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { accountHierarchyService } from "../accounts/AccountHierarchyService";
import { Loader2 } from "lucide-react";

export default function AccountSelector({ organizationId, value, onChange, showLabel = true }) {
  const [accounts, setAccounts] = useState([]);

  // Fetch all accounts for organization
  const { data: allAccounts, isLoading } = useQuery({
    queryKey: ['organizationAccounts', organizationId],
    queryFn: async () => {
      if (!organizationId || organizationId === 'all') return [];
      return await accountHierarchyService.getAllAccountsForOrganization(organizationId);
    },
    enabled: !!organizationId && organizationId !== 'all',
    staleTime: 5 * 60 * 1000 // 5 minutes
  });

  useEffect(() => {
    if (allAccounts) {
      setAccounts(allAccounts);
    }
  }, [allAccounts]);

  const getAccountDisplay = (account) => {
    const prefix = account.indent || '';
    const indicator = account.has_children ? '📁 ' : '📄 ';
    return `${prefix}${indicator}${account.name}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading accounts...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {showLabel && <Label>Account</Label>}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select account" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Accounts</SelectItem>
          {accounts.map(account => (
            <SelectItem 
              key={`${account.data_source_id}-${account.id}`} 
              value={account.external_id}
              className={account.level > 0 ? 'pl-8' : ''}
            >
              {getAccountDisplay(account)}
            </SelectItem>
          ))}
          {accounts.length === 0 && (
            <SelectItem value="none" disabled>
              No accounts configured
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      {accounts.length === 0 && (
        <p className="text-xs text-gray-500">
          Configure data sources to see accounts
        </p>
      )}
    </div>
  );
}