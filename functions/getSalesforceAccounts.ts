import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('salesforce');
    
    const query = `SELECT 
      Id, Name, Account_Manager__c, Primary_Sector__c, Sector_Category__c,
      Total_Current_Marketing_Budget__c, Active_Marketing_Client__c, Marketing_Package_Type__c,
      Live_Services__c, Marketing_Age_in_Years__c, Number_of_Opportunities__c,
      POD__c, Client_Team_Owner__c, Current_Account_Plan__c, 
      Service_Agreement__c, Agency_Analytics_ID__c, Company_History__c,
      At_Risk__c
    FROM Account 
    LIMIT 500`;

    const response = await fetch('https://login.salesforce.com/services/oauth2/authorize?response_type=code', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Use Salesforce REST API to query accounts
    const instanceUrl = 'https://adtrak.salesforce.com';
    const sfResponse = await fetch(`${instanceUrl}/services/data/v60.0/query?q=${encodeURIComponent(query)}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!sfResponse.ok) {
      return Response.json({ error: 'Salesforce API error: ' + sfResponse.statusText }, { status: 500 });
    }

    const data = await sfResponse.json();
    
    return Response.json({ 
      accounts: data.records || [],
      syncMetadata: {
        recordsFetched: data.records?.length || 0,
        source: 'salesforce_api'
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});