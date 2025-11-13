import React, { useState, useEffect } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { accountHierarchyService } from "../accounts/AccountHierarchyService";
import { Loader2, X, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

export default function MultiAccountSelector({ organizationId, selectedAccountIds = [], onChange, showLabel = true }) {
  const [accounts, setAccounts] = useState([]);
  const [open, setOpen] = useState(false);

  // Fetch all accounts for organization
  const { data: allAccounts, isLoading } = useQuery({
    queryKey: ['organizationAccounts', organizationId],
    queryFn: async () => {
      if (!organizationId || organizationId === 'all') return [];
      return await accountHierarchyService.getAllAccountsForOrganization(organizationId);
    },
    enabled: !!organizationId && organizationId !== 'all',
    staleTime: 5 * 60 * 1000
  });

  useEffect(() => {
    if (allAccounts) {
      setAccounts(allAccounts);
    }
  }, [allAccounts]);

  const handleToggleAccount = (accountId) => {
    const isSelected = selectedAccountIds.includes(accountId);
    
    if (isSelected) {
      // Remove account
      onChange(selectedAccountIds.filter(id => id !== accountId));
    } else {
      // Add account
      onChange([...selectedAccountIds, accountId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedAccountIds.length === accounts.length) {
      // Deselect all
      onChange([]);
    } else {
      // Select all
      onChange(accounts.map(a => a.external_id));
    }
  };

  const handleRemoveAccount = (accountId) => {
    onChange(selectedAccountIds.filter(id => id !== accountId));
  };

  const getAccountDisplay = (account) => {
    const prefix = account.indent || '';
    const indicator = account.has_children ? '📁 ' : '📄 ';
    return `${prefix}${indicator}${account.name}`;
  };

  const getSelectedAccountNames = () => {
    if (selectedAccountIds.length === 0) return [];
    return selectedAccountIds
      .map(id => accounts.find(a => a.external_id === id))
      .filter(a => a)
      .map(a => a.name);
  };

  const selectedNames = getSelectedAccountNames();

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
      {showLabel && <Label>Accounts</Label>}
      
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between text-left font-normal"
          >
            {selectedAccountIds.length === 0 ? (
              <span className="text-gray-500">Select accounts...</span>
            ) : (
              <span>
                {selectedAccountIds.length} account{selectedAccountIds.length !== 1 ? 's' : ''} selected
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <div className="p-2 border-b">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              className="w-full justify-start text-sm"
            >
              <Check className="w-4 h-4 mr-2" />
              {selectedAccountIds.length === accounts.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>
          
          <div className="max-h-64 overflow-y-auto p-2">
            {accounts.length === 0 ? (
              <div className="text-center text-sm text-gray-500 py-4">
                No accounts configured
              </div>
            ) : (
              <div className="space-y-1">
                {accounts.map(account => {
                  const isSelected = selectedAccountIds.includes(account.external_id);
                  
                  return (
                    <div
                      key={`${account.data_source_id}-${account.id}`}
                      className="flex items-center space-x-2 p-2 rounded hover:bg-gray-100 cursor-pointer"
                      onClick={() => handleToggleAccount(account.external_id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleToggleAccount(account.external_id)}
                      />
                      <span className="text-sm flex-1">
                        {getAccountDisplay(account)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {selectedNames.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedNames.map((name, index) => (
            <Badge key={index} variant="secondary" className="gap-1">
              {name}
              <button
                onClick={() => handleRemoveAccount(selectedAccountIds[index])}
                className="ml-1 hover:text-red-600"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {accounts.length === 0 && (
        <p className="text-xs text-gray-500">
          Configure data sources to see accounts
        </p>
      )}
    </div>
  );
}