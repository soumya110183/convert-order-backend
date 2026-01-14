import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { Menu } from "lucide-react";
import { useState, } from "react";


import { Sidebar } from "./components/Sidebar.tsx";
import { LoginPage } from "./components/pages/LoginPage.tsx";
import { UserDashboard } from "./components/pages/UserDashboard.tsx";
import { UploadPage } from "./components/pages/UploadPage.tsx";
import { MappingPage } from "./components/pages/MappingPage.tsx";
import { ResultPage } from "./components/pages/ResultPage.tsx";
import { HistoryPage } from "./components/pages/HistoryPage.tsx";
import { AdminDashboard } from "./components/pages/AdminDashboard.tsx";
import { MappingRulesPage } from "./components/pages/MappingRulesPage.tsx";
import { UserAccessPage } from "./components/pages/UserAccessPage.tsx";
import ProtectedRoute from "./components/ProtectedRoutes.tsx";
import { MasterDataPage } from "./components/pages/MasterDataPage.tsx";

import { useAuth } from "./context/AuthContext.tsx";

export default function App() {
  const { user, loading, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400">
        Loading...
      </div>
    );
  }

  /* ----------------------------
     NOT AUTHENTICATED
  ----------------------------- */
  if (!user) {
    return (
      <>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <Toaster position="top-right" richColors />
      </>
    );
  }

  /* ----------------------------
     AUTHENTICATED LAYOUT
  ----------------------------- */
  return (
    <div className="min-h-screen bg-neutral-50">
      <Sidebar
        userRole={user.role}
        onLogout={logout}
        isMobileMenuOpen={isMobileMenuOpen}
        onMobileMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      />

      <div className="lg:ml-64 min-h-screen">
        {/* Mobile Header */}
        <div className="lg:hidden sticky top-0 z-20 bg-white border-b border-neutral-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-neutral-600 hover:bg-neutral-100 rounded-lg"
            >
              <Menu className="w-6 h-6" />
            </button>
            <span className="font-semibold text-neutral-900">
              OrderConvert
            </span>
            <div className="w-10" />
          </div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          <Routes>
            {/* USER ROUTES */}
            <Route
  path="/"
  element={
    <ProtectedRoute>
      {user.role === "admin" ? (
        <Navigate to="/admin" replace />
      ) : (
        <UserDashboard />
      )}
    </ProtectedRoute>
  }
/>

            <Route
              path="/upload"
              element={
                <ProtectedRoute>
                  <UploadPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mapping"
              element={
                <ProtectedRoute>
                  <MappingPage />
                </ProtectedRoute>
              }
            />
            <Route
  path="/result/:id"
  element={
    <ProtectedRoute>
      <ResultPage />
    </ProtectedRoute>
  }
/>

            <Route
              path="/history"
              element={
                <ProtectedRoute>
                  <HistoryPage />
                </ProtectedRoute>
              }
            />

            {/* ADMIN ROUTES */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute role="admin">
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
          <Route
              path="/admin/user-access"
              element={
                <ProtectedRoute role="admin">
                  <UserAccessPage />
                </ProtectedRoute>
              }
            />

           
            <Route
              path="/admin/master-data"
              element={
                <ProtectedRoute role="admin">
                  <MasterDataPage />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </div>

      <Toaster position="top-right" richColors />
    </div>
  );
}
