import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('salesforce');

    const response = await fetch('https://adtrak.my.salesforce.com/services/data/v59.0/query?q=SELECT Id, Account_Manager__c, Active_Marketing_Budget__c, Active_Marketing_Client__c, Adtrak_Paid_Marketing_Customer__c, Agency_Analytics_ID__c, Archived__c, Breeez_Account__c, Client_Team__c, Client_Team_Owner__c, Company_History__c, Company_Status__c, Current_Account_Plan__c, Marketing_Package_Client__c, Marketing_Package_Type__c, Name, Number_of_Live_Services__c, Number_of_Marketing_Live_Services__c, Number_of_Opportunities__c, ParentId, Primary_Sector__c, Sector__c, Sector_Category__c, Service_Agreement__c, Subscription_Line_Item__c FROM Account ORDER BY CreatedDate DESC', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      return Response.json({ error: `Salesforce API error: ${error}` }, { status: response.status });
    }

    const data = await response.json();
    return Response.json({ accounts: data.records || [] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});