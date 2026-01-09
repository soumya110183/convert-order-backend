import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  Info,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
} from "lucide-react";
import { Card } from "../Card";
import { Button } from "../Button";
import { Dropdown } from "../Dropdown";
import { Badge } from "../Badge";
import { toast } from "sonner";
import api from "../../services/api";
import { normalizeKey } from "../../utils/normalizeKey";
import { useNavigate, useLocation } from "react-router-dom";

interface ExtractedField {
  id: string;
  fieldName: string;
  sampleValue: string;
  autoMapped: string;
  confidence: "high" | "medium" | "low";
}

interface ValidationError {
  field: string;
  message: string;
}

/* 🔒 CANONICAL REQUIRED COLUMNS */
const REQUIRED_COLUMNS = ["itemdesc", "orderqty"];

export function MappingPage() {
  const navigate = useNavigate();
  const location = useLocation();

  
  const [extractedFields, setExtractedFields] = useState<ExtractedField[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [standardColumns, setStandardColumns] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    []
  );
  const [lockedFields, setLockedFields] = useState<Set<string>>(new Set());
const parsedResult = location.state?.parsedResult;

  /* ---------------- FETCH EXTRACTED FIELDS ---------------- */
 useEffect(() => {
  if (!parsedResult) {
    toast.error("No parsed data found. Please re-upload.");
    navigate("/upload");
    return;
  }

  setUploadId(parsedResult.uploadId);
  setExtractedFields(parsedResult.extractedFields);

  const initial: Record<string, string> = {};
  const locked = new Set<string>();

  parsedResult.extractedFields.forEach((f: ExtractedField) => {
    initial[f.id] = f.autoMapped || "";
    if (f.confidence === "high" && f.autoMapped) {
      locked.add(f.id);
    }
  });

  setMappings(initial);
  setLockedFields(locked);
  setLoading(false);
}, [parsedResult, navigate]);


  /* ---------------- LOAD STANDARD COLUMNS ---------------- */
  useEffect(() => {
    const loadTemplate = async () => {
      try {
        const res = await api.get("/orders/template");
        setStandardColumns([
          { value: "", label: "Select column..." },
          ...res.data.columns.map((col: string) => ({
            value: col,
            label: col,
          })),
        ]);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load training template");
      }
    };

    loadTemplate();
  }, []);

  /* ---------------- RESTORE UPLOAD ID FROM SESSION ---------------- */

  const isMetaField = (fieldId: string) => fieldId.startsWith("__meta_");

  const toggleLock = (fieldId: string) => {
    setLockedFields((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) {
        next.delete(fieldId);
      } else {
        next.add(fieldId);
      }
      return next;
    });
  };

  /* ---------------- HANDLE MAPPING CHANGE ---------------- */
  const handleMappingChange = (fieldId: string, value: string) => {
    setMappings((prev) => ({ ...prev, [fieldId]: value }));
    // Clear validation errors when user makes changes
    setValidationErrors([]);
  };

  /* ---------------- VALIDATE BEFORE CONVERT ---------------- */
  const validateMappings = (): boolean => {
    const errors: ValidationError[] = [];

    // Filter out meta fields and empty mappings
    const normalizedMappings = Object.entries(mappings)
      .filter(
        ([key, value]) => !key.startsWith("__meta_") && value && value.trim()
      )
      .map(([key, value]) => ({
        original: key,
        normalized: normalizeKey(value),
      }));

    /* ---------------- REQUIRED COLUMNS CHECK ---------------- */
    for (const col of REQUIRED_COLUMNS) {
      const normalizedCol = normalizeKey(col);
      const found = normalizedMappings.some(
        (m) => m.normalized === normalizedCol
      );

      if (!found) {
        errors.push({
          field: col,
          message: `Required mapping missing: ${col}`,
        });
      }
    }

    /* ---------------- DUPLICATE CHECK ---------------- */
    const values = normalizedMappings.map((m) => m.normalized);
    const duplicates = values.filter((v, i) => values.indexOf(v) !== i);

    if (duplicates.length) {
      const uniqueDuplicates = [...new Set(duplicates)];
      errors.push({
        field: "duplicate",
        message: `Duplicate mappings detected: ${uniqueDuplicates.join(", ")}`,
      });
    }

    /* ---------------- EMPTY VALUE CHECK ---------------- */


    setValidationErrors(errors);

    if (errors.length > 0) {
      errors.forEach((error) => toast.error(error.message));
      return false;
    }

    return true;
  };

  /* ---------------- RESET STATE ---------------- */
  const resetState = () => {
    setUploadId(null);
    sessionStorage.removeItem("uploadId");
    setExtractedFields([]);
    setMappings({});
    setValidationErrors([]);
    setLockedFields(new Set());
  };

  /* ---------------- CONVERT ---------------- */
