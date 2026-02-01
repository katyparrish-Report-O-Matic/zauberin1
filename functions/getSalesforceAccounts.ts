import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get synced SalesforceAccount records from the database
    const accounts = await base44.entities.SalesforceAccount.filter({
      organization_id: user.organization_id
    }, '-created_date', 1000);

    return Response.json({ 
      accounts: accounts.map(acc => acc.data || acc),
      syncMetadata: {
        recordsFetched: accounts.length,
        source: 'database'
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});