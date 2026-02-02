import React, { useState, useMemo } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Phone, Calendar, Loader2, Building2 } from "lucide-react";
import { format, parseISO, startOfMonth, eachMonthOfInterval } from "date-fns";

export default function TelecomsReport() {
  const [selectedAccount, setSelectedAccount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Fetch Salesforce Accounts
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['salesforceAccounts'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getSalesforceAccounts', {});
      return result.data;
    }
  });

  const accounts = accountsData?.accounts || [];

  // Fetch Telecoms__c data for selected account
  const { data: telecomsData, isLoading: telecomsLoading } = useQuery({
    queryKey: ['telecomsData', selectedAccount],
    queryFn: async () => {
      const result = await base44.functions.invoke('getTelecomsData', {
        accountName: selectedAccount
      });
      return result.data;
    },
    enabled: !!selectedAccount
  });

  const telecomsRecords = telecomsData?.records || [];

  // Fetch CallRecords for selected account and date range
  const { data: callRecords = [], isLoading: callsLoading } = useQuery({
    queryKey: ['callRecords', selectedAccount, startDate, endDate],
    queryFn: async () => {
      if (!selectedAccount || !startDate || !endDate) return [];
      
      const records = await base44.entities.CallRecord.filter({
        account_name: selectedAccount
      });
      
      // Filter by date range client-side
      return records.filter(record => {
        if (!record.start_time) return false;
        const callDate = record.start_time.split('T')[0];
        return callDate >= startDate && callDate <= endDate;
      });
    },
    enabled: !!selectedAccount && !!startDate && !!endDate
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
      const key = `${record.tracking_number || 'Unknown'}|||${record.tracking_number_description || ''}`;
      
      if (!grouped[key]) {
        grouped[key] = {
          tracking_number: record.tracking_number || 'Unknown',
          tracking_number_description: record.tracking_number_description || '',
          months: {},
          total: 0
        };
      }

      if (record.start_time) {
        const monthKey = format(parseISO(record.start_time), 'yyyy-MM');
        grouped[key].months[monthKey] = (grouped[key].months[monthKey] || 0) + 1;
        grouped[key].total += 1;
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

  const isLoading = accountsLoading || telecomsLoading || callsLoading;
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
          <p className="text-gray-600 mt-1">View active services and call statistics by account</p>
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
                <Label>Account</Label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map(account => (
                      <SelectItem key={account.Id} value={account.Name}>
                        {account.Name}
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

        {/* Loading State */}
        {isLoading && hasFilters && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        )}

        {/* Section 1: Active Services & Locations */}
        {selectedAccount && !telecomsLoading && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Active Services & Locations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {telecomsRecords.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No telecoms records found for this account</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Access Number</TableHead>
                      <TableHead>Telecoms Name</TableHead>
                      <TableHead>Active</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {telecomsRecords.map(record => (
                      <TableRow key={record.Id}>
                        <TableCell className="font-mono">{record.Access_Number__c}</TableCell>
                        <TableCell>{record.Name}</TableCell>
                        <TableCell>{record.Active__c ? 'Yes' : 'No'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Section 2: Call Stats */}
        {hasFilters && !callsLoading && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="w-5 h-5" />
                Call Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              {callStatsData.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No call records found for this account and date range</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[150px]">Tracking Number</TableHead>
                        <TableHead className="min-w-[200px]">Description</TableHead>
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
                          <TableCell>{row.tracking_number_description}</TableCell>
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
                        <TableCell colSpan={2}>Total</TableCell>
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

        {/* Empty State */}
        {!selectedAccount && (
          <Card>
            <CardContent className="py-12 text-center">
              <Phone className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">Select an account to view telecoms data</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}