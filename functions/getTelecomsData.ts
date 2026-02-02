import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Fetch Telecoms__c records from Salesforce filtered by Account Name
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accountName } = await req.json();

    if (!accountName) {
      return Response.json({ error: 'accountName required' }, { status: 400 });
    }

    // Get Salesforce access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken("salesforce");

    // Query Telecoms__c by Account_Name__c
    const query = `SELECT Id, Name, Access_Number__c, Account_Name__c, Active__c 
                   FROM Telecoms__c 
                   WHERE Account_Name__c = '${accountName.replace(/'/g, "\\'")}'
                   ORDER BY Name`;

    const response = await fetch(
      `https://adtrak.my.salesforce.com/services/data/v59.0/query?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[getTelecomsData] Salesforce error:', errorText);
      return Response.json({ error: 'Salesforce query failed', details: errorText }, { status: 500 });
    }

    const data = await response.json();

    return Response.json({
      success: true,
      records: data.records || [],
      totalSize: data.totalSize || 0
    });

  } catch (error) {
    console.error('[getTelecomsData] Error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});