import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Sparkles, Settings } from "lucide-react";

export default function Layout({ children }) {
  const location = useLocation();

  const navItems = [
    { name: "Report Builder", path: createPageUrl("ReportBuilder"), icon: Sparkles },
    { name: "Settings", path: createPageUrl("Settings"), icon: Settings }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-gray-900">Report Builder</h1>
              </div>
              <div className="hidden sm:ml-8 sm:flex sm:space-x-4">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`inline-flex items-center px-4 py-2 text-sm font-medium border-b-2 ${
                        isActive
                          ? "border-gray-900 text-gray-900"
                          : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
                      }`}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  );
}