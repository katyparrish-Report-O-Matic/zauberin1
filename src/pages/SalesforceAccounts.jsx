import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';

export default function SalesforceAccounts() {
  const [searchTerm, setSearchTerm] = useState('');

  const { data: result, isLoading, error, refetch } = useQuery({
    queryKey: ['salesforceAccounts'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getSalesforceAccounts');
      return response.data;
    }
  });

  const accounts = result?.accounts || [];

  const filteredAccounts = accounts.filter(account =>
    account.Name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.Primary_Sector__c?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.Company_Status__c?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRefresh = () => {
    refetch();
    toast.success('Refreshing Salesforce accounts...');
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

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <Input
            placeholder="Search by name, sector, or status..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
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
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-100 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Account Name</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Industry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAccounts.map((account) => (
                      <tr key={account.Id} className="border-b border-gray-200 hover:bg-gray-50">
                         <td className="px-6 py-4 text-sm font-medium text-gray-900">{account.Name}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Industry || '-'}</td>
                       </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}