import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { accountId } = body;

    if (!accountId) {
      return Response.json({ error: 'Account ID required' }, { status: 400 });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('salesforce');

    // Query for Account Plan records related to this account
    const soqlQuery = `SELECT Id, Name, Status__c, Due_Date__c, Account_Plan_Focus__c, Marketing_Goals__c, Primary_Priority__c, Secondary_Priority__c, Activity_Plan__c, Performance_Summary__c, Marketing_Channels__c, Recommended_Products_and_Services__c, Expected_Ad_Spend__c, Total_Current_Marketing_Budget__c, Start_Date__c, Client_Review_Date__c, Client_Review_Deadline__c, IM_Summary_Analysis__c, PM_Summary_Analysis__c, Social_Summary_Analysis__c, Paid_Social_Summary_Analysis__c, Value_Proposition__c, Work_Summary__c, Post_Review_Summary__c, Primary_Competitors__c, Email_Marketing_Account_Login_Username__c FROM Account_Plan__c WHERE Service_Agreement__r.Company__c = '${accountId}' ORDER BY CreatedDate DESC LIMIT 50`;

    const encodedQuery = encodeURIComponent(soqlQuery);
    const response = await fetch(`https://adtrak.my.salesforce.com/services/data/v59.0/query?q=${encodedQuery}`, {
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
    const plans = data.records || [];

    return Response.json({ plans });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});