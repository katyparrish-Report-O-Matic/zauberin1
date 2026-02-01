import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get accounts from local database
    const accounts = await base44.entities.SalesforceAccount.filter({
      organization_id: user.organization_id,
      is_active: true
    }, '-updated_date', 100) || [];

    // Update last_sync_at timestamp
    const now = new Date().toISOString();
    if (dataSource) {
      await base44.asServiceRole.entities.DataSource.update(dataSource.id, {
        last_sync_at: now,
        last_sync_status: 'success',
        total_records_synced: (dataSource.total_records_synced || 0) + accounts.length
      });
    }

    return Response.json({ 
      accounts,
      syncMetadata: {
        type: syncType,
        recordsFetched: accounts.length,
        lastSyncAt: now,
        previousSyncAt: dataSource?.last_sync_at || null
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});