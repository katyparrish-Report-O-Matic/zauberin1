import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

export default function AccountPlanModal({ accountId, isOpen, onClose }) {
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && accountId) {
      fetchPlans();
    }
  }, [isOpen, accountId]);

  const fetchPlans = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('[DEBUG] Fetching plans for serviceAgreementId:', accountId);
      const response = await base44.functions.invoke('getAccountPlanDetails', { serviceAgreementId: accountId });
      console.log('[DEBUG] Plans response:', response.data);
      setPlans(response.data.plans || []);
      if (response.data.plans?.length > 0) {
        setSelectedPlan(response.data.plans[0]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const renderFieldValue = (value) => {
    if (!value) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const fieldGroups = [
    {
      label: 'Basic Information',
      fields: [
        { key: 'Name', label: 'Plan Name' },
        { key: 'Status__c', label: 'Status' },
        { key: 'Due_Date__c', label: 'Due Date' },
        { key: 'Start_Date__c', label: 'Start Date' },
      ]
    },
    {
      label: 'Planning & Focus',
      fields: [
        { key: 'Account_Plan_Focus__c', label: 'Account Plan Focus' },
        { key: 'Primary_Priority__c', label: 'Primary Priority' },
        { key: 'Secondary_Priority__c', label: 'Secondary Priority' },
        { key: 'Marketing_Goals__c', label: 'Marketing Goals' },
        { key: 'Marketing_Channels__c', label: 'Marketing Channels' },
      ]
    },
    {
      label: 'Budget & Resources',
      fields: [
        { key: 'Expected_Ad_Spend__c', label: 'Expected Ad Spend' },
        { key: 'Total_Current_Marketing_Budget__c', label: 'Total Marketing Budget' },
        { key: 'Recommended_Products_and_Services__c', label: 'Recommended Products/Services' },
      ]
    },
    {
      label: 'Analysis & Insights',
      fields: [
        { key: 'IM_Summary_Analysis__c', label: 'IM Summary & Analysis' },
        { key: 'PM_Summary_Analysis__c', label: 'PM Summary & Analysis' },
        { key: 'Social_Summary_Analysis__c', label: 'Social Summary & Analysis' },
        { key: 'Paid_Social_Summary_Analysis__c', label: 'Paid Social Summary & Analysis' },
      ]
    },
    {
      label: 'Details & Strategy',
      fields: [
        { key: 'Activity_Plan__c', label: 'Activity Plan' },
        { key: 'Value_Proposition__c', label: 'Value Proposition' },
        { key: 'Work_Summary__c', label: 'Work Summary' },
        { key: 'Performance_Summary__c', label: 'Performance Summary' },
      ]
    },
    {
      label: 'Review Information',
      fields: [
        { key: 'Client_Review_Date__c', label: 'Client Review Date' },
        { key: 'Client_Review_Deadline__c', label: 'Client Review Deadline' },
        { key: 'Post_Review_Summary__c', label: 'Post Review Summary' },
      ]
    },
    {
      label: 'Competitive & Contact',
      fields: [
        { key: 'Primary_Competitors__c', label: 'Primary Competitors' },
        { key: 'Email_Marketing_Account_Login_Username__c', label: 'Email Marketing Username' },
      ]
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-2xl">Account Plan Details</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 h-[calc(90vh-120px)]">
          {/* Plans List */}
          <div className="col-span-1 border-r bg-gray-50 p-4">
            <h3 className="font-semibold text-sm mb-3">Plans</h3>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : plans.length === 0 ? (
              <p className="text-sm text-gray-500">No plans found</p>
            ) : (
              <ScrollArea className="h-full">
                <div className="space-y-2">
                  {plans.map((plan) => (
                    <button
                      key={plan.Id}
                      onClick={() => setSelectedPlan(plan)}
                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                        selectedPlan?.Id === plan.Id
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-gray-200 text-gray-900'
                      }`}
                    >
                      <div className="font-medium truncate">{plan.Name}</div>
                      <div className="text-xs opacity-70">{plan.Status__c || 'No status'}</div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Plan Details */}
          <div className="col-span-2">
            {selectedPlan ? (
              <ScrollArea className="h-full p-6">
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold mb-2">{selectedPlan.Name}</h2>
                    <div className="flex gap-2 flex-wrap">
                      {selectedPlan.Status__c && (
                        <Badge>{selectedPlan.Status__c}</Badge>
                      )}
                    </div>
                  </div>

                  {fieldGroups.map((group) => {
                    const hasValues = group.fields.some(f => selectedPlan[f.key]);
                    if (!hasValues) return null;

                    return (
                      <div key={group.label}>
                        <h3 className="font-semibold text-sm mb-3 text-gray-700">{group.label}</h3>
                        <div className="space-y-3">
                          {group.fields.map((field) => {
                            const value = selectedPlan[field.key];
                            if (!value) return null;

                            return (
                              <div key={field.key} className="border-b border-gray-100 pb-3">
                                <div className="text-xs font-medium text-gray-600 mb-1">
                                  {field.label}
                                </div>
                                <div className="text-sm text-gray-900 whitespace-pre-wrap">
                                  {renderFieldValue(value)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                {error ? (
                  <div className="text-red-600">Error: {error}</div>
                ) : (
                  'No plan selected'
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}