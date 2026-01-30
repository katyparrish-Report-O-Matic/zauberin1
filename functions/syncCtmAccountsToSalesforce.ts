import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { organizationId } = await req.json();

    if (!organizationId) {
      return Response.json({ 
        success: false, 
        error: 'Organization ID is required' 
      }, { status: 400 });
    }

    console.log(`[Salesforce Sync] Starting sync for org: ${organizationId}`);

    // Get Salesforce OAuth token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('salesforce');

    if (!accessToken) {
      return Response.json({ 
        success: false, 
        error: 'Salesforce not connected. Please authorize in Data Sources.' 
      }, { status: 400 });
    }

    // Get Salesforce instance URL
    const instanceResponse = await fetch('https://login.salesforce.com/services/oauth2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!instanceResponse.ok) {
      throw new Error('Failed to get Salesforce instance URL');
    }

    const userInfo = await instanceResponse.json();
    const instanceUrl = userInfo.urls.custom_domain || userInfo.urls.enterprise;

    console.log('[Salesforce Sync] Instance URL:', instanceUrl);

    // Fetch CTM accounts from AccountHierarchy
    const ctmAccounts = await base44.asServiceRole.entities.AccountHierarchy.filter({
      organization_id: organizationId,
      platform_type: 'call_tracking',
      hierarchy_level: 'account'
    });

    console.log(`[Salesforce Sync] Found ${ctmAccounts.length} CTM accounts to sync`);

    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors = [];

    // Sync each account to Salesforce
    for (const ctmAccount of ctmAccounts) {
      try {
        // Check if account already exists in Salesforce by external ID
        const searchQuery = `SELECT Id FROM Account WHERE External_CTM_Account_ID__c = '${ctmAccount.external_id}'`;
        const searchResponse = await fetch(
          `${instanceUrl}/services/data/v58.0/query?q=${encodeURIComponent(searchQuery)}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const searchData = await searchResponse.json();
        const existingAccount = searchData.totalSize > 0 ? searchData.records[0] : null;

        // Prepare account data
        const accountData = {
          Name: ctmAccount.name,
          External_CTM_Account_ID__c: ctmAccount.external_id,
          Account_Region__c: ctmAccount.region,
          AccountSource: 'Call Tracking Metrics',
          Type: 'Customer',
          Description: `CTM Account - Status: ${ctmAccount.status}`,
          Account_Status__c: ctmAccount.status
        };

        if (existingAccount) {
          // Update existing account
          const updateResponse = await fetch(
            `${instanceUrl}/services/data/v58.0/sobjects/Account/${existingAccount.Id}`,
            {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(accountData)
            }
          );

          if (!updateResponse.ok) {
            const errorText = await updateResponse.text();
            throw new Error(`Update failed: ${errorText}`);
          }

          updated++;
          console.log(`[Salesforce Sync] Updated: ${ctmAccount.name}`);
        } else {
          // Create new account
          const createResponse = await fetch(
            `${instanceUrl}/services/data/v58.0/sobjects/Account`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(accountData)
            }
          );

          if (!createResponse.ok) {
            const errorText = await createResponse.text();
            throw new Error(`Create failed: ${errorText}`);
          }

          created++;
          console.log(`[Salesforce Sync] Created: ${ctmAccount.name}`);
        }

      } catch (error) {
        failed++;
        errors.push({
          account: ctmAccount.name,
          error: error.message
        });
        console.error(`[Salesforce Sync] Failed to sync ${ctmAccount.name}:`, error.message);
      }
    }

    return Response.json({
      success: true,
      totalAccounts: ctmAccounts.length,
      created,
      updated,
      failed,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('[Salesforce Sync] Error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});