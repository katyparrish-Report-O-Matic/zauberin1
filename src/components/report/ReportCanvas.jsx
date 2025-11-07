import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const COLORS = ['#6b7280', '#9ca3af', '#4b5563', '#d1d5db', '#374151'];

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

  // Get all data keys except 'date', 'name' for dynamic series
  const getDataKeys = () => {
    if (!data || data.length === 0) return [];
    const firstRow = data[0];
    return Object.keys(firstRow).filter(key => key !== 'date' && key !== 'name');
  };

  const dataKeys = getDataKeys();

  const renderVisualization = () => {
    switch (config.chart_type) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '12px' }} />
              <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
              <Tooltip />
              <Legend />
              {dataKeys.map((key, idx) => (
                <Line 
                  key={key}
                  type="monotone" 
                  dataKey={key} 
                  stroke={COLORS[idx % COLORS.length]} 
                  strokeWidth={2}
                  name={key}
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
              <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '12px' }} />
              <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
              <Tooltip />
              <Legend />
              {dataKeys.map((key, idx) => (
                <Bar 
                  key={key}
                  dataKey={key} 
                  fill={COLORS[idx % COLORS.length]}
                  name={key}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'pie':
        const total = data.reduce((sum, item) => sum + item.value, 0);
        return (
          <div>
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  label={({ name, value }) => `${name}: ${((value/total)*100).toFixed(1)}%`}
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value.toLocaleString()} (${((value/total)*100).toFixed(1)}%)`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 text-center text-sm text-gray-600">
              <strong>Total: {total.toLocaleString()}</strong>
            </div>
          </div>
        );

      case 'table':
        return (
          <div className="border rounded-lg max-h-96 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-gray-50">
                <TableRow>
                  {Object.keys(data[0] || {}).map(key => (
                    <TableHead key={key} className="font-semibold">{key}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, idx) => (
                  <TableRow key={idx} className="hover:bg-gray-50">
                    {Object.values(row).map((val, i) => (
                      <TableCell key={i}>
                        {typeof val === 'number' ? val.toLocaleString() : val}
                      </TableCell>
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
        {config.segment_by && config.segment_by.length > 0 && (
          <p className="text-xs text-gray-500 mt-2">
            Segmented by: {config.segment_by.join(', ')}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {renderVisualization()}
      </CardContent>
    </Card>
  );
}