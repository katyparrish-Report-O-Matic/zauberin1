import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { usePermissions } from "../components/auth/usePermissions";
import PermissionGuard from "../components/auth/PermissionGuard";

// Simple inline progress bar
const SimpleProgress = ({ value }) => (
  <div className="w-full bg-gray-200 rounded-full h-2">
    <div 
      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
      style={{ width: `${value}%` }}
    />
  </div>
);

export default function StormImport() {
  const { userOrg } = usePermissions();
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Parse "HH:MM:SS" to seconds
  const parseTimeToSeconds = (timeStr) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length === 3) {
      const hours = parseInt(parts[0], 10) || 0;
      const minutes = parseInt(parts[1], 10) || 0;
      const seconds = parseInt(parts[2], 10) || 0;
      return hours * 3600 + minutes * 60 + seconds;
    }
    return 0;
  };

  // Parse "Number ID" field into account_name and tracking_number_description
  const parseNumberId = (numberId) => {
    if (!numberId) return { account_name: '', tracking_number_description: '' };
    
    const lastParenIndex = numberId.lastIndexOf('(');
    if (lastParenIndex === -1) {
      return {
        account_name: numberId.trim(),
        tracking_number_description: ''
      };
    }

    const accountName = numberId.substring(0, lastParenIndex).trim();
    const description = numberId.substring(lastParenIndex + 1, numberId.lastIndexOf(')')).trim();
    
    return {
      account_name: accountName,
      tracking_number_description: description
    };
  };

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setResult(null);

    try {
          const reader = new FileReader();
           reader.onload = (event) => {
             try {
               const text = event.target.result;
               const lines = text.split('\n').filter(line => line.trim());

               // Detect delimiter (tab or comma)
               const firstLine = lines[0];
               const delimiter = firstLine.includes('\t') ? '\t' : ',';

               const rows = lines.map(line => {
                 return line.split(delimiter).map(cell => cell.trim().replace(/^"|"$/g, ''));
               });

               console.log('Parsed rows:', rows.length);
               console.log('First row (headers):', rows[0]);

           if (rows.length < 2) {
             setError('File must contain headers and at least one data row');
             return;
           }

           // Expected headers - normalize by trimming, removing brackets, and lowercasing for comparison
           const headers = rows[0];
           const normalizeHeader = (h) => String(h || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
           const normalizedHeaders = headers.map(normalizeHeader);

           const dateTimeIdx = normalizedHeaders.indexOf('date_time');
           const ctNumberIdx = normalizedHeaders.indexOf('ct_number');
           const callEndIdx = normalizedHeaders.indexOf('call_end');
           const callIdIdx = normalizedHeaders.indexOf('call_id');
           const durationIdx = normalizedHeaders.indexOf('call duration');
           const numberIdIdx = normalizedHeaders.indexOf('number id');

           console.log('Header indices:', { dateTimeIdx, ctNumberIdx, callEndIdx, callIdIdx, durationIdx, numberIdIdx });
           console.log('Normalized headers:', normalizedHeaders);

           if (dateTimeIdx === -1 || ctNumberIdx === -1 || callEndIdx === -1 || callIdIdx === -1 || durationIdx === -1 || numberIdIdx === -1) {
             setError('Missing required columns. Found: ' + headers.join(', '));
             return;
           }

           // Parse all data rows
           const parsed = rows.slice(1).map((row, idx) => {
             const { account_name, tracking_number_description } = parseNumberId(row[numberIdIdx]);

             return {
               start_time: row[dateTimeIdx],
               end_time: row[callEndIdx],
               tracking_number: String(row[ctNumberIdx] || ''),
               call_id: String(row[callIdIdx] || ''),
               duration: parseTimeToSeconds(row[durationIdx]),
               account_name,
               tracking_number_description,
               data_source: 'storm',
               sync_date: new Date().toISOString().split('T')[0]
             };
           }).filter(record => record.call_id); // Skip rows without call_id

           console.log('Parsed records:', parsed.length);
           setParsedData(parsed);
           setPreview(parsed.slice(0, 20)); // Show first 20

        } catch (parseError) {
          setError(`Failed to parse file: ${parseError.message}`);
        }
      };

      reader.readAsText(selectedFile);
    } catch (err) {
      setError(`Error reading file: ${err.message}`);
    }
  };

  const handleImport = async () => {
    if (!parsedData || parsedData.length === 0) return;
    if (!userOrg) {
      setError('Organization not found');
      return;
    }

    setImporting(true);
    setProgress(0);
    setError(null);

    try {
      console.log('[StormImport] Starting import with', parsedData.length, 'records');
      // Get or create Storm data source
      console.log('[StormImport] Looking for DataSource in org:', userOrg.id);
      let dataSource = await base44.entities.DataSource.filter({
        organization_id: userOrg.id,
        platform_type: 'custom_api',
        name: 'Storm Call Tracking'
      });

      console.log('[StormImport] Found datasources:', dataSource.length);
      if (!dataSource.length) {
        console.log('[StormImport] Creating new DataSource');
        dataSource = await base44.entities.DataSource.create({
          organization_id: userOrg.id,
          name: 'Storm Call Tracking',
          platform_type: 'custom_api',
          auth_type: 'api_key',
          enabled: true
        });
        dataSource = [dataSource];
        console.log('[StormImport] Created DataSource:', dataSource[0].id);
      }

      const dataSourceId = dataSource[0].id;
      console.log('[StormImport] Using DataSource:', dataSourceId);

      // Check for duplicate call_ids in batches (avoid URL length limits)
      console.log('[StormImport] Checking for duplicates among', parsedData.length, 'records');
      const callIds = parsedData.map(r => r.call_id);
      const existingIds = new Set();

      const batchCheckSize = 1000;
      for (let i = 0; i < callIds.length; i += batchCheckSize) {
        const batch = callIds.slice(i, i + batchCheckSize);
        const existing = await base44.entities.CallRecord.filter({
          organization_id: userOrg.id,
          call_id: { $in: batch }
        });
        existing.forEach(r => existingIds.add(r.call_id));
        console.log(`[StormImport] Checked batch ${Math.floor(i / batchCheckSize) + 1}, found ${existing.length} duplicates so far`);
      }

      console.log('[StormImport] Total existing records:', existingIds.size);
      const toImport = parsedData.filter(r => !existingIds.has(r.call_id));
      console.log('[StormImport] Will import', toImport.length, 'new records');

      if (toImport.length === 0) {
        setResult({
          total: parsedData.length,
          imported: 0,
          skipped: parsedData.length,
          message: 'All records already exist (duplicates skipped)'
        });
        setImporting(false);
        return;
      }

      // Import in batches of 100 to avoid 503 errors
      const batchSize = 100;
      let imported = 0;

      for (let i = 0; i < toImport.length; i += batchSize) {
        const batch = toImport.slice(i, i + batchSize);

        const records = batch.map(record => ({
          ...record,
          organization_id: userOrg.id,
          data_source_id: dataSourceId,
          account_id: record.account_name || 'unknown' // Required field
        }));

        try {
          await base44.entities.CallRecord.bulkCreate(records);
          imported += batch.length;
          setProgress(Math.round((imported / toImport.length) * 100));
          console.log(`[StormImport] Batch ${Math.floor(i / batchSize) + 1} complete - ${imported}/${toImport.length} records imported`);
        } catch (batchErr) {
          console.error(`[StormImport] Batch ${Math.floor(i / batchSize) + 1} failed:`, batchErr.message);
          throw batchErr;
        }
      }

      // Create SyncJob record for tracking
      await base44.entities.SyncJob.create({
        organization_id: userOrg.id,
        data_source_id: dataSourceId,
        sync_type: 'manual',
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        records_synced: imported,
        records_created: imported,
        records_updated: 0,
        records_failed: 0,
        progress_percentage: 100
      });

      setResult({
        total: parsedData.length,
        imported,
        skipped: parsedData.length - imported,
        message: `Successfully imported ${imported} call records`
      });

    } catch (err) {
      console.error('[StormImport] Import error:', err);
      setError(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
    };

  return (
    <PermissionGuard requiredLevel="editor">
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Storm Call Data Import</h1>
            <p className="text-gray-600 mt-2">Upload Excel or CSV files containing Storm call tracking data</p>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" />
                Upload File
              </CardTitle>
              <CardDescription>
                Select an Excel (.xlsx) or CSV file with columns: date_time, ct_number, call_end, call_id, Call Duration, Number ID
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload">
                    <Button variant="outline" className="cursor-pointer" asChild>
                      <span>
                        <Upload className="w-4 h-4 mr-2" />
                        Choose File
                      </span>
                    </Button>
                  </label>
                  {file && (
                    <span className="text-sm text-gray-600">{file.name}</span>
                  )}
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {result && (
                  <Alert>
                    <CheckCircle className="w-4 h-4" />
                    <AlertDescription>
                      <div className="font-semibold">{result.message}</div>
                      <div className="text-sm mt-1">
                        Total: {result.total} | Imported: {result.imported} | Skipped: {result.skipped}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>

          {preview.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Preview - First 20 Records</CardTitle>
                <CardDescription>
                  Review the parsed data before importing ({parsedData.length} total records)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Start Time</TableHead>
                        <TableHead>Tracking Number</TableHead>
                        <TableHead>Call ID</TableHead>
                        <TableHead>Duration (sec)</TableHead>
                        <TableHead>Account Name</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.map((record, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-xs">{record.start_time}</TableCell>
                          <TableCell>{record.tracking_number}</TableCell>
                          <TableCell>{record.call_id}</TableCell>
                          <TableCell>{record.duration}</TableCell>
                          <TableCell>{record.account_name}</TableCell>
                          <TableCell className="text-xs text-gray-600">{record.tracking_number_description}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="mt-6 space-y-4">
                  {importing && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-gray-600">
                        <span>Importing records...</span>
                        <span>{progress}%</span>
                      </div>
                      <SimpleProgress value={progress} />
                    </div>
                  )}

                  <Button 
                    onClick={handleImport} 
                    disabled={importing}
                    className="w-full"
                  >
                    {importing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Import {parsedData.length} Records
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PermissionGuard>
  );
}