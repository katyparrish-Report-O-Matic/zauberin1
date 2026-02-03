import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Fetch all AccountMapping records
    const allMappings = await base44.asServiceRole.entities.AccountMapping.list();

    // Find records that need migration (have ctm_account_name but no source_account_name)
    const toMigrate = allMappings.filter(m => 
      m.ctm_account_name && (!m.source_account_name || m.source_account_name === '')
    );

    let migrated = 0;
    const errors = [];

    for (const mapping of toMigrate) {
      try {
        await base44.asServiceRole.entities.AccountMapping.update(mapping.id, {
          source_account_name: mapping.ctm_account_name,
          source_type: 'ctm'
        });
        migrated++;
      } catch (err) {
        errors.push({ id: mapping.id, error: err.message });
      }
    }

    return Response.json({
      success: true,
      total: allMappings.length,
      needsMigration: toMigrate.length,
      migrated,
      errors
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});