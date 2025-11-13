import React from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, ArrowLeft, Download, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import ReportCanvas from "../components/report/ReportCanvas";

export default function BookViewer() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const bookId = searchParams.get('bookId');

  // Fetch book
  const { data: book, isLoading } = useQuery({
    queryKey: ['reportBook', bookId],
    queryFn: async () => {
      const books = await base44.entities.ReportBook.list();
      return books.find(b => b.id === bookId);
    },
    enabled: !!bookId
  });

  const handleDownloadPDF = () => {
    toast.info('PDF generation coming soon');
  };

  const handleShare = () => {
    toast.info('Sharing functionality coming soon');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <BookOpen className="w-16 h-16 mx-auto text-gray-400 mb-4 animate-pulse" />
          <p className="text-gray-600">Loading book...</p>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600">Book not found</p>
          <Button onClick={() => navigate(createPageUrl('ReportLibrary'))} className="mt-4">
            Back to Library
          </Button>
        </div>
      </div>
    );
  }

  const sortedReports = (book.reports || []).sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - Print-friendly */}
      <div className="bg-white border-b print:border-0">
        <div className="max-w-5xl mx-auto p-6 md:p-8">
          <div className="flex justify-between items-start print:block">
            <div className="flex items-center gap-3 print:block">
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate(createPageUrl('ReportLibrary'))}
                className="print:hidden"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{book.title}</h1>
                {book.description && (
                  <p className="text-gray-600 mt-2">{book.description}</p>
                )}
                <div className="flex gap-2 mt-3 print:hidden">
                  <Badge>{book.status}</Badge>
                  {book.account_name && (
                    <Badge variant="outline">{book.account_name}</Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 print:hidden">
              <Button variant="outline" onClick={handleShare} className="gap-2">
                <Share2 className="w-4 h-4" />
                Share
              </Button>
              <Button onClick={handleDownloadPDF} className="gap-2">
                <Download className="w-4 h-4" />
                Download PDF
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Book Content */}
      <div className="max-w-5xl mx-auto p-6 md:p-8 space-y-8">
        {sortedReports.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <BookOpen className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">This book is empty</p>
            </CardContent>
          </Card>
        ) : (
          sortedReports.map((report, index) => (
            <div key={`report-${index}`} className="page-break-after">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm text-gray-500 mb-1">
                        Report {index + 1} of {sortedReports.length}
                      </div>
                      <CardTitle className="text-2xl">{report.title}</CardTitle>
                      {report.notes && (
                        <p className="text-gray-600 mt-2">{report.notes}</p>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {report.config && (
                    <ReportCanvas 
                      config={report.config} 
                      data={null} // Would need to generate mock data
                    />
                  )}
                  {!report.config && (
                    <div className="text-center py-8 text-gray-500">
                      Report preview not available
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ))
        )}
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          .print\\:hidden {
            display: none !important;
          }
          .print\\:block {
            display: block !important;
          }
          .print\\:border-0 {
            border: 0 !important;
          }
          .page-break-after {
            page-break-after: always;
          }
          body {
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
}