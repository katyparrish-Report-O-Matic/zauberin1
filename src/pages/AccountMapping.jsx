import React, { useState, useMemo } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Link2, Trash2, Loader2, Check, X, Save } from "lucide-react";

// Simple fuzzy match scoring
function calculateMatchScore(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (s1 === s2) return 100;
  if (s1.includes(s2) || s2.includes(s1)) return 80;
  
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
  const [manualSelections, setManualSelections] = useState({});
  const queryClient = useQueryClient();

  // Fetch Salesforce Accounts
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['salesforceAccounts'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getSalesforceAccounts', {});
      return result.data;
    }
  });

  // Fetch CTM Accounts from AccountHierarchy
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

  const salesforceAccounts = accountsData?.accounts || [];

  // Create mapping mutation
  const createMapping = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.AccountMapping.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountMappings'] });
    }
  });

  // Update mapping mutation
  const updateMapping = useMutation({
    mutationFn: async ({ id, data }) => {
      return await base44.entities.AccountMapping.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountMappings'] });
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

  // Compute "Needs Review" = CTM accounts NOT IN any AccountMapping record
  const needsReview = useMemo(() => {
    if (!ctmAccounts || !mappings || !salesforceAccounts.length) return [];

    const mappedCtmNames = new Set(mappings.map(m => m.ctm_account_name));
    
    const sfNames = salesforceAccounts.map(a => ({
      id: a.Id,
      name: a.Company__r?.Name || a.Name,
      saName: a.Name
    }));

    return ctmAccounts
      .filter(ctm => !mappedCtmNames.has(ctm.name))
      .map(ctm => {
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
          ctmName: ctm.name,
          sfMatch: bestMatch,
          score: bestScore
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [ctmAccounts, mappings, salesforceAccounts]);

  // Confirmed Matches = AccountMapping WHERE salesforce_account_name IS NOT empty
  const confirmedMatches = useMemo(() => {
    if (!mappings) return [];
    return mappings.filter(m => m.salesforce_account_name && m.salesforce_account_name !== "");
  }, [mappings]);

  // Needs Manual Mapping = AccountMapping WHERE salesforce_account_name IS empty
  const needsManualMapping = useMemo(() => {
    if (!mappings) return [];
    return mappings.filter(m => !m.salesforce_account_name || m.salesforce_account_name === "");
  }, [mappings]);

  // Confirm button handler
  const handleConfirm = (ctmName, salesforceAccountName) => {
    createMapping.mutate({
      ctm_account_name: ctmName,
      salesforce_account_name: salesforceAccountName
    });
  };

  // Wrong button handler
  const handleWrong = (ctmName) => {
    createMapping.mutate({
      ctm_account_name: ctmName,
      salesforce_account_name: ""
    });
  };

  // Delete handler
  const handleDelete = (id) => {
    deleteMapping.mutate(id);
  };

  // Save manual mapping handler
  const handleSaveManual = (mappingId, salesforceAccountName) => {
    updateMapping.mutate({
      id: mappingId,
      data: { salesforce_account_name: salesforceAccountName }
    });
    setManualSelections(prev => {
      const newSelections = { ...prev };
      delete newSelections[mappingId];
      return newSelections;
    });
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

        {/* Table 1: Needs Review (Probable Matches) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Needs Review (Probable Matches)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : !needsReview.length ? (
              <p className="text-gray-500 text-center py-8">No accounts need review</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CTM Name</TableHead>
                      <TableHead>Best Fuzzy Match from Salesforce</TableHead>
                      <TableHead className="text-center">Match Score</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {needsReview.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{item.ctmName}</TableCell>
                        <TableCell>
                          {item.sfMatch ? (
                            <div>
                              <div>{item.sfMatch.name}</div>
                              <div className="text-xs text-gray-500">{item.sfMatch.saName}</div>
                            </div>
                          ) : (
                            <span className="text-gray-400">No match found</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge 
                            className={
                              item.score >= 70 ? 'bg-green-100 text-green-800' :
                              item.score >= 40 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }
                          >
                            {item.score}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex gap-2 justify-center">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 border-green-600 hover:bg-green-50"
                              onClick={() => handleConfirm(item.ctmName, item.sfMatch?.name || "")}
                              disabled={createMapping.isPending}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Confirm
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-600 hover:bg-red-50"
                              onClick={() => handleWrong(item.ctmName)}
                              disabled={createMapping.isPending}
                            >
                              <X className="w-4 h-4 mr-1" />
                              Wrong
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Table 2: Confirmed Matches */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Confirmed Matches</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : !confirmedMatches.length ? (
              <p className="text-gray-500 text-center py-8">No confirmed matches</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CTM Name</TableHead>
                      <TableHead>Salesforce Account</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {confirmedMatches.map((mapping) => (
                      <TableRow key={mapping.id}>
                        <TableCell className="font-medium">{mapping.ctm_account_name}</TableCell>
                        <TableCell>{mapping.salesforce_account_name}</TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-600 hover:bg-red-50"
                            onClick={() => handleDelete(mapping.id)}
                            disabled={deleteMapping.isPending}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Table 3: Needs Manual Mapping */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Needs Manual Mapping</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : !needsManualMapping.length ? (
              <p className="text-gray-500 text-center py-8">No accounts need manual mapping</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CTM Name</TableHead>
                      <TableHead>Select Salesforce Account</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {needsManualMapping.map((mapping) => (
                      <TableRow key={mapping.id}>
                        <TableCell className="font-medium">{mapping.ctm_account_name}</TableCell>
                        <TableCell>
                          <Select 
                            value={manualSelections[mapping.id] || ""} 
                            onValueChange={(value) => setManualSelections(prev => ({ ...prev, [mapping.id]: value }))}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select Salesforce account..." />
                            </SelectTrigger>
                            <SelectContent>
                              {salesforceAccounts.map(account => (
                                <SelectItem key={account.Id} value={account.Company__r?.Name || account.Name}>
                                  {account.Name} {account.Company__r?.Name ? `(${account.Company__r.Name})` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            onClick={() => handleSaveManual(mapping.id, manualSelections[mapping.id])}
                            disabled={!manualSelections[mapping.id] || updateMapping.isPending}
                          >
                            <Save className="w-4 h-4 mr-1" />
                            Save
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}