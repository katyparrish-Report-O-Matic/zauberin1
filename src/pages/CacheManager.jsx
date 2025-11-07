import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Database, Trash2, RefreshCw, TrendingUp, 
  Clock, HardDrive, Zap, CheckCircle
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePermissions } from "../components/auth/usePermissions";
import OrganizationSelector from "../components/org/OrganizationSelector";
import PermissionGuard from "../components/auth/PermissionGuard";
import { cacheService } from "../components/cache/CacheService";

export default function CacheManager() {
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [clearType, setClearType] = useState(null);

  const { currentUser, isAgency } = usePermissions();

  // Fetch cache stats
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['cacheStats', selectedOrgId || currentUser?.organization_id],
    queryFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      return await cacheService.getStats(orgId === 'all' ? null : orgId);
    },
    refetchInterval: 30000, // Refresh every 30s
    initialData: {
      total_entries: 0,
      by_type: {},
      total_size_bytes: 0,
      total_size_formatted: '0 Bytes',
      total_hits: 0,
      memory_cache_size: 0,
      expired_entries: 0,
      avg_hit_rate: 0
    }
  });

  // Fetch top cache entries
  const { data: topEntries } = useQuery({
    queryKey: ['topCacheEntries'],
    queryFn: () => cacheService.getTopCacheEntries(10),
    refetchInterval: 30000,
    initialData: []
  });

  // Cleanup expired mutation
  const cleanupMutation = useMutation({
    mutationFn: () => cacheService.cleanupExpired(),
    onSuccess: (count) => {
      refetchStats();
      queryClient.invalidateQueries({ queryKey: ['topCacheEntries'] });
      toast.success(`Cleaned up ${count} expired entries`);
    }
  });

  // Clear cache mutation
  const clearCacheMutation = useMutation({
    mutationFn: async (type) => {
      if (type === 'all') {
        await cacheService.clearAll();
      } else {
        await cacheService.invalidateType(type);
      }
    },
    onSuccess: () => {
      refetchStats();
      queryClient.invalidateQueries();
      toast.success('Cache cleared');
      setShowClearDialog(false);
    }
  });

  // Warm cache mutation
  const warmCacheMutation = useMutation({
    mutationFn: async () => {
      const orgId = selectedOrgId || currentUser?.organization_id;
      if (!orgId || orgId === 'all') {
        throw new Error('Please select a specific organization');
      }
      await cacheService.warmCache(orgId);
    },
    onSuccess: () => {
      refetchStats();
      toast.success('Cache warmed with popular queries');
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const handleClearCache = (type) => {
    setClearType(type);
    setShowClearDialog(true);
  };

  const confirmClear = () => {
    clearCacheMutation.mutate(clearType);
  };

  const getCacheHealthColor = () => {
    if (stats.expired_entries > stats.total_entries * 0.3) return 'text-red-600';
    if (stats.expired_entries > stats.total_entries * 0.1) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <PermissionGuard requiredLevel="admin">
      <div className="min-h-screen bg-gray-50">
        <div className="p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <Database className="w-8 h-8" />
                  Cache Management
                </h1>
                <p className="text-gray-600 mt-1">Monitor and optimize multi-level caching</p>
              </div>
              <div className="flex gap-3">
                {isAgency && (
                  <OrganizationSelector
                    value={selectedOrgId || currentUser?.organization_id}
                    onChange={setSelectedOrgId}
                    showLabel={false}
                  />
                )}
                <Button 
                  variant="outline" 
                  onClick={() => warmCacheMutation.mutate()}
                  disabled={warmCacheMutation.isPending}
                  className="gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Warm Cache
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => cleanupMutation.mutate()}
                  disabled={cleanupMutation.isPending}
                  className="gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Cleanup
                </Button>
              </div>
            </div>

            {/* Overview Stats */}
            <div className="grid md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">Total Entries</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-3xl font-bold text-gray-900">{stats.total_entries}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {stats.memory_cache_size} in memory
                      </p>
                    </div>
                    <Database className="w-10 h-10 text-gray-400" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">Cache Size</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-3xl font-bold text-gray-900">{stats.total_size_formatted}</p>
                      <p className="text-xs text-gray-500 mt-1">Total cached data</p>
                    </div>
                    <HardDrive className="w-10 h-10 text-gray-400" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">Total Hits</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-3xl font-bold text-green-600">{stats.total_hits}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Avg: {stats.avg_hit_rate?.toFixed(1) || 0} per entry
                      </p>
                    </div>
                    <TrendingUp className="w-10 h-10 text-green-400" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">Cache Health</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-3xl font-bold ${getCacheHealthColor()}`}>
                        {stats.expired_entries}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Expired entries</p>
                    </div>
                    <CheckCircle className={`w-10 h-10 ${getCacheHealthColor()}`} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Cache by Type */}
            <Card>
              <CardHeader>
                <CardTitle>Cache Distribution</CardTitle>
                <CardDescription>Breakdown by cache type</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(stats.by_type).map(([type, data]) => {
                  const percentage = stats.total_entries > 0 
                    ? (data.count / stats.total_entries) * 100 
                    : 0;

                  return (
                    <div key={type} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-gray-900 capitalize">
                            {type.replace('_', ' ')}
                          </span>
                          <Badge variant="outline">{data.count} entries</Badge>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-gray-600">
                            {cacheService.formatBytes(data.size)}
                          </span>
                          <span className="text-sm text-gray-600">
                            {data.hits} hits
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleClearCache(type)}
                            className="gap-2"
                          >
                            <Trash2 className="w-3 h-3" />
                            Clear
                          </Button>
                        </div>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}

                {Object.keys(stats.by_type).length === 0 && (
                  <p className="text-center text-gray-500 py-8">No cache entries</p>
                )}
              </CardContent>
            </Card>

            {/* Top Cache Entries */}
            <Card>
              <CardHeader>
                <CardTitle>Most Accessed Entries</CardTitle>
                <CardDescription>Top 10 cache entries by hit count</CardDescription>
              </CardHeader>
              <CardContent>
                {topEntries.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No cache entries yet</p>
                ) : (
                  <div className="space-y-3">
                    {topEntries.map((entry, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-gray-900 truncate">
                              {entry.key}
                            </span>
                            <Badge variant="outline" className="capitalize">
                              {entry.type}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            {entry.last_accessed && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Last: {format(new Date(entry.last_accessed), 'MMM d, h:mm a')}
                              </span>
                            )}
                            <span>Size: {entry.size}</span>
                            <span>Expires: {format(new Date(entry.expires_at), 'MMM d, h:mm a')}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-2xl font-bold text-green-600">{entry.hits}</p>
                            <p className="text-xs text-gray-500">hits</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant="outline"
                  onClick={() => handleClearCache('all')}
                  className="w-full justify-start gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear All Cache
                </Button>
                <Button
                  variant="outline"
                  onClick={() => cleanupMutation.mutate()}
                  className="w-full justify-start gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Remove Expired Entries
                </Button>
                <Button
                  variant="outline"
                  onClick={() => warmCacheMutation.mutate()}
                  className="w-full justify-start gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Pre-load Popular Data
                </Button>
              </CardContent>
            </Card>

            {/* Info Card */}
            <Card>
              <CardHeader>
                <CardTitle>About Caching</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-gray-600">
                <p>✓ <strong>Database Cache:</strong> Stores query results to reduce database load</p>
                <p>✓ <strong>Memory Cache:</strong> Ultra-fast in-memory cache for frequently accessed data</p>
                <p>✓ <strong>API Response Cache:</strong> Caches external API responses to save quota</p>
                <p>✓ <strong>Smart Invalidation:</strong> Automatic cleanup of expired entries</p>
                <p>✓ <strong>Cache Warming:</strong> Pre-loads popular queries for better performance</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Clear Confirmation Dialog */}
        <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Clear Cache</DialogTitle>
              <DialogDescription>
                Are you sure you want to clear {clearType === 'all' ? 'all cache' : `${clearType} cache`}? 
                This will temporarily affect performance until the cache is rebuilt.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowClearDialog(false)}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={confirmClear}
                disabled={clearCacheMutation.isPending}
              >
                Clear Cache
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
}