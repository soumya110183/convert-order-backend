import { useEffect, useState } from "react";
import { Card } from "../Card";
import { Table } from "../Table";
import { Input } from "../Input";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { toast } from "sonner";
import { masterDataApi } from "../../services/masterDataApi";

export function ProductManagement() {
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [loading, setLoading] = useState(false);


  const startEdit = (id: string) => {
    setProducts(prev =>
      prev.map(r => (r._id === id ? { ...r, isEditing: true } : r))
    );
  };

  const cancelEdit = (id: string) => {
    setProducts(prev =>
      prev.map(r =>
        r._id === id
          ? { ...r, isEditing: false }
          : r
      )
    );
  };

const saveEdit = async (row: any) => {
  try {
    setProducts(prev =>
      prev.map(r =>
        r._id === row._id ? { ...r, isSaving: true } : r
      )
    );

    await masterDataApi.update(row._id, {
      name: row.name,
      sapCode: row.sapCode,
      status: row.status,
    });

    setProducts(prev =>
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


  const loadProducts = async () => {
    try {
      setLoading(true);
      const res = await masterDataApi.getProducts(search);
      setProducts(res.data);
    } catch {
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(loadProducts, 300);
    return () => clearTimeout(t);
  }, [search]);

  const saveChanges = async () => {
    try {
      await masterDataApi.updateProduct({
        productCode: editing.productCode,
        productName: editing.productName,
        division: editing.division,
      });

      toast.success("Product updated");
      setEditing(null);
      loadProducts();
    } catch {
      toast.error("Update failed");
    }
  };

  const columns = [
    { key: "productCode", label: "Product Code" },
    { key: "productName", label: "Product Name" },
    { key: "division", label: "Division" },
    {
      key: "actions",
      label: "Actions",
      render: (_: any, row: any) => (
        <Button size="sm" onClick={() => setEditing(row)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <>
      <Card>
        <h3 className="text-lg font-semibold mb-3">Products</h3>

        <Input
          placeholder="Search product code or name"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="mt-4">
          <Table columns={columns} data={products} loading={loading} />
        </div>
      </Card>

      {/* EDIT MODAL */}
      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title="Update Product"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveChanges}>Save</Button>
          </>
        }
      >
        <Input
          label="Product Name"
          value={editing?.productName || ""}
          onChange={e =>
            setEditing({ ...editing, productName: e.target.value })
          }
        />

        <Input
          label="Division"
          value={editing?.division || ""}
          onChange={e =>
            setEditing({ ...editing, division: e.target.value })
          }
        />
      </Modal>
    </>
  );
}
