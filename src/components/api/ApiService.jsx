import { base44 } from "@/api/base44Client";

/**
 * Centralized API Service for external metrics API
 * Handles retries, caching, logging, and error normalization
 */
class ApiService {
  constructor() {
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.maxRetries = 3;
    this.baseDelay = 1000; // 1 second
  }

  /**
   * Generate cache key from endpoint and params
   */
  generateCacheKey(endpoint, params) {
    const paramStr = JSON.stringify(params || {});
    return `${endpoint}_${paramStr}`.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * Check if cache is still valid
   */
  isCacheValid(cacheEntry) {
    if (!cacheEntry || !cacheEntry.expires_at) return false;
    return new Date(cacheEntry.expires_at) > new Date();
  }

  /**
   * Get data from cache
   */
  async getFromCache(endpoint, params) {
    const cacheKey = this.generateCacheKey(endpoint, params);
    
    try {
      const cached = await base44.entities.MetricCache.filter({ cache_key: cacheKey });
      
      if (cached.length > 0 && this.isCacheValid(cached[0])) {
        console.log(`[API Cache] Hit for ${endpoint}`);
        return cached[0].response_data;
      }
      
      console.log(`[API Cache] Miss for ${endpoint}`);
      return null;
    } catch (error) {
      console.error('[API Cache] Error reading cache:', error);
      return null;
    }
  }

  /**
   * Save data to cache
   */
  async saveToCache(endpoint, params, data, cacheDurationMinutes = 5) {
    const cacheKey = this.generateCacheKey(endpoint, params);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + cacheDurationMinutes);

    try {
      // Delete old cache entry if exists
      const existing = await base44.entities.MetricCache.filter({ cache_key: cacheKey });
      if (existing.length > 0) {
        await base44.entities.MetricCache.delete(existing[0].id);
      }

      // Create new cache entry
      await base44.entities.MetricCache.create({
        cache_key: cacheKey,
        endpoint,
        request_params: params || {},
        response_data: data,
        expires_at: expiresAt.toISOString(),
        cache_duration_minutes: cacheDurationMinutes
      });

      console.log(`[API Cache] Saved ${endpoint} (expires in ${cacheDurationMinutes}m)`);
    } catch (error) {
      console.error('[API Cache] Error saving to cache:', error);
    }
  }

  /**
   * Clear cache for specific endpoint or all
   */
  async clearCache(endpoint = null) {
    try {
      if (endpoint) {
        const cached = await base44.entities.MetricCache.filter({ endpoint });
        for (const entry of cached) {
          await base44.entities.MetricCache.delete(entry.id);
        }
        console.log(`[API Cache] Cleared cache for ${endpoint}`);
      } else {
        const allCached = await base44.entities.MetricCache.list();
        for (const entry of allCached) {
          await base44.entities.MetricCache.delete(entry.id);
        }
        console.log('[API Cache] Cleared all cache');
      }
    } catch (error) {
      console.error('[API Cache] Error clearing cache:', error);
    }
  }

  /**
   * Log API request
   */
  async logRequest(endpoint, method, params, success, responseTime, error = null, retryCount = 0) {
    try {
      await base44.entities.ApiRequestLog.create({
        endpoint,
        method,
        request_params: params || {},
        response_status: success ? 200 : 500,
        response_time_ms: responseTime,
        success,
        error_message: error?.message || null,
        retry_count: retryCount
      });
    } catch (logError) {
      console.error('[API Logger] Failed to log request:', logError);
    }
  }

