
/**
 * Environment Configuration Service
 * Manages environment-specific settings and configurations
 */

// Environment definitions
const ENVIRONMENTS = {
  development: {
    name: 'Development',
    apiBaseUrl: 'http://localhost:3000/api/v1',
    useMockData: true,
    enableVerboseLogging: true,
    enableDebugMode: true,
    cacheEnabled: true,
    cacheTTL: {
      query: 300,        // 5 minutes in dev
      api_response: 180,
      metric_data: 60,
      report: 600,
      user_prefs: 1800
    },
    rateLimits: {
      apiCallsPerHour: 10000,  // Generous limit for dev
      reportsPerDay: 1000
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
      logLevel: 'debug',
      errorReporting: false,
      performanceTracking: true
    }
  },

  staging: {
    name: 'Staging',
    apiBaseUrl: 'https://api-staging.zauberin.app/v1', // Updated
    useMockData: false,
    enableVerboseLogging: true,
    enableDebugMode: true,
    cacheEnabled: true,
    cacheTTL: {
      query: 1800,      // 30 minutes
      api_response: 900,
      metric_data: 600,
      report: 3600,
      user_prefs: 7200
    },
    rateLimits: {
      apiCallsPerHour: 5000,
      reportsPerDay: 500
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
      logLevel: 'info',
      errorReporting: true,
      performanceTracking: true
    }
  },

  production: {
    name: 'Production',
    apiBaseUrl: 'https://api.zauberin.app/v1', // Updated
    useMockData: false,
    enableVerboseLogging: false,
    enableDebugMode: false,
    cacheEnabled: true,
    cacheTTL: {
      query: 3600,      // 1 hour
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
  }
};

class EnvironmentConfig {
  constructor() {
    // Detect environment from URL or localStorage
    this.currentEnvironment = this.detectEnvironment();
    this.config = ENVIRONMENTS[this.currentEnvironment];
  }

  /**
   * Detect current environment
   */
  detectEnvironment() {
    // Check localStorage first (for manual override)
    const stored = localStorage.getItem('metricflow_environment');
    if (stored && ENVIRONMENTS[stored]) {
      return stored;
    }

    // Detect from hostname
    const hostname = window.location.hostname;
    
    if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
      return 'development';
    } else if (hostname.includes('staging')) {
      return 'staging';
    } else {
      return 'production';
    }
  }

  /**
   * Get current environment name
   */
  getEnvironment() {
    return this.currentEnvironment;
  }

  /**
   * Get environment display name
   */
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

  /**
   * Log message based on environment
   */
  log(level, message, ...args) {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevel = this.getLogLevel();
    const currentLevelIndex = levels.indexOf(currentLevel);
    const messageLevelIndex = levels.indexOf(level);

    // Only log if message level is >= current level
    if (messageLevelIndex >= currentLevelIndex) {
      const timestamp = new Date().toISOString();
      const prefix = `[${timestamp}] [${this.currentEnvironment.toUpperCase()}] [${level.toUpperCase()}]`;
      
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

  /**
   * Switch environment (admin only)
   */
  switchEnvironment(environment) {
    if (!ENVIRONMENTS[environment]) {
      throw new Error(`Invalid environment: ${environment}`);
    }

    localStorage.setItem('metricflow_environment', environment);
    this.currentEnvironment = environment;
    this.config = ENVIRONMENTS[environment];
    
    this.log('info', `Switched to ${environment} environment`);
    
    // Reload page to apply new config
    window.location.reload();
  }

  /**
   * Get all available environments
   */
  getAvailableEnvironments() {
    return Object.keys(ENVIRONMENTS).map(key => ({
      key,
      name: ENVIRONMENTS[key].name,
      current: key === this.currentEnvironment
    }));
  }

  /**
   * Export configuration for debugging
   */
  exportConfig() {
    return {
      environment: this.currentEnvironment,
      config: this.config,
      hostname: window.location.hostname,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Validate environment setup
   */
  validateEnvironment() {
    const issues = [];

    // Check required config
    if (!this.config.apiBaseUrl) {
      issues.push('API base URL not configured');
    }

    // Check cache settings
    if (this.config.cacheEnabled && !this.config.cacheTTL) {
      issues.push('Cache enabled but TTL not configured');
    }

    // Check monitoring
    if (!this.config.monitoring.logLevel) {
      issues.push('Log level not configured');
    }

    return {
      valid: issues.length === 0,
      issues,
      environment: this.currentEnvironment
    };
  }

  /**
   * Get environment color for UI
   */
  getEnvironmentColor() {
    const colors = {
      development: 'bg-blue-600',
      staging: 'bg-yellow-600',
      production: 'bg-green-600'
    };
    return colors[this.currentEnvironment] || 'bg-gray-600';
  }

  /**
   * Check if environment allows dangerous operations
   */
  allowsDangerousOperations() {
    return this.currentEnvironment !== 'production';
  }

  /**
   * Get environment-specific warning message
   */
  getEnvironmentWarning() {
    if (this.currentEnvironment === 'development') {
      return 'You are in DEVELOPMENT mode. Data may be mocked.';
    } else if (this.currentEnvironment === 'staging') {
      return 'You are in STAGING mode. Changes will not affect production.';
    }
    return null;
  }
}

// Create singleton instance
export const environmentConfig = new EnvironmentConfig();

// Export for testing
export { ENVIRONMENTS };
