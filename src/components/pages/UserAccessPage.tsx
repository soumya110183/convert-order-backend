import React, { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { Card } from "../Card";
import { Button } from "../Button";
import { Input } from "../Input";
import { Dropdown } from "../Dropdown";
import { Table } from "../Table";
import { Badge } from "../Badge";
import { Modal } from "../Modal";
import { toast } from "sonner";
import { adminUsersApi } from "../../services/adminUserApi";

export function UserAccessPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<any>(null);

  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "User",
    status: "Active",
  });

  /* ---------------- LOAD USERS ---------------- */
  const loadUsers = async (search = "") => {
    try {
      setLoading(true);
      const res = await adminUsersApi.getUsers(search);
      setUsers(res.data);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  /* ---------------- SEARCH ---------------- */
  useEffect(() => {
    const delay = setTimeout(() => {
      loadUsers(searchTerm);
    }, 400);

    return () => clearTimeout(delay);
  }, [searchTerm]);

  /* ---------------- ROLE CHANGE ---------------- */
  const handleRoleChange = async (id: string, role: string) => {
    try {
      const normalizedRole = role.toLowerCase();
      await adminUsersApi.updateRole(id, normalizedRole);

      setUsers(prev =>
        prev.map(u =>
          u._id === id ? { ...u, role: normalizedRole } : u
        )
      );

      toast.success("Role updated");
    } catch {
      toast.error("Failed to update role");
    }
  };

  /* ---------------- STATUS TOGGLE ---------------- */
  const confirmStatusChange = async () => {
    try {
      await adminUsersApi.toggleStatus(confirmModal._id);

      setUsers(prev =>
        prev.map(u =>
          u._id === confirmModal._id
            ? {
                ...u,
                status: u.status === "Active" ? "Disabled" : "Active",
              }
            : u
        )
      );

      toast.success("User status updated");
    } catch {
      toast.error("Failed to update status");
    } finally {
      setConfirmModal(null);
    }
  };

  /* ---------------- ADD USER ---------------- */
  const handleAddUser = async () => {
    try {
      const payload = {
        name: newUser.name,
        email: newUser.email,
        password: newUser.password,
        role: newUser.role.toLowerCase(),
        status: newUser.status,
      };

      const res = await adminUsersApi.addUser(payload);

      setUsers(prev => [res.data, ...prev]);
      toast.success("User added");

      setIsAddModalOpen(false);
      setNewUser({
        name: "",
        email: "",
        password: "",
        role: "User",
        status: "Active",
      });
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add user");
    }
  };

  /* ---------------- TABLE ---------------- */
  const columns = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },

    {
      key: "role",
      label: "Role",
      render: (value: string, row: any) => (
        <Dropdown
          options={[
            { value: "user", label: "User" },
            { value: "admin", label: "Admin" },
          ]}
          value={value}
          onChange={e => handleRoleChange(row._id, e.target.value)}
        />
      ),
    },

    {
      key: "status",
      label: "Status",
      render: (value: string) => (
        <Badge variant={value === "Active" ? "success" : "neutral"}>
          {value}
        </Badge>
      ),
    },

    {
      key: "lastLogin",
      label: "Last Login",
      render: (v: string) => (v ? new Date(v).toLocaleString() : "—"),
    },

    { key: "conversions", label: "Conversions" },

    {
      key: "actions",
      label: "Actions",
      render: (_: any, row: any) => (
        <input
          type="checkbox"
          checked={row.status === "Active"}
          onChange={() => setConfirmModal(row)}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex justify-between">
        <h1 className="text-3xl font-bold">User Access Management</h1>
        <Button onClick={() => setIsAddModalOpen(true)}>
          <UserPlus className="w-4 h-4" />
          Add User
        </Button>
      </div>

      {/* SEARCH */}
      <Card>
        <Input
          placeholder="Search by name or email"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </Card>

      {/* TABLE */}
      <Card padding="none">
        <Table columns={columns} data={users} loading={loading} />
      </Card>

      {/* ADD USER MODAL */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New User"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsAddModalOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleAddUser}>Add User</Button>
          </>
        }
      >
        <Input
          label="Name"
          value={newUser.name}
          onChange={e => setNewUser({ ...newUser, name: e.target.value })}
        />
        <Input
          label="Email"
          value={newUser.email}
          onChange={e => setNewUser({ ...newUser, email: e.target.value })}
        />
        <Input
          label="Password"
          type="password"
          value={newUser.password}
          onChange={e =>
            setNewUser({ ...newUser, password: e.target.value })
          }
        />
        <Dropdown
          label="Role"
          options={[
            { value: "User", label: "User" },
            { value: "Admin", label: "Admin" },
          ]}
          value={newUser.role}
          onChange={e => setNewUser({ ...newUser, role: e.target.value })}
        />
        <Dropdown
          label="Status"
          options={[
            { value: "Active", label: "Active" },
            { value: "Disabled", label: "Disabled" },
          ]}
          value={newUser.status}
          onChange={e => setNewUser({ ...newUser, status: e.target.value })}
        />
      </Modal>

      {/* CONFIRM MODAL */}
      <Modal
        isOpen={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        title="Confirm Status Change"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmModal(null)}
            >
              Cancel
            </Button>
            <Button onClick={confirmStatusChange}>Confirm</Button>
          </>
        }
      >
        Are you sure you want to change status for{" "}
        <b>{confirmModal?.name}</b>?
      </Modal>
    </div>
  );
}