const handleConvert = async () => {
  if (!uploadId) {
    toast.error("Invalid upload session. Please re-upload the file.");
    navigate("/upload");
    return;
  }

  /* 1️⃣ Build repaired mappings (SYNC) */
  const repairedMappings: Record<string, string> = { ...mappings };

  REQUIRED_COLUMNS.forEach((required) => {
    const exists = Object.values(repairedMappings).some(
      (v) => normalizeKey(v) === normalizeKey(required)
    );

    if (!exists) {
      const candidate = extractedFields.find(
        (f) => normalizeKey(f.autoMapped) === normalizeKey(required)
      );

      if (candidate) {
        repairedMappings[candidate.id] = required;
      }
    }
  });

  /* 2️⃣ Validate repaired mappings */
  const errors: ValidationError[] = [];

  const normalizedValues = Object.entries(repairedMappings)
    .filter(([key, val]) => !key.startsWith("__meta_") && val?.trim())
    .map(([_, val]) => normalizeKey(val));

  for (const col of REQUIRED_COLUMNS) {
    if (!normalizedValues.includes(normalizeKey(col))) {
      errors.push({
        field: col,
        message: `Required mapping missing: ${col}`,
      });
    }
  }

  if (new Set(normalizedValues).size !== normalizedValues.length) {
    errors.push({
      field: "duplicate",
      message: "Duplicate mappings detected",
    });
  }

  if (errors.length) {
    setValidationErrors(errors);
    errors.forEach((e) => toast.error(e.message));
    return;
  }

  /* 3️⃣ Commit repaired mappings to UI */
  setMappings(repairedMappings);

  /* 4️⃣ Build clean mappings for backend */
  const cleanMappings: Record<string, string> = {};
  Object.entries(repairedMappings).forEach(([key, value]) => {
    if (!key.startsWith("__meta_") && value?.trim()) {
      cleanMappings[key] = normalizeKey(value);
    }
  });

  try {
    setConverting(true);

    const res = await api.post("/orders/convert", {
      uploadId,
      mappings: cleanMappings,
    });

    toast.success("File converted successfully");
    navigate(`/result/${res.data.uploadId}`);
  } catch (err: any) {
    toast.error(
      err.response?.data?.message || "Conversion failed. Please try again."
    );
  } finally {
    setConverting(false);
  }
};

