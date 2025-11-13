import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, Sparkles } from "lucide-react";
import { format } from "date-fns";
import AccountSelector from "../books/AccountSelector";

export default function ReportRequestPanel({ onGenerateReport, isGenerating, disabled, organizationId }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [account, setAccount] = useState('all');
  const [dateRange, setDateRange] = useState({
    from: undefined,
    to: undefined
  });

  const handleGenerate = () => {
    if (!description.trim()) {
      return;
    }

    onGenerateReport({
      title: title || 'Untitled Report',
      description,
      account,
      dateRange
    });
  };

  const examplePrompts = [
    "Show me total calls by tracking number as a bar chart",
    "Display daily call trends for the last 30 days as a line chart",
    "Break down answered vs missed calls by source as a pie chart",
    "Show me revenue by region in a table with daily breakdown"
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          Describe Your Report
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="report-title">Report Title (optional)</Label>
          <Input
            id="report-title"
            placeholder="e.g., Monthly Sales Performance"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={disabled}
          />
        </div>

        <AccountSelector
          organizationId={organizationId}
          value={account}
          onChange={setAccount}
          showLabel={true}
        />

        <div className="space-y-2">
          <Label>Date Range (optional)</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                    </>
                  ) : (
                    format(dateRange.from, "LLL dd, y")
                  )
                ) : (
                  <span>Pick a date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange.from}
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label htmlFor="report-description">What would you like to visualize? *</Label>
          <Textarea
            id="report-description"
            placeholder="Describe what you want to see. Examples: 'Show revenue by branch as a bar chart', 'Display daily call trends', 'Compare conversion rates across regions'"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            disabled={disabled}
          />
        </div>

        <Button 
          className="w-full" 
          onClick={handleGenerate}
          disabled={!description.trim() || isGenerating || disabled}
        >
          {isGenerating ? 'Generating...' : 'Generate Report'}
        </Button>

        {disabled && (
          <p className="text-xs text-red-600">
            You need editor permissions to create reports
          </p>
        )}

        <div className="border-t pt-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">Example prompts:</p>
          {examplePrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => setDescription(prompt)}
              className="block w-full text-left text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 p-2 rounded transition-colors"
              disabled={disabled}
            >
              💡 {prompt}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}