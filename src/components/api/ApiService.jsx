import { base44 } from "@/api/base44Client";

/**
 * Centralized API Service with intelligent rate limiting
 */
class ApiService {
  constructor() {
    this.requestQueue = {
      critical: [],
      high: [],
      normal: [],
      low: []
    };
    this.isProcessingQueue = false;
    this.maxRetries = 3;
    this.baseDelay = 1000;
  }

  /**
   * Generate cache key
   */
  generateCacheKey(endpoint, params) {
    const paramStr = JSON.stringify(params || {});
    return `${endpoint}_${paramStr}`.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * Check if cache is valid
   */
  isCacheValid(cacheEntry) {
    if (!cacheEntry || !cacheEntry.expires_at) return false;
    return new Date(cacheEntry.expires_at) > new Date();
  }

  /**
   * Get from cache
   */
  async getFromCache(endpoint, params) {
    const cacheKey = this.generateCacheKey(endpoint, params);
    
    try {
      const cached = await base44.entities.MetricCache.filter({ cache_key: cacheKey });
      
      if (cached.length > 0 && this.isCacheValid(cached[0])) {
        console.log(`[API Cache] Hit for ${endpoint}`);
        return cached[0].response_data;
      }
      
      return null;
    } catch (error) {
      console.error('[API Cache] Error reading cache:', error);
      return null;
    }
  }

  /**
   * Save to cache
   */
  async saveToCache(endpoint, params, data, cacheDurationMinutes = 5) {
    const cacheKey = this.generateCacheKey(endpoint, params);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + cacheDurationMinutes);

    try {
      const existing = await base44.entities.MetricCache.filter({ cache_key: cacheKey });
      if (existing.length > 0) {
        await base44.entities.MetricCache.delete(existing[0].id);
      }

      await base44.entities.MetricCache.create({
        cache_key: cacheKey,
        endpoint,
        request_params: params || {},
        response_data: data,
        expires_at: expiresAt.toISOString(),
        cache_duration_minutes: cacheDurationMinutes
      });

      console.log(`[API Cache] Saved ${endpoint}`);
    } catch (error) {
      console.error('[API Cache] Error saving to cache:', error);
    }
  }

  /**
   * Clear cache
   */
  async clearCache(endpoint = null) {
    try {
      if (endpoint) {
        const cached = await base44.entities.MetricCache.filter({ endpoint });
        for (const entry of cached) {
          await base44.entities.MetricCache.delete(entry.id);
        }
      } else {
        const allCached = await base44.entities.MetricCache.list();
        for (const entry of allCached) {
          await base44.entities.MetricCache.delete(entry.id);
        }
      }
    } catch (error) {
      console.error('[API Cache] Error clearing cache:', error);
    }
  }

  /**
   * Get available API configs with rate limit checks
   */
  async getAvailableApis(orgId) {
    try {
      const apis = await base44.entities.ApiSettings.filter({ 
        organization_id: orgId,
        is_active: true
      });
      
      // Sort by priority
      const sortedApis = apis.sort((a, b) => (a.priority || 999) - (b.priority || 999));
      
      // Filter APIs that have capacity
      const availableApis = [];
      for (const api of sortedApis) {
        if (await this.hasRateLimitCapacity(api)) {
          availableApis.push(api);
        }
      }
      
      return availableApis;
    } catch (error) {
      console.error('[ApiService] Error getting available APIs:', error);
      return [];
    }
  }

  /**
   * Check if API has rate limit capacity
   */
  async hasRateLimitCapacity(apiConfig) {
    if (!apiConfig.rate_limit_per_hour) return true;
    
    // Check if usage needs reset
    if (apiConfig.usage_reset_at) {
      const resetTime = new Date(apiConfig.usage_reset_at);
      if (new Date() >= resetTime) {
        // Reset usage
        await base44.entities.ApiSettings.update(apiConfig.id, {
          current_usage: 0,
          usage_reset_at: new Date(Date.now() + 3600000).toISOString()
        });
        return true;
      }
    }
    
    // Check remaining capacity (keep 10% buffer)
    const buffer = Math.ceil(apiConfig.rate_limit_per_hour * 0.1);
    const remaining = apiConfig.rate_limit_per_hour - (apiConfig.current_usage || 0);
    return remaining > buffer;
  }

  /**
   * Update rate limit from response headers
   */
  async updateRateLimitFromHeaders(apiConfig, headers, endpoint) {
    try {
      const limit = headers['x-ratelimit-limit'];
      const remaining = headers['x-ratelimit-remaining'];
      const reset = headers['x-ratelimit-reset'];
      
      if (limit && remaining) {
        await base44.entities.RateLimitLog.create({
          api_settings_id: apiConfig.id,
          organization_id: apiConfig.organization_id,
          endpoint,
          limit_total: parseInt(limit),
          limit_remaining: parseInt(remaining),
          limit_reset: reset ? new Date(parseInt(reset) * 1000).toISOString() : null,
          priority_level: 'normal'
        });
        
        // Update API settings
        await base44.entities.ApiSettings.update(apiConfig.id, {
          current_usage: parseInt(limit) - parseInt(remaining),
          rate_limit_per_hour: parseInt(limit),
          usage_reset_at: reset ? new Date(parseInt(reset) * 1000).toISOString() : null
        });
      } else {
        // Increment usage manually
        await base44.entities.ApiSettings.update(apiConfig.id, {
          current_usage: (apiConfig.current_usage || 0) + 1
        });
      }
    } catch (error) {
      console.error('[ApiService] Error updating rate limit:', error);
    }
  }

