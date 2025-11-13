import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Test CTM API Connection and List Available Accounts
 * Use this to verify credentials and see which account IDs are accessible
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      return Response.json({ 
        error: 'Invalid JSON in request body',
        details: parseError.message 
      }, { status: 400 });
    }

    const { apiKey } = body;

    if (!apiKey) {
      return Response.json({ 
        error: 'Missing required parameter: apiKey',
        hint: 'Provide apiKey in format "accessKey:secretKey"'
      }, { status: 400 });
    }

    // Parse credentials
    const parseCredentials = (token) => {
      if (token && token.length > 40 && !token.includes(':')) {
        return token;
      }
      
      if (token && token.includes(':')) {
        const [access, secret] = token.split(':');
        const encoder = new TextEncoder();
        const data = encoder.encode(`${access}:${secret}`);
        return btoa(String.fromCharCode(...data));
      }
      
      throw new Error('Invalid credentials format');
    };

    let auth;
    try {
      auth = parseCredentials(apiKey);
    } catch (credError) {
      return Response.json({ 
        error: 'Invalid API credentials format',
        details: credError.message
      }, { status: 400 });
    }

    const baseUrl = 'https://api.calltrackingmetrics.com/api/v1';

    // Test 1: Fetch list of accessible accounts
    console.log('[CTM Test] Fetching accounts list...');
    
    const accountsResponse = await fetch(`${baseUrl}/accounts.json`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    if (!accountsResponse.ok) {
      const errorText = await accountsResponse.text();
      return Response.json({
        success: false,
        error: 'Failed to fetch accounts',
        status: accountsResponse.status,
        details: errorText,
        hint: accountsResponse.status === 401 
          ? 'Invalid credentials - check Access Key and Secret Key'
          : 'API connection failed'
      }, { status: accountsResponse.status });
    }

    const accountsData = await accountsResponse.json();
    
    // Extract account details
    const accounts = accountsData.accounts || [];
    
    console.log(`[CTM Test] Found ${accounts.length} accessible accounts`);

    // Test 2: Try to fetch calls from the first account (if any)
    let callsTest = null;
    if (accounts.length > 0) {
      const firstAccountId = accounts[0].id;
      console.log(`[CTM Test] Testing calls endpoint for account ${firstAccountId}...`);
      
      try {
        const callsResponse = await fetch(
          `${baseUrl}/accounts/${firstAccountId}/calls.json?per_page=1`, 
          {
            method: 'GET',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (callsResponse.ok) {
          const callsData = await callsResponse.json();
          callsTest = {
            success: true,
            account_id: firstAccountId,
            total_calls: callsData.total_entries || 0,
            sample_call: callsData.calls?.[0] || null
          };
        } else {
          const errorText = await callsResponse.text();
          callsTest = {
            success: false,
            account_id: firstAccountId,
            error: errorText,
            status: callsResponse.status
          };
        }
      } catch (callsError) {
        callsTest = {
          success: false,
          error: callsError.message
        };
      }
    }

    return Response.json({
      success: true,
      connection: 'established',
      accounts_found: accounts.length,
      accounts: accounts.map(acc => ({
        id: acc.id,
        name: acc.name,
        status: acc.status,
        created: acc.created
      })),
      calls_endpoint_test: callsTest,
      instructions: accounts.length > 0 
        ? `Use one of these account IDs (${accounts.map(a => a.id).join(', ')}) in your Data Source configuration`
        : 'No accounts found - verify your agency has sub-accounts configured'
    });

  } catch (error) {
    console.error('[CTM Test] Error:', error);
    return Response.json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});