import { base44 } from "@/api/base44Client";

/**
 * Cache Service
 * Multi-level caching for queries, API responses, and data
 */
class CacheService {
  constructor() {
    // Default TTLs for different cache types (in seconds)
    this.defaultTTLs = {
      query: 3600,           // 1 hour for database queries
      api_response: 1800,    // 30 minutes for API responses
      metric_data: 900,      // 15 minutes for metric data
      report: 7200,          // 2 hours for reports
      user_prefs: 86400      // 24 hours for user preferences
    };

    // Memory cache for ultra-fast access
    this.memoryCache = new Map();
    this.memoryCacheMaxSize = 100; // Max items in memory cache
  }

  /**
   * Generate cache key from params
   */
  generateKey(type, params) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${JSON.stringify(params[key])}`)
      .join('&');
    
    return `${type}:${sortedParams}`;
  }

  /**
   * Get cached data
   */
  async get(key, options = {}) {
    try {
      // Check memory cache first
      if (this.memoryCache.has(key)) {
        const cached = this.memoryCache.get(key);
        if (new Date(cached.expiresAt) > new Date()) {
          console.log(`[Cache] Memory hit: ${key}`);
          return cached.data;
        } else {
          this.memoryCache.delete(key);
        }
      }

      // Check database cache
      const entries = await base44.entities.CacheEntry.filter({ cache_key: key });
      
      if (entries.length === 0) {
        console.log(`[Cache] Miss: ${key}`);
        return null;
      }

      const entry = entries[0];

      // Check if expired
      if (new Date(entry.expires_at) <= new Date()) {
        console.log(`[Cache] Expired: ${key}`);
        await base44.entities.CacheEntry.delete(entry.id);
        return null;
      }

      // Update hit count and last accessed
      await base44.entities.CacheEntry.update(entry.id, {
        hit_count: (entry.hit_count || 0) + 1,
        last_accessed: new Date().toISOString()
      });

      // Store in memory cache for next time
      this.setMemoryCache(key, entry.data, entry.expires_at);

      console.log(`[Cache] Hit: ${key} (hits: ${entry.hit_count + 1})`);
      return entry.data;

    } catch (error) {
      console.error('[Cache] Error getting cache:', error);
      return null;
    }
  }

  /**
   * Set cached data
   */
  async set(key, data, options = {}) {
    try {
      const {
        type = 'query',
        organizationId = null,
        ttl = this.defaultTTLs[type] || 3600,
        metadata = {}
      } = options;

      const expiresAt = new Date(Date.now() + ttl * 1000);
      const sizeBytes = new Blob([JSON.stringify(data)]).size;

      // Check if entry exists
      const existing = await base44.entities.CacheEntry.filter({ cache_key: key });

      if (existing.length > 0) {
        // Update existing
        await base44.entities.CacheEntry.update(existing[0].id, {
          data,
          expires_at: expiresAt.toISOString(),
          size_bytes: sizeBytes,
          metadata
        });
      } else {
        // Create new
        await base44.entities.CacheEntry.create({
          cache_key: key,
          cache_type: type,
          organization_id: organizationId,
          data,
          ttl_seconds: ttl,
          expires_at: expiresAt.toISOString(),
          hit_count: 0,
          size_bytes: sizeBytes,
          metadata
        });
      }

      // Also set in memory cache
      this.setMemoryCache(key, data, expiresAt);

      console.log(`[Cache] Set: ${key} (TTL: ${ttl}s)`);

    } catch (error) {
      console.error('[Cache] Error setting cache:', error);
    }
  }

  /**
   * Set memory cache
   */
  setMemoryCache(key, data, expiresAt) {
    // Enforce max size
    if (this.memoryCache.size >= this.memoryCacheMaxSize) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }

    this.memoryCache.set(key, {
      data,
      expiresAt: typeof expiresAt === 'string' ? expiresAt : expiresAt.toISOString()
    });
  }

  /**
   * Invalidate cache by key
   */
  async invalidate(key) {
    try {
      this.memoryCache.delete(key);

      const entries = await base44.entities.CacheEntry.filter({ cache_key: key });
      for (const entry of entries) {
        await base44.entities.CacheEntry.delete(entry.id);
      }

      console.log(`[Cache] Invalidated: ${key}`);
    } catch (error) {
      console.error('[Cache] Error invalidating cache:', error);
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern) {
    try {
      const entries = await base44.entities.CacheEntry.list();
      let invalidated = 0;

      for (const entry of entries) {
        if (entry.cache_key.includes(pattern)) {
          this.memoryCache.delete(entry.cache_key);
          await base44.entities.CacheEntry.delete(entry.id);
          invalidated++;
        }
      }

      console.log(`[Cache] Invalidated ${invalidated} entries matching: ${pattern}`);
    } catch (error) {
      console.error('[Cache] Error invalidating pattern:', error);
    }
  }

  /**
   * Invalidate cache by type
   */
  async invalidateType(type) {
    try {
      const entries = await base44.entities.CacheEntry.filter({ cache_type: type });
      
      for (const entry of entries) {
        this.memoryCache.delete(entry.cache_key);
        await base44.entities.CacheEntry.delete(entry.id);
      }

      console.log(`[Cache] Invalidated ${entries.length} ${type} entries`);
    } catch (error) {
      console.error('[Cache] Error invalidating type:', error);
    }
  }

  /**
   * Clear all cache
   */
  async clearAll() {
    try {
      this.memoryCache.clear();

      const entries = await base44.entities.CacheEntry.list();
      for (const entry of entries) {
        await base44.entities.CacheEntry.delete(entry.id);
      }

      console.log(`[Cache] Cleared ${entries.length} total entries`);
    } catch (error) {
      console.error('[Cache] Error clearing cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(organizationId = null) {
    try {
      const query = organizationId ? { organization_id: organizationId } : {};
      const entries = await base44.entities.CacheEntry.list();
      
      const filtered = organizationId 
        ? entries.filter(e => e.organization_id === organizationId)
        : entries;

      const stats = {
        total_entries: filtered.length,
        by_type: {},
        total_size_bytes: 0,
        total_hits: 0,
        memory_cache_size: this.memoryCache.size,
        expired_entries: 0
      };

      const now = new Date();

      for (const entry of filtered) {
        // Count by type
        if (!stats.by_type[entry.cache_type]) {
          stats.by_type[entry.cache_type] = {
            count: 0,
            size: 0,
            hits: 0
          };
        }
        stats.by_type[entry.cache_type].count++;
        stats.by_type[entry.cache_type].size += entry.size_bytes || 0;
        stats.by_type[entry.cache_type].hits += entry.hit_count || 0;

        // Total size and hits
        stats.total_size_bytes += entry.size_bytes || 0;
        stats.total_hits += entry.hit_count || 0;

        // Count expired
        if (new Date(entry.expires_at) <= now) {
          stats.expired_entries++;
        }
      }

      // Calculate hit rate
      if (filtered.length > 0) {
        stats.avg_hit_rate = stats.total_hits / filtered.length;
      }

      // Format size
      stats.total_size_formatted = this.formatBytes(stats.total_size_bytes);

      return stats;

    } catch (error) {
      console.error('[Cache] Error getting stats:', error);
      return null;
    }
  }

  /**
   * Clean up expired entries
   */
  async cleanupExpired() {
    try {
      const entries = await base44.entities.CacheEntry.list();
      const now = new Date();
      let cleaned = 0;

      for (const entry of entries) {
        if (new Date(entry.expires_at) <= now) {
          this.memoryCache.delete(entry.cache_key);
          await base44.entities.CacheEntry.delete(entry.id);
          cleaned++;
        }
      }

      console.log(`[Cache] Cleaned up ${cleaned} expired entries`);
      return cleaned;

    } catch (error) {
      console.error('[Cache] Error cleaning up:', error);
      return 0;
    }
  }

  /**
   * Warm cache with popular queries
   */
  async warmCache(organizationId) {
    console.log(`[Cache] Warming cache for org: ${organizationId}`);

    try {
      // Pre-fetch popular reports
      const reports = await base44.entities.ReportRequest.filter(
        { organization_id: organizationId },
        '-created_date',
        10
      );

      const key = this.generateKey('report', { organization_id: organizationId });
      await this.set(key, reports, {
        type: 'report',
        organizationId,
        ttl: this.defaultTTLs.report
      });

      // Pre-fetch recent metrics
      const metrics = await base44.entities.TransformedMetric.list('-created_date', 100);
      const metricsKey = this.generateKey('metric_data', { organization_id: organizationId });
      await this.set(metricsKey, metrics, {
        type: 'metric_data',
        organizationId,
        ttl: this.defaultTTLs.metric_data
      });

      console.log('[Cache] Cache warming completed');

    } catch (error) {
      console.error('[Cache] Error warming cache:', error);
    }
  }

  /**
   * Get most accessed cache entries
   */
  async getTopCacheEntries(limit = 10) {
    try {
      const entries = await base44.entities.CacheEntry.list();
      
      return entries
        .sort((a, b) => (b.hit_count || 0) - (a.hit_count || 0))
        .slice(0, limit)
        .map(e => ({
          key: e.cache_key,
          type: e.cache_type,
          hits: e.hit_count || 0,
          size: this.formatBytes(e.size_bytes || 0),
          last_accessed: e.last_accessed,
          expires_at: e.expires_at
        }));

    } catch (error) {
      console.error('[Cache] Error getting top entries:', error);
      return [];
    }
  }

  /**
   * Format bytes
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Wrapper for cached queries
   */
  async cached(key, fetchFn, options = {}) {
    // Try to get from cache
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    // Not in cache, fetch data
    const data = await fetchFn();

    // Store in cache
    await this.set(key, data, options);

    return data;
  }
}

export const cacheService = new CacheService();