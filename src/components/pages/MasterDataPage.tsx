import React, { useState } from "react";
import { Upload, Download, AlertTriangle, CheckCircle, Database } from "lucide-react";
import { Card } from "../Card";
import { Button } from "../Button";
import { Badge } from "../Badge";
import { toast } from "sonner";
import { masterDataApi } from "../../services/masterDataApi";
import { CustomerTable } from "../admin/CustomerTable";
import { ProductManagement } from "../admin/ProductManagement";

export function MasterDataPage() {
  const [customerFile, setCustomerFile] = useState<File | null>(null);
  const [productFile, setProductFile] = useState<File | null>(null);

  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(false);

  /* ===========================
     CUSTOMER UPLOAD
  ============================ */
  const uploadCustomers = async () => {
    if (!customerFile) {
      toast.error("Please select a customer file");
      return;
    }

    try {
      setLoadingCustomer(true);
      const res = await masterDataApi.uploadCustomers(customerFile);

      toast.success(
        `Customers uploaded: ${res.data.inserted}, Skipped: ${res.data.skipped}`
      );
      setCustomerFile(null);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Customer upload failed");
    } finally {
      setLoadingCustomer(false);
    }
  };

  /* ===========================
     PRODUCT UPLOAD
  ============================ */
  const uploadProducts = async () => {
    if (!productFile) {
      toast.error("Please select a product file");
      return;
    }

    try {
      setLoadingProduct(true);
      const res = await masterDataApi.uploadProducts(productFile);

      toast.success(
        `Products uploaded: ${res.data.inserted}, Skipped: ${res.data.skipped}`
      );
      setProductFile(null);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Product upload failed");
    } finally {
      setLoadingProduct(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* HEADER */}
      <div>
        <h1 className="text-3xl font-bold">Master Data Management</h1>
        <p className="text-neutral-600">Admin-only customer & product master</p>
      </div>

      {/* INFO */}
      <Card>
        <div className="flex gap-3">
          <Database className="w-5 h-5 text-primary-600" />
          <p className="text-sm">
            Used for validation and aggregation. Only ORDER QTY is updated during uploads.
          </p>
        </div>
      </Card>

      {/* CUSTOMER UPLOAD */}
   <Card>
  <h3 className="font-semibold mb-3">Customer Master Upload</h3>

  {/* Hidden input */}
  <input
    type="file"
    accept=".xlsx,.xls"
    id="customerFileInput"
    className="hidden"
    onChange={(e) => setCustomerFile(e.target.files?.[0] || null)}
  />

  <div className="flex items-center gap-3">
    {/* Select file button */}
    <Button
      variant="secondary"
      onClick={() =>
        document.getElementById("customerFileInput")?.click()
      }
    >
      Select File
    </Button>

    {/* Selected file */}
    {customerFile ? (
      <Badge variant="success">{customerFile.name}</Badge>
    ) : (
      <span className="text-sm text-neutral-500">
        No file selected
      </span>
    )}
  </div>

  {/* Upload button */}
  <div className="flex justify-end mt-4">
    <Button
      onClick={uploadCustomers}
      isLoading={loadingCustomer}
      disabled={!customerFile}
    >
      Upload Customers
    </Button>
  </div>
</Card>



      {/* PRODUCT UPLOAD */}
   <Card>
  <h3 className="font-semibold mb-3">Product Master Upload</h3>

  <input
    type="file"
    accept=".xlsx,.xls"
    id="productFileInput"
    className="hidden"
    onChange={(e) => setProductFile(e.target.files?.[0] || null)}
  />

  <div className="flex items-center gap-3">
    <Button
      variant="secondary"
      onClick={() =>
        document.getElementById("productFileInput")?.click()
      }
    >
      Select File
    </Button>

    {productFile ? (
      <Badge variant="success">{productFile.name}</Badge>
    ) : (
      <span className="text-sm text-neutral-500">
        No file selected
      </span>
    )}
  </div>

  <div className="flex justify-end mt-4">
    <Button
      onClick={uploadProducts}
      isLoading={loadingProduct}
      disabled={!productFile}
    >
      Upload Products
    </Button>
  </div>
</Card>


      <CustomerTable />
<ProductManagement />
    </div>
  );
}
