import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, XCircle, Activity, Clock, Database } from "lucide-react";
import { cn } from "@/lib/utils";

export default function QualityMetrics({ metrics }) {
  if (!metrics) return null;

  const getScoreColor = (score) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreIcon = (score) => {
    if (score >= 90) return CheckCircle;
    if (score >= 70) return AlertTriangle;
    return XCircle;
  };

  const ScoreIcon = getScoreIcon(metrics.overallScore);

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Overall Score */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-gray-600">Overall Quality</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className={cn("text-3xl font-bold", getScoreColor(metrics.overallScore))}>
                {metrics.overallScore}%
              </p>
              <p className="text-xs text-gray-500 mt-1">Data quality score</p>
            </div>
            <ScoreIcon className={cn("w-10 h-10", getScoreColor(metrics.overallScore))} />
          </div>
          <Progress 
            value={metrics.overallScore} 
            className="mt-3"
          />
        </CardContent>
      </Card>

      {/* Completeness */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-gray-600">Completeness</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className={cn("text-3xl font-bold", getScoreColor(metrics.completeness))}>
                {metrics.completeness}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {metrics.missingDataPoints} missing points
              </p>
            </div>
            <Database className={cn("w-10 h-10", getScoreColor(metrics.completeness))} />
          </div>
          <Progress 
            value={metrics.completeness} 
            className="mt-3"
          />
        </CardContent>
      </Card>

      {/* Freshness */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-gray-600">Data Freshness</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-gray-900">
                {metrics.minutesSinceLastSync}m
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Last sync: {new Date(metrics.lastSyncTime).toLocaleTimeString()}
              </p>
            </div>
            <Clock className="w-10 h-10 text-gray-600" />
          </div>
          {metrics.isFresh ? (
            <Badge className="mt-3 bg-green-600">Fresh</Badge>
          ) : (
            <Badge variant="destructive" className="mt-3">Stale</Badge>
          )}
        </CardContent>
      </Card>

      {/* Error Rate */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-gray-600">Error Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className={cn(
                "text-3xl font-bold",
                metrics.errorRate < 5 ? 'text-green-600' : 
                metrics.errorRate < 15 ? 'text-yellow-600' : 'text-red-600'
              )}>
                {metrics.errorRate.toFixed(1)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {metrics.failedRequests}/{metrics.totalRequests} failed
              </p>
            </div>
            <Activity className={cn(
              "w-10 h-10",
              metrics.errorRate < 5 ? 'text-green-600' : 
              metrics.errorRate < 15 ? 'text-yellow-600' : 'text-red-600'
            )} />
          </div>
          <Progress 
            value={100 - metrics.errorRate} 
            className="mt-3"
          />
        </CardContent>
      </Card>
    </div>
  );
}