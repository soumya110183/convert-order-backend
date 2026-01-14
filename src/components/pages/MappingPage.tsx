/**
 * ORDER QUANTITY REVIEW PAGE
 * Pharma-safe, master-driven architecture
 */
import React, { useEffect, useState } from "react";
import { ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card } from "../Card";
import { Button } from "../Button";
import { Badge } from "../Badge";
import { toast } from "sonner";
import api from "../../services/api";
import { useNavigate, useLocation } from "react-router-dom";

export function MappingPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const parsedResult = location.state?.parsedResult;

  const [rows, setRows] = useState<any[]>([]);
  const [rowErrors, setRowErrors] = useState<Record<number, string[]>>({});
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  /* ---------------- INIT ---------------- */
  useEffect(() => {
    if (!parsedResult?.dataRows || !parsedResult.uploadId) {
      toast.error("Invalid upload session. Please re-upload.");
      navigate("/upload");
      return;
    }

    setRows(parsedResult.dataRows);
    setUploadId(parsedResult.uploadId);

    parsedResult.dataRows.forEach((row: any, i: number) =>
      validateRow(i, row)
    );
  }, [parsedResult, navigate]);

  /* ---------------- VALIDATION ---------------- */
  const validateRow = (index: number, row: any) => {
    const errors: string[] = [];

    if (!row.ORDERQTY || isNaN(Number(row.ORDERQTY)) || Number(row.ORDERQTY) <= 0) {
      errors.push("Invalid ORDERQTY");
    }

    setRowErrors(prev => ({ ...prev, [index]: errors }));
  };

  const updateQty = (index: number, value: string) => {
    setRows(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ORDERQTY: value };
      validateRow(index, next[index]);
      return next;
    });
  };

  const deleteRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  /* ---------------- CONVERT ---------------- */
  const handleConvert = async () => {
    if (Object.values(rowErrors).some(e => e.length > 0)) {
      toast.error("Fix quantity errors before continuing");
      return;
    }

    try {
      setConverting(true);

      const res = await api.post("/orders/convert", {
        uploadId,
        editedRows: rows, // ONLY ORDERQTY IS USED
      });

      toast.success("Order quantities processed successfully");
      navigate(`/result/${res.data.uploadId}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Conversion failed");
    } finally {
      setConverting(false);
    }
  };

  /* ---------------- RENDER ---------------- */
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Review Order Quantities</h1>

      <Card>
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded">
          <CheckCircle2 className="text-amber-600 w-5 h-5" />
          <p className="text-sm">
            Product, pack, division & customer data are taken from
            <strong> Admin Master</strong>.  
            You only need to verify order quantities.
          </p>
        </div>
      </Card>

      <Card>
        <table className="min-w-full text-sm border">
          <thead className="bg-neutral-100">
            <tr>
              <th className="px-3 py-2 text-left">ITEMDESC</th>
              <th className="px-3 py-2 text-left">ORDER QTY</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {rows.map((row, i) => {
              const hasError = rowErrors[i]?.length > 0;

              return (
                <tr key={i} className={hasError ? "bg-red-50" : ""}>
                  <td className="px-3 py-2">{row.ITEMDESC}</td>
                  <td className="px-3 py-2">
                    <input
                      value={row.ORDERQTY}
                      onChange={e => updateQty(i, e.target.value)}
                      className={`w-24 px-2 py-1 border rounded ${
                        hasError ? "border-red-500" : "border-gray-300"
                      }`}
                    />
                  </td>
                  <td className="text-center">
                    {hasError ? (
                      <Badge variant="warning">Invalid</Badge>
                    ) : (
                      <Badge variant="success">OK</Badge>
                    )}
                  </td>
                  <td className="text-center">
                    <button
                      onClick={() => deleteRow(i)}
                      className="text-red-600"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => navigate("/upload")}>
          Back
        </Button>
        <Button onClick={handleConvert} isLoading={converting}>
          Confirm & Convert <ArrowRight className="ml-2 w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
