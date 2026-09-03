import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('salesforce');

    const response = await fetch(`https://adtrak.my.salesforce.com/services/data/v59.0/sobjects/Account/describe`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();
    
    // Filter to show only custom fields
    const customFields = result.fields?.filter(f => f.name.includes('__c')).map(f => ({
      name: f.name,
      label: f.label,
      type: f.type
    }));
    
    return Response.json({ 
      totalFields: result.fields?.length,
      customFields,
      searchFor: ['At_Risk__c', 'POD__c', 'Current_Account_Plan__c', 'Total_Current_Marketing_Budget__c']
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});