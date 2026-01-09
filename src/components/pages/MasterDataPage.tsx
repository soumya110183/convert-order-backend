import React, { useState } from 'react';
import { Upload, Download, AlertTriangle, CheckCircle, Database } from 'lucide-react';
import { Card } from '../Card';
import { Button } from '../Button';
import { Badge } from '../Badge';
import { toast } from 'sonner';

interface MasterDataPageProps {
  onNavigate: (page: string) => void;
}

export function MasterDataPage({ onNavigate }: MasterDataPageProps) {
  const [customerFile, setCustomerFile] = useState<File | null>(null);
  const [productFile, setProductFile] = useState<File | null>(null);
  const [uploadingCustomer, setUploadingCustomer] = useState(false);
  const [uploadingProduct, setUploadingProduct] = useState(false);

  const handleCustomerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCustomerFile(e.target.files[0]);
    }
  };

  const handleProductUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setProductFile(e.target.files[0]);
    }
  };

  const handleCustomerSubmit = () => {
    if (!customerFile) return;
    
    setUploadingCustomer(true);
    setTimeout(() => {
      setUploadingCustomer(false);
      toast.success('Customer master data uploaded successfully!');
      setCustomerFile(null);
    }, 2000);
  };

  const handleProductSubmit = () => {
    if (!productFile) return;
    
    setUploadingProduct(true);
    setTimeout(() => {
      setUploadingProduct(false);
      toast.success('Product master data uploaded successfully!');
      setProductFile(null);
    }, 2000);
  };

  const handleDownloadTemplate = (type: string) => {
    toast.success(`Downloading ${type} template...`);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Master Data Management</h1>
        <p className="text-neutral-600 mt-1">Upload and manage customer and product master data</p>
      </div>

      {/* Info Banner */}
      <Card>
        <div className="flex items-start gap-3 p-4 bg-primary-50 rounded-lg border border-primary-200">
          <Database className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-primary-900">
            <p className="font-medium mb-1">Master Data Purpose</p>
            <p className="text-primary-700">
              Master data is used for validation during conversion. Customer names and product IDs in uploaded
              files are checked against this data. Any mismatches will be flagged for review.
            </p>
          </div>
        </div>
      </Card>

      {/* Current Master Data Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-success-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-success-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-600">Active Customers</p>
              <p className="text-2xl font-semibold text-neutral-900">2,453</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-secondary-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-secondary-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-600">Active Products</p>
              <p className="text-2xl font-semibold text-neutral-900">1,847</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-warning-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-warning-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-600">Last Updated</p>
              <p className="text-base font-medium text-neutral-900">Jan 2, 2026</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Customer Master Data */}
      <Card>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">Customer Master Data</h3>
            <p className="text-sm text-neutral-600 mt-1">
              Upload an Excel file containing customer names and IDs
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleDownloadTemplate('Customer')}
          >
            <Download className="w-4 h-4" />
            Download Template
          </Button>
        </div>

        {/* Upload Area */}
        <div className="border-2 border-dashed border-neutral-300 rounded-lg p-8 text-center hover:border-primary-400 hover:bg-neutral-50 transition-all">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-primary-100 rounded-full">
              <Upload className="w-8 h-8 text-primary-600" />
            </div>
            
            <div>
              <p className="text-base font-medium text-neutral-900 mb-1">
                Upload Customer Excel
              </p>
              <p className="text-sm text-neutral-600">
                File must include columns: Customer ID, Customer Name
              </p>
            </div>

            <label className="cursor-pointer">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleCustomerUpload}
                className="hidden"
              />
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors">
                Select File
              </span>
            </label>

            {customerFile && (
              <div className="w-full max-w-md">
                <div className="flex items-center justify-between p-3 bg-success-50 border border-success-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-success-600" />
                    <span className="text-sm font-medium text-neutral-900">{customerFile.name}</span>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleCustomerSubmit}
                    isLoading={uploadingCustomer}
                  >
                    Upload
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Validation Info */}
        <div className="mt-4 p-4 bg-warning-50 border border-warning-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-warning-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-warning-900">
              <p className="font-medium mb-1">Duplicate Detection</p>
              <p className="text-warning-700">
                The system will automatically detect and flag duplicate customer IDs.
                You'll be prompted to resolve conflicts before the data is saved.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Product Master Data */}
      <Card>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">Product Master Data</h3>
            <p className="text-sm text-neutral-600 mt-1">
              Upload an Excel file containing product codes and descriptions
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleDownloadTemplate('Product')}
          >
            <Download className="w-4 h-4" />
            Download Template
          </Button>
        </div>

        {/* Upload Area */}
        <div className="border-2 border-dashed border-neutral-300 rounded-lg p-8 text-center hover:border-primary-400 hover:bg-neutral-50 transition-all">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-secondary-100 rounded-full">
              <Upload className="w-8 h-8 text-secondary-600" />
            </div>
            
            <div>
              <p className="text-base font-medium text-neutral-900 mb-1">
                Upload Product Excel
              </p>
              <p className="text-sm text-neutral-600">
                File must include columns: Product ID, Product Name, Category
              </p>
            </div>

            <label className="cursor-pointer">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleProductUpload}
                className="hidden"
              />
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors">
                Select File
              </span>
            </label>

            {productFile && (
              <div className="w-full max-w-md">
                <div className="flex items-center justify-between p-3 bg-success-50 border border-success-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-success-600" />
                    <span className="text-sm font-medium text-neutral-900">{productFile.name}</span>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleProductSubmit}
                    isLoading={uploadingProduct}
                  >
                    Upload
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Validation Info */}
        <div className="mt-4 p-4 bg-warning-50 border border-warning-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-warning-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-warning-900">
              <p className="font-medium mb-1">Duplicate Detection</p>
              <p className="text-warning-700">
                The system will automatically detect and flag duplicate product IDs.
                You'll be prompted to resolve conflicts before the data is saved.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Recent Updates */}
      <Card>
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">Recent Updates</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg">
            <div>
              <p className="font-medium text-neutral-900">Customer Master Data</p>
              <p className="text-sm text-neutral-600">Updated by Admin User on Jan 2, 2026</p>
            </div>
            <Badge variant="success">2,453 records</Badge>
          </div>
          <div className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg">
            <div>
              <p className="font-medium text-neutral-900">Product Master Data</p>
              <p className="text-sm text-neutral-600">Updated by Admin User on Dec 28, 2025</p>
            </div>
            <Badge variant="success">1,847 records</Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}
