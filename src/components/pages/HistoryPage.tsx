import React, { useState,useEffect } from 'react';
import { Search, Download, Eye, Filter, Calendar } from 'lucide-react';
import { Card } from '../Card';
import { Button } from '../Button';
import { Input } from '../Input';
import { Dropdown } from '../Dropdown';
import { Table } from '../Table';
import { Badge } from '../Badge';
import { Modal } from '../Modal';
import api from '../../services/api';
import { toast } from 'sonner';

interface HistoryPageProps {
  onNavigate: (page: string) => void;
}

export function HistoryPage({ onNavigate }: HistoryPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);


 const [history, setHistory] = useState<any[]>([]);
const [loading, setLoading] = useState(true);
useEffect(() => {
  const timer = setTimeout(fetchHistory, 400);
  return () => clearTimeout(timer);
}, [searchTerm, statusFilter]);


const fetchHistory = async () => {
  try {
    const res = await api.get("/orders/history", {
 params: {
  search: searchTerm,
  status: statusFilter === "all"
    ? "all"
    : statusFilter.toUpperCase(),
}
,
});


    console.log("HISTORY API RESPONSE 👉", res.data.history);

    setHistory(res.data.history);
  } catch {
    toast.error("Failed to load history");
  } finally {
    setLoading(false);
  }
};



const filteredData = history;


  const handleViewLog = (row: any) => {
    setSelectedLog(row);
    setIsModalOpen(true);
  };

const handleDownload = async (uploadId: string) => {
  try {
    const res = await api.get(
      `/orders/download/${uploadId}`,
      { responseType: "blob" }
    );

    const blob = new Blob([res.data], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "converted_orders.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    toast.error("Download failed");
  }
};




  const columns = [
    { key: 'fileName', label: 'File Name' },
    { key: 'uploadDate', label: 'Upload Date' },
    {
      key: 'status',
      label: 'Status',
 render: (value: string) => (
  <Badge
    variant={
      value === "CONVERTED"
        ? "success"
        : value === "FAILED"
        ? "error"
        : "neutral"
    }
  >
    {value}
  </Badge>
)

    },
    {
      key: 'recordsProcessed',
      label: 'Processed',
      render: (value: number, row: any) => (
  <span>{value} / {value + (row.recordsFailed ?? 0)}</span>
)

    },
    { key: 'processingTime', label: 'Time' },
    {
      key: 'actions',
      label: 'Actions',
      render: (_: any, row: any) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleViewLog(row);
            }}
          >
            <Eye className="w-4 h-4" />
          </Button>
          {row.outputFile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
               handleDownload(row.id)

              }}
            >
              <Download className="w-4 h-4" />
            </Button>
          )}
        </div>
      )
    },
  ];
  if (loading) {
  return (
    <p className="text-neutral-600 text-center py-10">
      Loading order history…
    </p>
  );
}


  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Order History</h1>
        <p className="text-neutral-600 mt-1">View and manage your past file conversions</p>
      </div>

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
              <Input
                type="text"
                placeholder="Search by file name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        <Dropdown
  options={[
    { value: 'all', label: 'All Status' },
    { value: 'converted', label: 'Converted' },
    { value: 'failed', label: 'Failed' },
  ]}
  value={statusFilter}
  onChange={(e) => setStatusFilter(e.target.value)}
/>

        </div>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card padding="sm">
          <p className="text-sm text-neutral-600 mb-1">Total Conversions</p>
          <p className="text-2xl font-semibold text-neutral-900">{history.length}
</p>
        </Card>
        <Card padding="sm">
          <p className="text-sm text-neutral-600 mb-1">Successful</p>
          <p className="text-2xl font-semibold text-success-600">
            {history.filter(h => h.status === "CONVERTED").length}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-sm text-neutral-600 mb-1">Failed</p>
          <p className="text-2xl font-semibold text-error-600">
            {history.filter(h => h.status === "FAILED").length}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-sm text-neutral-600 mb-1">Total Records</p>
          <p className="text-2xl font-semibold text-neutral-900">
            {history.reduce((acc, h) => acc + h.recordsProcessed, 0)}
          </p>
        </Card>
      </div>

      {/* History Table */}
      <Card padding="none">
        <div className="p-6 border-b border-neutral-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-neutral-900">Conversion History</h3>
            <div className="text-sm text-neutral-600">
              Showing {filteredData.length} of {history.length}
 conversions
            </div>
          </div>
        </div>
        <Table columns={columns} data={filteredData} />
        <div className="p-4 border-t border-neutral-200 bg-neutral-50">
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-600">Showing 1-{filteredData.length} of {filteredData.length}</p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled>
                Previous
              </Button>
              <Button variant="secondary" size="sm" disabled>
                Next
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Log Details Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Conversion Details"
        size="lg"
      >
        {selectedLog && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-neutral-600 mb-1">File Name</p>
                <p className="font-medium text-neutral-900">{selectedLog.fileName}</p>
              </div>
              <div>
                <p className="text-sm text-neutral-600 mb-1">Status</p>
               <Badge variant={selectedLog.status === "CONVERTED" ? "success" : "error"}>
  {selectedLog.status === "CONVERTED" ? "Success" : "Failed"}
</Badge>

              </div>
              <div>
                <p className="text-sm text-neutral-600 mb-1">Upload Date</p>
                <p className="font-medium text-neutral-900">{selectedLog.uploadDate}</p>
              </div>
              <div>
                <p className="text-sm text-neutral-600 mb-1">Processing Time</p>
                <p className="font-medium text-neutral-900">{selectedLog.processingTime}</p>
              </div>
              <div>
                <p className="text-sm text-neutral-600 mb-1">Records Processed</p>
                <p className="font-medium text-neutral-900">{selectedLog.recordsProcessed}</p>
              </div>
              <div>
                <p className="text-sm text-neutral-600 mb-1">Records Failed</p>
                <p className="font-medium text-neutral-900">
  {selectedLog.recordsFailed ?? 0}
</p>

              </div>
            </div>

            {selectedLog.outputFile && (
              <div className="pt-4 border-t border-neutral-200">
                <p className="text-sm text-neutral-600 mb-2">Output File</p>
                <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                  <p className="font-mono text-sm text-neutral-900">{selectedLog.outputFile}</p>
                  <Button
                    variant="primary"
                    size="sm"
                   onClick={() => handleDownload(selectedLog.id)}

                  >
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
