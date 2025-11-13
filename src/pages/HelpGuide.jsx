import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  BookOpen, FileBarChart, FlaskConical, Save, Download, Share2, 
  Calendar, FileText, Users, Database, ChevronRight, Search,
  Eye, Edit, Trash2, Plus, CheckCircle
} from "lucide-react";
import { Input } from "@/components/ui/input";

export default function HelpGuide() {
  const [searchQuery, setSearchQuery] = useState('');

  const sections = [
    {
      id: 'saved-reports',
      title: 'How to View Saved Reports',
      icon: FileBarChart,
      color: 'bg-blue-100 text-blue-700',
      steps: [
        {
          title: 'Navigate to Report Builder',
          description: 'Click on "Report Builder" in the navigation menu',
          icon: FileBarChart
        },
        {
          title: 'Find Saved Reports Section',
          description: 'Look at the left sidebar - there\'s a "Saved Reports" section below the report creation panel',
          icon: Eye
        },
        {
          title: 'Browse Your Reports',
          description: 'Scroll through your saved reports. You can see the title, description, date created, and chart type',
          icon: Search
        },
        {
          title: 'Load a Report',
          description: 'Click the "Load" button on any report to view it in the canvas',
          icon: CheckCircle
        }
      ],
      tips: [
        'Saved reports are stored in the database and persist across sessions',
        'Reports are organized by organization - you only see reports from your org',
        'Use the search feature to quickly find specific reports',
        'Reports include their original configuration, account settings, and date range'
      ]
    },
    {
      id: 'create-report',
      title: 'How to Create a New Report',
      icon: Plus,
      color: 'bg-green-100 text-green-700',
      steps: [
        {
          title: 'Go to Report Builder',
          description: 'Open the Report Builder page from the main navigation',
          icon: FileBarChart
        },
        {
          title: 'Fill in Report Details',
          description: 'Enter a title (optional), select an account, and pick a date range',
          icon: Edit
        },
        {
          title: 'Describe What You Want',
          description: 'In the text box, describe the visualization you want. Be specific about metrics, time periods, and segmentation (e.g., "by branch")',
          icon: FileText
        },
        {
          title: 'Generate Report',
          description: 'Click "Generate Report" and wait for the AI to create your visualization',
          icon: CheckCircle
        },
        {
          title: 'Save Your Report',
          description: 'Once generated, click "Save Report" to store it for future use',
          icon: Save
        }
      ],
      tips: [
        'Mention "by branch" or "by region" to segment your data',
        'Specify chart types like "bar chart", "line graph", "pie chart", or "table"',
        'Include time periods like "last 30 days", "this quarter", "monthly"',
        'Example: "Show me revenue by branch for the last 30 days as a bar chart"'
      ]
    },
    {
      id: 'create-book',
      title: 'How to Create a Report Book',
      icon: BookOpen,
      color: 'bg-purple-100 text-purple-700',
      steps: [
        {
          title: 'Open Report Library',
          description: 'Navigate to "Report Library" in the main menu',
          icon: BookOpen
        },
        {
          title: 'Click New Book',
          description: 'Click the "New Book" button in the top right corner',
          icon: Plus
        },
        {
          title: 'Enter Book Details',
          description: 'Provide a title, description, and choose a cover color',
          icon: Edit
        },
        {
          title: 'Select Accounts',
          description: 'Choose one or multiple accounts that this book will include data from',
          icon: Users
        },
        {
          title: 'Set Date Range',
          description: 'Pick the date range for all reports in this book (REQUIRED)',
          icon: Calendar
        },
        {
          title: 'Create & Edit',
          description: 'Click "Create Book" to be taken to the book editor where you can add reports',
          icon: CheckCircle
        }
      ],
      tips: [
        'Books can include multiple accounts for consolidated reporting',
        'All reports in a book automatically use the book\'s date range and accounts',
        'Books are perfect for client deliverables or monthly performance reviews',
        'You can add both saved reports and templates to a book'
      ]
    },
    {
      id: 'add-reports-to-book',
      title: 'How to Add Reports to a Book',
      icon: FileText,
      color: 'bg-orange-100 text-orange-700',
      steps: [
        {
          title: 'Open Book Editor',
          description: 'From Report Library, click "Edit" on a book to open the editor',
          icon: Edit
        },
        {
          title: 'Click Add Report',
          description: 'In the book editor, click the "Add Report" button',
          icon: Plus
        },
        {
          title: 'Choose Report Type',
          description: 'Select either "Saved Reports" or "Templates" tab',
          icon: FileText
        },
        {
          title: 'Select a Report',
          description: 'Click on any report or template to select it',
          icon: CheckCircle
        },
        {
          title: 'Add Notes (Optional)',
          description: 'Add any notes or context about this report section',
          icon: Edit
        },
        {
          title: 'Add to Book',
          description: 'Click "Add to Book" - the report will use the book\'s date range and accounts',
          icon: CheckCircle
        }
      ],
      tips: [
        'Reports automatically inherit the book\'s date range and account settings',
        'You can reorder reports using the up/down arrows',
        'Add notes to provide context for each report section',
        'Mix saved reports and templates in the same book'
      ]
    },
    {
      id: 'use-templates',
      title: 'How to Use Templates',
      icon: FlaskConical,
      color: 'bg-teal-100 text-teal-700',
      steps: [
        {
          title: 'Navigate to Templates',
          description: 'Click "Templates" in the main navigation',
          icon: FlaskConical
        },
        {
          title: 'Browse Templates',
          description: 'Explore popular templates (Revenue by Branch, Regional Sales, etc.)',
          icon: Search
        },
        {
          title: 'Configure Settings',
          description: 'Set your default date range and account preferences at the top',
          icon: Calendar
        },
        {
          title: 'Use Template',
          description: 'Click "Use Template" - it will create a new report with your settings',
          icon: CheckCircle
        },
        {
          title: 'View in Report Builder',
          description: 'You\'ll be redirected to Report Builder where the report is generated',
          icon: FileBarChart
        }
      ],
      tips: [
        'Templates are pre-configured report structures that you can reuse',
        'You can save any report as a template using "Save as Template"',
        'Templates show usage count to identify popular report types',
        'Templates automatically apply your selected date range and accounts'
      ]
    },
    {
      id: 'export-share',
      title: 'How to Export & Share Reports',
      icon: Share2,
      color: 'bg-pink-100 text-pink-700',
      steps: [
        {
          title: 'Generate a Report',
          description: 'Create or load a report in Report Builder',
          icon: FileBarChart
        },
        {
          title: 'Export as CSV',
          description: 'Click "Export CSV" to download the data in spreadsheet format',
          icon: Download
        },
        {
          title: 'Download PDF (Books)',
          description: 'For books, use the "Download PDF" button in Book Viewer',
          icon: Download
        },
        {
          title: 'Share via Email',
          description: 'Click the email icon on saved reports to send via email',
          icon: Share2
        },
        {
          title: 'Copy Share Link',
          description: 'Use the "Share" button to copy a link to the report or book',
          icon: Share2
        }
      ],
      tips: [
        'CSV exports are great for further analysis in Excel or Google Sheets',
        'PDF downloads create comprehensive client-ready reports',
        'Email reports include title, description, and key metrics',
        'Shared links allow others to view reports without logging in'
      ]
    },
    {
      id: 'manage-accounts',
      title: 'How to Manage Multiple Accounts',
      icon: Users,
      color: 'bg-indigo-100 text-indigo-700',
      steps: [
        {
          title: 'Configure Data Sources',
          description: 'Go to "Data Sources" to connect your accounts (admin only)',
          icon: Database
        },
        {
          title: 'Select in Report Builder',
          description: 'When creating reports, use the account dropdown to filter data',
          icon: FileBarChart
        },
        {
          title: 'Multi-Select in Books',
          description: 'When creating books, check multiple accounts to include all in reports',
          icon: BookOpen
        },
        {
          title: 'View Account Hierarchy',
          description: 'Accounts show with 📁 for parent accounts and 📄 for individual accounts',
          icon: Users
        }
      ],
      tips: [
        'Books can combine data from multiple accounts into single reports',
        'Account hierarchy helps organize complex account structures',
        'Use "All Accounts" to see data across your entire organization',
        'Each account shows its external ID for reference'
      ]
    },
    {
      id: 'segment-data',
      title: 'How to Segment Data',
      icon: Database,
      color: 'bg-yellow-100 text-yellow-700',
      steps: [
        {
          title: 'Mention Segmentation in Request',
          description: 'When describing your report, include phrases like "by branch", "by region", "per location"',
          icon: FileText
        },
        {
          title: 'AI Detects Segmentation',
          description: 'The system automatically detects you want data broken down by dimensions',
          icon: CheckCircle
        },
        {
          title: 'View Segmented Charts',
          description: 'Line/bar charts will show separate lines/bars for each segment',
          icon: FileBarChart
        },
        {
          title: 'Tables Show All Dimensions',
          description: 'Tables will include columns for each segment dimension',
          icon: FileText
        }
      ],
      tips: [
        'Common segments: branch, region, product, category, campaign',
        'Example: "Show revenue by branch" creates separate bars per branch',
        'Pie charts show distribution across segments',
        'Tables are best for viewing multiple segments with multiple metrics'
      ]
    },
    {
      id: 'date-ranges',
      title: 'Understanding Date Ranges',
      icon: Calendar,
      color: 'bg-red-100 text-red-700',
      steps: [
        {
          title: 'Set in Report Builder',
          description: 'Use the date picker to select "from" and "to" dates',
          icon: Calendar
        },
        {
          title: 'Set in Books (Required)',
          description: 'Books MUST have a date range - all reports inherit this range',
          icon: BookOpen
        },
        {
          title: 'Override with Natural Language',
          description: 'In your request, you can specify "last 30 days", "this quarter", etc.',
          icon: FileText
        },
        {
          title: 'View Data Freshness',
          description: 'Check the data freshness indicator to see when data was last updated',
          icon: CheckCircle
        }
      ],
      tips: [
        'Book date ranges override individual report date ranges',
        'Use relative ranges like "last 30 days" for dynamic reports',
        'Date ranges are required for books to ensure consistency',
        'Data freshness indicator shows how recent your data is'
      ]
    }
  ];

  const filteredSections = sections.filter(section => 
    section.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    section.steps.some(step => 
      step.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      step.description.toLowerCase().includes(searchQuery.toLowerCase())
    ) ||
    section.tips.some(tip => tip.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 md:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-8 h-8" />
              How-To Guide
            </h1>
            <p className="text-gray-600 mt-1">
              Learn how to use Zauberin to create reports, books, and visualizations
            </p>
          </div>

          {/* Search */}
          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  placeholder="Search guides..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Access</CardTitle>
              <CardDescription>Jump to common topics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                {sections.map(section => {
                  const Icon = section.icon;
                  return (
                    <button
                      key={section.id}
                      onClick={() => {
                        document.getElementById(section.id)?.scrollIntoView({ 
                          behavior: 'smooth',
                          block: 'start'
                        });
                      }}
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-left"
                    >
                      <div className={`w-10 h-10 rounded-lg ${section.color} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{section.title}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Sections */}
          <div className="space-y-6">
            {filteredSections.map((section, idx) => {
              const Icon = section.icon;
              return (
                <Card key={section.id} id={section.id} className="scroll-mt-6">
                  <CardHeader>
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-lg ${section.color} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-xl">{section.title}</CardTitle>
                        <Badge variant="outline" className="mt-2">
                          {section.steps.length} steps
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Steps */}
                    <div className="space-y-4">
                      {section.steps.map((step, stepIdx) => {
                        const StepIcon = step.icon;
                        return (
                          <div key={stepIdx} className="flex gap-4">
                            <div className="flex flex-col items-center">
                              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-sm flex-shrink-0">
                                {stepIdx + 1}
                              </div>
                              {stepIdx < section.steps.length - 1 && (
                                <div className="w-0.5 flex-1 bg-blue-200 my-1 min-h-[20px]" />
                              )}
                            </div>
                            <div className="flex-1 pb-4">
                              <div className="flex items-center gap-2 mb-1">
                                <StepIcon className="w-4 h-4 text-gray-500" />
                                <h4 className="font-semibold text-gray-900">{step.title}</h4>
                              </div>
                              <p className="text-gray-600 text-sm">{step.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Tips */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        Pro Tips
                      </h4>
                      <ul className="space-y-1.5">
                        {section.tips.map((tip, tipIdx) => (
                          <li key={tipIdx} className="text-sm text-blue-800 flex gap-2">
                            <span className="text-blue-600">•</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredSections.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center">
                <Search className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600 mb-2">No guides found</p>
                <p className="text-sm text-gray-500">
                  Try searching with different keywords
                </p>
              </CardContent>
            </Card>
          )}

          {/* Need More Help */}
          <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
            <CardContent className="p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Need More Help?</h3>
              <p className="text-gray-700 text-sm mb-4">
                If you can't find what you're looking for, check the Audit Logs for system activity,
                visit the Data Quality page to ensure your data is fresh, or contact your administrator
                for assistance with data sources and permissions.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Audit Logs</Badge>
                <Badge variant="outline">Data Quality</Badge>
                <Badge variant="outline">Data Sources</Badge>
                <Badge variant="outline">Settings</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}