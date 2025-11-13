import { base44 } from "@/api/base44Client";
import { environmentConfig } from "../config/EnvironmentConfig";

/**
 * Account Hierarchy Service
 * Manages hierarchical account structures (agency → sub-accounts)
 */
class AccountHierarchyService {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Get all accounts for a data source with hierarchy
   */
  async getAccountsForDataSource(dataSourceId, organizationId) {
    try {
      const cacheKey = `accounts_${dataSourceId}`;
      
      // Check cache first
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < 300000) { // 5 min cache
          return cached.data;
        }
      }

      // Fetch account hierarchy
      const accounts = await base44.entities.AccountHierarchy.filter({
        data_source_id: dataSourceId,
        hierarchy_level: 'account',
        status: 'active'
      });

      // Build tree structure
      const accountTree = this.buildAccountTree(accounts);

      // Cache results
      this.cache.set(cacheKey, {
        data: accountTree,
        timestamp: Date.now()
      });

      environmentConfig.log('info', `[AccountHierarchy] Loaded ${accounts.length} accounts`);
      return accountTree;

    } catch (error) {
      environmentConfig.log('error', '[AccountHierarchy] Error:', error);
      return [];
    }
  }

  /**
   * Build hierarchical tree from flat account list
   */
  buildAccountTree(accounts) {
    const accountMap = new Map();
    const rootAccounts = [];

    // First pass: create map
    accounts.forEach(account => {
      accountMap.set(account.id, {
        ...account,
        children: []
      });
    });

    // Second pass: build tree
    accounts.forEach(account => {
      const node = accountMap.get(account.id);
      
      if (account.parent_id && accountMap.has(account.parent_id)) {
        // Sub-account
        const parent = accountMap.get(account.parent_id);
        parent.children.push(node);
      } else {
        // Root account
        rootAccounts.push(node);
      }
    });

    return rootAccounts;
  }

  /**
   * Get flattened account list for dropdowns
   */
  async getAccountOptionsForDropdown(dataSourceId, organizationId) {
    const accountTree = await this.getAccountsForDataSource(dataSourceId, organizationId);
    return this.flattenAccountTree(accountTree);
  }

  /**
   * Flatten tree into list with indentation markers
   */
  flattenAccountTree(tree, level = 0, result = []) {
    tree.forEach(node => {
      result.push({
        id: node.id || node.external_id,
        external_id: node.external_id,
        name: node.name,
        level,
        indent: '  '.repeat(level), // For display
        has_children: node.children.length > 0,
        parent_id: node.parent_id
      });

      if (node.children.length > 0) {
        this.flattenAccountTree(node.children, level + 1, result);
      }
    });

    return result;
  }

  /**
   * Get accounts for organization across all data sources
   */
  async getAllAccountsForOrganization(organizationId) {
    try {
      // Get all data sources for organization
      const dataSources = await base44.entities.DataSource.filter({
        organization_id: organizationId,
        enabled: true
      });

      const allAccounts = [];

      // Fetch accounts for each data source
      for (const ds of dataSources) {
        const accounts = await this.getAccountOptionsForDropdown(ds.id, organizationId);
        
        // Add data source info to each account
        accounts.forEach(account => {
          allAccounts.push({
            ...account,
            data_source_id: ds.id,
            data_source_name: ds.name,
            platform_type: ds.platform_type
          });
        });
      }

      return allAccounts;

    } catch (error) {
      environmentConfig.log('error', '[AccountHierarchy] Error fetching org accounts:', error);
      return [];
    }
  }

  /**
   * Sync CTM sub-accounts from API
   */
  async syncCTMSubAccounts(dataSourceId, organizationId, parentAccountId, apiKey) {
    try {
      environmentConfig.log('info', `[AccountHierarchy] Syncing CTM sub-accounts for ${parentAccountId}`);

      // This would call CTM API to get sub-accounts
      // For now, return empty - will be populated when API sync runs
      return [];

    } catch (error) {
      environmentConfig.log('error', '[AccountHierarchy] Sync CTM sub-accounts error:', error);
      return [];
    }
  }

  /**
   * Get account by external ID
   */
  async getAccountByExternalId(dataSourceId, externalId) {
    try {
      const accounts = await base44.entities.AccountHierarchy.filter({
        data_source_id: dataSourceId,
        external_id: externalId,
        hierarchy_level: 'account'
      });

      return accounts[0] || null;

    } catch (error) {
      environmentConfig.log('error', '[AccountHierarchy] Get account error:', error);
      return null;
    }
  }

  /**
   * Clear cache
   */
  clearCache(dataSourceId = null) {
    if (dataSourceId) {
      const cacheKey = `accounts_${dataSourceId}`;
      this.cache.delete(cacheKey);
    } else {
      this.cache.clear();
    }
  }
}

export const accountHierarchyService = new AccountHierarchyService();