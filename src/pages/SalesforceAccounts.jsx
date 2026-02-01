import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Search, Filter, Building2, AlertCircle, TrendingUp } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function SalesforceAccounts() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [podFilter, setPodFilter] = useState('all');
  const [sectorFilter, setSectorFilter] = useState('all');

  const { data: result, isLoading, error, refetch } = useQuery({
    queryKey: ['salesforceAccounts'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getSalesforceAccounts');
      return response.data;
    }
  });

  const accounts = result?.accounts || [];

  // Extract unique values for filters
  const uniquePods = useMemo(() => 
    [...new Set(accounts.map(a => a.POD__c).filter(Boolean))].sort(),
    [accounts]
  );

  const uniqueSectors = useMemo(() => 
    [...new Set(accounts.map(a => a.Primary_Sector__c).filter(Boolean))].sort(),
    [accounts]
  );

  const uniqueStatuses = useMemo(() => 
    [...new Set(accounts.map(a => a.Company_Status__c).filter(Boolean))].sort(),
    [accounts]
  );

  const filteredAccounts = accounts.filter(account => {
    const matchesSearch = !searchTerm || 
      account.Name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.Account_Manager__c?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.Primary_Sector__c?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || account.Company_Status__c === statusFilter;
    const matchesPod = podFilter === 'all' || account.POD__c === podFilter;
    const matchesSector = sectorFilter === 'all' || account.Primary_Sector__c === sectorFilter;

    return matchesSearch && matchesStatus && matchesPod && matchesSector;
  });

  const handleRefresh = () => {
    refetch();
    toast.success('Refreshing Salesforce accounts...');
  };

  const renderField = (label, value) => {
    if (!value) return null;
    return (
      <div className="flex justify-between items-start py-2 border-b border-gray-100">
        <span className="text-sm text-gray-600 font-medium">{label}</span>
        <span className="text-sm text-gray-900 text-right max-w-[200px]">{value}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Salesforce Accounts</h1>
            <p className="text-gray-600 mt-1">View and manage all Salesforce accounts</p>
          </div>
          <Button onClick={handleRefresh} disabled={isLoading} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>

        {/* Search and Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative md:col-span-1">
            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <Input
              placeholder="Search accounts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {uniqueStatuses.map(status => (
                <SelectItem key={status} value={status}>{status}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={podFilter} onValueChange={setPodFilter}>
            <SelectTrigger>
              <SelectValue placeholder="POD" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All PODs</SelectItem>
              {uniquePods.map(pod => (
                <SelectItem key={pod} value={pod}>{pod}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sectorFilter} onValueChange={setSectorFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Sector" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sectors</SelectItem>
              {uniqueSectors.map(sector => (
                <SelectItem key={sector} value={sector}>{sector}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="text-gray-600">Loading Salesforce accounts...</div>
          </div>
        ) : error ? (
          <Card className="p-6 bg-red-50 border-red-200">
            <p className="text-red-700">Error loading accounts: {error.message}</p>
          </Card>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {filteredAccounts.length} of {accounts.length} accounts
            </p>

            {filteredAccounts.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="text-gray-600">No accounts found</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredAccounts.map((account) => (
                  <Card key={account.Id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-5 h-5 text-blue-600" />
                          <CardTitle className="text-lg">{account.Name}</CardTitle>
                        </div>
                        {account.At_Risk__c && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertCircle className="w-3 h-3" />
                            At Risk
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {account.POD__c && (
                          <Badge variant="secondary">{account.POD__c}</Badge>
                        )}
                        {account.Primary_Sector__c && (
                          <Badge variant="outline">{account.Primary_Sector__c}</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                      {renderField('Account Manager', account.Account_Manager__c)}
                      {renderField('Sector Category', account.Sector_Category__c)}
                      {renderField('Marketing Budget', account.Total_Current_Marketing_Budget__c)}
                      {renderField('Active Marketing Client', account.Active_Marketing_Client__c)}
                      {renderField('Marketing Package', account.Marketing_Package_Type__c)}
                      {renderField('Live Services', account.Live_Services__c)}
                      {renderField('Opportunities', account.Number_of_Opportunities__c)}
                      {renderField('Client Team Owner', account.Client_Team_Owner__c)}
                      {renderField('Current Account Plan', account.Current_Account_Plan__c)}
                      {renderField('Service Agreement', account.Service_Agreement__c)}
                      {renderField('Agency Analytics ID', account.Agency_Analytics_ID__c)}
                      {account.Company_History__c && (
                        <div className="pt-2 mt-2 border-t border-gray-200">
                          <span className="text-xs text-gray-500 font-medium">Company History</span>
                          <p className="text-xs text-gray-700 mt-1">{account.Company_History__c}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}