  /**
   * Exponential backoff delay
   */
  async delay(attempt) {
    const delayMs = this.baseDelay * Math.pow(2, attempt);
    console.log(`[API Retry] Waiting ${delayMs}ms before retry ${attempt + 1}`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  /**
   * Normalize error to standard format
   */
  normalizeError(error, endpoint) {
    return {
      message: error.message || 'Unknown error occurred',
      endpoint,
      timestamp: new Date().toISOString(),
      type: error.name || 'ApiError',
      retryable: error.status >= 500 || error.code === 'NETWORK_ERROR'
    };
  }

  /**
   * Make HTTP request with retry logic
   */
  async makeRequest(endpoint, method = 'GET', params = {}, options = {}) {
    const { skipCache = false, cacheDuration = 5 } = options;
    let lastError = null;

    // Check cache first (for GET requests)
    if (method === 'GET' && !skipCache) {
      const cachedData = await this.getFromCache(endpoint, params);
      if (cachedData) {
        return { data: cachedData, fromCache: true };
      }
    }

    // Attempt request with retries
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const startTime = Date.now();

      try {
        console.log(`[API Request] ${method} ${endpoint} (attempt ${attempt + 1}/${this.maxRetries + 1})`);

        // Get API settings
        const settings = await base44.entities.ApiSettings.list();
        if (!settings || settings.length === 0) {
          throw new Error('API not configured. Please configure in Settings.');
        }

        const apiSettings = settings[0];
        
        // Construct headers
        const headers = {
          'Content-Type': 'application/json',
        };

        if (apiSettings.auth_method === 'bearer_token') {
          headers['Authorization'] = `Bearer ${apiSettings.api_token}`;
        } else {
          headers['X-API-Key'] = apiSettings.api_token;
        }

        // Make actual API call
        const url = new URL(endpoint, apiSettings.api_url);
        if (method === 'GET' && params) {
          Object.keys(params).forEach(key => {
            url.searchParams.append(key, params[key]);
          });
        }

        const response = await fetch(url.toString(), {
          method,
          headers,
          body: method !== 'GET' ? JSON.stringify(params) : undefined,
        });

        const responseTime = Date.now() - startTime;

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Log success
        await this.logRequest(endpoint, method, params, true, responseTime, null, attempt);

        // Cache if GET request
        if (method === 'GET') {
          await this.saveToCache(endpoint, params, data, cacheDuration);
        }

        console.log(`[API Request] Success in ${responseTime}ms`);
        return { data, fromCache: false };

      } catch (error) {
        const responseTime = Date.now() - startTime;
        lastError = this.normalizeError(error, endpoint);

        console.error(`[API Request] Failed (attempt ${attempt + 1}):`, lastError.message);

        // Log failure
        await this.logRequest(endpoint, method, params, false, responseTime, error, attempt);

        // If not retryable or last attempt, throw
        if (!lastError.retryable || attempt === this.maxRetries) {
          break;
        }

        // Wait before retry
        await this.delay(attempt);
      }
    }

    // All retries exhausted
    throw lastError;
  }

  /**
   * Add request to queue
   */
  queueRequest(requestFn, metadata = {}) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        fn: requestFn,
        resolve,
        reject,
        metadata
      });

      // Start processing if not already running
      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  /**
   * Process request queue sequentially
   */
  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    console.log(`[API Queue] Processing ${this.requestQueue.length} requests`);

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      const { fn, resolve, reject, metadata } = request;

      try {
        console.log(`[API Queue] Processing request ${metadata.name || 'unnamed'} (${this.requestQueue.length} remaining)`);
        const result = await fn();
        resolve(result);
      } catch (error) {
        console.error(`[API Queue] Request failed:`, error);
        reject(error);
      }

      // Small delay between requests to avoid rate limits
      if (this.requestQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    this.isProcessingQueue = false;
    console.log('[API Queue] Queue processing complete');
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    return {
      queueLength: this.requestQueue.length,
      isProcessing: this.isProcessingQueue
    };
  }

  /**
   * Perform health check
   */
  async performHealthCheck() {
    const startTime = Date.now();

    try {
      // Simple ping to API base URL
      const result = await this.makeRequest('/health', 'GET', {}, { skipCache: true, cacheDuration: 0 });
      const responseTime = Date.now() - startTime;

      const status = responseTime < 1000 ? 'healthy' : 'degraded';

      // Save health check result
      const existing = await base44.entities.ApiHealthCheck.list();
      if (existing.length > 0) {
        await base44.entities.ApiHealthCheck.update(existing[0].id, {
          status,
          response_time_ms: responseTime,
          last_checked: new Date().toISOString(),
          consecutive_failures: 0,
          error_message: null
        });
      } else {
        await base44.entities.ApiHealthCheck.create({
          status,
          response_time_ms: responseTime,
          last_checked: new Date().toISOString(),
          consecutive_failures: 0
        });
      }

      return { status, responseTime };

    } catch (error) {
      const responseTime = Date.now() - startTime;

      // Update health check with failure
      const existing = await base44.entities.ApiHealthCheck.list();
      const consecutiveFailures = existing.length > 0 ? (existing[0].consecutive_failures || 0) + 1 : 1;

      if (existing.length > 0) {
        await base44.entities.ApiHealthCheck.update(existing[0].id, {
          status: 'down',
          response_time_ms: responseTime,
          last_checked: new Date().toISOString(),
          consecutive_failures: consecutiveFailures,
          error_message: error.message
        });
      } else {
        await base44.entities.ApiHealthCheck.create({
          status: 'down',
          response_time_ms: responseTime,
          last_checked: new Date().toISOString(),
          consecutive_failures: 1,
          error_message: error.message
        });
      }

      return { status: 'down', error: error.message };
    }
  }

  /**
   * Get latest health check status
   */
  async getHealthStatus() {
    const healthChecks = await base44.entities.ApiHealthCheck.list('-last_checked');
    if (healthChecks.length > 0) {
      return healthChecks[0];
    }
    return { status: 'unknown', last_checked: null };
  }
}

// Export singleton instance
export const apiService = new ApiService();