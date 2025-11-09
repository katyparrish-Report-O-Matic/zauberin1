import { base44 } from "@/api/base44Client";
import { environmentConfig } from "../config/EnvironmentConfig";

/**
 * Metric Calculation Service
 * Handles derived metrics, ROAS, CPA, conversion rates, and ROI calculations
 */
class MetricCalculationService {
  constructor() {
    this.calculators = this.initializeCalculators();
  }

  /**
   * Initialize metric calculators
   */
  initializeCalculators() {
    return {
      // Google Ads metrics
      ctr: (data) => this.calculatePercentage(data.clicks, data.impressions),
      cpc: (data) => this.calculateRatio(data.cost, data.clicks),
      cpm: (data) => this.calculateRatio(data.cost, data.impressions) * 1000,
      cpa: (data) => this.calculateRatio(data.cost, data.conversions),
      conversion_rate: (data) => this.calculatePercentage(data.conversions, data.clicks),
      roas: (data) => this.calculateRatio(data.conversion_value, data.cost),
      
      // GA4 metrics
      bounce_rate: (data) => 100 - this.calculatePercentage(data.engaged_sessions, data.sessions),
      engagement_rate: (data) => this.calculatePercentage(data.engaged_sessions, data.sessions),
      pages_per_session: (data) => this.calculateRatio(data.pageviews, data.sessions),
      avg_session_duration: (data) => this.calculateRatio(data.total_session_duration, data.sessions),
      
      // Call tracking metrics
      answer_rate: (data) => this.calculatePercentage(data.answered_calls, data.total_calls),
      qualification_rate: (data) => this.calculatePercentage(data.qualified_calls, data.answered_calls),
      avg_call_duration: (data) => this.calculateRatio(data.total_duration_minutes, data.answered_calls),
      
      // ROI metrics
      roi: (data) => this.calculateROI(data.revenue, data.cost),
      profit: (data) => data.revenue - data.cost,
      profit_margin: (data) => this.calculatePercentage(data.revenue - data.cost, data.revenue),
      
      // Cross-platform metrics
      cost_per_call: (data) => this.calculateRatio(data.cost, data.total_calls),
      revenue_per_call: (data) => this.calculateRatio(data.revenue, data.qualified_calls),
      call_conversion_rate: (data) => this.calculatePercentage(data.qualified_calls, data.total_calls)
    };
  }

  /**
   * Calculate all metrics for a dataset
   */
  async calculateMetrics(rawData, metricKeys) {
    try {
      environmentConfig.log('info', `[MetricCalc] Calculating ${metricKeys.length} metrics`);

      const enrichedData = rawData.map(record => {
        const calculated = { ...record };

        for (const metricKey of metricKeys) {
          if (this.calculators[metricKey]) {
            try {
              calculated[metricKey] = this.calculators[metricKey](record);
            } catch (error) {
              environmentConfig.log('warn', `[MetricCalc] Failed to calculate ${metricKey}:`, error);
              calculated[metricKey] = null;
            }
          }
        }

        return calculated;
      });

      return enrichedData;

    } catch (error) {
      environmentConfig.log('error', '[MetricCalc] Calculate metrics error:', error);
      throw error;
    }
  }

  /**
   * Calculate custom metric from formula
   */
  async calculateCustomMetric(data, formula, dependencies) {
    try {
      // Parse formula and calculate
      // Example formula: "(conversion_value - cost) / cost * 100"
      
      const result = data.map(record => {
        try {
          // Ensure all dependencies exist
          const hasAllDependencies = dependencies.every(dep => 
            record[dep] !== undefined && record[dep] !== null
          );

          if (!hasAllDependencies) {
            return { ...record, custom_metric: null };
          }

          // Create safe evaluation context
          const context = {};
          dependencies.forEach(dep => {
            context[dep] = record[dep];
          });

          // Simple formula evaluation (in production, use a proper expression parser)
          const value = this.evaluateFormula(formula, context);

          return { ...record, custom_metric: value };

        } catch (error) {
          environmentConfig.log('warn', '[MetricCalc] Custom metric calculation failed:', error);
          return { ...record, custom_metric: null };
        }
      });

      return result;

    } catch (error) {
      environmentConfig.log('error', '[MetricCalc] Calculate custom metric error:', error);
      throw error;
    }
  }

