import { base44 } from "@/api/base44Client";
import { environmentConfig } from "../config/EnvironmentConfig";

/**
 * Production API Service
 * Handles real external API connections with retry logic, caching, and logging
 */
class ProductionApiService {
  constructor() {
    this.maxRetries = 3;
    this.baseBackoffMs = 1000;
    this.cacheTTL = 300; // 5 minutes
  }

  /**
   * Get API configuration for organization
   */
  async getApiConfig(organizationId) {
    try {
      const configs = await base44.entities.ApiSettings.filter({
        organization_id: organizationId,
        is_active: true
      }, 'priority');

      return configs[0] || null;
    } catch (error) {
      environmentConfig.log('error', '[ProductionAPI] Error getting config:', error);
      return null;
    }
  }

  /**
   * Test API connection
   */
  async testConnection(apiUrl, authToken, authMethod = 'bearer_token') {
    const startTime = Date.now();

    try {
      const headers = this.buildHeaders(authToken, authMethod);

      const response = await fetch(`${apiUrl}/metrics/list`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        return {
          success: false,
          error: `API returned ${response.status}: ${response.statusText}`,
          duration
        };
      }

      const data = await response.json();

      return {
        success: true,
        message: 'Connection successful',
        duration,
        metricsCount: Array.isArray(data) ? data.length : 0
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Fetch available metrics from API
   */
  async fetchMetricsList(organizationId) {
    const cacheKey = `metrics_list_${organizationId}`;

    // Try cache first
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      environmentConfig.log('debug', '[ProductionAPI] Using cached metrics list');
      return cached;
    }

    const config = await this.getApiConfig(organizationId);
    if (!config) {
      throw new Error('No API configuration found');
    }

    const data = await this.makeApiCall(
      `${config.api_url}/metrics/list`,
      config,
      'GET'
    );

    // Cache the result
    await this.saveToCache(cacheKey, data, this.cacheTTL);

    return data;
  }

  /**
   * Fetch metric data with retry logic
   */
  async fetchMetricData(organizationId, metricName, startDate, endDate) {
    const cacheKey = `metric_data_${organizationId}_${metricName}_${startDate}_${endDate}`;

    // Try cache first
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      environmentConfig.log('debug', '[ProductionAPI] Using cached metric data');
      return cached;
    }

    const config = await this.getApiConfig(organizationId);
    if (!config) {
      throw new Error('No API configuration found');
    }

    const params = new URLSearchParams({
      metric: metricName,
      start: startDate,
      end: endDate
    });

    const data = await this.makeApiCall(
      `${config.api_url}/metrics/data?${params}`,
      config,
      'GET'
    );

    // Cache the result
    await this.saveToCache(cacheKey, data, this.cacheTTL);

    return data;
  }

  /**
   * Make API call with retry logic
   */
  async makeApiCall(url, config, method = 'GET', body = null, attempt = 0) {
    const startTime = Date.now();

    try {
      const headers = this.buildHeaders(config.api_token, config.auth_method);

      if (body && method !== 'GET') {
        headers['Content-Type'] = 'application/json';
      }

      const options = {
        method,
        headers,
        signal: AbortSignal.timeout(30000) // 30 second timeout
      };

      if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const duration = Date.now() - startTime;

      // Log the API call
      await this.logApiCall(
        config.id,
        config.organization_id,
        url,
        response.status,
        duration,
        response.ok
      );

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;

    } catch (error) {
      const duration = Date.now() - startTime;

      // Log failed call
      await this.logApiCall(
        config.id,
        config.organization_id,
        url,
        0,
        duration,
        false,
        error.message
      );

      // Retry logic with exponential backoff
      if (attempt < this.maxRetries) {
        const backoffTime = this.baseBackoffMs * Math.pow(2, attempt);
        environmentConfig.log('warn', `[ProductionAPI] Retry ${attempt + 1}/${this.maxRetries} after ${backoffTime}ms`);
        
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        return this.makeApiCall(url, config, method, body, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Build request headers
   */
  buildHeaders(token, authMethod) {
    const headers = {
      'Accept': 'application/json'
    };

    if (authMethod === 'bearer_token') {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (authMethod === 'api_key') {
      headers['X-API-Key'] = token;
    }

    return headers;
  }

  /**
   * Get from cache
   */
  async getFromCache(key) {
    try {
      const entries = await base44.entities.CacheEntry.filter({ cache_key: key });
      
      if (entries.length === 0) return null;

      const entry = entries[0];
      
      // Check if expired
      if (new Date(entry.expires_at) <= new Date()) {
        await base44.entities.CacheEntry.delete(entry.id);
        return null;
      }

      // Update hit count
      await base44.entities.CacheEntry.update(entry.id, {
        hit_count: (entry.hit_count || 0) + 1,
        last_accessed: new Date().toISOString()
      });

      return entry.data;
    } catch (error) {
      environmentConfig.log('error', '[ProductionAPI] Cache get error:', error);
      return null;
    }
  }

  /**
   * Save to cache
   */
  async saveToCache(key, data, ttlSeconds) {
    try {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      const sizeBytes = new Blob([JSON.stringify(data)]).size;

      const existing = await base44.entities.CacheEntry.filter({ cache_key: key });

      if (existing.length > 0) {
        await base44.entities.CacheEntry.update(existing[0].id, {
          data,
          expires_at: expiresAt.toISOString(),
          size_bytes: sizeBytes
        });
      } else {
        await base44.entities.CacheEntry.create({
          cache_key: key,
          cache_type: 'api_response',
          data,
          ttl_seconds: ttlSeconds,
          expires_at: expiresAt.toISOString(),
          hit_count: 0,
          size_bytes: sizeBytes
        });
      }
    } catch (error) {
      environmentConfig.log('error', '[ProductionAPI] Cache save error:', error);
    }
  }

  /**
   * Log API call
   */
  async logApiCall(apiSettingsId, organizationId, endpoint, statusCode, duration, success, errorMessage = null) {
    try {
      await base44.entities.RateLimitLog.create({
        api_settings_id: apiSettingsId,
        organization_id: organizationId,
        endpoint,
        response_time_ms: duration,
        priority_level: 'normal'
      });

      // Update API config usage
      if (success) {
        const config = await base44.entities.ApiSettings.list();
        const apiConfig = config.find(c => c.id === apiSettingsId);
        
        if (apiConfig) {
          await base44.entities.ApiSettings.update(apiSettingsId, {
            current_usage: (apiConfig.current_usage || 0) + 1,
            connection_status: 'connected'
          });
        }
      }
    } catch (error) {
      environmentConfig.log('error', '[ProductionAPI] Logging error:', error);
    }
  }

  /**
   * Check API health
   */
  async checkApiHealth(organizationId) {
    try {
      const config = await this.getApiConfig(organizationId);
      if (!config) {
        return { healthy: false, error: 'No API configuration' };
      }

      const result = await this.testConnection(
        config.api_url,
        config.api_token,
        config.auth_method
      );

      // Update connection status
      await base44.entities.ApiSettings.update(config.id, {
        connection_status: result.success ? 'connected' : 'error'
      });

      return {
        healthy: result.success,
        duration: result.duration,
        error: result.error
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Prefetch dashboard data
   */
  async prefetchDashboardData(organizationId) {
    try {
      environmentConfig.log('info', '[ProductionAPI] Prefetching dashboard data');

      // Get list of metrics
      const metrics = await this.fetchMetricsList(organizationId);

      if (!Array.isArray(metrics) || metrics.length === 0) {
        return { prefetched: 0 };
      }

      // Prefetch data for top 5 metrics
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      let prefetched = 0;
      for (const metric of metrics.slice(0, 5)) {
        try {
          await this.fetchMetricData(
            organizationId,
            metric.name || metric,
            startDate,
            endDate
          );
          prefetched++;
        } catch (error) {
          environmentConfig.log('warn', `[ProductionAPI] Failed to prefetch ${metric}:`, error);
        }
      }

      return { prefetched, total: metrics.length };
    } catch (error) {
      environmentConfig.log('error', '[ProductionAPI] Prefetch error:', error);
      return { prefetched: 0, error: error.message };
    }
  }
}

export const productionApiService = new ProductionApiService();