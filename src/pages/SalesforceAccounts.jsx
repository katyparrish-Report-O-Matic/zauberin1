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
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Account Manager</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Active Marketing Budget</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Active Marketing Client</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Adtrak Paid Marketing Customer</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Agency Analytics ID</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Archived</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Breeez Account</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Client Team</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Client Team Owner</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Company History</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Company Status</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Current Account Plan</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Marketing Package Client</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Marketing Package Type</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Number of Live Services</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Number of Marketing Live Services</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Number of Opportunities</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Parent ID</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Primary Sector</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Sector</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Sector Category</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Service Agreement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAccounts.map((account) => (
                      <tr key={account.Id} className="border-b border-gray-200 hover:bg-gray-50">
                         <td className="px-6 py-4 text-sm font-medium text-gray-900">{account.Name || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Account_Manager__c || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Active_Marketing_Budget__c || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Active_Marketing_Client__c || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Adtrak_Paid_Marketing_Customer__c || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Agency_Analytics_ID__c || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Archived__c || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Breeez_Account__c || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Client_Team__c || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Client_Team_Owner__c || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Company_History__c || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Company_Status__c || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Current_Account_Plan__c || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Marketing_Package_Client__c || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Marketing_Package_Type__c || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Number_of_Live_Services__c || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Number_of_Marketing_Live_Services__c || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Number_of_Opportunities__c || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.ParentId || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Primary_Sector__c || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Sector__c || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Sector_Category__c || '-'}</td>
                         <td className="px-6 py-4 text-sm text-gray-600">{account.Service_Agreement__c || '-'}</td>
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