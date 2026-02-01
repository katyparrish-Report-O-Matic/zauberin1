import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('salesforce');

    // Test query with just the problematic fields
    const testQuery = `SELECT Id, Name, At_Risk__c, Archived__c FROM Account LIMIT 5`;
    
    const encodedQuery = encodeURIComponent(testQuery);
    const response = await fetch(`https://adtrak.my.salesforce.com/services/data/v59.0/query?q=${encodedQuery}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();
    
    return Response.json({ 
      status: response.status,
      query: testQuery,
      result 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});