  /**
   * Make HTTP request with intelligent rate limiting
   */
  async makeRequest(endpoint, method = 'GET', params = {}, options = {}) {
    const { 
      skipCache = false, 
      cacheDuration = 5, 
      orgId = null,
      priority = 'normal'
    } = options;

    // Check cache first
    if (method === 'GET' && !skipCache) {
      const cachedData = await this.getFromCache(endpoint, params);
      if (cachedData) {
        return { data: cachedData, fromCache: true };
      }
    }

    // Get available APIs
    const availableApis = await this.getAvailableApis(orgId);
    
    if (availableApis.length === 0) {
      throw new Error('No available APIs with rate limit capacity');
    }

    // Try each API in order
    let lastError = null;
    for (const apiConfig of availableApis) {
      try {
        const result = await this.makeRequestWithApi(apiConfig, endpoint, method, params, priority);
        
        // Cache if GET
        if (method === 'GET') {
          await this.saveToCache(endpoint, params, result.data, cacheDuration);
        }
        
        return result;
      } catch (error) {
        console.error(`[ApiService] Failed with API ${apiConfig.name}:`, error);
        lastError = error;
        
        // If rate limited, try next API
        if (error.status === 429) {
          continue;
        }
        
        // For other errors, throw immediately
        throw error;
      }
    }
    
    // All APIs exhausted
    throw lastError || new Error('All APIs failed');
  }

  /**
   * Make request with specific API
   */
  async makeRequestWithApi(apiConfig, endpoint, method, params, priority) {
    const startTime = Date.now();
    
    try {
      const url = new URL(endpoint, apiConfig.api_url);
      if (method === 'GET' && params) {
        Object.keys(params).forEach(key => {
          url.searchParams.append(key, params[key]);
        });
      }

      const headers = {
        'Content-Type': 'application/json',
      };

      if (apiConfig.auth_method === 'bearer_token') {
        headers['Authorization'] = `Bearer ${apiConfig.api_token}`;
      } else {
        headers['X-API-Key'] = apiConfig.api_token;
      }

      const response = await fetch(url.toString(), {
        method,
        headers,
        body: method !== 'GET' ? JSON.stringify(params) : undefined,
      });

      const responseTime = Date.now() - startTime;

      // Update rate limit tracking
      await this.updateRateLimitFromHeaders(apiConfig, response.headers, endpoint);

      if (!response.ok) {
        if (response.status === 429) {
          throw { status: 429, message: 'Rate limit exceeded' };
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      console.log(`[ApiService] Success with ${apiConfig.name} in ${responseTime}ms`);
      return { data, fromCache: false, apiUsed: apiConfig.name };

    } catch (error) {
      throw error;
    }
  }

  /**
   * Add request to priority queue
   */
  queueRequest(requestFn, metadata = {}) {
    const priority = metadata.priority || 'normal';
    
    return new Promise((resolve, reject) => {
      this.requestQueue[priority].push({
        fn: requestFn,
        resolve,
        reject,
        metadata
      });

      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  /**
   * Process request queue by priority
   */
  async processQueue() {
    if (this.isProcessingQueue) return;

    this.isProcessingQueue = true;

    const priorities = ['critical', 'high', 'normal', 'low'];
    
    while (this.hasQueuedRequests()) {
      // Process highest priority first
      for (const priority of priorities) {
        if (this.requestQueue[priority].length > 0) {
          const request = this.requestQueue[priority].shift();
          const { fn, resolve, reject, metadata } = request;

          try {
            console.log(`[API Queue] Processing ${priority} priority: ${metadata.name || 'unnamed'}`);
            const result = await fn();
            resolve(result);
          } catch (error) {
            console.error(`[API Queue] Failed:`, error);
            reject(error);
          }

          // Delay between requests
          await new Promise(resolve => setTimeout(resolve, 200));
          break; // Go back to check priorities again
        }
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Check if there are queued requests
   */
  hasQueuedRequests() {
    return Object.values(this.requestQueue).some(queue => queue.length > 0);
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    return {
      critical: this.requestQueue.critical.length,
      high: this.requestQueue.high.length,
      normal: this.requestQueue.normal.length,
      low: this.requestQueue.low.length,
      isProcessing: this.isProcessingQueue
    };
  }

  /**
   * Get rate limit status for organization
   */
  async getRateLimitStatus(orgId) {
    try {
      const apis = await base44.entities.ApiSettings.filter({ 
        organization_id: orgId,
        is_active: true
      });

      const status = apis.map(api => {
        const remaining = api.rate_limit_per_hour 
          ? api.rate_limit_per_hour - (api.current_usage || 0)
          : null;
        
        const percentage = api.rate_limit_per_hour
          ? ((api.current_usage || 0) / api.rate_limit_per_hour) * 100
          : 0;

        return {
          name: api.name,
          total: api.rate_limit_per_hour,
          used: api.current_usage || 0,
          remaining,
          percentage: Math.round(percentage),
          resetAt: api.usage_reset_at,
          status: percentage > 90 ? 'critical' : percentage > 70 ? 'warning' : 'healthy'
        };
      });

      return status;
    } catch (error) {
      console.error('[ApiService] Error getting rate limit status:', error);
      return [];
    }
  }
}

export const apiService = new ApiService();