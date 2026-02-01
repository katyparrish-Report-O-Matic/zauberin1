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
    });

    let dataSource = dataSources[0];
    let whereClause = '';
    let syncType = 'full';

    // If we have a previous sync timestamp, use incremental sync
    if (dataSource?.last_sync_at) {
      const lastSyncDate = new Date(dataSource.last_sync_at).toISOString();
      whereClause = ` WHERE LastModifiedDate > ${lastSyncDate}`;
      syncType = 'incremental';
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('salesforce');

    const soqlQuery = `SELECT Id, Account_Manager__c, Active_Marketing_Budget__c, Active_Marketing_Client__c, Adtrak_Paid_Marketing_Customer__c, Agency_Analytics_ID__c, Archived__c, At_Risk__c, Breeez_Account__c, Client_Team__c, Client_Team_Owner__c, Company_History__c, Company_Status__c, Current_Account_Plan__c, Marketing_Package_Client__c, Marketing_Package_Type__c, Name, Number_of_Live_Services__c, Number_of_Marketing_Live_Services__c, Number_of_Opportunities__c, ParentId, POD__c, Primary_Sector__c, Sector__c, Sector_Category__c, Service_Agreement__c, Subscription_Line_Item__c, Total_Current_Marketing_Budget__c FROM Account${whereClause} ORDER BY LastModifiedDate DESC`;

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
    const accounts = data.records || [];

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