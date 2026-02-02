import React, { useState, useMemo } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Link2, Trash2, Loader2, Building2, Phone, AlertTriangle } from "lucide-react";

// Simple fuzzy match scoring
function calculateMatchScore(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (s1 === s2) return 100;
  if (s1.includes(s2) || s2.includes(s1)) return 80;
  
  // Check word overlap
  const words1 = str1.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const words2 = str2.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  
  let matchingWords = 0;
  for (const w1 of words1) {
    for (const w2 of words2) {
      if (w1.includes(w2) || w2.includes(w1)) {
        matchingWords++;
        break;
      }
    }
  }
  
  const totalWords = Math.max(words1.length, words2.length);
  if (totalWords === 0) return 0;
  
  return Math.round((matchingWords / totalWords) * 70);
}

export default function AccountMapping() {
  const [selectedSalesforce, setSelectedSalesforce] = useState('');
  const [selectedCtm, setSelectedCtm] = useState('');
  const [wrongMatches, setWrongMatches] = useState({});
  const queryClient = useQueryClient();

  // Fetch Salesforce Accounts
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['salesforceAccounts'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getSalesforceAccounts', {});
      return result.data;
    }
  });

  // Fetch CTM Accounts from AccountHierarchy (more complete than CallRecords)
  const { data: ctmAccounts, isLoading: ctmLoading } = useQuery({
    queryKey: ['ctmAccountHierarchy'],
    queryFn: async () => {
      return await base44.entities.AccountHierarchy.filter({ platform_type: 'call_tracking' });
    }
  });

  // Fetch existing mappings
  const { data: mappings, isLoading: mappingsLoading } = useQuery({
    queryKey: ['accountMappings'],
    queryFn: async () => {
      return await base44.entities.AccountMapping.list();
    }
  });

  // Get Salesforce accounts
  const salesforceAccounts = accountsData?.accounts || [];

  // Calculate probable matches
  const probableMatches = useMemo(() => {
    if (!ctmAccounts || !salesforceAccounts.length) return [];

    const sfNames = salesforceAccounts.map(a => ({
      id: a.Id,
      name: a.Company__r?.Name || a.Name,
      saName: a.Name
    }));

    return ctmAccounts.map(ctm => {
      let bestMatch = null;
      let bestScore = 0;

      for (const sf of sfNames) {
        const score = calculateMatchScore(ctm.name, sf.name);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = sf;
        }
      }

      return {
        ctmId: ctm.external_id,
        ctmName: ctm.name,
        sfMatch: bestMatch,
        score: bestScore
      };
    }).sort((a, b) => b.score - a.score);
  }, [ctmAccounts, salesforceAccounts]);

  // Get unique CTM account names for manual mapping dropdown
  const ctmAccountNames = useMemo(() => {
    if (!ctmAccounts) return [];
    return ctmAccounts.map(a => a.name).sort();
  }, [ctmAccounts]);

  // Create mapping mutation
  const createMapping = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.AccountMapping.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountMappings'] });
      setSelectedSalesforce('');
      setSelectedCtm('');
    }
  });

  // Delete mapping mutation
  const deleteMapping = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.AccountMapping.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountMappings'] });
    }
  });

  const handleCreateMapping = () => {
    if (!selectedSalesforce || !selectedCtm) return;

    const sfAccount = salesforceAccounts.find(a => a.Id === selectedSalesforce);
    
    createMapping.mutate({
      salesforce_account_id: sfAccount.Id,
      salesforce_account_name: sfAccount.Company__r?.Name || sfAccount.Name,
      ctm_account_name: selectedCtm
    });
  };

  const handleWrongMatchToggle = (ctmName, checked) => {
    setWrongMatches(prev => ({
      ...prev,
      [ctmName]: checked
    }));
  };

  const isLoading = accountsLoading || ctmLoading || mappingsLoading;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Link2 className="w-8 h-8" />
            Account Mapping
          </h1>
          <p className="text-gray-600 mt-1">Link Salesforce accounts to CTM account names</p>
        </div>

        {/* Create Mapping */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Create New Mapping</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Salesforce Account
                </label>
                <Select value={selectedSalesforce} onValueChange={setSelectedSalesforce}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Salesforce account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {salesforceAccounts.map(account => (
                      <SelectItem key={account.Id} value={account.Id}>
                        {account.Name} {account.Company__r?.Name ? `(${account.Company__r.Name})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  CTM Account Name
                </label>
                <Select value={selectedCtm} onValueChange={setSelectedCtm}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select CTM account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ctmAccountNames.map(name => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button 
                onClick={handleCreateMapping}
                disabled={!selectedSalesforce || !selectedCtm || createMapping.isPending}
              >
                {createMapping.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Link2 className="w-4 h-4 mr-2" />
                )}
                Create Mapping
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Existing Mappings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Existing Mappings</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : !mappings?.length ? (
              <p className="text-gray-500 text-center py-8">No mappings created yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Salesforce Account</TableHead>
                    <TableHead>CTM Account Name</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappings.map(mapping => (
                    <TableRow key={mapping.id}>
                      <TableCell>{mapping.salesforce_account_name}</TableCell>
                      <TableCell>{mapping.ctm_account_name}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMapping.mutate(mapping.id)}
                          disabled={deleteMapping.isPending}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}