import ReportBuilder from './pages/ReportBuilder';
import Settings from './pages/Settings';
import Layout from './Layout.jsx';


export const PAGES = {
    "ReportBuilder": ReportBuilder,
    "Settings": Settings,
}

export const pagesConfig = {
    mainPage: "ReportBuilder",
    Pages: PAGES,
    Layout: Layout,
};