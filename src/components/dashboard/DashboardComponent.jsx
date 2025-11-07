import React from 'react';
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown } from "lucide-react";

const COLORS = ['#6b7280', '#9ca3af', '#4b5563', '#d1d5db', '#374151'];

// Generate mock data based on component type
const generateMockData = (type) => {
  switch (type) {
    case 'kpi':
      return { value: 12487, change: 12.5, trend: 'up' };
    case 'line':
    case 'bar':
    case 'sparkline':
      return Array.from({ length: 10 }, (_, i) => ({
        date: `Day ${i + 1}`,
        value: Math.floor(Math.random() * 1000) + 500
      }));
    case 'pie':
      return [
        { name: 'Category A', value: 400 },
        { name: 'Category B', value: 300 },
        { name: 'Category C', value: 200 },
        { name: 'Category D', value: 100 }
      ];
    case 'table':
      return Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        name: `Item ${i + 1}`,
        value: Math.floor(Math.random() * 1000),
        status: i % 2 === 0 ? 'Active' : 'Pending'
      }));
    case 'heatmap':
      return Array.from({ length: 7 }, (_, day) =>
        Array.from({ length: 24 }, (_, hour) => ({
          day,
          hour,
          value: Math.floor(Math.random() * 100)
        }))
      ).flat();
    default:
      return [];
  }
};

export default function DashboardComponent({ component }) {
  const data = generateMockData(component.type);

  const renderComponent = () => {
    switch (component.type) {
      case 'kpi':
        return (
          <div className="h-full flex flex-col items-center justify-center p-4">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-2">{component.config.metric || 'Select Metric'}</p>
              <p className="text-4xl font-bold text-gray-900">{data.value.toLocaleString()}</p>
              <div className={`flex items-center justify-center gap-1 mt-2 ${data.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                {data.trend === 'up' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span className="text-sm font-medium">{data.change}%</span>
              </div>
            </div>
          </div>
        );

      case 'line':
        return (
          <div className="h-full p-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '10px' }} />
                <YAxis stroke="#6b7280" style={{ fontSize: '10px' }} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#6b7280" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );

      case 'bar':
        return (
          <div className="h-full p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '10px' }} />
                <YAxis stroke="#6b7280" style={{ fontSize: '10px' }} />
                <Tooltip />
                <Bar dataKey="value" fill="#6b7280" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );

      case 'pie':
        return (
          <div className="h-full p-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={60}
                  label={(entry) => entry.name}
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        );

      case 'table':
        return (
          <div className="h-full overflow-auto p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.id}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.value.toLocaleString()}</TableCell>
                    <TableCell>{row.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        );

      case 'sparkline':
        return (
          <div className="h-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <Line type="monotone" dataKey="value" stroke="#6b7280" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );

      case 'heatmap':
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        return (
          <div className="h-full p-4 overflow-auto">
            <div className="grid grid-cols-25 gap-1">
              {data.map((cell, idx) => (
                <div
                  key={idx}
                  className="w-4 h-4 rounded-sm"
                  style={{
                    backgroundColor: `rgba(107, 114, 128, ${cell.value / 100})`
                  }}
                  title={`${days[cell.day]} ${cell.hour}:00 - ${cell.value}`}
                />
              ))}
            </div>
          </div>
        );

      default:
        return (
          <div className="h-full flex items-center justify-center p-4">
            <p className="text-gray-500">Unknown component type</p>
          </div>
        );
    }
  };

  return (
    <>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{component.name}</CardTitle>
      </CardHeader>
      <CardContent className="h-[calc(100%-3rem)]">
        {renderComponent()}
      </CardContent>
    </>
  );
}