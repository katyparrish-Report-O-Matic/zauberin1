import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const COLORS = ['#6b7280', '#9ca3af', '#d1d5db', '#4b5563'];

export default function ReportCanvas({ config, data }) {
  if (!config || !data) {
    return (
      <Card className="border-2 border-dashed border-gray-300">
        <CardContent className="p-12 text-center">
          <div className="text-gray-400 mb-2">
            <svg className="w-16 h-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-lg font-medium text-gray-600">No report generated yet</p>
            <p className="text-sm text-gray-500 mt-1">Describe what you want to visualize in the panel</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderVisualization = () => {
    switch (config.chart_type) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip />
              {config.metrics?.map((metric, idx) => (
                <Line 
                  key={metric}
                  type="monotone" 
                  dataKey={metric} 
                  stroke={COLORS[idx % COLORS.length]} 
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip />
              {config.metrics?.map((metric, idx) => (
                <Bar 
                  key={metric}
                  dataKey={metric} 
                  fill={COLORS[idx % COLORS.length]} 
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={120}
                label
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'table':
        return (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  {Object.keys(data[0] || {}).map(key => (
                    <TableHead key={key}>{key}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, idx) => (
                  <TableRow key={idx}>
                    {Object.values(row).map((val, i) => (
                      <TableCell key={i}>{val}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        );

      default:
        return <div className="text-gray-500 text-center py-8">Unknown chart type</div>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{config.title || 'Custom Report'}</CardTitle>
        {config.description && (
          <p className="text-sm text-gray-600 mt-1">{config.description}</p>
        )}
      </CardHeader>
      <CardContent>
        {renderVisualization()}
      </CardContent>
    </Card>
  );
}