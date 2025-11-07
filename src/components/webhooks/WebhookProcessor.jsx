import { base44 } from "@/api/base44Client";
import { dataTransformationService } from "../data/DataTransformationService";

/**
 * Webhook Processor Service
 * Handles incoming webhook data and stores metrics
 */
class WebhookProcessor {
  /**
   * Process incoming webhook data
   */
  async processWebhook(webhookId, payload, signature = null) {
    const startTime = Date.now();
    
    try {
      // Get webhook configuration
      const webhooks = await base44.entities.WebhookEndpoint.list();
      const webhook = webhooks.find(w => w.id === webhookId);
      
      if (!webhook) {
        throw new Error('Webhook not found');
      }

      if (!webhook.enabled) {
        throw new Error('Webhook is disabled');
      }

      // Validate signature if provided
      const signatureValid = signature ? this.validateSignature(payload, signature, webhook.secret_key) : true;

      if (!signatureValid) {
        await this.logActivity(webhook, payload, 'failed', false, 'Invalid signature');
        throw new Error('Invalid webhook signature');
      }

      // Transform payload to metrics
      const metrics = this.extractMetrics(payload, webhook.metric_mappings);

      // Store metrics using transformation service
      let recordsCreated = 0;
      for (const metric of metrics) {
        await dataTransformationService.transformData([metric], {
          metric_name: metric.metric_name || 'webhook_metric',
          time_period: 'hourly',
          segment_by: []
        });
        recordsCreated++;
      }

      // Update webhook stats
      await base44.entities.WebhookEndpoint.update(webhook.id, {
        last_triggered: new Date().toISOString(),
        total_requests: (webhook.total_requests || 0) + 1
      });

      const processingTime = Date.now() - startTime;

      // Log successful activity
      await this.logActivity(
        webhook,
        payload,
        'success',
        signatureValid,
        null,
        recordsCreated,
        processingTime
      );

      console.log(`[WebhookProcessor] Processed webhook ${webhook.name}: ${recordsCreated} records`);

      return {
        success: true,
        recordsCreated,
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Log failed activity
      const webhooks = await base44.entities.WebhookEndpoint.list();
      const webhook = webhooks.find(w => w.id === webhookId);
      
      if (webhook) {
        await this.logActivity(
          webhook,
          payload,
          'failed',
          false,
          error.message,
          0,
          processingTime
        );
      }

      console.error('[WebhookProcessor] Error:', error);
      throw error;
    }
  }

  /**
   * Validate webhook signature
   */
  validateSignature(payload, signature, secretKey) {
    // Simple validation - in production use HMAC-SHA256
    const expectedSignature = btoa(JSON.stringify(payload) + secretKey);
    return signature === expectedSignature;
  }

  /**
   * Extract metrics from webhook payload
   */
  extractMetrics(payload, mappings = {}) {
    const metrics = [];

    // If payload is an array, process each item
    if (Array.isArray(payload)) {
      payload.forEach(item => {
        metrics.push(this.mapPayloadToMetric(item, mappings));
      });
    } else {
      // Single metric
      metrics.push(this.mapPayloadToMetric(payload, mappings));
    }

    return metrics;
  }

  /**
   * Map payload fields to metric structure
   */
  mapPayloadToMetric(item, mappings) {
    const metric = {
      date: item.timestamp || item.date || new Date().toISOString(),
      metric_name: mappings.metric_name || 'webhook_data',
      value: item.value || item.amount || 0
    };

    // Add mapped fields
    Object.keys(mappings).forEach(key => {
      if (key !== 'metric_name' && item[key]) {
        metric[mappings[key]] = item[key];
      }
    });

    // Add any additional fields from payload
    Object.keys(item).forEach(key => {
      if (!metric[key] && key !== 'timestamp') {
        metric[key] = item[key];
      }
    });

    return metric;
  }

  /**
   * Log webhook activity
   */
  async logActivity(webhook, payload, status, signatureValid, error = null, recordsCreated = 0, processingTime = 0) {
    try {
      await base44.entities.WebhookActivity.create({
        webhook_id: webhook.id,
        organization_id: webhook.organization_id,
        status,
        payload,
        signature_valid: signatureValid,
        error_message: error,
        records_created: recordsCreated,
        processing_time_ms: processingTime
      });
    } catch (logError) {
      console.error('[WebhookProcessor] Failed to log activity:', logError);
    }
  }

  /**
   * Generate webhook signature for testing
   */
  generateSignature(payload, secretKey) {
    return btoa(JSON.stringify(payload) + secretKey);
  }

  /**
   * Get recent webhook activity
   */
  async getRecentActivity(webhookId, limit = 20) {
    try {
      const activities = await base44.entities.WebhookActivity.filter(
        { webhook_id: webhookId },
        '-created_date',
        limit
      );
      return activities;
    } catch (error) {
      console.error('[WebhookProcessor] Error fetching activity:', error);
      return [];
    }
  }
}

export const webhookProcessor = new WebhookProcessor();