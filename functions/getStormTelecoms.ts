import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { companyId } = await req.json();

    if (!companyId) {
      return Response.json({ error: 'companyId required' }, { status: 400 });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken("salesforce");
    const instanceUrl = 'https://adtrak.my.salesforce.com';

    const query = `
      SELECT Id, Name, Access_Number__c, Telecom_Description__c, Active__c, Provider__c
      FROM Telecoms__c
      WHERE Company__c = '${companyId}'
      AND Provider__c = 'Storm'
      ORDER BY Name ASC
    `;

    const encodedQuery = encodeURIComponent(query);
    const queryUrl = `${instanceUrl}/services/data/v59.0/query?q=${encodedQuery}`;

    const response = await fetch(queryUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[getStormTelecoms] Query failed:', errorText);
      return Response.json({ error: 'Failed to fetch Storm telecoms', details: errorText }, { status: response.status });
    }

    const data = await response.json();
    return Response.json({ records: data.records || [] });

  } catch (error) {
    console.error('[getStormTelecoms] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});