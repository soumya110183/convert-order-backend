import React, { useEffect, useState } from "react";
import {
  CheckCircle,
  XCircle,
  Download,
  AlertTriangle,
} from "lucide-react";

import { Card } from "../Card";
import { Button } from "../Button";
import { Table } from "../Table";
import { Badge } from "../Badge";

import {
  getOrderResult,
  downloadOrderFile,
} from "../../services/orderApi";

import { useParams, useNavigate } from "react-router-dom";

export function ResultPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!id) {
      navigate("/history");
      return;
    }

    let mounted = true;

    (async () => {
      try {
        const res = await getOrderResult(id);
        if (!mounted) return;

        setData({
          successRows: res.recordsProcessed || 0,
          errors: res.rowErrors || [],
          warnings: res.rowWarnings || [],
          processingTime: res.processingTime || "-",
        });

        setSuccess(res.status === "CONVERTED");
      } catch (err) {
        console.error(err);
        navigate("/history");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-neutral-500">
        Loading conversion result...
      </div>
    );
  }

  if (!data) return null;

const errorRows = Array.isArray(data.errors) ? data.errors : [];
const warningRows = Array.isArray(data.warnings) ? data.warnings : [];



  const errorColumns = [
    { key: "rowNumber", label: "Row" },
    { key: "field", label: "Field" },
    { key: "error", label: "Error" },
    { key: "originalValue", label: "Original Value" },
    { key: "suggestedFix", label: "Suggested Fix" },
  ];

  const warningColumns = [
    { key: "rowNumber", label: "Row" },
    { key: "field", label: "Field" },
    { key: "warning", label: "Warning" },
    { key: "originalValue", label: "Original" },
    { key: "newValue", label: "New Value" },
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      {/* HEADER */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">
          Conversion Result
        </h1>
        <p className="text-neutral-600 mt-1">
          Review the conversion results and download your file
        </p>
      </div>

      {/* STATUS */}
      <Card>
        <div
          className={`flex items-start gap-4 p-6 rounded-lg border-2 ${
            success
              ? "bg-success-50 border-success-300"
              : "bg-error-50 border-error-300"
          }`}
        >
          {success ? (
            <CheckCircle className="w-12 h-12 text-success-600" />
          ) : (
            <XCircle className="w-12 h-12 text-error-600" />
          )}

          <div className="flex-1">
            <h2 className="text-2xl font-semibold mb-2">
              {success
                ? "Conversion Completed Successfully"
                : "Conversion Failed"}
            </h2>

            <div className="flex gap-2 mt-3">
              <Badge variant="success">
                {data.successRows} records processed
              </Badge>
              <Badge variant="warning">
                {warningRows.length} warnings
              </Badge>
              <Badge variant="error">{errorRows.length} errors</Badge>
            </div>
          </div>

          {success && (
            <Button
              variant="primary"
              onClick={() => downloadOrderFile(id)}
            >
              <Download className="w-4 h-4" />
              Download Excel
            </Button>
          )}
        </div>
      </Card>

      {/* WARNINGS */}
      {warningRows.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-warning-600" />
            <h3 className="text-lg font-semibold">Warnings</h3>
            <Badge variant="warning">{warningRows.length}</Badge>
          </div>
          <Table columns={warningColumns} data={warningRows} />
        </Card>
      )}

      {/* ERRORS */}
      {errorRows.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <XCircle className="w-5 h-5 text-error-600" />
            <h3 className="text-lg font-semibold">Errors</h3>
            <Badge variant="error">{errorRows.length}</Badge>
          </div>
          <Table columns={errorColumns} data={errorRows} />
        </Card>
      )}

      {/* ACTIONS */}
      <Card>
        <div className="flex justify-between items-center">
          <span className="text-sm text-neutral-600">
            {success
              ? "Your file is ready to download."
              : "Fix the errors and retry upload."}
          </span>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => navigate("/history")}>
              View History
            </Button>
            <Button variant="primary" onClick={() => navigate("/upload")}>
              {success ? "Upload Another File" : "Retry Upload"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
