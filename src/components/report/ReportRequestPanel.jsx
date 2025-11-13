import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Moon, Calendar as CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";

export default function ReportRequestPanel({ onGenerateReport, isGenerating, disabled = false }) {
  const [title, setTitle] = useState('');
  const [request, setRequest] = useState('');
  const [dateRange, setDateRange] = useState({ from: null, to: null });

  const handleGenerate = () => {
    if (request.trim()) {
      onGenerateReport({ 
        title: title || 'Custom Report', 
        description: request,
        dateRange
      });
    }
  };

  const exampleRequests = [
    "Show me revenue by branch for the last 30 days as a bar chart",
    "Compare sales across all regions this quarter with a line graph",
    "Display a pie chart of conversions broken down by branch",
    "Create a table showing daily revenue for each branch and region",
    "Show me user engagement trends by region over the past month"
  ];

  return (
    <Card className="border-gray-300">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Moon className="w-5 h-5" />
          Create Bespoke Report
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="report-title">Report Title (optional)</Label>
          <Input
            id="report-title"
            placeholder="e.g., Q4 Sales by Branch"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Date Range (optional)</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "MMM d, yyyy")} - {format(dateRange.to, "MMM d, yyyy")}
                    </>
                  ) : (
                    format(dateRange.from, "MMM d, yyyy")
                  )
                ) : (
                  <span>Pick a date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={(range) => setDateRange(range || { from: null, to: null })}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label htmlFor="report-request">What would you like to visualize?</Label>
          <Textarea
            id="report-request"
            placeholder="Describe the report you want... Include metrics, time periods, and segmentation (by branch, region, etc.)"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            rows={6}
            className="resize-none"
          />
          <p className="text-xs text-gray-500">
            Tip: Mention "by branch" or "by region" to segment your data
          </p>
        </div>

        <Button 
          onClick={handleGenerate}
          disabled={!request.trim() || isGenerating || disabled}
          className="w-full gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating Report...
            </>
          ) : (
            <>
              <Moon className="w-4 h-4" />
              Generate Report
            </>
          )}
        </Button>

        {disabled && (
          <p className="text-xs text-red-600">
            You need editor permissions to create reports
          </p>
        )}

        <div className="pt-4 border-t">
          <p className="text-sm font-medium text-gray-700 mb-2">Example requests:</p>
          <div className="space-y-2">
            {exampleRequests.map((example, idx) => (
              <button
                key={idx}
                onClick={() => setRequest(example)}
                className="text-xs text-left text-gray-600 hover:text-gray-900 hover:bg-gray-50 p-2 rounded block w-full transition-colors"
              >
                "{example}"
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}