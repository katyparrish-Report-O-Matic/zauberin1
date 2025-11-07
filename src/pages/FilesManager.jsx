import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Image, File, Copy, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import PermissionGuard from "../components/auth/PermissionGuard";

export default function FilesManager() {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(null);

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const result = await base44.integrations.Core.UploadFile({ file });
      return result;
    },
    onSuccess: (data) => {
      setUploadedFiles(prev => [...prev, {
        url: data.file_url,
        name: data.file_url.split('/').pop(),
        type: data.file_url.includes('.png') || data.file_url.includes('.jpg') ? 'image' : 'file',
        uploadedAt: new Date().toISOString()
      }]);
      toast.success('File uploaded successfully');
    },
    onError: () => {
      toast.error('Failed to upload file');
    }
  });

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    await uploadMutation.mutateAsync(file);
    setUploading(false);
  };

  const copyToClipboard = (url) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    toast.success('URL copied to clipboard');
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const removeFile = (url) => {
    setUploadedFiles(prev => prev.filter(f => f.url !== url));
    toast.success('File removed from list');
  };

  return (
    <PermissionGuard requiredLevel="admin">
      <div className="min-h-screen bg-gray-50">
        <div className="p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Files & Media</h1>
              <p className="text-gray-600 mt-1">Upload and manage your images and files</p>
            </div>

            {/* Upload Section */}
            <Card>
              <CardHeader>
                <CardTitle>Upload Files</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-gray-400 transition-colors">
                  <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-4">Upload images, logos, or documents</p>
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <Button disabled={uploading} asChild>
                      <span>
                        {uploading ? 'Uploading...' : 'Choose File'}
                      </span>
                    </Button>
                    <Input
                      id="file-upload"
                      type="file"
                      className="hidden"
                      onChange={handleFileSelect}
                      accept="image/*,.pdf,.doc,.docx"
                    />
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Uploaded Files */}
            {uploadedFiles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Uploaded Files</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {uploadedFiles.map((file, idx) => (
                      <div key={idx} className="border border-gray-200 rounded-lg p-4 space-y-3">
                        {file.type === 'image' ? (
                          <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                            <img 
                              src={file.url} 
                              alt={file.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                            <File className="w-12 h-12 text-gray-400" />
                          </div>
                        )}
                        
                        <div>
                          <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(file.uploadedAt).toLocaleDateString()}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => copyToClipboard(file.url)}
                          >
                            {copiedUrl === file.url ? (
                              <Check className="w-4 h-4 mr-1" />
                            ) : (
                              <Copy className="w-4 h-4 mr-1" />
                            )}
                            {copiedUrl === file.url ? 'Copied!' : 'Copy URL'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeFile(file.url)}
                            className="text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Instructions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">How to use uploaded files</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-gray-600">
                <p>1. Upload your file using the upload section above</p>
                <p>2. Click "Copy URL" to copy the file's permanent URL</p>
                <p>3. Use the URL in your app (e.g., for logos in the header)</p>
                <p>4. For the logo: Tell me the URL and I'll add it to the header</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PermissionGuard>
  );
}