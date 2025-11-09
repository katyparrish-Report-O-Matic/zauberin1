import React from 'react';
import { TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HistoricalComparison({ currentValue, previousValue, metricName, format = 'number', showTrend = true }) {
  if (currentValue === null || currentValue === undefined || previousValue === null || previousValue === undefined) {
    return null;
  }

  const difference = currentValue - previousValue;
  const percentageChange = previousValue !== 0 ? ((difference / previousValue) * 100) : 0;
  
  const isPositive = difference > 0;
  const isNegative = difference < 0;
  const isNeutral = difference === 0;

  const formatValue = (value) => {
    if (format === 'currency') {
      return `£${value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (format === 'percentage') {
      return `${value.toFixed(2)}%`;
    }
    return value.toLocaleString('en-GB');
  };

  const getTrendIcon = () => {
    if (isPositive) return TrendingUp;
    if (isNegative) return TrendingDown;
    return Minus;
  };

  const getTrendColor = () => {
    if (isPositive) return 'text-green-600';
    if (isNegative) return 'text-red-600';
    return 'text-gray-600';
  };

  const getBadgeVariant = () => {
    if (isPositive) return 'default';
    if (isNegative) return 'destructive';
    return 'secondary';
  };

  const TrendIcon = getTrendIcon();

  if (!showTrend) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-semibold text-lg">{formatValue(currentValue)}</span>
        <Badge variant={getBadgeVariant()} className="gap-1">
          {isPositive && <ArrowUpRight className="w-3 h-3" />}
          {isNegative && <ArrowDownRight className="w-3 h-3" />}
          {percentageChange.toFixed(1)}%
        </Badge>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">{metricName}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">{formatValue(currentValue)}</span>
            <TrendIcon className={`w-5 h-5 ${getTrendColor()}`} />
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <Badge variant={getBadgeVariant()} className="gap-1">
              {isPositive && '+'}
              {percentageChange.toFixed(1)}%
            </Badge>
            <span className="text-gray-500">vs previous period</span>
          </div>
          
          <div className="text-xs text-gray-500">
            Previous: {formatValue(previousValue)} 
            {difference !== 0 && (
              <span className={getTrendColor()}>
                {' '}({isPositive ? '+' : ''}{formatValue(Math.abs(difference))})
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper function to calculate comparison data
export function calculateComparison(currentData, previousData, metricKey) {
  const sumMetric = (data) => {
    return data.reduce((sum, item) => sum + (item[metricKey] || 0), 0);
  };

  const currentValue = sumMetric(currentData);
  const previousValue = sumMetric(previousData);

  return {
    currentValue,
    previousValue,
    difference: currentValue - previousValue,
    percentageChange: previousValue !== 0 ? ((currentValue - previousValue) / previousValue) * 100 : 0
  };
}