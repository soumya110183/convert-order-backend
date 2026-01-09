import React, { useState } from 'react';
import { Upload, FileText, X, CheckCircle, AlertCircle } from 'lucide-react';
import { Card } from '../Card';
import { Button } from '../Button';
import api from "../../services/api";

import { useNavigate } from "react-router-dom";




export function UploadPage() {
    const navigate = useNavigate();
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const allowedExtensions = ['xlsx', 'xls', 'csv', 'pdf','txt'];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const isDuplicateFile = (newFile: File) => {
  return uploadedFiles.some(
    file => file.name === newFile.name && file.size === newFile.size
  );
};

  const handleDragLeave = () => {
    setIsDragging(false);
  };
async function uploadAndParse(
  file: File,
  onProgress: (p: number) => void
) {
  const formData = new FormData();
  formData.append("file", file);

  onProgress(50);

  const res = await api.post("/orders/extract", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  onProgress(80);

  if (!res.data || !res.data.extractedFields) {
    throw new Error("Parsing failed");
  }

  onProgress(100);

  return res.data;
}

const handleDrop = (e: React.DragEvent) => {
  e.preventDefault();
  setIsDragging(false);

  const files = Array.from(e.dataTransfer.files);
  const validFiles = validateFiles(files);

  setUploadedFiles(prev => [...prev, ...validFiles]);
};


const validateFiles = (files: File[]) => {
  const validFiles: File[] = [];
  const invalidFiles: string[] = [];

  files.forEach(file => {
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (!allowedExtensions.includes(ext || '')) {
      invalidFiles.push(file.name);
    } else if (!isDuplicateFile(file)) {
      validFiles.push(file);
    }
  });

  if (invalidFiles.length > 0) {
    alert(
      `Unsupported file types:\n${invalidFiles.join(
        ', '
      )}\n\nAllowed formats: Excel, CSV, PDF`
    );
  }

  return validFiles;
};

const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
  if (!e.target.files) return;

  const files = Array.from(e.target.files);
  const validFiles = validateFiles(files);

  setUploadedFiles(prev => [...prev, ...validFiles]);
};


  const removeFile = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
  };

const handleContinue = async () => {
  if (uploadedFiles.length !== 1) {
    alert("Please upload only one file at a time.");
    return;
  }

  try {
    setIsUploading(true);
    setUploadProgress(20);

    const file = uploadedFiles[0];

    setUploadProgress(40); // upload started

    const parsedResult = await uploadAndParse(file, setUploadProgress);

    navigate("/mapping", {
      state: {
        parsedResult,   // ✅ VERY IMPORTANT
        fileName: file.name,
      },
    });
  } catch (err) {
    alert("Failed to upload and parse file.");
    console.error(err);
  } finally {
    setIsUploading(false);
  }
};



  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Upload Order Files</h1>
        <p className="text-neutral-600 mt-1">Upload your order files to convert them to the standard Excel format</p>
      </div>

      {/* Upload Instructions */}
      <Card>
        <div className="flex items-start gap-3 p-4 bg-primary-50 rounded-lg border border-primary-200">
          <AlertCircle className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-primary-900">
            <p className="font-medium mb-1">Supported File Formats</p>
            <p className="text-primary-700"> Excel (.xlsx, .xls), CSV (.csv), PDF (.pdf), and Text (.txt) files are supported. Maximum file size: 10MB per file.</p>
          </div>
        </div>
      </Card>

      {/* Upload Zone */}
      <Card>
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
            isDragging
              ? 'border-primary-500 bg-primary-50'
              : 'border-neutral-300 hover:border-primary-400 hover:bg-neutral-50'
          }`}
        >
          <div className="flex flex-col items-center gap-4">
            <div className={`p-4 rounded-full ${isDragging ? 'bg-primary-100' : 'bg-neutral-100'}`}>
              <Upload className={`w-8 h-8 ${isDragging ? 'text-primary-600' : 'text-neutral-600'}`} />
            </div>
            
            <div>
              <p className="text-lg font-medium text-neutral-900 mb-1">
                {isDragging ? 'Drop files here' : 'Drag & drop files here'}
              </p>
              <p className="text-neutral-600 text-sm">or</p>
            </div>

            <label className="cursor-pointer">
              <input
                type="file"
                multiple
                accept=".xlsx,.xls,.csv,.pdf,.txt"
                onChange={handleFileSelect}
                className="hidden"
              />
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
                Browse Files
              </span>
            </label>

            <p className="text-xs text-neutral-500">
              Support multiple file upload
            </p>
          </div>
        </div>

        {/* Upload Progress */}
        {isUploading && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-neutral-600">Uploading files...</span>
              <span className="text-sm font-medium text-primary-600">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-neutral-200 rounded-full h-2">
              <div
                className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </Card>

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <Card>
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">
            Uploaded Files ({uploadedFiles.length})
          </h3>
          <div className="space-y-2">
            {uploadedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="p-2 bg-primary-100 rounded-lg">
                    <FileText className="w-5 h-5 text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-neutral-900 truncate">{file.name}</p>
                    <p className="text-sm text-neutral-600">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-success-600" />
                  <button
                    onClick={() => removeFile(index)}
                    className="p-1 text-neutral-400 hover:text-error-600 transition-colors"
                    disabled={isUploading}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-neutral-200">
           <Button
  variant="secondary"
  onClick={() => navigate("/")}
  disabled={isUploading}
>
  Cancel
</Button>

            <Button
              variant="primary"
              onClick={handleContinue}
              disabled={uploadedFiles.length === 0 || isUploading}
              isLoading={isUploading}
            >
              Continue to Mapping
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
