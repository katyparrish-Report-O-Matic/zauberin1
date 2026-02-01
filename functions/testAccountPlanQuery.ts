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

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('salesforce');

    // Get Account Plan with all relationship fields
    const testQuery = `SELECT Id, Name, Account__c, Company__c, Service_Agreement__c, Service_Agreement__r.Company__c FROM Account_Plan__c LIMIT 5`;
    const encodedQuery = encodeURIComponent(testQuery);
    
    const response = await fetch(`https://adtrak.my.salesforce.com/services/data/v59.0/query?q=${encodedQuery}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    return Response.json({ 
      success: response.ok,
      totalSize: data.totalSize,
      records: data.records,
      error: data.error ? data.error[0]?.message : null
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});