const IGNORE_FIELDS = ["sl no", "free", "amount", "tax", "rate"];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-neutral-600">Loading mapping data…</p>
      </div>
    );
  }

  const highConfidence = extractedFields.filter((f) => f.confidence === "high")
    .length;
  const mediumConfidence = extractedFields.filter(
    (f) => f.confidence === "medium"
  ).length;
  const lowConfidence = extractedFields.filter((f) => f.confidence === "low")
    .length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6">
      {/* PAGE HEADER */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Column Mapping</h1>
        <p className="text-neutral-600 mt-1">
          Map your file columns to the standard training Excel format
        </p>
      </div>

      {/* VALIDATION ERRORS */}
      {validationErrors.length > 0 && (
        <Card>
          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-900 mb-2">
                  Validation Errors
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-red-800">
                  {validationErrors.map((error, idx) => (
                    <li key={idx}>{error.message}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* BUSINESS RULES */}
      <Card>
        <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <Info className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium mb-2 text-blue-900">
              Business Rules Applied
            </p>
            <ul className="list-disc list-inside space-y-1 text-blue-800">
              <li>Missing Box / Pack values default to 0</li>
              <li>Missing SAP / DVN values are left blank</li>
              <li>Mandatory fields (ItemDesc, OrderQty) must be mapped</li>
              <li>High-confidence mappings are locked by default (click to unlock)</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* MAPPING GRID */}
      <Card>
        {/* HEADER */}
        <div className="grid grid-cols-12 gap-4 pb-3 border-b text-sm font-medium text-neutral-600">
          <div className="col-span-3">Extracted Field</div>
          <div className="col-span-3">Sample Value</div>
          <div className="col-span-1 text-center">Confidence</div>
          <div className="col-span-4">Standard Column</div>
          <div className="col-span-1 text-center">Lock</div>
        </div>

        {/* ROWS */}
        <div className="space-y-3 mt-4">
          {extractedFields
  .filter(f => !IGNORE_FIELDS.includes(f.fieldName.toLowerCase()))
  .map((field) => {
            const meta = isMetaField(field.id);
            const isLocked = lockedFields.has(field.id);
            const confidenceColor =
              field.confidence === "high"
                ? "text-green-600"
                : field.confidence === "medium"
                ? "text-yellow-600"
                : "text-red-600";

            return (
              <div
                key={field.id}
                className={`grid grid-cols-12 gap-4 items-center p-3 rounded-lg ${
                  isLocked ? "bg-gray-50" : "bg-white"
                } border`}
              >
                <div className="col-span-3">
                  <div className="font-medium text-neutral-900">
                    {field.fieldName}
                  </div>
                  {meta && (
                    <span className="text-xs text-blue-600">(Header)</span>
                  )}
                </div>

                <div className="col-span-3 text-sm text-neutral-600 truncate">
                  {field.sampleValue}
                </div>

                <div className="col-span-1 text-center">
                  <Badge
                    variant={
                      field.confidence === "high"
                        ? "success"
                        : field.confidence === "medium"
                        ? "warning"
                        : "neutral"
                    }
                  >
                    {field.confidence}
                  </Badge>
                </div>

                <div className="col-span-4">
                  <Dropdown
                    options={standardColumns}
                    value={mappings[field.id] || ""}
                    disabled={meta || isLocked}
                    onChange={(e) =>
                      handleMappingChange(field.id, e.target.value)
                    }
                  />
                </div>

                <div className="col-span-1 flex justify-center">
                  {!meta && (
                    <button
                      onClick={() => toggleLock(field.id)}
                      className="p-1 hover:bg-gray-100 rounded"
                      title={isLocked ? "Unlock mapping" : "Lock mapping"}
                    >
                      {isLocked ? (
                        <Lock className="w-4 h-4 text-gray-600" />
                      ) : (
                        <Unlock className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* SUMMARY */}
        <div className="mt-6 pt-6 border-t flex justify-between items-center">
          <div className="flex gap-3">
            <Badge variant="success">{highConfidence} High</Badge>
            <Badge variant="warning">{mediumConfidence} Medium</Badge>
            <Badge variant="neutral">{lowConfidence} Low</Badge>
          </div>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                resetState();
                navigate("/upload");
              }}
            >
              Back
            </Button>
            <Button
              onClick={handleConvert}
              disabled={converting || !uploadId}
              title={
                !uploadId ? "Upload session missing. Re-upload file." : ""
              }
            >
              {converting ? "Converting..." : "Convert to Excel"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}