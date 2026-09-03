import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { dataSourceId } = await req.json();

    if (!dataSourceId) {
      return Response.json({ error: 'dataSourceId required' }, { status: 400 });
    }

    // Find in-progress sync job
    const inProgressJobs = await base44.asServiceRole.entities.SyncJob.filter({
      data_source_id: dataSourceId,
      status: 'in_progress'
    });

    if (inProgressJobs.length === 0) {
      return Response.json({ error: 'No in-progress sync found', status: 'not_found' }, { status: 404 });
    }

    const job = inProgressJobs[0];

    // Cancel it
    await base44.asServiceRole.entities.SyncJob.update(job.id, {
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      error_message: 'Cancelled by user'
    });

    return Response.json({
      success: true,
      jobId: job.id,
      message: 'Sync cancelled'
    });

  } catch (error) {
    console.error('[Cancel Sync] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});