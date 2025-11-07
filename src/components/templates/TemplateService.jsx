import { base44 } from "@/api/base44Client";

/**
 * Template Service
 * Manages report templates - creation, loading, sharing
 */
class TemplateService {
  constructor() {
    this.systemTemplates = this.getSystemTemplates();
  }

  /**
   * Get pre-defined system templates
   */
  getSystemTemplates() {
    return [
      {
        name: "Executive Summary",
        description: "High-level overview with 4 KPIs and main trend chart",
        template_type: "executive_summary",
        category: "general",
        configuration: {
          layout: {
            type: "dashboard",
            sections: [
              { type: "kpi_grid", metrics: ["revenue", "users", "conversions", "engagement"] },
              { type: "main_chart", chart_type: "line", metrics: ["revenue"] }
            ]
          },
          metrics: ["revenue", "users", "conversions", "engagement"],
          chart_types: ["kpi", "line"],
          date_range: { period: "last_30_days", granularity: "daily" },
          filters: {},
          segment_by: []
        },
        is_system: true
      },
      {
        name: "Detailed Analysis",
        description: "Deep dive into a single metric with multiple visualizations",
        template_type: "detailed_analysis",
        category: "general",
        configuration: {
          layout: {
            type: "multi_chart",
            sections: [
              { type: "line_chart", metrics: ["revenue"] },
              { type: "bar_chart", metrics: ["revenue"], segment_by: ["region"] },
              { type: "pie_chart", metrics: ["revenue"], segment_by: ["branch"] },
              { type: "table", metrics: ["revenue"], segment_by: ["date", "region"] }
            ]
          },
          metrics: ["revenue"],
          chart_types: ["line", "bar", "pie", "table"],
          date_range: { period: "last_90_days", granularity: "weekly" },
          segment_by: ["region", "branch"],
          filters: {}
        },
        is_system: true
      },
      {
        name: "Comparison View",
        description: "Compare multiple metrics side-by-side",
        template_type: "comparison_view",
        category: "general",
        configuration: {
          layout: {
            type: "comparison",
            sections: [
              { type: "metric_cards", metrics: ["revenue", "users", "conversions"] },
              { type: "comparison_chart", chart_type: "bar", metrics: ["revenue", "users", "conversions"] }
            ]
          },
          metrics: ["revenue", "users", "conversions"],
          chart_types: ["bar"],
          date_range: { period: "last_30_days", granularity: "daily" },
          segment_by: [],
          filters: {}
        },
        is_system: true
      },
      {
        name: "Real-time Monitor",
        description: "Live dashboard with auto-refresh",
        template_type: "realtime_monitor",
        category: "operations",
        configuration: {
          layout: {
            type: "monitor",
            sections: [
              { type: "live_metrics", metrics: ["active_users", "transactions", "errors"] },
              { type: "live_chart", chart_type: "line", metrics: ["active_users"] }
            ]
          },
          metrics: ["active_users", "transactions", "errors"],
          chart_types: ["line"],
          date_range: { period: "last_hour", granularity: "hourly" },
          refresh_interval: 30,
          filters: {}
        },
        is_system: true
      },
      {
        name: "Sales Performance",
        description: "Track sales metrics by region and branch",
        template_type: "custom",
        category: "sales",
        configuration: {
          layout: {
            type: "dashboard",
            sections: [
              { type: "kpi_row", metrics: ["revenue", "conversions"] },
              { type: "chart", chart_type: "line", metrics: ["revenue"], segment_by: ["region"] },
              { type: "chart", chart_type: "bar", metrics: ["conversions"], segment_by: ["branch"] }
            ]
          },
          metrics: ["revenue", "conversions"],
          chart_types: ["line", "bar"],
          date_range: { period: "last_30_days", granularity: "daily" },
          segment_by: ["region", "branch"],
          filters: {}
        },
        is_system: true
      },
      {
        name: "Marketing Dashboard",
        description: "Track campaign performance and engagement",
        template_type: "custom",
        category: "marketing",
        configuration: {
          layout: {
            type: "dashboard",
            sections: [
              { type: "kpi_grid", metrics: ["impressions", "clicks", "conversions", "ctr"] },
              { type: "chart", chart_type: "line", metrics: ["impressions", "clicks"] },
              { type: "pie_chart", metrics: ["conversions"], segment_by: ["channel"] }
            ]
          },
          metrics: ["impressions", "clicks", "conversions", "ctr"],
          chart_types: ["line", "pie"],
          date_range: { period: "last_7_days", granularity: "daily" },
          segment_by: ["channel"],
          filters: {}
        },
        is_system: true
      }
    ];
  }

