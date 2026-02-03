import React, { useState, useMemo } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Phone, Calendar, Loader2, Building2, Hash, BarChart3 } from "lucide-react";
import { format, parseISO, eachMonthOfInterval } from "date-fns";

export default function TelecomsReport() {
  const [selectedAccount, setSelectedAccount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Fetch Salesforce Accounts (Service Agreements)
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['salesforceAccounts'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getSalesforceAccounts', {});
      return result.data;
    }
  });

  const accounts = accountsData?.accounts || [];

  // Get selected account details
  const selectedAccountDetails = useMemo(() => {
    if (!selectedAccount) return null;
    return accounts.find(a => (a.Company__r?.Name || a.Name) === selectedAccount);
  }, [accounts, selectedAccount]);

  // Fetch AccountMappings
  const { data: accountMappings = [] } = useQuery({
    queryKey: ['accountMappings'],
    queryFn: async () => {
      return await base44.entities.AccountMapping.list();
    }
  });

  // Section 1: Active Service Lines from Subscription_Line_Item__c
  const { data: lineItemsData, isLoading: lineItemsLoading } = useQuery({
    queryKey: ['subscriptionLineItems', selectedAccountDetails?.Id],
    queryFn: async () => {
      const result = await base44.functions.invoke('getSubscriptionLineItems', {
        serviceAgreementId: selectedAccountDetails.Id
      });
      return result.data;
    },
    enabled: !!selectedAccountDetails?.Id
  });

  const lineItems = (lineItemsData?.records || []).filter(item => 
    item.Status__c === 'Active' || item.Status__c === 'Planned'
  );

  // Get CTM account names from mappings
  const ctmAccountNames = useMemo(() => {
    if (!selectedAccount) return [];
    return accountMappings
      .filter(m => m.salesforce_account_name === selectedAccount && m.source_type === 'ctm')
      .map(m => m.source_account_name);
  }, [accountMappings, selectedAccount]);

  // Section 2a: CTM Numbers from TrackingNumber entity
  const { data: ctmNumbers = [], isLoading: ctmNumbersLoading } = useQuery({
    queryKey: ['ctmTrackingNumbers', ctmAccountNames],
    queryFn: async () => {
      if (ctmAccountNames.length === 0) return [];
      const allNumbers = await base44.entities.TrackingNumber.filter({ source: 'ctm' });
      return allNumbers.filter(n => ctmAccountNames.includes(n.account_name));
    },
    enabled: ctmAccountNames.length > 0
  });

  // Section 2b: Storm Numbers from Salesforce Telecoms__c
  const { data: stormData, isLoading: stormLoading } = useQuery({
    queryKey: ['stormTelecoms', selectedAccount],
    queryFn: async () => {
      const result = await base44.functions.invoke('getStormTelecoms', {
        companyName: selectedAccount
      });
      return result.data;
    },
    enabled: !!selectedAccount
  });

  const stormNumbers = (stormData?.records || []).filter(r => r.Provider__c === 'Storm');

  // Combine all numbers for Section 2
  const allNumbers = useMemo(() => {
    const combined = [];
    
    ctmNumbers.forEach(num => {
      combined.push({
        tracking_number: num.tracking_number,
        description: num.description || '',
        source: 'CTM',
        status: num.status || 'active'
      });
    });
    
    stormNumbers.forEach(num => {
      combined.push({
        tracking_number: num.Access_Number__c || '',
        description: num.Telecom_Description__c || num.Name || '',
        source: 'Storm',
        status: num.Active__c ? 'active' : 'inactive'
      });
    });
    
    return combined;
  }, [ctmNumbers, stormNumbers]);

  // Get all tracking numbers for call stats query
  const allTrackingNumbersList = useMemo(() => {
    return allNumbers.map(n => n.tracking_number).filter(Boolean);
  }, [allNumbers]);

  // Section 3: Call Stats from CallRecord entity
  const { data: callRecords = [], isLoading: callsLoading } = useQuery({
    queryKey: ['callRecords', allTrackingNumbersList, startDate, endDate],
    queryFn: async () => {
      if (allTrackingNumbersList.length === 0 || !startDate || !endDate) return [];
      
      const allRecords = await base44.entities.CallRecord.list();
      
      return allRecords.filter(record => {
        if (!record.tracking_number || !record.start_time) return false;
        if (!allTrackingNumbersList.includes(record.tracking_number)) return false;
        const callDate = record.start_time.split('T')[0];
        return callDate >= startDate && callDate <= endDate;
      });
    },
    enabled: allTrackingNumbersList.length > 0 && !!startDate && !!endDate
  });

  // Generate month columns based on date range
  const monthColumns = useMemo(() => {
    if (!startDate || !endDate) return [];
    
    try {
      const start = parseISO(startDate);
      const end = parseISO(endDate);
      const months = eachMonthOfInterval({ start, end });
      
      return months.map(month => ({
        key: format(month, 'yyyy-MM'),
        label: format(month, 'MMM yyyy')
      }));
    } catch {
      return [];
    }
  }, [startDate, endDate]);

  // Group call records by tracking number and month
  const callStatsData = useMemo(() => {
    if (!callRecords.length || !monthColumns.length) return [];

    const grouped = {};

    callRecords.forEach(record => {
      const trackingNum = record.tracking_number;
      
      if (!grouped[trackingNum]) {
        grouped[trackingNum] = {
          tracking_number: trackingNum,
          months: {},
          total: 0
        };
      }

      if (record.start_time) {
        const monthKey = format(parseISO(record.start_time), 'yyyy-MM');
        grouped[trackingNum].months[monthKey] = (grouped[trackingNum].months[monthKey] || 0) + 1;
        grouped[trackingNum].total += 1;
      }
    });

    return Object.values(grouped).sort((a, b) => b.total - a.total);
  }, [callRecords, monthColumns]);

  // Calculate totals row
  const monthTotals = useMemo(() => {
    const totals = {};
    let grandTotal = 0;

    monthColumns.forEach(col => {
      totals[col.key] = 0;
    });

    callStatsData.forEach(row => {
      monthColumns.forEach(col => {
        totals[col.key] += row.months[col.key] || 0;
      });
      grandTotal += row.total;
    });

    return { months: totals, grandTotal };
  }, [callStatsData, monthColumns]);

  const hasFilters = selectedAccount && startDate && endDate;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Phone className="w-8 h-8" />
            Telecoms Report
          </h1>
          <p className="text-gray-600 mt-1">View active services, tracking numbers, and call statistics</p>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Salesforce Account</Label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map(account => (
                      <SelectItem key={account.Id} value={account.Company__r?.Name || account.Name}>
                        {account.Name} {account.Company__r?.Name ? `(${account.Company__r.Name})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Empty State */}
        {!selectedAccount && (
          <Card>
            <CardContent className="py-12 text-center">
              <Phone className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">Select an account to view telecoms data</p>
            </CardContent>
          </Card>
        )}

        {/* Section 1: Active Service Lines */}
        {selectedAccount && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Active Service Lines
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lineItemsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : lineItems.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No active service lines found</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Display Name</TableHead>
                        <TableHead>Recurring Amount</TableHead>
                        <TableHead>Start Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Frequency</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineItems.map(item => (
                        <TableRow key={item.Id}>
                          <TableCell className="font-medium">{item.Name}</TableCell>
                          <TableCell>{item.Display_Name__c || '-'}</TableCell>
                          <TableCell>
                            {item.Recurring_Amount__c 
                              ? `£${Number(item.Recurring_Amount__c).toFixed(2)}` 
                              : '-'}
                          </TableCell>
                          <TableCell>
                            {item.Start_Date__c 
                              ? format(parseISO(item.Start_Date__c), 'dd/MM/yyyy') 
                              : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge className={item.Status__c === 'Active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                              {item.Status__c}
                            </Badge>
                          </TableCell>
                          <TableCell>{item.Frequency__c || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Section 2: All Numbers */}
        {selectedAccount && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Hash className="w-5 h-5" />
                All Numbers
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(ctmNumbersLoading || stormLoading) ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : allNumbers.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No tracking numbers found</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tracking Number</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allNumbers.map((num, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono">{num.tracking_number}</TableCell>
                          <TableCell>{num.description || '-'}</TableCell>
                          <TableCell>
                            <Badge className={num.source === 'CTM' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}>
                              {num.source}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={num.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                              {num.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Section 3: Call Stats */}
        {hasFilters && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Call Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              {callsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : callStatsData.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No call records found for this date range</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[150px]">Tracking Number</TableHead>
                        {monthColumns.map(col => (
                          <TableHead key={col.key} className="text-center min-w-[80px]">
                            {col.label}
                          </TableHead>
                        ))}
                        <TableHead className="text-center font-bold min-w-[80px]">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {callStatsData.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono">{row.tracking_number}</TableCell>
                          {monthColumns.map(col => (
                            <TableCell key={col.key} className="text-center">
                              {row.months[col.key] || 0}
                            </TableCell>
                          ))}
                          <TableCell className="text-center font-bold">{row.total}</TableCell>
                        </TableRow>
                      ))}
                      {/* Totals Row */}
                      <TableRow className="bg-gray-100 font-bold">
                        <TableCell>Total</TableCell>
                        {monthColumns.map(col => (
                          <TableCell key={col.key} className="text-center">
                            {monthTotals.months[col.key] || 0}
                          </TableCell>
                        ))}
                        <TableCell className="text-center">{monthTotals.grandTotal}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}