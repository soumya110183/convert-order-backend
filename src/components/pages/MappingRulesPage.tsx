import React, { useEffect, useState } from "react";
import { Save, Plus, Edit2, Trash2, Clock } from "lucide-react";
import { Card } from "../Card";
import { Button } from "../Button";
import { Table } from "../Table";
import { Modal } from "../Modal";
import { Input } from "../Input";
import { Dropdown } from "../Dropdown";
import { Badge } from "../Badge";
import { toast } from "sonner";
import api from "../../services/api";

interface MappingRulesPageProps {
  onNavigate: (page: string) => void;
}

export function MappingRulesPage({ onNavigate }: MappingRulesPageProps) {
  const [mappingRules, setMappingRules] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [form, setForm] = useState<any>({
    sourceColumn: "",
    targetColumn: "",
    transformation: "None",
    mandatory: true,
  });

  /* ---------------- FETCH RULES ---------------- */
  const loadRules = async () => {
    try {
      const res = await api.get("/api/admin/mapping-rules");
      setMappingRules(res.data.rules);
    } catch {
      toast.error("Failed to load mapping rules");
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  /* ---------------- SAVE (CREATE / UPDATE) ---------------- */
  const handleSaveRule = async () => {
    try {
      if (editingRule) {
        await api.put(
          `/api/admin/mapping-rules/${editingRule._id}`,
          form
        );
        toast.success("Rule updated");
      } else {
        await api.post("/api/admin/mapping-rules", form);
        toast.success("Rule added");
      }

      setIsAddModalOpen(false);
      setEditingRule(null);
      setForm({
        sourceColumn: "",
        targetColumn: "",
        transformation: "None",
        mandatory: true,
      });

      loadRules();
    } catch {
      toast.error("Failed to save rule");
    }
  };

  /* ---------------- DELETE ---------------- */
  const handleDeleteRule = async (id: string) => {
    try {
      await api.delete(`/api/admin/mapping-rules/${id}`);
      toast.success("Rule deleted");
      loadRules();
    } catch {
      toast.error("Failed to delete rule");
    }
  };

  /* ---------------- TABLE ---------------- */
  const columns = [
    { key: "sourceColumn", label: "Source Column" },
    { key: "targetColumn", label: "Target Column" },
    {
      key: "transformation",
      label: "Transformation",
      render: (v: string) => <Badge variant="neutral">{v}</Badge>,
    },
    {
      key: "mandatory",
      label: "Mandatory",
      render: (v: boolean) => (
        <Badge variant={v ? "error" : "neutral"}>
          {v ? "Required" : "Optional"}
        </Badge>
      ),
    },
    {
      key: "updatedAt",
      label: "Last Updated",
      render: (v: string) =>
        new Date(v).toLocaleDateString(),
    },
    {
      key: "actions",
      label: "Actions",
      render: (_: any, row: any) => (
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditingRule(row);
              setForm(row);
            }}
          >
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDeleteRule(row._id)}
          >
            <Trash2 className="w-4 h-4 text-error-600" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex justify-between">
        <div>
          <h1 className="text-3xl font-bold">Mapping Rules</h1>
          <p className="text-neutral-600">
            Configure how source columns map to training format
          </p>
        </div>
        <Button variant="primary" onClick={() => setIsAddModalOpen(true)}>
          <Plus className="w-4 h-4" /> Add Rule
        </Button>
      </div>

      {/* VERSION */}
      <Card>
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-primary-600" />
          <div>
            <p className="font-medium">Active Mapping Rules</p>
            <p className="text-sm text-neutral-600">
              {mappingRules.length} rules configured
            </p>
          </div>
        </div>
      </Card>

      {/* TABLE */}
      <Card padding="none">
        <Table columns={columns} data={mappingRules} />
      </Card>

      {/* MODAL */}
      <Modal
        isOpen={isAddModalOpen || !!editingRule}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingRule(null);
        }}
        title={editingRule ? "Edit Mapping Rule" : "Add Mapping Rule"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveRule}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Source Column Pattern (keywords / regex)"
            value={form.sourceColumn}
            onChange={(e) =>
              setForm({ ...form, sourceColumn: e.target.value })
            }
          />
          <Input
            label="Target Column"
            value={form.targetColumn}
            onChange={(e) =>
              setForm({ ...form, targetColumn: e.target.value })
            }
          />
          <Dropdown
            label="Transformation"
            options={[
              { value: "None", label: "None" },
              { value: "Uppercase", label: "Uppercase" },
              { value: "Lowercase", label: "Lowercase" },
              { value: "Round Up", label: "Round Up" },
              { value: "Date Format", label: "Date Format" },
              { value: "Currency Format", label: "Currency Format" },
            ]}
            value={form.transformation}
            onChange={(e) =>
              setForm({ ...form, transformation: e.target.value })
            }
          />
          <Dropdown
            label="Mandatory"
            options={[
              { value: "true", label: "Required" },
              { value: "false", label: "Optional" },
            ]}
            value={String(form.mandatory)}
            onChange={(e) =>
              setForm({ ...form, mandatory: e.target.value === "true" })
            }
          />
        </div>
      </Modal>
    </div>
  );
}
