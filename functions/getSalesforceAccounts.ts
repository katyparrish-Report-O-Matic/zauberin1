import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find the Salesforce data source for this org
    const dataSources = await base44.asServiceRole.entities.DataSource.filter({
      organization_id: user.organization_id,
      platform_type: 'salesforce'
    }, '-updated_date', 1);

    let dataSource = dataSources[0];
    let whereClause = '';
    let syncType = 'full';

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('salesforce');

    // Try incremental sync first if we have a previous timestamp
    let accounts = [];
    if (dataSource?.last_sync_at) {
      const lastSyncDate = new Date(dataSource.last_sync_at).toISOString();
      whereClause = ` WHERE LastModifiedDate > ${lastSyncDate}`;
      syncType = 'incremental';

      const soqlQuery = `SELECT Id, Name, At_Risk__c, At_Risk_Reason__c, POD__c, Current_Account_Plan__c, Total_Current_Marketing_Budget__c, Company__c, Company__r.Name, Company__r.Account_Manager__c, Primary_Sector__c, Status__c FROM Service_Agreement__c${whereClause} ORDER BY LastModifiedDate DESC`;
      const encodedQuery = encodeURIComponent(soqlQuery);
      const response = await fetch(`https://adtrak.my.salesforce.com/services/data/v59.0/query?q=${encodedQuery}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.text();
        return Response.json({ error: `Salesforce API error: ${error}` }, { status: response.status });
      }

      const data = await response.json();
      accounts = data.records || [];

      // If no changes found, fall back to full sync
      if (accounts.length === 0) {
        syncType = 'full';
      }
    }

    // Do full sync if no previous sync or incremental found nothing
    if (syncType === 'full') {
      whereClause = '';
      const soqlQuery = `SELECT Id, Name, At_Risk__c, At_Risk_Reason__c, POD__c, Current_Account_Plan__c, Total_Current_Marketing_Budget__c, Company__c, Company__r.Name, Company__r.Account_Manager__c, Primary_Sector__c, Status__c FROM Service_Agreement__c ORDER BY LastModifiedDate DESC LIMIT 10000`;
      const encodedQuery = encodeURIComponent(soqlQuery);
      const response = await fetch(`https://adtrak.my.salesforce.com/services/data/v59.0/query?q=${encodedQuery}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.text();
        return Response.json({ error: `Salesforce API error: ${error}` }, { status: response.status });
      }

      const data = await response.json();
      accounts = data.records || [];
    }

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