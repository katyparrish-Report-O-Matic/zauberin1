import { base44 } from "@/api/base44Client";

/**
 * API Key Service
 * Manages API keys, validation, and rate limiting
 */
class ApiKeyService {
  /**
   * Generate a new API key
   */
  generateKey() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    const moreRandom = Math.random().toString(36).substring(2, 15);
    return `mf_${timestamp}_${random}${moreRandom}`;
  }

  /**
   * Create API key
   */
  async createApiKey(organizationId, name, permissions, rateLimitPerHour = 1000, expiresInDays = null) {
    try {
      const key = this.generateKey();
      const keyPrefix = key.substring(0, 12);

      const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;

      const apiKey = await base44.entities.ApiKey.create({
        organization_id: organizationId,
        name,
        key,
        key_prefix: keyPrefix,
        permissions,
        rate_limit_per_hour: rateLimitPerHour,
        enabled: true,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
        metadata: {
          created_at: new Date().toISOString()
        }
      });

      console.log(`[ApiKeyService] Created API key: ${keyPrefix}...`);
      
      return {
        ...apiKey,
        plainKey: key // Return plain key only once at creation
      };

    } catch (error) {
      console.error('[ApiKeyService] Error creating API key:', error);
      throw error;
    }
  }

  /**
   * Validate API key
   */
  async validateKey(keyString) {
    try {
      const keys = await base44.entities.ApiKey.list();
      const apiKey = keys.find(k => k.key === keyString);

      if (!apiKey) {
        return { valid: false, error: 'Invalid API key' };
      }

      if (!apiKey.enabled) {
        return { valid: false, error: 'API key is disabled' };
      }

      if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
        return { valid: false, error: 'API key has expired' };
      }

      // Check rate limit
      const rateLimitCheck = await this.checkRateLimit(apiKey.id, apiKey.rate_limit_per_hour);
      if (!rateLimitCheck.allowed) {
        return { 
          valid: false, 
          error: 'Rate limit exceeded',
          rateLimitInfo: rateLimitCheck
        };
      }

      // Update last used
      await base44.entities.ApiKey.update(apiKey.id, {
        last_used: new Date().toISOString()
      });

      return {
        valid: true,
        apiKey,
        rateLimitInfo: rateLimitCheck
      };

    } catch (error) {
      console.error('[ApiKeyService] Error validating key:', error);
      return { valid: false, error: 'Validation error' };
    }
  }

  /**
   * Check rate limit
   */
  async checkRateLimit(apiKeyId, limitPerHour) {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const recentUsage = await base44.entities.ApiUsage.filter({
        api_key_id: apiKeyId
      });

      const usageInLastHour = recentUsage.filter(u => 
        new Date(u.created_date) >= oneHourAgo
      );

      const remaining = Math.max(0, limitPerHour - usageInLastHour.length);

      return {
        allowed: usageInLastHour.length < limitPerHour,
        used: usageInLastHour.length,
        limit: limitPerHour,
        remaining,
        resetAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      };

    } catch (error) {
      console.error('[ApiKeyService] Error checking rate limit:', error);
      return {
        allowed: true,
        used: 0,
        limit: limitPerHour,
        remaining: limitPerHour
      };
    }
  }

  /**
   * Log API usage
   */
  async logUsage(apiKeyId, organizationId, endpoint, method, statusCode, responseTime, error = null) {
    try {
      await base44.entities.ApiUsage.create({
        api_key_id: apiKeyId,
        organization_id: organizationId,
        endpoint,
        method,
        status_code: statusCode,
        response_time_ms: responseTime,
        ip_address: 'client',
        user_agent: navigator.userAgent,
        error_message: error
      });
    } catch (logError) {
      console.error('[ApiKeyService] Error logging usage:', logError);
    }
  }

  /**
   * Get usage analytics
   */
  async getUsageAnalytics(apiKeyId, days = 7) {
    try {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      
      const usage = await base44.entities.ApiUsage.filter({
        api_key_id: apiKeyId
      });

      const recentUsage = usage.filter(u => 
        new Date(u.created_date) >= cutoffDate
      );

      // Group by date
      const byDate = {};
      recentUsage.forEach(u => {
        const date = new Date(u.created_date).toISOString().split('T')[0];
        if (!byDate[date]) {
          byDate[date] = {
            date,
            total: 0,
            success: 0,
            errors: 0,
            avgResponseTime: []
          };
        }
        byDate[date].total++;
        if (u.status_code < 400) byDate[date].success++;
        else byDate[date].errors++;
        byDate[date].avgResponseTime.push(u.response_time_ms || 0);
      });

      // Calculate averages
      Object.values(byDate).forEach(day => {
        const times = day.avgResponseTime;
        day.avgResponseTime = times.length > 0 
          ? Math.round(times.reduce((sum, t) => sum + t, 0) / times.length)
          : 0;
      });

      return {
        totalRequests: recentUsage.length,
        successRate: recentUsage.length > 0 
          ? (recentUsage.filter(u => u.status_code < 400).length / recentUsage.length) * 100
          : 0,
        avgResponseTime: recentUsage.length > 0
          ? Math.round(recentUsage.reduce((sum, u) => sum + (u.response_time_ms || 0), 0) / recentUsage.length)
          : 0,
        byDate: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
        byEndpoint: this.groupByEndpoint(recentUsage),
        recentErrors: recentUsage.filter(u => u.status_code >= 400).slice(0, 10)
      };

    } catch (error) {
      console.error('[ApiKeyService] Error getting analytics:', error);
      return null;
    }
  }

  /**
   * Group usage by endpoint
   */
  groupByEndpoint(usage) {
    const byEndpoint = {};
    
    usage.forEach(u => {
      if (!byEndpoint[u.endpoint]) {
        byEndpoint[u.endpoint] = {
          endpoint: u.endpoint,
          count: 0,
          methods: {}
        };
      }
      byEndpoint[u.endpoint].count++;
      
      if (!byEndpoint[u.endpoint].methods[u.method]) {
        byEndpoint[u.endpoint].methods[u.method] = 0;
      }
      byEndpoint[u.endpoint].methods[u.method]++;
    });

    return Object.values(byEndpoint).sort((a, b) => b.count - a.count);
  }

  /**
   * Revoke API key
   */
  async revokeKey(keyId) {
    try {
      await base44.entities.ApiKey.update(keyId, {
        enabled: false
      });
      console.log(`[ApiKeyService] Revoked API key: ${keyId}`);
    } catch (error) {
      console.error('[ApiKeyService] Error revoking key:', error);
      throw error;
    }
  }

  /**
   * Get API keys for organization
   */
  async getKeysForOrganization(organizationId) {
    try {
      return await base44.entities.ApiKey.filter({
        organization_id: organizationId
      }, '-created_date');
    } catch (error) {
      console.error('[ApiKeyService] Error getting keys:', error);
      return [];
    }
  }
}

export const apiKeyService = new ApiKeyService();