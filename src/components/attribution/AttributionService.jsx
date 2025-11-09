import { base44 } from "@/api/base44Client";
import { environmentConfig } from "../config/EnvironmentConfig";
import { metricCalculationService } from "../metrics/MetricCalculationService";

/**
 * Attribution Service
 * Handles cross-platform attribution and customer journey tracking
 */
class AttributionService {
  constructor() {
    this.attributionWindows = {
      click: 30, // days
      view: 1    // days
    };
  }

  /**
   * Track conversion with full attribution
   */
  async trackConversion(conversionData) {
    try {
      environmentConfig.log('info', '[Attribution] Tracking conversion:', conversionData);

      const {
        organization_id,
        conversion_id,
        conversion_value,
        timestamp,
        user_identifier
      } = conversionData;

      // Get conversion configuration
      const conversions = await base44.entities.Conversion.list();
      const conversion = conversions.find(c => c.id === conversion_id);

      if (!conversion) {
        throw new Error('Conversion not found');
      }

      // Get user's touchpoints within attribution window
      const touchpoints = await this.getUserTouchpoints(
        organization_id,
        user_identifier,
        timestamp,
        conversion.attribution_window_days
      );

      if (touchpoints.length === 0) {
        environmentConfig.log('warn', '[Attribution] No touchpoints found for conversion');
        return null;
      }

      // Calculate attribution credits
      const attributedCredits = await metricCalculationService.calculateAttribution(
        touchpoints,
        conversion.attribution_model,
        conversion_value || conversion.value
      );

      // Store attribution records
      for (const credit of attributedCredits) {
        await this.storeAttributionCredit(
          organization_id,
          conversion_id,
          credit
        );
      }

      environmentConfig.log('info', `[Attribution] Conversion attributed to ${attributedCredits.length} touchpoints`);

      return {
        conversion_id,
        touchpoints: attributedCredits,
        attribution_model: conversion.attribution_model
      };

    } catch (error) {
      environmentConfig.log('error', '[Attribution] Track conversion error:', error);
      throw error;
    }
  }

