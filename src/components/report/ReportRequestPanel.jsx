import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2 } from "lucide-react";

export default function ReportRequestPanel({ onGenerateReport, isGenerating }) {
  const [title, setTitle] = useState('');
  const [request, setRequest] = useState('');

  const handleGenerate = () => {
    if (request.trim()) {
      onGenerateReport({ title: title || 'Custom Report', description: request });
    }
  };

  const exampleRequests = [
    "Show me revenue trends over the last 30 days broken down by region",
    "Compare conversion rates between different marketing channels this quarter",
    "Display top 10 products by sales with a bar chart",
    "Create a pie chart of user engagement by device type"
  ];

  return (
    <Card className="border-gray-300">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-gray-600" />
          Create Bespoke Report
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="report-title">Report Title (optional)</Label>
          <Input
            id="report-title"
            placeholder="e.g., Q4 Sales Analysis"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="report-request">What would you like to visualize?</Label>
          <Textarea
            id="report-request"
            placeholder="Describe the report you want to create... Be specific about metrics, time periods, filters, and visualization type."
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            rows={6}
            className="resize-none"
          />
        </div>

        <Button 
          onClick={handleGenerate}
          disabled={!request.trim() || isGenerating}
          className="w-full gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating Report...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate Report
            </>
          )}
        </Button>

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