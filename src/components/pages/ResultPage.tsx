/**
 * RESULT PAGE - Display Conversion Results
 * Compatible with production backend template structure
 */
import React, { useEffect, useState } from "react";
import {
  CheckCircle,
  XCircle,
  Download,
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
} from "lucide-react";
import { Card } from "../Card";
import { Button } from "../Button";
import { Table } from "../Table";
import { Badge } from "../Badge";
import { getOrderResult, downloadOrderFile } from "../../services/orderApi";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface ConversionData {
  successRows: number;
  errors: Array<{
    rowNumber: number;
    field: string;
    error: string;
    originalValue?: string;
    suggestedFix?: string;
  }>;
  warnings: Array<{
    rowNumber: number;
    field: string;
    warning: string;
    originalValue?: string;
    newValue?: string | number;
  }>;
  processingTime: string | number;
  status: string;
}

export function ResultPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [data, setData] = useState<ConversionData | null>(null);

  useEffect(() => {
    if (!id) {
      toast.error("No conversion ID provided");
      navigate("/history");
      return;
    }

    let mounted = true;

    (async () => {
      try {
        const res = await getOrderResult(id);
        if (!mounted) return;

        const conversionData: ConversionData = {
          successRows: res.recordsProcessed || 0,
          errors: Array.isArray(res.errors) ? res.errors : (res.rowErrors || []),
          warnings: Array.isArray(res.warnings) ? res.warnings : (res.rowWarnings || []),
          processingTime: res.processingTime || "-",
          status: res.status || "UNKNOWN",
        };

        setData(conversionData);
        setSuccess(res.status === "CONVERTED");

        // Show toast based on result
        if (res.status === "CONVERTED") {
          toast.success(`✅ ${conversionData.successRows} records converted successfully`);
        } else {
          toast.error("Conversion completed with errors");
        }
        
      } catch (err: any) {
        console.error("Result fetch error:", err);
        toast.error("Failed to load conversion result");
        navigate("/history");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id, navigate]);

  const handleDownload = async () => {
    if (!id) return;

    try {
      setDownloading(true);
      await downloadOrderFile(id);
      toast.success("File downloaded successfully");
    } catch (err: any) {
      console.error("Download error:", err);
      toast.error("Failed to download file");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-2" />
          <p className="text-neutral-600">Loading conversion result...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const errorRows = data.errors;
  const warningRows = data.warnings;
  const hasIssues = errorRows.length > 0 || warningRows.length > 0;

  const errorColumns = [
    { key: "rowNumber", label: "Row #" },
    { key: "field", label: "Field" },
    { key: "error", label: "Error Description" },
    { key: "originalValue", label: "Original Value" },
    { key: "suggestedFix", label: "Suggestion" },
  ];

  const warningColumns = [
    { key: "rowNumber", label: "Row #" },
    { key: "field", label: "Field" },
    { key: "warning", label: "Warning" },
    { key: "originalValue", label: "Original" },
    { key: "newValue", label: "Corrected To" },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6">
      {/* HEADER */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">
          Conversion Result
        </h1>
        <p className="text-neutral-600 mt-1">
          {success 
            ? "Your file has been converted to the pharmaceutical training template" 
            : "Review issues and retry conversion"}
        </p>
      </div>

      {/* STATUS CARD */}
      <Card>
        <div
          className={`flex items-start gap-4 p-6 rounded-lg border-2 ${
            success && !hasIssues
              ? "bg-green-50 border-green-300"
              : success && hasIssues
              ? "bg-yellow-50 border-yellow-300"
              : "bg-red-50 border-red-300"
          }`}
        >
          {success ? (
            <CheckCircle className="w-12 h-12 text-green-600 flex-shrink-0" />
          ) : (
            <XCircle className="w-12 h-12 text-red-600 flex-shrink-0" />
          )}

          <div className="flex-1">
            <h2 className="text-2xl font-semibold mb-2">
              {success
                ? hasIssues
                  ? "Conversion Completed with Warnings"
                  : "Conversion Successful"
                : "Conversion Failed"}
            </h2>

            <p className="text-neutral-700 mb-4">
              {success
                ? `Successfully converted ${data.successRows} product records to template format`
                : `${errorRows.length} errors prevented conversion`}
            </p>

            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="success">
                {data.successRows} records
              </Badge>
              {warningRows.length > 0 && (
                <Badge variant="warning">
                  {warningRows.length} warnings
                </Badge>
              )}
              {errorRows.length > 0 && (
                <Badge variant="error">
                  {errorRows.length} errors
                </Badge>
              )}
              {data.processingTime && data.processingTime !== "-" && (
                <Badge variant="neutral">
                  {typeof data.processingTime === 'number' 
                    ? `${(data.processingTime / 1000).toFixed(2)}s`
                    : data.processingTime}
                </Badge>
              )}
            </div>

            {success && (
              <Button
                variant="primary"
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center gap-2"
              >
                {downloading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download Excel File
                  </>
                )}
              </Button>
            )}
          </div>

          {success && (
            <div className="flex-shrink-0">
              <FileSpreadsheet className="w-16 h-16 text-green-600" />
            </div>
          )}
        </div>
      </Card>

      {/* TEMPLATE INFO */}
      {success && (
        <Card>
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium text-blue-900 mb-1">
                  Template Format
                </p>
                <p className="text-sm text-blue-800">
                  Your file has been converted to the pharmaceutical training template with columns: 
                  <strong> CODE | CUSTOMER NAME | SAPCODE | ITEMDESC | ORDERQTY | BOX PACK | PACK | DVN</strong>
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* WARNINGS TABLE */}
      {warningRows.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            <h3 className="text-lg font-semibold">Warnings</h3>
            <Badge variant="warning">{warningRows.length}</Badge>
          </div>
          <p className="text-sm text-neutral-600 mb-4">
            These records were processed but required automatic correction:
          </p>
          <div className="overflow-x-auto">
            <Table columns={warningColumns} data={warningRows} />
          </div>
        </Card>
      )}

      {/* ERRORS TABLE */}
      {errorRows.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <XCircle className="w-5 h-5 text-red-600" />
            <h3 className="text-lg font-semibold">Errors</h3>
            <Badge variant="error">{errorRows.length}</Badge>
          </div>
          <p className="text-sm text-neutral-600 mb-4">
            These records could not be processed and need to be fixed:
          </p>
          <div className="overflow-x-auto">
            <Table columns={errorColumns} data={errorRows} />
          </div>
        </Card>
      )}

      {/* ACTION BUTTONS */}
      <Card>
        <div className="flex justify-between items-center">
          <div className="text-sm text-neutral-600">
            {success ? (
              <>
                <CheckCircle className="w-4 h-4 inline text-green-600 mr-1" />
                Your pharmaceutical order file is ready
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 inline text-red-600 mr-1" />
                Fix errors in source file and upload again
              </>
            )}
          </div>

          <div className="flex gap-3">
            <Button 
              variant="secondary" 
              onClick={() => navigate("/history")}
            >
              View History
            </Button>
            <Button 
              variant="primary" 
              onClick={() => navigate("/upload")}
            >
              {success ? "Upload Another File" : "Try Again"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}