import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";

export default function ComponentConfigPanel({ component, onSave, onClose }) {
  const [config, setConfig] = useState(component?.config || {
    metric: '',
    filters: {},
    refreshInterval: 60000,
    thresholds: {}
  });

  const handleSave = () => {
    onSave(component.id, config);
    onClose();
  };

  if (!component) return null;

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Configure {component.name}</CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="metric">Data Source</Label>
          <Select
            value={config.metric || ''}
            onValueChange={(value) => setConfig({ ...config, metric: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select metric" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="revenue">Revenue</SelectItem>
              <SelectItem value="users">Users</SelectItem>
              <SelectItem value="conversions">Conversions</SelectItem>
              <SelectItem value="engagement">Engagement</SelectItem>
              <SelectItem value="sessions">Sessions</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Component Title</Label>
          <Input
            id="title"
            value={config.title || component.name}
            onChange={(e) => setConfig({ ...config, title: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="refresh">Refresh Interval (seconds)</Label>
          <Select
            value={String(config.refreshInterval / 1000)}
            onValueChange={(value) => setConfig({ ...config, refreshInterval: parseInt(value) * 1000 })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 seconds</SelectItem>
              <SelectItem value="60">1 minute</SelectItem>
              <SelectItem value="300">5 minutes</SelectItem>
              <SelectItem value="600">10 minutes</SelectItem>
              <SelectItem value="3600">1 hour</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {component.type === 'kpi' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="warning-threshold">Warning Threshold</Label>
              <Input
                id="warning-threshold"
                type="number"
                placeholder="e.g., 1000"
                value={config.thresholds?.warning || ''}
                onChange={(e) => setConfig({
                  ...config,
                  thresholds: { ...config.thresholds, warning: parseInt(e.target.value) }
                })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="critical-threshold">Critical Threshold</Label>
              <Input
                id="critical-threshold"
                type="number"
                placeholder="e.g., 500"
                value={config.thresholds?.critical || ''}
                onChange={(e) => setConfig({
                  ...config,
                  thresholds: { ...config.thresholds, critical: parseInt(e.target.value) }
                })}
              />
            </div>
          </>
        )}

        <div className="space-y-2">
          <Label>Filters</Label>
          <Select
            onValueChange={(value) => setConfig({
              ...config,
              filters: { ...config.filters, timeRange: value }
            })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 days</SelectItem>
              <SelectItem value="month">Last 30 days</SelectItem>
              <SelectItem value="quarter">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="pt-4 border-t">
          <Button onClick={handleSave} className="w-full">
            Save Configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}