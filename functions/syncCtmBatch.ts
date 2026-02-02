import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Sync a BATCH of CTM accounts (NOT all at once)
 * This prevents timeout by processing only 25-50 accounts per call
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { dataSourceId, startIndex = 0, batchSize = 25 } = await req.json();

    if (!dataSourceId) {
      return Response.json({ error: 'dataSourceId required' }, { status: 400 });
    }

    // Fetch DataSource
    const dataSources = await base44.asServiceRole.entities.DataSource.filter({
      id: dataSourceId
    });

    if (!dataSources.length) {
      return Response.json({ error: 'Data source not found' }, { status: 404 });
    }

    const dataSource = dataSources[0];
    const accountIds = dataSource.account_ids || [];
    const apiKey = dataSource.credentials?.api_key;

    if (!apiKey) {
      return Response.json({ error: 'API key not configured' }, { status: 400 });
    }

    // Calculate batch boundaries
    const endIndex = Math.min(startIndex + batchSize, accountIds.length);
    const batchAccountIds = accountIds.slice(startIndex, endIndex);
    const isComplete = endIndex >= accountIds.length;

    console.log(`[CTM Batch] Processing accounts ${startIndex}-${endIndex-1} of ${accountIds.length}`);

    if (batchAccountIds.length === 0) {
      return Response.json({
        success: true,
        processedCount: 0,
        totalSaved: 0,
        nextStartIndex: startIndex,
        isComplete: true
      });
    }

    // Date range
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = dataSource.last_sync_at 
      ? new Date(dataSource.last_sync_at).toISOString().split('T')[0]
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let totalSaved = 0;
    const isAgencyLevel = apiKey.includes(':');

    // Get account regions
    const accountHierarchies = await base44.asServiceRole.entities.AccountHierarchy.filter({
      data_source_id: dataSource.id
    });
    const accountRegionMap = {};
    accountHierarchies.forEach(ah => {
      if (ah.external_id && ah.region) {
        accountRegionMap[ah.external_id] = ah.region;
      }
    });

    // Process ONLY this batch of accounts
    for (let i = 0; i < batchAccountIds.length; i++) {
      const accountId = batchAccountIds[i];
      const accountRegion = accountRegionMap[String(accountId)] || null;

      try {
        console.log(`[CTM Batch] [${i+1}/${batchAccountIds.length}] Fetching account ${accountId}`);

        const result = await base44.asServiceRole.functions.invoke('syncCallTrackingData', {
          accountId: String(accountId),
          startDate,
          endDate,
          apiKey,
          isAgencyLevel,
          includeRawCalls: true,
          accountRegion,
          dataSourceId: dataSource.id
        });

        if (!result.data?.success) {
          console.warn(`[CTM Batch] Account ${accountId} failed:`, result.data?.error);
          continue;
        }

        const callRecords = result.data.callRecords || [];
        const accountName = result.data.account?.name || `Account ${accountId}`;

        // Save records immediately
        if (callRecords.length > 0) {
          const recordsToSave = callRecords.map(call => ({
            organization_id: dataSource.organization_id,
            data_source_id: dataSource.id,
            account_id: String(accountId),
            account_name: accountName,
            region: accountRegion,
            ...call
          }));

          const created = await base44.asServiceRole.entities.CallRecord.bulkCreate(recordsToSave);
          const savedCount = Array.isArray(created) ? created.length : 0;
          totalSaved += savedCount;
          console.log(`[CTM Batch] Account ${accountId} saved ${savedCount} records`);
        }

        // Update/Create AccountHierarchy
        const existing = await base44.asServiceRole.entities.AccountHierarchy.filter({
          data_source_id: dataSource.id,
          external_id: String(accountId)
        });

        if (existing.length === 0) {
          await base44.asServiceRole.entities.AccountHierarchy.create({
            organization_id: dataSource.organization_id,
            data_source_id: dataSource.id,
            platform_type: 'call_tracking',
            hierarchy_level: 'account',
            external_id: String(accountId),
            name: accountName,
            region: accountRegion,
            status: 'active',
            last_updated: new Date().toISOString()
          });
        } else {
          await base44.asServiceRole.entities.AccountHierarchy.update(existing[0].id, {
            name: accountName,
            region: accountRegion || existing[0].region,
            last_updated: new Date().toISOString()
          });
        }

        // Small delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`[CTM Batch] Account ${accountId} error:`, error.message);
        continue;
      }
    }

    console.log(`[CTM Batch] Batch complete: ${totalSaved} records saved`);

    return Response.json({
      success: true,
      processedCount: batchAccountIds.length,
      totalSaved,
      nextStartIndex: endIndex,
      isComplete,
      batchInfo: {
        startIndex,
        endIndex,
        totalAccounts: accountIds.length
      }
    });

  } catch (error) {
    console.error('[CTM Batch] Error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});