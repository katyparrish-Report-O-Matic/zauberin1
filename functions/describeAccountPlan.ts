import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('salesforce');

    // Get Account Plan object metadata
    const response = await fetch(`https://adtrak.my.salesforce.com/services/data/v59.0/sobjects/Account_Plan__c/describe/`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    // Filter for relationship fields
    const relationshipFields = data.fields.filter(f => f.type === 'reference' || f.relationshipName);
    
    return Response.json({ 
      objectName: data.name,
      relationshipFields: relationshipFields.map(f => ({
        name: f.name,
        label: f.label,
        type: f.type,
        referenceTo: f.referenceTo,
        relationshipName: f.relationshipName
      }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});