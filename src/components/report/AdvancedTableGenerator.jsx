import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUpDown, ArrowUp, ArrowDown, Download, Filter } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

/**
 * Advanced Table Generator - Looker-style reporting
 * Supports: Multi-level grouping, aggregations, sorting, filtering, subtotals
 */
export default function AdvancedTableGenerator({ 
  config, 
  data,
  onExport 
}) {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [filterText, setFilterText] = useState('');

  if (!config || !data) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="text-gray-500">No table configuration provided</p>
        </CardContent>
      </Card>
    );
  }

  // Extract configuration
  const {
    title = "Report Table",
    description,
    groupBy = [],
    columns = [],
    aggregations = {},
    showSubtotals = true,
    showGrandTotal = true
  } = config;

  // Process data with grouping and aggregations
  const processedData = useMemo(() => {
    if (groupBy.length === 0) {
      // No grouping - return raw data with column calculations
      return data.map(row => {
        const processedRow = { ...row };
        
        // Apply any calculated columns
        Object.keys(aggregations).forEach(colKey => {
          if (aggregations[colKey].type === 'calculated') {
            processedRow[colKey] = aggregations[colKey].formula(row);
          }
        });
        
        return processedRow;
      });
    }

    // Group data by specified dimensions
    const grouped = {};
    
    data.forEach(row => {
      const groupKey = groupBy.map(dim => row[dim] || 'Unknown').join('|');
      
      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          groupValues: {},
          rows: [],
          subtotals: {}
        };
        
        // Store group dimension values
        groupBy.forEach(dim => {
          grouped[groupKey].groupValues[dim] = row[dim];
        });
        
        // Initialize subtotals
        Object.keys(aggregations).forEach(colKey => {
          grouped[groupKey].subtotals[colKey] = 0;
        });
      }
      
      grouped[groupKey].rows.push(row);
      
      // Calculate subtotals
      Object.keys(aggregations).forEach(colKey => {
        const agg = aggregations[colKey];
        if (agg.type === 'sum') {
          grouped[groupKey].subtotals[colKey] += (row[colKey] || 0);
        } else if (agg.type === 'count') {
          grouped[groupKey].subtotals[colKey] += 1;
        } else if (agg.type === 'avg') {
          grouped[groupKey].subtotals[colKey] += (row[colKey] || 0);
        }
      });
    });

    // Calculate averages
    Object.keys(grouped).forEach(groupKey => {
      Object.keys(aggregations).forEach(colKey => {
        const agg = aggregations[colKey];
        if (agg.type === 'avg') {
          const count = grouped[groupKey].rows.length;
          grouped[groupKey].subtotals[colKey] = 
            count > 0 ? grouped[groupKey].subtotals[colKey] / count : 0;
        }
      });
    });

    return grouped;
  }, [data, groupBy, aggregations]);

  // Calculate grand totals
  const grandTotals = useMemo(() => {
    if (!showGrandTotal || groupBy.length === 0) return null;

    const totals = {};
    
    Object.keys(aggregations).forEach(colKey => {
      const agg = aggregations[colKey];
      totals[colKey] = 0;
    });

    Object.keys(processedData).forEach(groupKey => {
      Object.keys(aggregations).forEach(colKey => {
        const agg = aggregations[colKey];
        if (agg.type === 'sum' || agg.type === 'count') {
          totals[colKey] += processedData[groupKey].subtotals[colKey];
        } else if (agg.type === 'avg') {
          totals[colKey] += processedData[groupKey].subtotals[colKey];
        }
      });
    });

    // Calculate overall averages
    const groupCount = Object.keys(processedData).length;
    Object.keys(aggregations).forEach(colKey => {
      const agg = aggregations[colKey];
      if (agg.type === 'avg' && groupCount > 0) {
        totals[colKey] = totals[colKey] / groupCount;
      }
    });

    return totals;
  }, [processedData, aggregations, showGrandTotal, groupBy]);

  // Filter data
  const filteredData = useMemo(() => {
    if (!filterText) return processedData;

    if (groupBy.length === 0) {
      return processedData.filter(row => {
        return Object.values(row).some(val => 
          String(val).toLowerCase().includes(filterText.toLowerCase())
        );
      });
    }

    const filtered = {};
    Object.keys(processedData).forEach(groupKey => {
      const group = processedData[groupKey];
      const matchesGroup = Object.values(group.groupValues).some(val =>
        String(val).toLowerCase().includes(filterText.toLowerCase())
      );
      
      if (matchesGroup) {
        filtered[groupKey] = group;
      }
    });
    
    return filtered;
  }, [processedData, filterText, groupBy]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;

    if (groupBy.length === 0) {
      return [...filteredData].sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // Sort grouped data
    const sorted = Object.keys(filteredData).sort((keyA, keyB) => {
      const groupA = filteredData[keyA];
      const groupB = filteredData[keyB];
      
      let aVal, bVal;
      
      if (groupBy.includes(sortConfig.key)) {
        aVal = groupA.groupValues[sortConfig.key];
        bVal = groupB.groupValues[sortConfig.key];
      } else {
        aVal = groupA.subtotals[sortConfig.key];
        bVal = groupB.subtotals[sortConfig.key];
      }
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    const sortedObj = {};
    sorted.forEach(key => {
      sortedObj[key] = filteredData[key];
    });
    
    return sortedObj;
  }, [filteredData, sortConfig, groupBy]);

  const handleSort = (columnKey) => {
    setSortConfig(prev => {
      if (prev.key === columnKey) {
        if (prev.direction === 'asc') return { key: columnKey, direction: 'desc' };
        if (prev.direction === 'desc') return { key: null, direction: null };
      }
      return { key: columnKey, direction: 'asc' };
    });
  };

  const formatValue = (value, column) => {
    if (value === null || value === undefined) return '-';
    
    const format = column.format || 'number';
    
    if (format === 'number') {
      return typeof value === 'number' ? value.toLocaleString() : value;
    } else if (format === 'percentage') {
      return `${Math.round(value)}%`;
    } else if (format === 'duration') {
      const mins = Math.floor(value / 60);
      const secs = value % 60;
      return `${mins}:${String(secs).padStart(2, '0')}`;
    } else if (format === 'currency') {
      return `$${Number(value).toLocaleString()}`;
    }
    
    return value;
  };

  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown className="w-4 h-4 text-gray-400" />;
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="w-4 h-4 text-gray-700" />
      : <ArrowDown className="w-4 h-4 text-gray-700" />;
  };

  const renderGroupedTable = () => {
    let rowNumber = 1;

    return (
      <>
        {Object.keys(sortedData).map((groupKey, groupIndex) => {
          const group = sortedData[groupKey];
          
          return (
            <React.Fragment key={groupKey}>
              {/* Group Header Row */}
              <TableRow className="bg-gray-50 hover:bg-gray-100 font-semibold border-t-2 border-gray-300">
                <TableCell>{rowNumber++}.</TableCell>
                {groupBy.map(dim => (
                  <TableCell key={dim}>{group.groupValues[dim]}</TableCell>
                ))}
                {columns.filter(col => !groupBy.includes(col.key)).map(col => (
                  <TableCell key={col.key} className="text-right">
                    {formatValue(group.subtotals[col.key], col)}
                  </TableCell>
                ))}
              </TableRow>
            </React.Fragment>
          );
        })}

        {/* Grand Total Row */}
        {showGrandTotal && grandTotals && (
          <TableRow className="bg-teal-50 hover:bg-teal-100 font-bold border-t-2 border-teal-600">
            <TableCell></TableCell>
            <TableCell colSpan={groupBy.length}>Grand Total</TableCell>
            {columns.filter(col => !groupBy.includes(col.key)).map(col => (
              <TableCell key={col.key} className="text-right">
                {formatValue(grandTotals[col.key], col)}
              </TableCell>
            ))}
          </TableRow>
        )}
      </>
    );
  };

  const renderFlatTable = () => {
    return sortedData.map((row, index) => (
      <TableRow key={index}>
        <TableCell>{index + 1}.</TableCell>
        {columns.map(col => (
          <TableCell key={col.key} className={col.align === 'right' ? 'text-right' : ''}>
            {formatValue(row[col.key], col)}
          </TableCell>
        ))}
      </TableRow>
    ));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription className="mt-1">{description}</CardDescription>}
          </div>
          <div className="flex gap-2">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <Input
                placeholder="Filter..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="w-48 h-8 text-sm"
              />
            </div>
            {onExport && (
              <Button variant="outline" size="sm" onClick={onExport} className="gap-2">
                <Download className="w-4 h-4" />
                Export
              </Button>
            )}
          </div>
        </div>
        
        {groupBy.length > 0 && (
          <div className="flex gap-2 mt-2">
            <Badge variant="outline">Grouped by: {groupBy.join(', ')}</Badge>
            {showSubtotals && <Badge variant="outline">Subtotals enabled</Badge>}
            {showGrandTotal && <Badge variant="outline">Grand total enabled</Badge>}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-gray-300">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-100">
                <TableHead className="w-12">#</TableHead>
                {columns.map(col => (
                  <TableHead 
                    key={col.key}
                    className={`cursor-pointer hover:bg-gray-200 ${col.align === 'right' ? 'text-right' : ''}`}
                    onClick={() => handleSort(col.key)}
                  >
                    <div className="flex items-center gap-2 justify-between">
                      <span>{col.label}</span>
                      {getSortIcon(col.key)}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupBy.length > 0 ? renderGroupedTable() : renderFlatTable()}
            </TableBody>
          </Table>
        </div>
        
        <div className="mt-4 text-sm text-gray-600">
          Showing {groupBy.length > 0 ? Object.keys(sortedData).length : sortedData.length} 
          {groupBy.length > 0 ? ' groups' : ' rows'}
          {filterText && ` (filtered from ${groupBy.length > 0 ? Object.keys(processedData).length : processedData.length})`}
        </div>
      </CardContent>
    </Card>
  );
}