import ReportBuilder from './pages/ReportBuilder';
import Settings from './pages/Settings';
import JobsManager from './pages/JobsManager';
import OrganizationManager from './pages/OrganizationManager';
import Layout from './Layout.jsx';


export const PAGES = {
    "ReportBuilder": ReportBuilder,
    "Settings": Settings,
    "JobsManager": JobsManager,
    "OrganizationManager": OrganizationManager,
}

export const pagesConfig = {
    mainPage: "ReportBuilder",
    Pages: PAGES,
    Layout: Layout,
};