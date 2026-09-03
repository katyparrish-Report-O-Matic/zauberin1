import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { serviceAgreementId } = await req.json();

    if (!serviceAgreementId) {
      return Response.json({ error: 'serviceAgreementId required' }, { status: 400 });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken("salesforce");
    
    // Get instance URL from a simple query first
    const identityResponse = await fetch('https://login.salesforce.com/services/oauth2/userinfo', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!identityResponse.ok) {
      // Try production instance directly
      const instanceUrl = 'https://adtrak.my.salesforce.com';
      
      const query = `
        SELECT Id, Name, Display_Name__c, Recurring_Amount__c, Start_Date__c, Status__c, Frequency__c
        FROM Subscription_Line_Item__c
        WHERE Service_Agreement__c = '${serviceAgreementId}'
        AND Status__c IN ('Active', 'Planned')
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
        console.error('[getSubscriptionLineItems] Query failed:', errorText);
        return Response.json({ error: 'Failed to fetch line items', details: errorText }, { status: response.status });
      }

      const data = await response.json();
      return Response.json({ records: data.records || [] });
    }

    const identity = await identityResponse.json();
    const instanceUrl = identity.urls?.custom_domain || 'https://adtrak.my.salesforce.com';

    const query = `
      SELECT Id, Name, Display_Name__c, Recurring_Amount__c, Start_Date__c, Status__c, Frequency__c
      FROM Subscription_Line_Item__c
      WHERE Service_Agreement__c = '${serviceAgreementId}'
      AND Status__c IN ('Active', 'Planned')
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
      console.error('[getSubscriptionLineItems] Query failed:', errorText);
      return Response.json({ error: 'Failed to fetch line items', details: errorText }, { status: response.status });
    }

    const data = await response.json();
    return Response.json({ records: data.records || [] });

  } catch (error) {
    console.error('[getSubscriptionLineItems] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});