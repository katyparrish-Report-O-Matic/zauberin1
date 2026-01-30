/**
 * Application Configuration
 * Central configuration for cache, monitoring, and features
 */

const CONFIG = {
  cacheEnabled: true,
  cacheTTL: {
    query: 3600,
    api_response: 1800,
    metric_data: 900,
    report: 7200,
    user_prefs: 86400
  },
  monitoring: {
    enabled: true,
    logLevel: 'error'
  }
};

class EnvironmentConfig {
  get(key) {
    return CONFIG[key];
  }

  getCacheTTL(cacheType) {
    return CONFIG.cacheTTL[cacheType] || 3600;
  }

  getLogLevel() {
    return CONFIG.monitoring.logLevel;
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

  isMonitoringEnabled() {
    return CONFIG.monitoring.enabled === true;
  }
}

export const environmentConfig = new EnvironmentConfig();