  /**
   * Initialize system templates for an organization
   */
  async initializeSystemTemplates(orgId) {
    try {
      const existing = await base44.entities.ReportTemplate.filter({
        organization_id: orgId,
        is_system: true
      });

      if (existing.length === 0) {
        for (const template of this.systemTemplates) {
          await base44.entities.ReportTemplate.create({
            ...template,
            organization_id: orgId,
            is_public: true,
            usage_count: 0
          });
        }
        console.log(`[TemplateService] Initialized ${this.systemTemplates.length} system templates`);
      }
    } catch (error) {
      console.error('[TemplateService] Error initializing templates:', error);
    }
  }

  /**
   * Get all templates for organization
   */
  async getTemplates(orgId, category = null) {
    try {
      const filters = { organization_id: orgId };
      if (category) {
        filters.category = category;
      }

      const templates = await base44.entities.ReportTemplate.filter(filters, '-created_date');
      return templates;
    } catch (error) {
      console.error('[TemplateService] Error fetching templates:', error);
      return [];
    }
  }

  /**
   * Create template from current report configuration
   */
  async createFromReport(orgId, name, description, reportConfig, category = 'custom') {
    try {
      const template = await base44.entities.ReportTemplate.create({
        organization_id: orgId,
        name,
        description,
        template_type: 'custom',
        category,
        configuration: {
          layout: { type: 'single_report' },
          metrics: reportConfig.metrics || [],
          chart_types: [reportConfig.chart_type],
          date_range: reportConfig.date_range || {},
          segment_by: reportConfig.segment_by || [],
          filters: reportConfig.filters || {}
        },
        is_public: false,
        is_system: false,
        usage_count: 0
      });

      console.log('[TemplateService] Created template:', template.name);
      return template;
    } catch (error) {
      console.error('[TemplateService] Error creating template:', error);
      throw error;
    }
  }

  /**
   * Apply template to generate report configuration
   */
  applyTemplate(template) {
    const config = template.configuration;
    
    // Generate report config from template
    return {
      title: `${template.name} Report`,
      description: template.description,
      chart_type: config.chart_types?.[0] || 'line',
      metrics: config.metrics || [],
      segment_by: config.segment_by || [],
      date_range: config.date_range || { period: 'last_30_days', granularity: 'daily' },
      filters: config.filters || {},
      refresh_interval: config.refresh_interval
    };
  }

  /**
   * Update template usage count
   */
  async incrementUsage(templateId) {
    try {
      const templates = await base44.entities.ReportTemplate.list();
      const template = templates.find(t => t.id === templateId);
      
      if (template) {
        await base44.entities.ReportTemplate.update(templateId, {
          usage_count: (template.usage_count || 0) + 1
        });
      }
    } catch (error) {
      console.error('[TemplateService] Error updating usage:', error);
    }
  }

  /**
   * Share template with organization
   */
  async shareTemplate(templateId, isPublic) {
    try {
      await base44.entities.ReportTemplate.update(templateId, {
        is_public: isPublic
      });
      console.log(`[TemplateService] Template ${isPublic ? 'shared' : 'unshared'}`);
    } catch (error) {
      console.error('[TemplateService] Error sharing template:', error);
      throw error;
    }
  }

  /**
   * Export template as JSON
   */
  exportTemplate(template) {
    const exportData = {
      name: template.name,
      description: template.description,
      template_type: template.template_type,
      category: template.category,
      configuration: template.configuration,
      version: '1.0'
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import template from JSON
   */
  async importTemplate(orgId, jsonString) {
    try {
      const templateData = JSON.parse(jsonString);
      
      const template = await base44.entities.ReportTemplate.create({
        organization_id: orgId,
        name: templateData.name || 'Imported Template',
        description: templateData.description || '',
        template_type: templateData.template_type || 'custom',
        category: templateData.category || 'general',
        configuration: templateData.configuration,
        is_public: false,
        is_system: false,
        usage_count: 0
      });

      console.log('[TemplateService] Imported template:', template.name);
      return template;
    } catch (error) {
      console.error('[TemplateService] Error importing template:', error);
      throw new Error('Invalid template format');
    }
  }

  /**
   * Delete template
   */
  async deleteTemplate(templateId) {
    try {
      await base44.entities.ReportTemplate.delete(templateId);
      console.log('[TemplateService] Deleted template');
    } catch (error) {
      console.error('[TemplateService] Error deleting template:', error);
      throw error;
    }
  }
}

export const templateService = new TemplateService();