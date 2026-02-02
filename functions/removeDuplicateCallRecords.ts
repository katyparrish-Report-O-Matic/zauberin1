import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Remove duplicate CallRecords - keeps oldest record for each call_id
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.log('[Dedupe] Starting duplicate removal...');

    // Fetch all CallRecords in batches
    let allRecords = [];
    let skip = 0;
    const batchSize = 500;
    
    while (true) {
      const batch = await base44.asServiceRole.entities.CallRecord.filter({}, 'created_date', batchSize, skip);
      if (!batch || batch.length === 0) break;
      allRecords = allRecords.concat(batch);
      skip += batchSize;
      console.log(`[Dedupe] Fetched ${allRecords.length} records so far...`);
      if (batch.length < batchSize) break;
    }
    
    console.log(`[Dedupe] Found ${allRecords.length} total records`);

    // Group by call_id
    const callIdMap = {};
    for (const record of allRecords) {
      const callId = record.call_id;
      if (!callId) continue;
      if (!callIdMap[callId]) {
        callIdMap[callId] = [];
      }
      callIdMap[callId].push({
        id: record.id,
        created_date: record.created_date
      });
    }

    // Find duplicates (call_ids with more than 1 record)
    const duplicateCallIds = Object.keys(callIdMap).filter(callId => callIdMap[callId].length > 1);
    
    console.log(`[Dedupe] Found ${duplicateCallIds.length} call_ids with duplicates`);

    // Collect IDs to delete (keep the first/oldest, delete the rest)
    const idsToDelete = [];
    for (const callId of duplicateCallIds) {
      const records = callIdMap[callId];
      // Sort by created_date ascending (oldest first)
      records.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
      
      // Keep the first (oldest), delete the rest
      for (let i = 1; i < records.length; i++) {
        idsToDelete.push(records[i].id);
      }
    }

    console.log(`[Dedupe] Will delete ${idsToDelete.length} duplicate records`);

    // Delete one by one
    let deleted = 0;
    for (const id of idsToDelete) {
      try {
        await base44.asServiceRole.entities.CallRecord.delete(id);
        deleted++;
        if (deleted % 100 === 0) {
          console.log(`[Dedupe] Deleted ${deleted}/${idsToDelete.length}`);
        }
      } catch (e) {
        console.warn(`[Dedupe] Failed to delete ${id}: ${e.message}`);
      }
    }

    return Response.json({
      success: true,
      totalRecords: allRecords.length,
      duplicateCallIds: duplicateCallIds.length,
      recordsDeleted: deleted,
      remainingRecords: allRecords.length - deleted
    });

  } catch (error) {
    console.error('[Dedupe] Error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});