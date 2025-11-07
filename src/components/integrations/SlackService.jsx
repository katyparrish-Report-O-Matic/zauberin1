
import { base44 } from "@/api/base44Client";

/**
 * Slack Integration Service
 * Posts metrics, alerts, and reports to Slack
 */
class SlackService {
  /**
   * Post message to Slack
   */
  async postMessage(webhookUrl, message) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message)
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.statusText}`);
      }

      return { success: true };
    } catch (error) {
      console.error('[Slack] Error posting message:', error);
      throw error;
    }
  }

  /**
   * Post daily metrics summary
   */
  async postDailySummary(integrationId) {
    try {
      const integrations = await base44.entities.SlackIntegration.list();
      const integration = integrations.find(i => i.id === integrationId);

      if (!integration || !integration.enabled) {
        return;
      }

      // Get metrics for last 24 hours
      const metrics = await base44.entities.TransformedMetric.filter({
        time_period: 'daily'
      }, '-created_date', 10);

      const summary = this.generateMetricsSummary(metrics);

      const message = {
        text: '📊 Daily Metrics Summary',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '📊 Daily Metrics Summary'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: summary
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Last updated: ${new Date().toLocaleString()}`
              }
            ]
          }
        ]
      };

      await this.postMessage(integration.webhook_url, message);

      // Update last posted time
      await base44.entities.SlackIntegration.update(integrationId, {
        last_posted: new Date().toISOString()
      });

      console.log('[Slack] Posted daily summary');
    } catch (error) {
      console.error('[Slack] Error posting daily summary:', error);
      throw error;
    }
  }

  /**
   * Post threshold alert
   */
  async postThresholdAlert(integrationId, metric, threshold, currentValue) {
    try {
      const integrations = await base44.entities.SlackIntegration.list();
      const integration = integrations.find(i => i.id === integrationId);

      if (!integration || !integration.enabled) {
        return;
      }

      const isAbove = currentValue > threshold;
      const emoji = isAbove ? '🔴' : '🟡';

      const message = {
        text: `${emoji} Threshold Alert: ${metric}`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `${emoji} Threshold Alert`
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Metric:*\n${metric}`
              },
              {
                type: 'mrkdwn',
                text: `*Current Value:*\n${currentValue.toLocaleString()}`
              },
              {
                type: 'mrkdwn',
                text: `*Threshold:*\n${threshold.toLocaleString()}`
              },
              {
                type: 'mrkdwn',
                text: `*Status:*\n${isAbove ? 'Above threshold' : 'Below threshold'}`
              }
            ]
          }
        ]
      };

      await this.postMessage(integration.webhook_url, message);
      console.log('[Slack] Posted threshold alert');
    } catch (error) {
      console.error('[Slack] Error posting alert:', error);
      throw error;
    }
  }

  /**
   * Post quality alert
   */
  async postQualityAlert(integrationId, issue) {
    try {
      const integrations = await base44.entities.SlackIntegration.list();
      const integration = integrations.find(i => i.id === integrationId);

      if (!integration || !integration.enabled) {
        return;
      }

      const severityEmoji = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🔵'
      };

      const message = {
        text: `${severityEmoji[issue.severity]} Data Quality Alert`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `${severityEmoji[issue.severity]} Data Quality Alert`
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Metric:*\n${issue.metric_name}`
              },
              {
                type: 'mrkdwn',
                text: `*Severity:*\n${issue.severity.toUpperCase()}`
              },
              {
                type: 'mrkdwn',
                text: `*Issue Type:*\n${issue.issue_type.replace('_', ' ')}`
              },
              {
                type: 'mrkdwn',
                text: `*Affected:*\n${issue.affected_records} records`
              }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Description:*\n${issue.description}`
            }
          }
        ]
      };

      await this.postMessage(integration.webhook_url, message);
      console.log('[Slack] Posted quality alert');
    } catch (error) {
      console.error('[Slack] Error posting quality alert:', error);
      throw error;
    }
  }

  /**
   * Share report link
   */
  async shareReport(integrationId, reportTitle, reportUrl) {
    try {
      const integrations = await base44.entities.SlackIntegration.list();
      const integration = integrations.find(i => i.id === integrationId);

      if (!integration || !integration.enabled) {
        return;
      }

      const message = {
        text: `📊 Report Shared: ${reportTitle}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📊 *${reportTitle}* has been shared`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'View Report'
                },
                url: reportUrl,
                action_id: 'view_report'
              }
            ]
          }
        ]
      };

      await this.postMessage(integration.webhook_url, message);
      console.log('[Slack] Shared report link');
    } catch (error) {
      console.error('[Slack] Error sharing report:', error);
      throw error;
    }
  }

  /**
   * Generate metrics summary text
   */
  generateMetricsSummary(metrics) {
    if (!metrics || metrics.length === 0) {
      return 'No metrics data available.';
    }

    const metricGroups = {};
    metrics.forEach(m => {
      if (!metricGroups[m.metric_name]) {
        metricGroups[m.metric_name] = [];
      }
      metricGroups[m.metric_name].push(m);
    });

    let summary = '';
    Object.entries(metricGroups).forEach(([name, values]) => {
      const latest = values[0];
      const previous = values[1];
      
      const change = previous 
        ? ((latest.aggregated_value - previous.aggregated_value) / previous.aggregated_value * 100)
        : 0;
      
      const changeEmoji = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';
      
      summary += `\n*${name}:* ${latest.aggregated_value.toLocaleString()} ${changeEmoji} ${Math.abs(change).toFixed(1)}%`;
    });

    return summary;
  }

  /**
   * Test Slack connection
   */
  async testConnection(webhookUrl) {
    try {
      const message = {
        text: '✅ Zauberin connection test successful!',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '✅ *Zauberin Connection Test*\n\nYour Slack integration is configured correctly!'
            }
          }
        ]
      };

      await this.postMessage(webhookUrl, message);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export const slackService = new SlackService();
