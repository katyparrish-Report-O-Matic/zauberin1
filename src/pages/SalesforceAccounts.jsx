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

  // Extract unique values for filters - using database field names
  const uniquePods = useMemo(() => [], []);
  const uniqueSectors = useMemo(() => [], []);
  const uniqueStatuses = useMemo(() => [], []);

  const filteredAccounts = accounts.filter(account => {
    const name = account.account_name || account.Name || '';
    const ownerName = account.owner_name || account.Account_Manager__c || '';
    
    const matchesSearch = !searchTerm || 
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ownerName.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSearch;
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
                  <Card key={account.salesforce_id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-5 h-5 text-blue-600" />
                          <CardTitle className="text-lg">{account.account_name || 'Unnamed Account'}</CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      {renderField('Owner', account.owner_name)}
                      {renderField('Email', account.owner_email)}
                      {renderField('Phone', account.phone)}
                      {renderField('Type', account.type)}
                      {renderField('Industry', account.industry)}
                      {renderField('Website', account.website)}
                      {renderField('Employees', account.number_of_employees)}
                      {renderField('Annual Revenue', account.annual_revenue)}
                      {renderField('Billing Street', account.billing_street)}
                      {renderField('Billing City', account.billing_city)}
                      {renderField('Billing State', account.billing_state)}
                      {renderField('Postal Code', account.billing_postal_code)}
                      {renderField('Country', account.billing_country)}
                      {renderField('Account Number', account.account_number)}
                      {renderField('Active', account.is_active ? 'Yes' : 'No')}
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