  /**
   * Calculate period-over-period comparison
   */
  async calculateComparison(currentData, previousData, metricKey) {
    try {
      const currentTotal = this.sumMetric(currentData, metricKey);
      const previousTotal = this.sumMetric(previousData, metricKey);

      const change = currentTotal - previousTotal;
      const percentChange = this.calculatePercentage(change, previousTotal);

      return {
        current: currentTotal,
        previous: previousTotal,
        change,
        percent_change: percentChange,
        trend: change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
      };

    } catch (error) {
      environmentConfig.log('error', '[MetricCalc] Calculate comparison error:', error);
      throw error;
    }
  }

  /**
   * Calculate goal progress
   */
  async calculateGoalProgress(goalId) {
    try {
      const goals = await base44.entities.Goal.list();
      const goal = goals.find(g => g.id === goalId);

      if (!goal) {
        throw new Error('Goal not found');
      }

      // Fetch actual metric value for the time period
      const actualValue = await this.fetchActualValue(
        goal.metric_key,
        goal.time_period,
        goal.scope
      );

      const achievementPercentage = (actualValue / goal.target_value) * 100;
      const remaining = goal.target_value - actualValue;
      const isOnTrack = achievementPercentage >= (goal.alert_threshold_percentage || 90);

      // Update goal
      await base44.entities.Goal.update(goalId, {
        current_value: actualValue,
        achievement_percentage: achievementPercentage
      });

      // Send alert if needed
      if (!isOnTrack && goal.alert_emails?.length > 0) {
        await this.sendGoalAlert(goal, achievementPercentage);
      }

      return {
        goal_id: goalId,
        metric: goal.metric_key,
        target: goal.target_value,
        actual: actualValue,
        remaining,
        achievement_percentage: achievementPercentage,
        is_on_track: isOnTrack
      };

    } catch (error) {
      environmentConfig.log('error', '[MetricCalc] Calculate goal progress error:', error);
      throw error;
    }
  }

  /**
   * Calculate attribution credit
   */
  async calculateAttribution(touchpoints, attributionModel, conversionValue) {
    try {
      let attributedCredits = [];

      switch (attributionModel) {
        case 'last_click':
          attributedCredits = this.lastClickAttribution(touchpoints, conversionValue);
          break;
        case 'first_click':
          attributedCredits = this.firstClickAttribution(touchpoints, conversionValue);
          break;
        case 'linear':
          attributedCredits = this.linearAttribution(touchpoints, conversionValue);
          break;
        case 'time_decay':
          attributedCredits = this.timeDecayAttribution(touchpoints, conversionValue);
          break;
        case 'position_based':
          attributedCredits = this.positionBasedAttribution(touchpoints, conversionValue);
          break;
        default:
          attributedCredits = this.lastClickAttribution(touchpoints, conversionValue);
      }

      return attributedCredits;

    } catch (error) {
      environmentConfig.log('error', '[MetricCalc] Calculate attribution error:', error);
      throw error;
    }
  }

  // Helper calculation methods
  calculatePercentage(numerator, denominator) {
    if (!denominator || denominator === 0) return 0;
    return ((numerator / denominator) * 100).toFixed(2);
  }

  calculateRatio(numerator, denominator) {
    if (!denominator || denominator === 0) return 0;
    return (numerator / denominator).toFixed(2);
  }

  calculateROI(revenue, cost) {
    if (!cost || cost === 0) return 0;
    return (((revenue - cost) / cost) * 100).toFixed(2);
  }

  sumMetric(data, metricKey) {
    return data.reduce((sum, record) => sum + (parseFloat(record[metricKey]) || 0), 0);
  }

  evaluateFormula(formula, context) {
    // Simple evaluation - in production, use a proper expression parser library
    let expression = formula;
    
    Object.keys(context).forEach(key => {
      const regex = new RegExp(`\\b${key}\\b`, 'g');
      expression = expression.replace(regex, context[key]);
    });

    try {
      // Use Function constructor as a safe eval alternative
      const func = new Function(`return ${expression}`);
      return func();
    } catch (error) {
      environmentConfig.log('warn', '[MetricCalc] Formula evaluation failed:', error);
      return null;
    }
  }

