import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Download, Loader2, Database } from 'lucide-react';

const ENTITIES = [
  'CallRecord',
  'TrackingNumber',
  'AccountMapping',
  'SalesforceAccount',
  'AccountHierarchy',
  'DataSource',
  'SyncJob',
  'Organization',
  'Dashboard',
  'ReportRequest',
  'ReportTemplate',
  'TransformedMetric',
  'DataQualityLog',
  'ScheduledJob',
  'JobExecution',
  'ApiSettings',
  'WebhookEndpoint',
  'WebhookActivity',
  'RateLimitLog',
  'DashboardVersion',
  'AuditLog',
  'AlertRule',
  'Backup',
  'ApiKey',
  'ApiUsage',
  'SlackIntegration',
  'EmailSchedule',
  'DataWarehouseConnection',
  'CacheEntry',
  'MetricDefinition',
  'Conversion',
  'Goal',
  'Annotation',
  'FormDefinition',
  'FormSubmission',
  'ReportVersion',
  'ReportBook',
  'ServiceAgreement',
  'AccountMapping'
];

// Deduplicate
const UNIQUE_ENTITIES = [...new Set(ENTITIES)];

export default function DataExport() {
  const [selected, setSelected] = useState(new Set(UNIQUE_ENTITIES));
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState('');

  const allSelected = selected.size === UNIQUE_ENTITIES.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(UNIQUE_ENTITIES));
    }
  };

  const toggleEntity = (name) => {
    const next = new Set(selected);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setSelected(next);
  };

  const handleExport = async () => {
    setExporting(true);
    const exportData = {};
    const entities = Array.from(selected);

    for (let i = 0; i < entities.length; i++) {
      const name = entities[i];
      setProgress(`Fetching ${name} (${i + 1}/${entities.length})...`);
      try {
        const records = await base44.entities[name].list();
        exportData[name] = records;
      } catch (err) {
        console.error(`Failed to fetch ${name}:`, err);
        exportData[name] = { error: err.message };
      }
    }

    setProgress('Generating file...');
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zauberin-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExporting(false);
    setProgress('');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Database className="w-8 h-8" />
            Data Export
          </h1>
          <p className="text-gray-600 mt-1">Export all app data as JSON</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span>Select Entities</span>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  id="select-all"
                />
                <Label htmlFor="select-all" className="text-sm font-normal cursor-pointer">
                  Select All
                </Label>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {UNIQUE_ENTITIES.map(name => (
                <div key={name} className="flex items-center gap-2">
                  <Checkbox
                    checked={selected.has(name)}
                    onCheckedChange={() => toggleEntity(name)}
                    id={name}
                  />
                  <Label htmlFor={name} className="text-sm font-normal cursor-pointer">
                    {name}
                  </Label>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center gap-4">
              <Button
                onClick={handleExport}
                disabled={exporting || selected.size === 0}
                className="gap-2"
              >
                {exporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {exporting ? 'Exporting...' : `Export ${selected.size} Entities`}
              </Button>
              {progress && (
                <span className="text-sm text-gray-500">{progress}</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}