  /**
   * Get user's touchpoints within attribution window
   */
  async getUserTouchpoints(organizationId, userIdentifier, conversionTime, windowDays) {
    try {
      const windowStart = new Date(new Date(conversionTime).getTime() - windowDays * 24 * 60 * 60 * 1000);

      // Mock touchpoints - in production, fetch from actual tracking data
      const touchpoints = [
        {
          timestamp: new Date(windowStart.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString(),
          source: 'google',
          medium: 'cpc',
          campaign: 'Brand Campaign',
          ad_id: 'ad_123',
          keyword: 'brand name',
          landing_page: '/services',
          type: 'click'
        },
        {
          timestamp: new Date(windowStart.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          source: 'facebook',
          medium: 'cpc',
          campaign: 'Retargeting Campaign',
          ad_id: 'fb_456',
          landing_page: '/pricing',
          type: 'view'
        },
        {
          timestamp: new Date(windowStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          source: 'direct',
          medium: 'none',
          landing_page: '/contact',
          type: 'click'
        },
        {
          timestamp: conversionTime,
          source: 'phone_call',
          medium: 'call_tracking',
          tracking_number: '+1-555-0101',
          type: 'conversion_action'
        }
      ];

      return touchpoints;

    } catch (error) {
      environmentConfig.log('error', '[Attribution] Get touchpoints error:', error);
      return [];
    }
  }

  /**
   * Store attribution credit
   */
  async storeAttributionCredit(organizationId, conversionId, credit) {
    try {
      // Create a record linking the credit to the source
      // This would go into a new entity or extend existing ones

      environmentConfig.log('debug', '[Attribution] Storing credit:', {
        conversion: conversionId,
        source: credit.source,
        credit: credit.credit
      });

      // In production, store to database
      // For now, just log

    } catch (error) {
      environmentConfig.log('error', '[Attribution] Store credit error:', error);
    }
  }

  /**
   * Get attribution report for time period
   */
  async getAttributionReport(organizationId, startDate, endDate, attributionModel = 'last_click') {
    try {
      environmentConfig.log('info', '[Attribution] Generating attribution report');

      // Get all conversions in period
      const conversions = await base44.entities.Conversion.filter({
        organization_id: organizationId
      });

      // Mock report data
      const report = {
        time_period: { start_date: startDate, end_date: endDate },
        attribution_model: attributionModel,
        channel_attribution: [
          {
            channel: 'google_cpc',
            conversions: 145,
            conversion_value: 14500,
            attributed_conversions: 120,
            attributed_value: 12000,
            cost: 5000,
            roas: 2.4
          },
          {
            channel: 'facebook_cpc',
            conversions: 89,
            conversion_value: 8900,
            attributed_conversions: 75,
            attributed_value: 7500,
            cost: 3000,
            roas: 2.5
          },
          {
            channel: 'direct',
            conversions: 67,
            conversion_value: 6700,
            attributed_conversions: 45,
            attributed_value: 4500,
            cost: 0,
            roas: null
          },
          {
            channel: 'phone_calls',
            conversions: 234,
            conversion_value: 23400,
            attributed_conversions: 200,
            attributed_value: 20000,
            cost: 2000,
            roas: 10.0
          }
        ],
        campaign_attribution: [
          {
            campaign: 'Brand Campaign',
            conversions: 180,
            attributed_value: 18000,
            cost: 4000,
            roas: 4.5
          },
          {
            campaign: 'Generic Campaign',
            conversions: 120,
            attributed_value: 12000,
            cost: 3500,
            roas: 3.4
          },
          {
            campaign: 'Retargeting Campaign',
            conversions: 95,
            attributed_value: 9500,
            cost: 2500,
            roas: 3.8
          }
        ],
        top_paths: [
          {
            path: 'google_cpc → direct → phone_call',
            conversions: 45,
            conversion_value: 4500
          },
          {
            path: 'facebook_cpc → google_cpc → phone_call',
            conversions: 32,
            conversion_value: 3200
          },
          {
            path: 'direct → phone_call',
            conversions: 28,
            conversion_value: 2800
          }
        ]
      };

      return report;

    } catch (error) {
      environmentConfig.log('error', '[Attribution] Get report error:', error);
      throw error;
    }
  }

  /**
   * Compare attribution models
   */
  async compareAttributionModels(organizationId, startDate, endDate) {
    try {
      environmentConfig.log('info', '[Attribution] Comparing attribution models');

      const models = ['last_click', 'first_click', 'linear', 'time_decay', 'position_based'];
      const comparison = {};

      for (const model of models) {
        const report = await this.getAttributionReport(organizationId, startDate, endDate, model);
        
        comparison[model] = {
          total_conversions: report.channel_attribution.reduce((sum, ch) => sum + ch.attributed_conversions, 0),
          total_value: report.channel_attribution.reduce((sum, ch) => sum + ch.attributed_value, 0),
          channels: report.channel_attribution
        };
      }

      return comparison;

    } catch (error) {
      environmentConfig.log('error', '[Attribution] Compare models error:', error);
      throw error;
    }
  }

  /**
   * Get customer journey
   */
  async getCustomerJourney(organizationId, userIdentifier) {
    try {
      environmentConfig.log('info', `[Attribution] Getting journey for user ${userIdentifier}`);

      // Mock journey data
      const journey = {
        user_identifier: userIdentifier,
        first_touch: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        last_touch: new Date().toISOString(),
        total_touchpoints: 8,
        touchpoints: [
          {
            timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            source: 'google',
            medium: 'organic',
            landing_page: '/blog/article',
            pages_viewed: 3,
            duration_seconds: 240
          },
          {
            timestamp: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
            source: 'google',
            medium: 'cpc',
            campaign: 'Brand Campaign',
            ad_id: 'ad_123',
            keyword: 'brand name',
            landing_page: '/services',
            pages_viewed: 5,
            duration_seconds: 420
          },
          {
            timestamp: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
            source: 'email',
            medium: 'newsletter',
            campaign: 'Monthly Newsletter',
            landing_page: '/case-studies',
            pages_viewed: 2,
            duration_seconds: 180
          },
          {
            timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
            source: 'facebook',
            medium: 'cpc',
            campaign: 'Retargeting Campaign',
            landing_page: '/pricing',
            pages_viewed: 4,
            duration_seconds: 300
          },
          {
            timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            source: 'direct',
            medium: 'none',
            landing_page: '/contact',
            pages_viewed: 2,
            duration_seconds: 120
          },
          {
            timestamp: new Date().toISOString(),
            source: 'phone_call',
            medium: 'call_tracking',
            tracking_number: '+1-555-0101',
            call_duration: 480,
            call_outcome: 'qualified',
            conversion: true,
            conversion_value: 500
          }
        ],
        conversions: [
          {
            timestamp: new Date().toISOString(),
            type: 'phone_call',
            value: 500
          }
        ],
        total_value: 500
      };

      return journey;

    } catch (error) {
      environmentConfig.log('error', '[Attribution] Get journey error:', error);
      throw error;
    }
  }
}

export const attributionService = new AttributionService();