/**
 * Environment Configuration Service
 * Manages environment-specific settings and configurations
 */

// Single production environment configuration
const CONFIG = {
  name: 'Production',
  useMockData: false,
  enableVerboseLogging: false,
  enableDebugMode: false,
  cacheEnabled: true,
  cacheTTL: {
    query: 3600,
    api_response: 1800,
    metric_data: 900,
    report: 7200,
    user_prefs: 86400
  },
  rateLimits: {
    apiCallsPerHour: 1000,
    reportsPerDay: 100
  },
  features: {
    webhooks: true,
    dataQuality: true,
    backups: true,
    integrations: true,
    apiKeys: true,
    performance: true,
    analytics: true
  },
  monitoring: {
    enabled: true,
    logLevel: 'error',
    errorReporting: true,
    performanceTracking: true
  }
};

class EnvironmentConfig {
  constructor() {
    this.config = CONFIG;
  }

  getEnvironment() {
    return 'production';
  }

  getEnvironmentName() {
    return this.config.name;
  }

  /**
   * Get full configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Get specific configuration value
   */
  get(key) {
    return this.config[key];
  }

  /**
   * Check if feature is enabled
   */
  isFeatureEnabled(featureName) {
    return this.config.features[featureName] === true;
  }

  /**
   * Get API base URL
   */
  getApiBaseUrl() {
    return this.config.apiBaseUrl;
  }

  /**
   * Check if using mock data
   */
  useMockData() {
    return this.config.useMockData === true;
  }

  /**
   * Check if verbose logging is enabled
   */
  isVerboseLogging() {
    return this.config.enableVerboseLogging === true;
  }

  /**
   * Check if debug mode is enabled
   */
  isDebugMode() {
    return this.config.enableDebugMode === true;
  }

  /**
   * Get cache TTL for specific type
   */
  getCacheTTL(cacheType) {
    return this.config.cacheTTL[cacheType] || 3600;
  }

  /**
   * Get rate limit
   */
  getRateLimit(limitType) {
    return this.config.rateLimits[limitType] || 1000;
  }

  /**
   * Get log level
   */
  getLogLevel() {
    return this.config.monitoring.logLevel;
  }

  /**
   * Check if monitoring is enabled
   */
  isMonitoringEnabled() {
    return this.config.monitoring.enabled === true;
  }

  log(level, message, ...args) {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevel = this.getLogLevel();
    const currentLevelIndex = levels.indexOf(currentLevel);
    const messageLevelIndex = levels.indexOf(level);

    if (messageLevelIndex >= currentLevelIndex) {
      const timestamp = new Date().toISOString();
      const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
      
      switch (level) {
        case 'debug':
          console.log(prefix, message, ...args);
          break;
        case 'info':
          console.info(prefix, message, ...args);
          break;
        case 'warn':
          console.warn(prefix, message, ...args);
          break;
        case 'error':
          console.error(prefix, message, ...args);
          break;
      }
    }
  }

  exportConfig() {
    return {
      environment: 'production',
      config: this.config,
      timestamp: new Date().toISOString()
    };
  }

  validateEnvironment() {
    const issues = [];

    if (this.config.cacheEnabled && !this.config.cacheTTL) {
      issues.push('Cache enabled but TTL not configured');
    }

    if (!this.config.monitoring.logLevel) {
      issues.push('Log level not configured');
    }

    return {
      valid: issues.length === 0,
      issues,
      environment: 'production'
    };
  }

  getEnvironmentColor() {
    return 'bg-green-600';
  }

  allowsDangerousOperations() {
    return false;
  }

  getEnvironmentWarning() {
    return null;
  }
}

export const environmentConfig = new EnvironmentConfig();