import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Code, Key, Copy } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function ApiDocumentation() {
  const [selectedLanguage, setSelectedLanguage] = useState('curl');

  const baseUrl = 'https://api.metricflow.app/v1';

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const endpoints = [
    {
      method: 'GET',
      path: '/reports',
      description: 'List all reports',
      permissions: ['reports:read'],
      params: [
        { name: 'limit', type: 'number', required: false, description: 'Max results (default: 50)' },
        { name: 'offset', type: 'number', required: false, description: 'Pagination offset' },
        { name: 'organization_id', type: 'string', required: false, description: 'Filter by organization' }
      ],
      response: {
        reports: [
          {
            id: 'rep_123',
            title: 'Q4 Sales Report',
            organization_id: 'org_456',
            created_date: '2025-01-07T10:00:00Z',
            status: 'generated'
          }
        ],
        total: 1,
        limit: 50,
        offset: 0
      }
    },
    {
      method: 'GET',
      path: '/reports/{id}',
      description: 'Get a specific report',
      permissions: ['reports:read'],
      params: [],
      response: {
        id: 'rep_123',
        title: 'Q4 Sales Report',
        description: 'Revenue breakdown by region',
        configuration: {
          metrics: ['revenue'],
          chart_type: 'bar',
          segment_by: ['region']
        },
        status: 'generated',
        created_date: '2025-01-07T10:00:00Z'
      }
    },
    {
      method: 'GET',
      path: '/reports/{id}/data',
      description: 'Get report data',
      permissions: ['data:read'],
      params: [
        { name: 'format', type: 'string', required: false, description: 'Response format: json (default) or csv' }
      ],
      response: {
        data: [
          { date: '2025-01-01', region: 'North', revenue: 15000 },
          { date: '2025-01-01', region: 'South', revenue: 12000 }
        ],
        metadata: {
          total_records: 2,
          generated_at: '2025-01-07T10:00:00Z'
        }
      }
    },
    {
      method: 'POST',
      path: '/reports',
      description: 'Create a new report',
      permissions: ['reports:write'],
      params: [],
      body: {
        title: 'Monthly Revenue',
        description: 'Show revenue by branch',
        organization_id: 'org_456',
        configuration: {
          metrics: ['revenue'],
          chart_type: 'bar',
          segment_by: ['branch'],
          date_range: { period: 'last_30_days' }
        }
      },
      response: {
        id: 'rep_789',
        title: 'Monthly Revenue',
        status: 'generated',
        created_date: '2025-01-07T10:05:00Z'
      }
    },
    {
      method: 'PUT',
      path: '/reports/{id}',
      description: 'Update a report',
      permissions: ['reports:write'],
      params: [],
      body: {
        title: 'Updated Title',
        description: 'Updated description'
      },
      response: {
        id: 'rep_123',
        title: 'Updated Title',
        updated_date: '2025-01-07T10:10:00Z'
      }
    },
    {
      method: 'DELETE',
      path: '/reports/{id}',
      description: 'Delete a report',
      permissions: ['reports:delete'],
      params: [],
      response: {
        success: true,
        message: 'Report deleted'
      }
    },
    {
      method: 'GET',
      path: '/data/metrics',
      description: 'Query transformed metrics',
      permissions: ['data:read'],
      params: [
        { name: 'metric_name', type: 'string', required: true, description: 'Metric to query (e.g., revenue)' },
        { name: 'start_date', type: 'string', required: true, description: 'ISO 8601 date' },
        { name: 'end_date', type: 'string', required: true, description: 'ISO 8601 date' },
        { name: 'time_period', type: 'string', required: false, description: 'hourly, daily, weekly, monthly' },
        { name: 'segment_by', type: 'string', required: false, description: 'Dimension to segment by' }
      ],
      response: {
        data: [
          {
            metric_name: 'revenue',
            period_start: '2025-01-01T00:00:00Z',
            aggregated_value: 25000,
            segment: { branch: 'North' }
          }
        ],
        total: 1
      }
    }
  ];

  const getCodeExample = (endpoint, lang) => {
    const examples = {
      curl: {
        GET: `curl -X GET "${baseUrl}${endpoint.path}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`,
        POST: `curl -X POST "${baseUrl}${endpoint.path}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(endpoint.body, null, 2)}'`,
        PUT: `curl -X PUT "${baseUrl}${endpoint.path}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(endpoint.body, null, 2)}'`,
        DELETE: `curl -X DELETE "${baseUrl}${endpoint.path}" \\
  -H "Authorization: Bearer YOUR_API_KEY"`
      },
      javascript: {
        GET: `const response = await fetch('${baseUrl}${endpoint.path}', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  }
});
const data = await response.json();`,
        POST: `const response = await fetch('${baseUrl}${endpoint.path}', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(${JSON.stringify(endpoint.body, null, 2)})
});
const data = await response.json();`,
        PUT: `const response = await fetch('${baseUrl}${endpoint.path}', {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(${JSON.stringify(endpoint.body, null, 2)})
});
const data = await response.json();`,
        DELETE: `const response = await fetch('${baseUrl}${endpoint.path}', {
  method: 'DELETE',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});
const data = await response.json();`
      },
      python: {
        GET: `import requests

response = requests.get(
    '${baseUrl}${endpoint.path}',
    headers={
        'Authorization': 'Bearer YOUR_API_KEY',
        'Content-Type': 'application/json'
    }
)
data = response.json()`,
        POST: `import requests

response = requests.post(
    '${baseUrl}${endpoint.path}',
    headers={
        'Authorization': 'Bearer YOUR_API_KEY',
        'Content-Type': 'application/json'
    },
    json=${JSON.stringify(endpoint.body)}
)
data = response.json()`,
        PUT: `import requests

response = requests.put(
    '${baseUrl}${endpoint.path}',
    headers={
        'Authorization': 'Bearer YOUR_API_KEY',
        'Content-Type': 'application/json'
    },
    json=${JSON.stringify(endpoint.body)}
)
data = response.json()`,
        DELETE: `import requests

response = requests.delete(
    '${baseUrl}${endpoint.path}',
    headers={'Authorization': 'Bearer YOUR_API_KEY'}
)
data = response.json()`
      }
    };

    return examples[lang]?.[endpoint.method] || '';
  };

  const getMethodColor = (method) => {
    const colors = {
      GET: 'bg-blue-600',
      POST: 'bg-green-600',
      PUT: 'bg-yellow-600',
      DELETE: 'bg-red-600'
    };
    return colors[method] || 'bg-gray-600';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <BookOpen className="w-8 h-8" />
                API Documentation
              </h1>
              <p className="text-gray-600 mt-1">Complete API reference for MetricFlow</p>
            </div>
            <Link to={createPageUrl("ApiKeysManager")}>
              <Button className="gap-2">
                <Key className="w-4 h-4" />
                Manage API Keys
              </Button>
            </Link>
          </div>

          {/* Quick Start */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Start</CardTitle>
              <CardDescription>Get started with the MetricFlow API in minutes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">1. Get your API Key</h4>
                <p className="text-sm text-gray-600">
                  Create an API key from the <Link to={createPageUrl("ApiKeysManager")} className="underline">API Keys page</Link>
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">2. Make your first request</h4>
                <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm relative group">
                  <pre className="overflow-x-auto">
{`curl -X GET "${baseUrl}/reports" \\
  -H "Authorization: Bearer YOUR_API_KEY"`}
                  </pre>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"
                    onClick={() => copyToClipboard(`curl -X GET "${baseUrl}/reports" -H "Authorization: Bearer YOUR_API_KEY"`)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">3. Handle the response</h4>
                <p className="text-sm text-gray-600">
                  All responses are in JSON format. Check the status code and handle errors appropriately.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Authentication */}
          <Card>
            <CardHeader>
              <CardTitle>Authentication</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                MetricFlow uses API keys for authentication. Include your API key in the Authorization header:
              </p>
              <div className="bg-gray-900 text-gray-100 p-3 rounded font-mono text-sm">
                Authorization: Bearer YOUR_API_KEY
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-yellow-800 text-sm">
                  <strong>Security:</strong> Never expose your API key in client-side code or public repositories.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Rate Limiting */}
          <Card>
            <CardHeader>
              <CardTitle>Rate Limiting</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>Each API key has a rate limit (default: 1000 requests/hour). Response headers include:</p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li><code className="bg-gray-100 px-1 rounded">X-RateLimit-Limit</code>: Your rate limit</li>
                <li><code className="bg-gray-100 px-1 rounded">X-RateLimit-Remaining</code>: Requests remaining</li>
                <li><code className="bg-gray-100 px-1 rounded">X-RateLimit-Reset</code>: Reset time (Unix timestamp)</li>
              </ul>
              <p className="text-gray-600">When limit exceeded, you'll receive a <code className="bg-gray-100 px-1 rounded">429 Too Many Requests</code> response.</p>
            </CardContent>
          </Card>

          {/* Endpoints */}
          <Card>
            <CardHeader>
              <CardTitle>API Endpoints</CardTitle>
              <CardDescription>Base URL: {baseUrl}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {endpoints.map((endpoint, idx) => (
                <div key={idx} className="border-t pt-6 first:border-t-0 first:pt-0">
                  <div className="flex items-start gap-3 mb-4">
                    <Badge className={getMethodColor(endpoint.method)}>
                      {endpoint.method}
                    </Badge>
                    <div className="flex-1">
                      <h3 className="font-mono text-lg">{endpoint.path}</h3>
                      <p className="text-sm text-gray-600 mt-1">{endpoint.description}</p>
                      <div className="flex gap-2 mt-2">
                        {endpoint.permissions.map(perm => (
                          <Badge key={perm} variant="outline" className="text-xs">
                            {perm}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  {endpoint.params.length > 0 && (
                    <div className="mb-4">
                      <h4 className="font-semibold text-sm mb-2">Parameters</h4>
                      <div className="space-y-2">
                        {endpoint.params.map((param, pidx) => (
                          <div key={pidx} className="flex items-start gap-2 text-sm">
                            <code className="bg-gray-100 px-2 py-1 rounded">{param.name}</code>
                            <span className="text-gray-600">{param.type}</span>
                            {param.required && <Badge variant="outline" className="text-xs">required</Badge>}
                            <span className="text-gray-600">- {param.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Tabs value={selectedLanguage} onValueChange={setSelectedLanguage} className="mb-4">
                    <TabsList>
                      <TabsTrigger value="curl">cURL</TabsTrigger>
                      <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                      <TabsTrigger value="python">Python</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  <div className="bg-gray-900 text-gray-100 p-4 rounded-lg relative group">
                    <pre className="overflow-x-auto text-sm">
                      <code>{getCodeExample(endpoint, selectedLanguage)}</code>
                    </pre>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"
                      onClick={() => copyToClipboard(getCodeExample(endpoint, selectedLanguage))}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="mt-4">
                    <h4 className="font-semibold text-sm mb-2">Response</h4>
                    <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
                      <pre className="text-sm">
                        <code>{JSON.stringify(endpoint.response, null, 2)}</code>
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Error Codes */}
          <Card>
            <CardHeader>
              <CardTitle>Error Codes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex gap-3">
                  <Badge className="bg-green-600">200</Badge>
                  <span>Success</span>
                </div>
                <div className="flex gap-3">
                  <Badge className="bg-yellow-600">400</Badge>
                  <span>Bad Request - Invalid parameters</span>
                </div>
                <div className="flex gap-3">
                  <Badge className="bg-yellow-600">401</Badge>
                  <span>Unauthorized - Invalid or missing API key</span>
                </div>
                <div className="flex gap-3">
                  <Badge className="bg-yellow-600">403</Badge>
                  <span>Forbidden - Insufficient permissions</span>
                </div>
                <div className="flex gap-3">
                  <Badge className="bg-yellow-600">404</Badge>
                  <span>Not Found - Resource doesn't exist</span>
                </div>
                <div className="flex gap-3">
                  <Badge className="bg-red-600">429</Badge>
                  <span>Too Many Requests - Rate limit exceeded</span>
                </div>
                <div className="flex gap-3">
                  <Badge className="bg-red-600">500</Badge>
                  <span>Internal Server Error</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}