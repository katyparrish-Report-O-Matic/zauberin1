import React from 'react';
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function QueueProgressIndicator({ current, total, isVisible }) {
  if (!isVisible || total === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-gray-200 rounded-lg shadow-lg p-4 min-w-[280px] z-50">
      <div className="flex items-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">Loading Data</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Processing {current} of {total} requests...
          </p>
        </div>
      </div>
      <div className="mt-3">
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div
            className={cn(
              "bg-gray-600 h-1.5 rounded-full transition-all duration-300",
              current === total && "bg-green-600"
            )}
            style={{ width: `${(current / total) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}