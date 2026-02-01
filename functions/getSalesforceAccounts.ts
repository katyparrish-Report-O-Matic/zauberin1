import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountQuery = `SELECT Id, Name FROM Account LIMIT 500`;
    const serviceAgreementQuery = `SELECT Id, Name FROM Service_Agreement__c LIMIT 500`;
    const subscriptionLineItemQuery = `SELECT Id, Name FROM Subscription_Line_Item__c LIMIT 500`;

    const [accountRes, saRes, sliRes] = await Promise.all([
      base44.asServiceRole.integrations.Salesforce.Query({ soql: accountQuery }),
      base44.asServiceRole.integrations.Salesforce.Query({ soql: serviceAgreementQuery }),
      base44.asServiceRole.integrations.Salesforce.Query({ soql: subscriptionLineItemQuery })
    ]);

    const enrichedAccounts = accountRes.records?.map(account => ({
      ...account,
      serviceAgreements: saRes.records?.filter(sa => sa.AccountId === account.Id) || [],
      subscriptionLineItems: sliRes.records?.filter(sli => sli.AccountId === account.Id) || []
    })) || [];

    return Response.json({ 
      accounts: enrichedAccounts,
      syncMetadata: {
        accountsFetched: accountRes.records?.length || 0,
        serviceAgreementsFetched: saRes.records?.length || 0,
        subscriptionLineItemsFetched: sliRes.records?.length || 0,
        source: 'salesforce_api'
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});