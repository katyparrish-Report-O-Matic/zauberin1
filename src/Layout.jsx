
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Sparkles, Settings, Clock, Building2, Shield, Webhook, Layout as LayoutIcon, Columns, FileText, Activity, Database, Key, Zap, HardDrive } from "lucide-react";
import JobScheduler from "./components/jobs/JobScheduler";
import { usePermissions } from "./components/auth/usePermissions";
import { Badge } from "@/components/ui/badge";

export default function Layout({ children }) {
  const location = useLocation();
  const { userOrg, hasPermission, isAgency } = usePermissions();

  const navItems = [
    { name: "Report Builder", path: createPageUrl("ReportBuilder"), icon: Sparkles },
    { name: "Dashboard Builder", path: createPageUrl("DashboardBuilder"), icon: Columns, requiredLevel: "editor" },
    { name: "Templates", path: createPageUrl("TemplateManager"), icon: LayoutIcon, requiredLevel: "editor" },
    { name: "Data Quality", path: createPageUrl("DataQuality"), icon: Activity, requiredLevel: "editor" },
    { name: "Performance", path: createPageUrl("PerformanceMonitor"), icon: Zap, requiredLevel: "admin" }, // Added new item
    { name: "Cache", path: createPageUrl("CacheManager"), icon: HardDrive, requiredLevel: "admin" },
    { name: "Backups", path: createPageUrl("BackupManager"), icon: Database, requiredLevel: "admin" },
    { name: "Integrations", path: createPageUrl("IntegrationsManager"), icon: Zap, requiredLevel: "admin" },
    { name: "API Keys", path: createPageUrl("ApiKeysManager"), icon: Key, requiredLevel: "admin" },
    { name: "Webhooks", path: createPageUrl("WebhookManager"), icon: Webhook, requiredLevel: "admin" },
    { name: "Jobs", path: createPageUrl("JobsManager"), icon: Clock, requiredLevel: "editor" },
    { name: "Audit Logs", path: createPageUrl("AuditLogs"), icon: FileText, requiredLevel: "admin" },
    { name: "Organizations", path: createPageUrl("OrganizationManager"), icon: Building2, requiredLevel: "admin", agencyOnly: true },
    { name: "Settings", path: createPageUrl("Settings"), icon: Settings, requiredLevel: "admin" }
  ];

  const visibleNavItems = navItems.filter(item => {
    if (item.agencyOnly && !isAgency) return false;
    if (item.requiredLevel && !hasPermission(item.requiredLevel)) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <JobScheduler />
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center gap-3">
                <h1 className="text-xl font-bold text-gray-900">MetricFlow</h1>
                {userOrg && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {userOrg.name}
                    </Badge>
                    {isAgency && (
                      <Badge variant="default" className="text-xs bg-blue-600">
                        <Shield className="w-3 h-3 mr-1" />
                        Agency
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              <div className="hidden sm:ml-8 sm:flex sm:space-x-4">
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`inline-flex items-center px-4 py-2 text-sm font-medium border-b-2 ${
                        isActive
                          ? "border-gray-900 text-gray-900"
                          : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
                      }`}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  );
}
