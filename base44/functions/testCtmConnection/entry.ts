import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Test CTM API connection and fetch available accounts
 * Agency-level credentials flow:
 * 1. Use provided credentials to call /api/v1/accounts.json
 * 2. Return list of all accessible accounts
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify user authentication
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ 
        success: false,
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { apiKey } = body;

    if (!apiKey) {
      return Response.json({
        success: false,
        error: 'API key is required'
      }, { status: 400 });
    }

    console.log('[testCtmConnection] Testing CTM agency credentials...');

    // Parse credentials - support both formats:
    // 1. "accessKey:secretKey" 
    // 2. Pre-encoded base64 token
    let auth;
    if (apiKey.includes(':')) {
      const [access, secret] = apiKey.split(':');
      const encoder = new TextEncoder();
      const data = encoder.encode(`${access}:${secret}`);
      auth = btoa(String.fromCharCode(...data));
    } else if (apiKey.length > 40) {
      auth = apiKey; // Already encoded
    } else {
      return Response.json({
        success: false,
        error: 'Invalid API key format. Use "accessKey:secretKey" or encoded token'
      }, { status: 400 });
    }

    // Fetch all accounts with pagination
    const baseUrl = 'https://api.calltrackingmetrics.com/api/v1';
    let allAccounts = [];
    let currentPage = 1;
    let totalPages = 1;

    console.log('[testCtmConnection] Fetching accounts from CTM...');

    do {
      const url = `${baseUrl}/accounts.json?page=${currentPage}&per_page=100`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[testCtmConnection] CTM API Error:', response.status, errorText);
        
        let hint = 'Check API credentials and permissions';
        if (response.status === 401) {
          hint = 'Invalid API credentials. Verify your Access Key and Secret Key.';
        } else if (response.status === 403) {
          hint = 'Access denied. Make sure you have agency-level API access enabled.';
        }
        
        return Response.json({
          success: false,
          error: `CTM API Error (${response.status})`,
          details: errorText,
          hint
        }, { status: response.status });
      }

      const data = await response.json();
      
      if (data.accounts && Array.isArray(data.accounts)) {
        allAccounts = allAccounts.concat(data.accounts);
        console.log(`[testCtmConnection] Page ${currentPage}: ${data.accounts.length} accounts`);
      }

      totalPages = data.total_pages || 1;
      currentPage++;

    } while (currentPage <= totalPages && currentPage <= 100); // Safety: max 100 pages

    console.log(`[testCtmConnection] ✅ Total accounts fetched: ${allAccounts.length}`);

    // Format accounts - CONVERT IDs TO STRINGS
    const formattedAccounts = allAccounts.map(acc => ({
      id: String(acc.id), // 🔥 CONVERT TO STRING!
      name: acc.name,
      status: acc.status || 'active',
      created: acc.created
    }));

    // Test calls endpoint with first account
    let callsTest = null;
    if (formattedAccounts.length > 0) {
      const testAccountId = formattedAccounts[0].id;
      const testUrl = `${baseUrl}/accounts/${testAccountId}/calls.json?per_page=1`;
      
      try {
        const callsResponse = await fetch(testUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          }
        });
        
        callsTest = {
          status: callsResponse.status,
          success: callsResponse.ok,
          tested_account: testAccountId
        };
      } catch (error) {
        callsTest = {
          error: error.message,
          tested_account: testAccountId
        };
      }
    }

    return Response.json({
      success: true,
      connection: 'established',
      accounts_found: formattedAccounts.length,
      accounts: formattedAccounts,
      calls_endpoint_test: callsTest,
      api_version: 'v1',
      access_level: 'agency'
    });

  } catch (error) {
    console.error('[testCtmConnection] Error:', error);
    return Response.json({
      success: false,
      error: 'Internal server error',
      details: error.message
    }, { status: 500 });
  }
});