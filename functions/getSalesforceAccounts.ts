import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

      Deno.serve(async (req) => {
              try {
                const base44 = createClientFromRequest(req);
                const user = await base44.auth.me();

                if (!user) {
                  return Response.json({ error: 'Unauthorized' }, { status: 401 });
                }

                const accessToken = await base44.asServiceRole.connectors.getAccessToken('salesforce');

                const accountQuery = `SELECT 
                  Id, Name, Account_Owner__c, Primary_Sector__c, Sector_Category__c,
                  Total_Current_Marketing_Budget__c, Active_Marketing_Client__c, Marketing_Package_Type__c,
                  Live_Services__c, Marketing_Age_in_Years__c, 
                  POD__c, Client_Team_Owner__c, Current_Account_Plan__c, 
                  At_Risk__c, Company_Status__c, Company_History__c, Agency_Analytics_ID__c, Service_Agreement__c, Number_of_Opportunities__c
                FROM Account 
                LIMIT 500`;

                const serviceAgreementQuery = `SELECT 
                  Id, Account__c, Name, Status__c, Start_Date__c, End_Date__c, 
                  Recurring_Amount__c, Annual_Revenue__c, Renewal_Date__c, Description__c
                FROM Service_Agreement__c 
                LIMIT 500`;

                const subscriptionLineItemQuery = `SELECT 
                  Id, Account__c, Name, Service_Agreement__c, Start_Date__c, End_Date__c,
                  Recurring_Amount__c, Status__c, Service_Tier__c, Type__c, Estimated_Spend__c, 
                  Active_or_Paused__c, Marketing_Package_Type__c, Live_Services__c
                FROM Subscription_Line_Item__c 
                LIMIT 500`;

                const headers = {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                };

                const baseUrl = 'https://adtrak.my.salesforce.com/services/data/v60.0/query';

                const [accountRes, saRes, sliRes] = await Promise.all([
                  fetch(`${baseUrl}?q=${encodeURIComponent(accountQuery)}`, { headers }),
                  fetch(`${baseUrl}?q=${encodeURIComponent(serviceAgreementQuery)}`, { headers }),
                  fetch(`${baseUrl}?q=${encodeURIComponent(subscriptionLineItemQuery)}`, { headers })
                ]);

                if (!accountRes.ok || !saRes.ok || !sliRes.ok) {
                  const accountError = !accountRes.ok ? await accountRes.text() : null;
                  const saError = !saRes.ok ? await saRes.text() : null;
                  const sliError = !sliRes.ok ? await sliRes.text() : null;

                  return Response.json({ 
                    error: 'Failed to fetch Salesforce data',
                    details: { accountError, saError, sliError }
                  }, { status: 500 });
                }

                const accounts = await accountRes.json();
                const serviceAgreements = await saRes.json();
                const subscriptionLineItems = await sliRes.json();

                const enrichedAccounts = accounts.records?.map(account => ({
                  ...account,
                  serviceAgreements: serviceAgreements.records?.filter(sa => sa.Account__c === account.Id) || [],
                  subscriptionLineItems: subscriptionLineItems.records?.filter(sli => sli.Account__c === account.Id) || []
                })) || [];

                return Response.json({ 
                  accounts: enrichedAccounts,
                  syncMetadata: {
                    accountsFetched: accounts.records?.length || 0,
                    serviceAgreementsFetched: serviceAgreements.records?.length || 0,
                    subscriptionLineItemsFetched: subscriptionLineItems.records?.length || 0,
                    source: 'salesforce_api'
                  }
                });
              } catch (error) {
                return Response.json({ error: error.message }, { status: 500 });
              }
            });