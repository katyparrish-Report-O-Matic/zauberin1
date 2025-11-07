import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  TrendingUp, BarChart3, PieChart, Table, Activity, 
  Grid3x3, Gauge
} from "lucide-react";

const COMPONENT_TYPES = [
  {
    id: 'kpi',
    name: 'KPI Card',
    icon: Gauge,
    description: 'Single metric display',
    defaultSize: { w: 3, h: 2 }
  },
  {
    id: 'line',
    name: 'Line Chart',
    icon: TrendingUp,
    description: 'Trend over time',
    defaultSize: { w: 6, h: 4 }
  },
  {
    id: 'bar',
    name: 'Bar Chart',
    icon: BarChart3,
    description: 'Compare categories',
    defaultSize: { w: 6, h: 4 }
  },
  {
    id: 'pie',
    name: 'Pie Chart',
    icon: PieChart,
    description: 'Show proportions',
    defaultSize: { w: 4, h: 4 }
  },
  {
    id: 'table',
    name: 'Data Table',
    icon: Table,
    description: 'Detailed data view',
    defaultSize: { w: 12, h: 5 }
  },
  {
    id: 'sparkline',
    name: 'Sparkline',
    icon: Activity,
    description: 'Compact trend',
    defaultSize: { w: 3, h: 2 }
  },
  {
    id: 'heatmap',
    name: 'Heatmap',
    icon: Grid3x3,
    description: 'Pattern visualization',
    defaultSize: { w: 8, h: 5 }
  }
];

export default function ComponentLibrary({ onAddComponent }) {
  const handleDragStart = (e, componentType) => {
    e.dataTransfer.setData('componentType', JSON.stringify(componentType));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Component Library</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2">
          {COMPONENT_TYPES.map(component => {
            const Icon = component.icon;
            return (
              <div
                key={component.id}
                draggable
                onDragStart={(e) => handleDragStart(e, component)}
                onClick={() => onAddComponent(component)}
                className="p-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 cursor-move transition-all"
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-5 h-5 text-gray-600" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900">{component.name}</p>
                    <p className="text-xs text-gray-500 truncate">{component.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}