import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { templateService } from "./TemplateService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layout, TrendingUp, BarChart3, Activity, Star, Download } from "lucide-react";
import { cn } from "@/lib/utils";

const templateIcons = {
  executive_summary: Layout,
  detailed_analysis: TrendingUp,
  comparison_view: BarChart3,
  realtime_monitor: Activity,
  custom: Star
};

const categoryColors = {
  sales: "bg-blue-100 text-blue-800",
  marketing: "bg-purple-100 text-purple-800",
  operations: "bg-green-100 text-green-800",
  finance: "bg-yellow-100 text-yellow-800",
  general: "bg-gray-100 text-gray-800"
};

export default function TemplateLibrary({ orgId, onSelectTemplate, onClose }) {
  const [selectedCategory, setSelectedCategory] = useState('all');

  const { data: templates, isLoading } = useQuery({
    queryKey: ['reportTemplates', orgId],
    queryFn: async () => {
      await templateService.initializeSystemTemplates(orgId);
      return await templateService.getTemplates(orgId);
    },
    enabled: !!orgId,
    initialData: []
  });

  const categories = ['all', 'general', 'sales', 'marketing', 'operations', 'finance'];

  const filteredTemplates = selectedCategory === 'all'
    ? templates
    : templates.filter(t => t.category === selectedCategory);

  const handleSelectTemplate = async (template) => {
    await templateService.incrementUsage(template.id);
    const config = templateService.applyTemplate(template);
    onSelectTemplate(config, template);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-gray-500">Loading templates...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Report Templates</h2>
        <p className="text-gray-600 mt-1">
          Start with a pre-built template or create your own
        </p>
      </div>

      {/* Category Filter */}
      <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
        <TabsList>
          {categories.map(cat => (
            <TabsTrigger key={cat} value={cat} className="capitalize">
              {cat}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Templates Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map(template => {
          const Icon = templateIcons[template.template_type] || Star;
          
          return (
            <Card
              key={template.id}
              className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02]"
              onClick={() => handleSelectTemplate(template)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <Icon className="w-5 h-5 text-gray-600" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        {template.description}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={cn("text-xs", categoryColors[template.category])}>
                    {template.category}
                  </Badge>
                  {template.is_system && (
                    <Badge variant="outline" className="text-xs">
                      System
                    </Badge>
                  )}
                  {template.is_public && (
                    <Badge variant="outline" className="text-xs">
                      Shared
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{template.configuration.metrics?.length || 0} metrics</span>
                  {template.usage_count > 0 && (
                    <span>{template.usage_count} uses</span>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectTemplate(template);
                    }}
                  >
                    Use Template
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredTemplates.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Layout className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600">No templates found in this category</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}