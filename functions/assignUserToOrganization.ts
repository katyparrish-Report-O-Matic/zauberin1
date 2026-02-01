import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Update current user's organization_id
    await base44.auth.updateMe({
      organization_id: '691599fd95dfa732e5bd8802'
    });

    return Response.json({ 
      success: true, 
      message: 'User assigned to Adtrak organization',
      user: await base44.auth.me()
    });
  } catch (error) {
    console.error('[assignUserToOrganization] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});