
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Settings, Clock, Building2, Shield, Webhook, FlaskConical, FileText, Activity, Database, Key, Zap, HardDrive, FileBarChart } from "lucide-react";
import JobScheduler from "./components/jobs/JobScheduler";
import { usePermissions } from "./components/auth/usePermissions";
import { Badge } from "@/components/ui/badge";
import EnvironmentIndicator from "./components/config/EnvironmentIndicator";
import MonitoringInitializer from "./components/monitoring/MonitoringInitializer";

export default function Layout({ children }) {
  const location = useLocation();
  const { userOrg, hasPermission, isAgency, currentUser } = usePermissions();

  const isAdmin = currentUser?.permission_level === 'admin';

  const navItems = [
    { name: "Report Builder", path: createPageUrl("ReportBuilder"), icon: FileBarChart },
    { name: "Templates", path: createPageUrl("ReportTemplates"), icon: FlaskConical },
    { name: "Data Quality", path: createPageUrl("DataQuality"), icon: Activity, requiredLevel: "editor" },
    { name: "Monitoring", path: createPageUrl("MonitoringDashboard"), icon: Activity, requiredLevel: "admin" },
    { name: "Performance", path: createPageUrl("PerformanceMonitor"), icon: Zap, requiredLevel: "admin" },
    { name: "Cache", path: createPageUrl("CacheManager"), icon: HardDrive, requiredLevel: "admin" },
    { name: "Backups", path: createPageUrl("BackupManager"), icon: Database, requiredLevel: "admin" },
    { name: "Integrations", path: createPageUrl("IntegrationsManager"), icon: Zap, requiredLevel: "admin" },
    { name: "API Keys", path: createPageUrl("ApiKeysManager"), icon: Key, requiredLevel: "admin" },
    { name: "Webhooks", path: createPageUrl("WebhookManager"), icon: Webhook, requiredLevel: "admin" },
    { name: "Files", path: createPageUrl("FilesManager"), icon: FileText, requiredLevel: "admin" },
    { name: "Jobs", path: createPageUrl("JobsManager"), icon: Clock, requiredLevel: "editor" },
    { name: "Audit Logs", path: createPageUrl("AuditLogs"), icon: FileText, requiredLevel: "admin" },
    { name: "Organizations", path: createPageUrl("OrganizationManager"), icon: Building2, requiredLevel: "admin", agencyOnly: true },
    { name: "Settings", path: createPageUrl("Settings"), icon: Settings, requiredLevel: "admin" }
  ];

  const visibleNavItems = navItems.filter(item => {
    if (isAdmin) {
      if (item.agencyOnly && !isAgency) return false;
      return true;
    }
    
    if (item.agencyOnly && !isAgency) return false;
    if (item.requiredLevel && !hasPermission(item.requiredLevel)) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <JobScheduler />
      <MonitoringInitializer />
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center gap-3">
                <img 
                  src="https://base44.app/api/apps/690dde1a97d67b2c9dbceb00/files/public/690dde1a97d67b2c9dbceb00/961e1fc85_Zauberin.png" 
                  alt="Zauberin Logo" 
                  className="h-10 w-10 object-contain"
                />
                <h1 className="text-xl font-bold text-gray-900">Zauberin</h1>
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
                    {isAdmin && (
                      <Badge variant="default" className="text-xs bg-purple-600">
                        <Shield className="w-3 h-3 mr-1" />
                        Admin
                      </Badge>
                    )}
                  </div>
                )}
                <EnvironmentIndicator />
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
