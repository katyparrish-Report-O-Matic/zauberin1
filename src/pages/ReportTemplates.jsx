import React from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LayoutTemplate, Eye, Users, TrendingUp, BarChart3, Copy } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { usePermissions } from "../components/auth/usePermissions";

export default function ReportTemplates() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { currentUser } = usePermissions();

  // Fetch public templates
  const { data: publicTemplates } = useQuery({
    queryKey: ['publicTemplates'],
    queryFn: async () => {
      const templates = await base44.entities.ReportTemplate.filter({
        is_public: true
      }, '-usage_count');
      return templates;
    },
    initialData: []
  });

  // Fetch user's templates
  const { data: myTemplates } = useQuery({
    queryKey: ['myTemplates', currentUser?.organization_id],
    queryFn: async () => {
      if (!currentUser?.organization_id) return [];
      const templates = await base44.entities.ReportTemplate.filter({
        organization_id: currentUser.organization_id
      }, '-created_date');
      return templates;
    },
    enabled: !!currentUser?.organization_id,
    initialData: []
  });

  // Use template mutation
  const useTemplateMutation = useMutation({
    mutationFn: async (template) => {
      // Increment usage count
      await base44.entities.ReportTemplate.update(template.id, {
        usage_count: (template.usage_count || 0) + 1
      });

      // Create dashboard from template
      return await base44.entities.Dashboard.create({
        name: `${template.name} - ${new Date().toLocaleDateString()}`,
        description: template.description,
        organization_id: currentUser.organization_id,
        template_id: template.id,
        layout: template.layout_config,
        components: template.metric_configs || [],
        global_settings: {
          refresh_interval: template.layout_config?.refresh_interval || 300
        }
      });
    },
    onSuccess: (dashboard) => {
      toast.success('Dashboard created from template');
      navigate(createPageUrl('DashboardBuilder'));
    },
    onError: () => {
      toast.error('Failed to use template');
    }
  });

  const templates = [
    {
      name: 'Executive Summary',
      description: 'High-level overview with key metrics and trends',
      type: 'executive_summary',
      icon: Eye,
      color: 'bg-blue-600',
      metrics: ['Revenue', 'Users', 'Conversions', 'Growth Rate'],
      usageCount: 245
    },
    {
      name: 'Detailed Analysis',
      description: 'In-depth breakdown with multiple dimensions',
      type: 'detailed_analysis',
      icon: BarChart3,
      color: 'bg-teal-600',
      metrics: ['Revenue by Region', 'Sales by Channel', 'User Segments', 'Cohort Analysis'],
      usageCount: 189
    },
    {
      name: 'Comparison View',
      description: 'Side-by-side comparison of metrics across segments',
      type: 'comparison_view',
      icon: TrendingUp,
      color: 'bg-purple-600',
      metrics: ['Regional Comparison', 'Channel Performance', 'Branch Rankings'],
      usageCount: 156
    },
    {
      name: 'Real-time Monitor',
      description: 'Live dashboard with auto-refresh for monitoring',
      type: 'realtime_monitor',
      icon: Activity,
      color: 'bg-green-600',
      metrics: ['Live Transactions', 'Active Users', 'System Health', 'Error Rate'],
      usageCount: 134
    }
  ];

  const handleUseTemplate = async (template) => {
    // Create template entity if it doesn't exist
    const existingTemplates = await base44.entities.ReportTemplate.filter({
      name: template.name,
      is_public: true
    });

    let templateEntity;

    if (existingTemplates.length > 0) {
      templateEntity = existingTemplates[0];
    } else {
      templateEntity = await base44.entities.ReportTemplate.create({
        name: template.name,
        description: template.description,
        template_type: template.type,
        is_public: true,
        layout_config: {
          grid_layout: [],
          refresh_interval: template.type === 'realtime_monitor' ? 30 : 300
        },
        metric_configs: template.metrics.map(m => ({
          metric_name: m,
          chart_type: 'line'
        })),
        usage_count: template.usageCount
      });
    }

    useTemplateMutation.mutate(templateEntity);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <LayoutTemplate className="w-8 h-8" />
              Report Templates
            </h1>
            <p className="text-gray-600 mt-1">
              Pre-built dashboard templates to get started quickly
            </p>
          </div>

          {/* Popular Templates */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Popular Templates</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {templates.map((template) => {
                const Icon = template.icon;
                return (
                  <Card key={template.type} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className={`h-12 w-12 ${template.color} rounded-lg flex items-center justify-center`}>
                            <Icon className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <CardTitle>{template.name}</CardTitle>
                            <CardDescription className="mt-1">
                              {template.description}
                            </CardDescription>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">Includes:</p>
                        <div className="flex flex-wrap gap-2">
                          {template.metrics.map((metric, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {metric}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Users className="w-4 h-4" />
                          <span>{template.usageCount} uses</span>
                        </div>
                        <Button 
                          onClick={() => handleUseTemplate(template)}
                          className="bg-teal-600 hover:bg-teal-700 gap-2"
                          disabled={useTemplateMutation.isPending}
                        >
                          <Copy className="w-4 h-4" />
                          Use Template
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* My Templates */}
          {myTemplates.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">My Templates</h2>
              <div className="grid md:grid-cols-3 gap-4">
                {myTemplates.map((template) => (
                  <Card key={template.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <CardDescription className="text-xs">
                        {template.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button 
                        size="sm"
                        variant="outline"
                        onClick={() => useTemplateMutation.mutate(template)}
                        className="w-full"
                      >
                        Use Template
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </PermissionGuard>
  );
}