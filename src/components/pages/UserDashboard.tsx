import React from 'react';
import { Upload, FileText, CheckCircle, XCircle, Clock, TrendingUp } from 'lucide-react';
import { Card } from '../Card';
import { Button } from '../Button';
import { StatCard } from '../StatCard';
import { Table } from '../Table';
import { Badge } from '../Badge';
import  { useEffect, useState } from 'react';
import api from '../../services/api';


interface UserDashboardProps {
  onNavigate: (page: string) => void;
}

export function UserDashboard({ onNavigate }: UserDashboardProps) {
const [stats, setStats] = useState<any>(null);
const [recentUploads, setRecentUploads] = useState<any[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');

 const columns = [
    { key: 'fileName', label: 'File Name' },
    {
      key: 'uploadDate',
      label: 'Upload Date',
      render: (value: string) =>
        new Date(value).toLocaleString(),
    },
    {
      key: 'status',
      label: 'Status',
   render: (value: string) => (
  <Badge
    variant={value === "CONVERTED" ? "success" : "error"}
  >
    {value === "CONVERTED" ? "Success" : "Failed"}
  </Badge>
),

    },
    { key: 'recordsProcessed', label: 'Records' },
  ];
useEffect(() => {
  const loadDashboard = async () => {
    try {
      setLoading(true);
     const res = await api.get("/user/dashboard");

      setStats(res.data.stats);
      setRecentUploads(res.data.recentUploads);
    } catch (err: any) {
      console.error('User dashboard error:', err);
      setError(
        err.response?.data?.message ||
        'Failed to load dashboard data'
      );
    } finally {
      setLoading(false);
    }
  };

  loadDashboard();
}, []);

if (loading) {
  return <p className="text-neutral-600">Loading dashboard...</p>;
}

if (error) {
  return (
    <div className="p-4 bg-error-50 border border-error-200 rounded">
      {error}
    </div>
  );
}

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Dashboard</h1>
          <p className="text-neutral-600 mt-1">Welcome back! Here's your conversion overview</p>
        </div>
        <Button variant="primary" onClick={() => onNavigate('upload')}>
          <Upload className="w-4 h-4" />
          Upload Order
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
  title="Total Uploads"
  value={stats.totalUploads}
  icon={FileText}
  color="primary"
/>

<StatCard
  title="Successful"
  value={stats.successCount}
  icon={CheckCircle}
  color="success"
/>

<StatCard
  title="Failed"
  value={stats.failedCount}
  icon={XCircle}
  color="error"
/>

<StatCard
  title="Records Processed"
  value={stats.recordsProcessed}
  icon={TrendingUp}
  color="success"
/>

      </div>

      {/* Quick Actions */}
      <Card>
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => onNavigate('upload')}
            className="flex items-center gap-3 p-4 border border-neutral-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-all group"
          >
            <div className="p-2 bg-primary-100 rounded-lg group-hover:bg-primary-200 transition-colors">
              <Upload className="w-5 h-5 text-primary-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-neutral-900">New Upload</p>
              <p className="text-sm text-neutral-600">Upload order files</p>
            </div>
          </button>

          <button
            onClick={() => onNavigate('history')}
            className="flex items-center gap-3 p-4 border border-neutral-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-all group"
          >
            <div className="p-2 bg-secondary-100 rounded-lg group-hover:bg-secondary-200 transition-colors">
              <Clock className="w-5 h-5 text-secondary-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-neutral-900">View History</p>
              <p className="text-sm text-neutral-600">Check past conversions</p>
            </div>
          </button>

          <button className="flex items-center gap-3 p-4 border border-neutral-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-all group">
            <div className="p-2 bg-warning-100 rounded-lg group-hover:bg-warning-200 transition-colors">
              <FileText className="w-5 h-5 text-warning-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-neutral-900">Template</p>
              <p className="text-sm text-neutral-600">Download template</p>
            </div>
          </button>
        </div>
      </Card>

      {/* Recent Uploads Table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-900">Recent Uploads</h3>
          <Button variant="ghost" size="sm" onClick={() => onNavigate('history')}>
            View All
          </Button>
        </div>
        <Table columns={columns} data={recentUploads} />
      </Card>
    </div>
  );
}
