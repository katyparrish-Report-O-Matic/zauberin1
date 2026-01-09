import ApiDocumentation from './pages/ApiDocumentation';
import ApiKeysManager from './pages/ApiKeysManager';
import AuditLogs from './pages/AuditLogs';
import BackupManager from './pages/BackupManager';
import BookEditor from './pages/BookEditor';
import BookViewer from './pages/BookViewer';
import CacheManager from './pages/CacheManager';
import DashboardBuilder from './pages/DashboardBuilder';
import DataQuality from './pages/DataQuality';
import DataSourceManager from './pages/DataSourceManager';
import FilesManager from './pages/FilesManager';
import HelpGuide from './pages/HelpGuide';
import Home from './pages/Home';
import IntegrationsManager from './pages/IntegrationsManager';
import JobsManager from './pages/JobsManager';
import MonitoringDashboard from './pages/MonitoringDashboard';
import OrganizationManager from './pages/OrganizationManager';
import PerformanceMonitor from './pages/PerformanceMonitor';
import ProductionDashboard from './pages/ProductionDashboard';
import ReportBuilder from './pages/ReportBuilder';
import ReportLibrary from './pages/ReportLibrary';
import ReportTemplates from './pages/ReportTemplates';
import Settings from './pages/Settings';
import StatusPage from './pages/StatusPage';
import TemplateManager from './pages/TemplateManager';
import WebhookManager from './pages/WebhookManager';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ApiDocumentation": ApiDocumentation,
    "ApiKeysManager": ApiKeysManager,
    "AuditLogs": AuditLogs,
    "BackupManager": BackupManager,
    "BookEditor": BookEditor,
    "BookViewer": BookViewer,
    "CacheManager": CacheManager,
    "DashboardBuilder": DashboardBuilder,
    "DataQuality": DataQuality,
    "DataSourceManager": DataSourceManager,
    "FilesManager": FilesManager,
    "HelpGuide": HelpGuide,
    "Home": Home,
    "IntegrationsManager": IntegrationsManager,
    "JobsManager": JobsManager,
    "MonitoringDashboard": MonitoringDashboard,
    "OrganizationManager": OrganizationManager,
    "PerformanceMonitor": PerformanceMonitor,
    "ProductionDashboard": ProductionDashboard,
    "ReportBuilder": ReportBuilder,
    "ReportLibrary": ReportLibrary,
    "ReportTemplates": ReportTemplates,
    "Settings": Settings,
    "StatusPage": StatusPage,
    "TemplateManager": TemplateManager,
    "WebhookManager": WebhookManager,
}

export const pagesConfig = {
    mainPage: "ReportBuilder",
    Pages: PAGES,
    Layout: __Layout,
};