import React, { useEffect, useState } from "react";
import { fetchAdminDashboard } from "../../services/adminDashboardApi";
import { toast } from "sonner";

import {
  AlertTriangle,
  TrendingUp,
  Users,
  Database,
  Map,
  Activity,
  FileText,
  CheckCircle,
} from "lucide-react";

import { Card } from "../Card";
import { Button } from "../Button";
import { StatCard } from "../StatCard";
import { Table } from "../Table";
import { Badge } from "../Badge";
import api from "../../services/api";

interface AdminDashboardProps {
  onNavigate: (page: string) => void;
}

interface DashboardStats {
  totalUsers: number;
  totalUploads: number;
  failedUploads: number;
  successRate: number;
  successfulConversions: number;
}

export function AdminDashboard({ onNavigate }: AdminDashboardProps) {
const [stats, setStats] = useState<DashboardStats | null>(null);

  const [alerts, setAlerts] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

const [exporting, setExporting] = useState(false);

const [uploads, setUploads] = useState<any[]>([]);
const [page, setPage] = useState(1);
const [pagination, setPagination] = useState<any>(null);

const loadUploads = async (pageNo = 1) => {
  const res = await api.get("/admin/uploads", {
    params: { page: pageNo, limit: 10 },
  });

  setUploads(
    res.data.data.map((u: any) => ({
      file: u.fileName,
      user: u.userEmail,
      status: u.status,
      processed: u.recordsProcessed ?? 0,
      failed: u.recordsFailed ?? 0,
      time: new Date(u.createdAt).toLocaleString(),
    }))
  );

  setPagination(res.data.pagination);
  setPage(pageNo);
};

useEffect(() => {
  loadUploads(1);
}, []);

 const loadDashboard = async () => {
  try {
    const data = await fetchAdminDashboard();

    setStats(data.stats);
    setAlerts(data.alerts);

    setRecentActivity(
      (data.recentActivity || []).map((a: any) => ({
        user: a.user || "System",
        action: a.action || "UNKNOWN",
        status: a.status || "Success",
        time: new Date(a.time).toLocaleString(),
      }))
    );
  } catch {
    toast.error("Failed to load admin dashboard");
  }
};

  useEffect(() => {
    loadDashboard();
    
  }, []);

  useEffect(() => {
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, []);

 const uploadColumns = [
  { key: "file", label: "File Name" },
  { key: "user", label: "Uploaded By" },
  {
    key: "status",
    label: "Status",
    render: (value: string) => (
      <Badge
        variant={
          value === "CONVERTED"
            ? "success"
            : value === "FAILED"
            ? "error"
            : "info"
        }
      >
        {value}
      </Badge>
    ),
  },
  { key: "processed", label: "Processed" },
  { key: "failed", label: "Failed" },
  { key: "time", label: "Uploaded At" },
];

const activityColumns = [
  { key: "user", label: "User" },
  { key: "action", label: "Action" },
  {
    key: "status",
    label: "Status",
    render: (value: string) => (
      <Badge variant={value === "Success" ? "success" : "error"}>
        {value}
      </Badge>
    ),
  },
  { key: "time", label: "Time" },
];


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">
            Admin Dashboard
          </h1>
          <p className="text-neutral-600 mt-1">
            System-wide overview and management
          </p>
        </div>
        <Badge variant="info">Live Data</Badge>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Users" value={stats?.totalUsers ?? 0} icon={Users} />
       <StatCard
  title="Total Uploads"
  value={stats?.totalUploads ?? 0}
  icon={FileText}
/>

<StatCard
  title="Failed Uploads"
  value={stats?.failedUploads ?? 0}
  icon={AlertTriangle}
/>

<StatCard
  title="Success Rate"
  value={`${stats?.successRate ?? 0}%`}
  icon={TrendingUp}
/>
<StatCard
  title="Successful Conversions"
  value={stats?.successfulConversions ?? 0}
  icon={CheckCircle}
/>

      </div>
<Button
  variant="secondary"
  disabled={exporting}
  onClick={async () => {
    try {
      setExporting(true);

      const res = await api.get(
        "/admin/export/conversions",
        {
          responseType: "blob", // ✅ THIS IS THE KEY
        }
      );

      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `converted_orders_${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();

      a.remove();
      window.URL.revokeObjectURL(url);

      toast.success("Export completed");
    } catch (err) {
      console.error(err);
      toast.error("Failed to export converted data");
    } finally {
      setExporting(false);
    }
  }}
>
  <FileText className="w-4 h-4" />
  {exporting ? "Exporting..." : "Export Converted Data"}
</Button>


      {/* Alerts */}
      {/* <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">System Alerts</h3>
          <Badge variant="error">
            {alerts.filter(a => a.type === "error").length} Critical
          </Badge>
        </div>

        <div className="space-y-3">
          {alerts.length === 0 && (
            <p className="text-sm text-neutral-500">No alerts 🎉</p>
          )}

          {alerts.map(alert => (
            <div
              key={alert._id}
              className={`p-4 border rounded-lg ${
                alert.type === "error"
                  ? "bg-error-50 border-error-200"
                  : alert.type === "warning"
                  ? "bg-warning-50 border-warning-200"
                  : "bg-primary-50 border-primary-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 mt-1" />
                <div className="flex-1">
                  <p className="font-medium">{alert.message}</p>
                  <div className="flex gap-3 mt-1">
                    <span className="text-sm text-neutral-600">{alert.time}</span>
                    <Badge variant="neutral">{alert.count} affected</Badge>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card> */}

      {/* Quick Access */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div onClick={() => onNavigate("mapping-rules")} className="cursor-pointer">
          <Card>
            <Map className="w-6 h-6 text-primary-600" />
            <p className="font-semibold mt-2">Mapping Rules</p>
          </Card>
        </div>
{/* 
        <div onClick={() => onNavigate("master-data")} className="cursor-pointer">
          <Card>
            <Database className="w-6 h-6 text-secondary-600" />
            <p className="font-semibold mt-2">Master Data</p>
          </Card>
        </div> */}

        <div onClick={() => onNavigate("user-access")} className="cursor-pointer">
          <Card>
            <Users className="w-6 h-6 text-warning-600" />
            <p className="font-semibold mt-2">User Access</p>
          </Card>
        </div>
      </div>

      {/* Activity */}
      {/* <Card>
        <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
        <Table columns={activityColumns} data={recentActivity} />
      </Card> */}
<Card>
  <h3 className="text-lg font-semibold mb-4">Recent Uploads</h3>

  {uploads.length === 0 ? (
    <p className="text-sm text-neutral-500">No uploads yet</p>
  ) : (
    <Table columns={uploadColumns} data={uploads} />
  )}

  <div className="flex justify-between items-center mt-4">
    <Button
      size="sm"
      variant="secondary"
      disabled={!pagination?.hasPrev}
      onClick={() => loadUploads(page - 1)}
    >
      Previous
    </Button>

    <span className="text-sm text-neutral-600">
      Page {pagination?.page} of {pagination?.totalPages}
    </span>

    <Button
      size="sm"
      variant="secondary"
      disabled={!pagination?.hasNext}
      onClick={() => loadUploads(page + 1)}
    >
      Next
    </Button>
  </div>
</Card>


    </div>
  );
}
