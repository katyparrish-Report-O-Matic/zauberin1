import ReportBuilder from './pages/ReportBuilder';
import Settings from './pages/Settings';
import JobsManager from './pages/JobsManager';
import OrganizationManager from './pages/OrganizationManager';
import WebhookManager from './pages/WebhookManager';
import Layout from './Layout.jsx';


export const PAGES = {
    "ReportBuilder": ReportBuilder,
    "Settings": Settings,
    "JobsManager": JobsManager,
    "OrganizationManager": OrganizationManager,
    "WebhookManager": WebhookManager,
}

export const pagesConfig = {
    mainPage: "ReportBuilder",
    Pages: PAGES,
    Layout: Layout,
};