  async fetchActualValue(metricKey, timePeriod, scope) {
    // Fetch actual metric value from transformed metrics
    const metrics = await base44.entities.TransformedMetric.filter({
      metric_name: metricKey
    });

    // Filter by time period and scope
    const relevantMetrics = metrics.filter(m => {
      const recordDate = new Date(m.period_start);
      const now = new Date();
      
      switch (timePeriod) {
        case 'daily':
          return recordDate.toDateString() === now.toDateString();
        case 'weekly':
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          return recordDate >= weekAgo;
        case 'monthly':
          return recordDate.getMonth() === now.getMonth() && 
                 recordDate.getFullYear() === now.getFullYear();
        default:
          return true;
      }
    });

    return relevantMetrics.reduce((sum, m) => sum + (m.aggregated_value || 0), 0);
  }

  async sendGoalAlert(goal, achievementPercentage) {
    try {
      const now = new Date();
      const lastAlerted = goal.last_alerted_at ? new Date(goal.last_alerted_at) : null;
      
      // Don't send alerts more than once per day
      if (lastAlerted && (now - lastAlerted) < 24 * 60 * 60 * 1000) {
        return;
      }

      for (const email of goal.alert_emails) {
        await base44.integrations.Core.SendEmail({
          to: email,
          subject: `Goal Alert: ${goal.name}`,
          body: `
            <h2>Goal Alert: ${goal.name}</h2>
            <p>Your goal is currently at ${achievementPercentage.toFixed(2)}% of target.</p>
            <ul>
              <li><strong>Metric:</strong> ${goal.metric_key}</li>
              <li><strong>Target:</strong> ${goal.target_value}</li>
              <li><strong>Current:</strong> ${goal.current_value}</li>
              <li><strong>Remaining:</strong> ${(goal.target_value - goal.current_value).toFixed(2)}</li>
            </ul>
            <p>Log in to view more details and take action.</p>
          `
        });
      }

      await base44.entities.Goal.update(goal.id, {
        last_alerted_at: now.toISOString()
      });

    } catch (error) {
      environmentConfig.log('error', '[MetricCalc] Send goal alert error:', error);
    }
  }

  // Attribution models
  lastClickAttribution(touchpoints, value) {
    const lastTouchpoint = touchpoints[touchpoints.length - 1];
    return [{ ...lastTouchpoint, credit: value }];
  }

  firstClickAttribution(touchpoints, value) {
    const firstTouchpoint = touchpoints[0];
    return [{ ...firstTouchpoint, credit: value }];
  }

  linearAttribution(touchpoints, value) {
    const creditPerTouchpoint = value / touchpoints.length;
    return touchpoints.map(tp => ({ ...tp, credit: creditPerTouchpoint }));
  }

  timeDecayAttribution(touchpoints, value) {
    const halfLife = 7; // 7 days
    const now = new Date();
    
    const weights = touchpoints.map(tp => {
      const daysSince = (now - new Date(tp.timestamp)) / (1000 * 60 * 60 * 24);
      return Math.pow(2, -daysSince / halfLife);
    });
    
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    
    return touchpoints.map((tp, idx) => ({
      ...tp,
      credit: (weights[idx] / totalWeight) * value
    }));
  }

  positionBasedAttribution(touchpoints, value) {
    if (touchpoints.length === 1) {
      return [{ ...touchpoints[0], credit: value }];
    }
    
    const firstCredit = value * 0.4;
    const lastCredit = value * 0.4;
    const middleCredit = value * 0.2;
    
    if (touchpoints.length === 2) {
      return [
        { ...touchpoints[0], credit: firstCredit + middleCredit / 2 },
        { ...touchpoints[1], credit: lastCredit + middleCredit / 2 }
      ];
    }
    
    const middleCreditPerTouchpoint = middleCredit / (touchpoints.length - 2);
    
    return touchpoints.map((tp, idx) => {
      if (idx === 0) return { ...tp, credit: firstCredit };
      if (idx === touchpoints.length - 1) return { ...tp, credit: lastCredit };
      return { ...tp, credit: middleCreditPerTouchpoint };
    });
  }
}

export const metricCalculationService = new MetricCalculationService();