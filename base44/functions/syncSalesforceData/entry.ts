import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { startDate, endDate } = await req.json();

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

    console.log('[Salesforce] Instance URL:', instanceUrl);

    // Fetch Accounts
    const accountsQuery = `SELECT Id, Name, AccountNumber, Type, Industry, AnnualRevenue, NumberOfEmployees, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry, Phone, Website, Owner.Name, Owner.Email, CreatedDate, LastModifiedDate FROM Account WHERE IsDeleted = false`;
    
    const accountsResponse = await fetch(
      `${instanceUrl}/services/data/v58.0/query?q=${encodeURIComponent(accountsQuery)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!accountsResponse.ok) {
      const errorText = await accountsResponse.text();
      throw new Error(`Salesforce API error: ${errorText}`);
    }

    const accountsData = await accountsResponse.json();
    console.log(`[Salesforce] Fetched ${accountsData.totalSize} accounts`);

    // Format accounts
    const accounts = accountsData.records.map(acc => ({
      salesforce_id: acc.Id,
      account_name: acc.Name,
      account_number: acc.AccountNumber,
      type: acc.Type,
      industry: acc.Industry,
      annual_revenue: acc.AnnualRevenue,
      number_of_employees: acc.NumberOfEmployees,
      billing_street: acc.BillingStreet,
      billing_city: acc.BillingCity,
      billing_state: acc.BillingState,
      billing_postal_code: acc.BillingPostalCode,
      billing_country: acc.BillingCountry,
      phone: acc.Phone,
      website: acc.Website,
      owner_name: acc.Owner?.Name,
      owner_email: acc.Owner?.Email,
      created_date: acc.CreatedDate,
      last_modified_date: acc.LastModifiedDate
    }));

    // Fetch Service Agreements (using ServiceContract object)
    const agreementsQuery = `SELECT Id, Name, ContractNumber, AccountId, Account.Name, Status, StartDate, EndDate, ContractTerm, Description, Owner.Name, Owner.Email, CreatedDate, LastModifiedDate FROM ServiceContract WHERE Status != 'Cancelled'`;
    
    const agreementsResponse = await fetch(
      `${instanceUrl}/services/data/v58.0/query?q=${encodeURIComponent(agreementsQuery)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    let agreements = [];
    if (agreementsResponse.ok) {
      const agreementsData = await agreementsResponse.json();
      console.log(`[Salesforce] Fetched ${agreementsData.totalSize} service agreements`);

      agreements = agreementsData.records.map(agr => ({
        salesforce_id: agr.Id,
        account_id: agr.AccountId,
        account_name: agr.Account?.Name,
        agreement_name: agr.Name,
        agreement_number: agr.ContractNumber,
        status: agr.Status?.toLowerCase() || 'active',
        start_date: agr.StartDate,
        end_date: agr.EndDate,
        description: agr.Description,
        owner_name: agr.Owner?.Name,
        owner_email: agr.Owner?.Email,
        created_date: agr.CreatedDate,
        last_modified_date: agr.LastModifiedDate
      }));
    }

    return Response.json({
      success: true,
      accounts,
      agreements,
      totalAccounts: accounts.length,
      totalAgreements: agreements.length
    });

  } catch (error) {
    console.error('[Salesforce] Sync error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});