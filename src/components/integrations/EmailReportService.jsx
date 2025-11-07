import { base44 } from "@/api/base44Client";

/**
 * Email Report Service
 * Generates and sends scheduled email reports
 */
class EmailReportService {
  /**
   * Send scheduled report
   */
  async sendScheduledReport(scheduleId) {
    try {
      const schedules = await base44.entities.EmailSchedule.list();
      const schedule = schedules.find(s => s.id === scheduleId);

      if (!schedule || !schedule.enabled) {
        return;
      }

      // Generate report data
      const reportData = await this.generateReportData(schedule);

      // Create email body
      const emailBody = this.generateEmailHTML(schedule, reportData);

      // Send email
      for (const recipient of schedule.recipients) {
        await base44.integrations.Core.SendEmail({
          from_name: 'MetricFlow Reports',
          to: recipient,
          subject: `${schedule.name} - ${new Date().toLocaleDateString()}`,
          body: emailBody
        });
      }

      // Update last sent time
      await base44.entities.EmailSchedule.update(scheduleId, {
        last_sent: new Date().toISOString(),
        next_send: this.calculateNextSend(schedule).toISOString()
      });

      console.log(`[Email] Sent report: ${schedule.name}`);
    } catch (error) {
      console.error('[Email] Error sending report:', error);
      throw error;
    }
  }

  /**
   * Generate report data
   */
  async generateReportData(schedule) {
    const endDate = new Date();
    const startDate = new Date();

    // Determine date range based on schedule
    switch (schedule.schedule) {
      case 'daily':
        startDate.setDate(endDate.getDate() - 1);
        break;
      case 'weekly':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case 'monthly':
        startDate.setMonth(endDate.getMonth() - 1);
        break;
    }

    // Fetch metrics data
    const metrics = await base44.entities.TransformedMetric.list('-created_date', 1000);

    const filteredMetrics = metrics.filter(m => {
      const date = new Date(m.period_start);
      return date >= startDate && date <= endDate;
    });

    // Group by metric name
    const groupedMetrics = {};
    filteredMetrics.forEach(m => {
      if (!groupedMetrics[m.metric_name]) {
        groupedMetrics[m.metric_name] = [];
      }
      groupedMetrics[m.metric_name].push(m);
    });

    // Calculate summaries
    const summaries = {};
    Object.entries(groupedMetrics).forEach(([name, values]) => {
      const total = values.reduce((sum, v) => sum + v.aggregated_value, 0);
      const average = total / values.length;
      const max = Math.max(...values.map(v => v.aggregated_value));
      const min = Math.min(...values.map(v => v.aggregated_value));

      summaries[name] = {
        total,
        average,
        max,
        min,
        count: values.length
      };
    });

    return {
      period: {
        start: startDate.toLocaleDateString(),
        end: endDate.toLocaleDateString()
      },
      summaries,
      totalRecords: filteredMetrics.length
    };
  }

  /**
   * Generate HTML email
   */
  generateEmailHTML(schedule, data) {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 10px 10px 0 0;
      text-align: center;
    }
    .content {
      background: #fff;
      padding: 30px;
      border: 1px solid #e5e7eb;
      border-top: none;
    }
    .metric-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      margin: 15px 0;
    }
    .metric-name {
      font-size: 14px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
    }
    .metric-value {
      font-size: 32px;
      font-weight: bold;
      color: #111827;
      margin-bottom: 15px;
    }
    .metric-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      font-size: 14px;
      color: #6b7280;
    }
    .stat-item {
      text-align: center;
      padding: 10px;
      background: white;
      border-radius: 6px;
    }
    .stat-label {
      font-size: 11px;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .stat-value {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
    }
    .footer {
      background: #f9fafb;
      padding: 20px;
      border-radius: 0 0 10px 10px;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
      border: 1px solid #e5e7eb;
      border-top: none;
    }
    .button {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 12px 24px;
      border-radius: 6px;
      text-decoration: none;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0; font-size: 28px;">📊 ${schedule.name}</h1>
    <p style="margin: 10px 0 0; opacity: 0.9;">${data.period.start} - ${data.period.end}</p>
  </div>
  
  <div class="content">
    <p>Here's your ${schedule.schedule} metrics summary:</p>
    
    ${Object.entries(data.summaries).map(([name, stats]) => `
      <div class="metric-card">
        <div class="metric-name">${name}</div>
        <div class="metric-value">${stats.total.toLocaleString()}</div>
        <div class="metric-stats">
          <div class="stat-item">
            <div class="stat-label">Average</div>
            <div class="stat-value">${stats.average.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Peak</div>
            <div class="stat-value">${stats.max.toLocaleString()}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Low</div>
            <div class="stat-value">${stats.min.toLocaleString()}</div>
          </div>
        </div>
      </div>
    `).join('')}
    
    <center>
      <a href="${window.location.origin}" class="button">View Dashboard</a>
    </center>
  </div>
  
  <div class="footer">
    <p>This is an automated report from MetricFlow</p>
    <p style="margin-top: 10px;">© ${new Date().getFullYear()} MetricFlow. All rights reserved.</p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Calculate next send time
   */
  calculateNextSend(schedule) {
    const next = new Date();

    switch (schedule.schedule) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        if (schedule.schedule_time) {
          const [hours, minutes] = schedule.schedule_time.split(':');
          next.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        }
        break;
      case 'weekly':
        next.setDate(next.getDate() + 7);
        if (schedule.day_of_week !== undefined) {
          const currentDay = next.getDay();
          const targetDay = schedule.day_of_week;
          const daysToAdd = (targetDay - currentDay + 7) % 7 || 7;
          next.setDate(next.getDate() + daysToAdd);
        }
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        if (schedule.day_of_month) {
          next.setDate(schedule.day_of_month);
        }
        break;
    }

    return next;
  }

  /**
   * Check and send due reports
   */
  async checkAndSendDueReports() {
    try {
      const schedules = await base44.entities.EmailSchedule.filter({
        enabled: true
      });

      const now = new Date();

      for (const schedule of schedules) {
        if (schedule.next_send && new Date(schedule.next_send) <= now) {
          await this.sendScheduledReport(schedule.id);
        }
      }
    } catch (error) {
      console.error('[Email] Error checking due reports:', error);
    }
  }
}

export const emailReportService = new EmailReportService();