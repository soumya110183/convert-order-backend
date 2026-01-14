import { useEffect, useState } from "react";
import { Card } from "../Card";
import { Table } from "../Table";
import { Input } from "../Input";
import { Badge } from "../Badge";
import { toast } from "sonner";
import { masterDataApi } from "../../services/masterDataApi";

export function CustomerTable() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);



  const startEdit = (id: string) => {
    setCustomers(prev =>
      prev.map(r => (r._id === id ? { ...r, isEditing: true } : r))
    );
  };

  const cancelEdit = (id: string) => {
    setCustomers(prev =>
      prev.map(r =>
        r._id === id
          ? { ...r, isEditing: false }
          : r
      )
    );
  };

  const saveEdit = async (row: any) => {
    try {
      setCustomers(prev =>
        prev.map(r =>
          r._id === row._id ? { ...r, isSaving: true } : r
        )
      );

      await masterDataApi.update(row._id, {
        name: row.name,
        sapCode: row.sapCode,
        status: row.status,
      });

      setCustomers(prev =>
        prev.map(r =>
          r._id === row._id
            ? { ...r, isEditing: false, isSaving: false }
            : r
        )
      );

      toast.success("Updated");
    } catch {
      toast.error("Update failed");
      cancelEdit(row._id);
    }
  };


  const loadCustomers = async () => {
    try {
      setLoading(true);
      const res = await masterDataApi.getCustomers(search);
      setCustomers(res.data);
    } catch {
      toast.error("Failed to load customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(loadCustomers, 300);
    return () => clearTimeout(t);
  }, [search]);

  const columns = [
    { key: "customerCode", label: "Customer Code" },
    { key: "customerName", label: "Customer Name" },
    {
      key: "totalOrderQty",
      label: "Total Order Qty",
      render: (v: number) => <Badge variant="info">{v}</Badge>,
    },
    {
      key: "updatedAt",
      label: "Last Updated",
      render: (v: string) => new Date(v).toLocaleDateString(),
    },
  ];

  return (
    <Card>
      <h3 className="text-lg font-semibold mb-3">Customers</h3>

      <Input
        placeholder="Search customer name or code"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div className="mt-4">
        <Table columns={columns} data={customers} loading={loading} />
      </div>
    </Card>
  );
}
