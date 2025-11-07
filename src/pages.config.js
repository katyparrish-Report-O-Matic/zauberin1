import ReportBuilder from './pages/ReportBuilder';
import Settings from './pages/Settings';
import JobsManager from './pages/JobsManager';
import Layout from './Layout.jsx';


export const PAGES = {
    "ReportBuilder": ReportBuilder,
    "Settings": Settings,
    "JobsManager": JobsManager,
}

export const pagesConfig = {
    mainPage: "ReportBuilder",
    Pages: PAGES,
    Layout: Layout,
};