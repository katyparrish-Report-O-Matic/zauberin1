import ReportBuilder from './pages/ReportBuilder';
import Settings from './pages/Settings';
import JobsManager from './pages/JobsManager';
import OrganizationManager from './pages/OrganizationManager';
import WebhookManager from './pages/WebhookManager';
import TemplateManager from './pages/TemplateManager';
import DashboardBuilder from './pages/DashboardBuilder';
import AuditLogs from './pages/AuditLogs';
import BackupManager from './pages/BackupManager';
import DataQuality from './pages/DataQuality';
import ApiKeysManager from './pages/ApiKeysManager';
import ApiDocumentation from './pages/ApiDocumentation';
import IntegrationsManager from './pages/IntegrationsManager';
import CacheManager from './pages/CacheManager';
import PerformanceMonitor from './pages/PerformanceMonitor';
import ProductionDashboard from './pages/ProductionDashboard';
import Layout from './Layout.jsx';


export const PAGES = {
    "ReportBuilder": ReportBuilder,
    "Settings": Settings,
    "JobsManager": JobsManager,
    "OrganizationManager": OrganizationManager,
    "WebhookManager": WebhookManager,
    "TemplateManager": TemplateManager,
    "DashboardBuilder": DashboardBuilder,
    "AuditLogs": AuditLogs,
    "BackupManager": BackupManager,
    "DataQuality": DataQuality,
    "ApiKeysManager": ApiKeysManager,
    "ApiDocumentation": ApiDocumentation,
    "IntegrationsManager": IntegrationsManager,
    "CacheManager": CacheManager,
    "PerformanceMonitor": PerformanceMonitor,
    "ProductionDashboard": ProductionDashboard,
}

export const pagesConfig = {
    mainPage: "ReportBuilder",
    Pages: PAGES,
    Layout: Layout,
};