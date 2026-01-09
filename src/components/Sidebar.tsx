import React from "react";
import {
  FileText,
  History,
  Upload,
  Users,
  Map,
  LayoutDashboard,
  LogOut,
  X,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { Badge } from "./Badge";
import { useAuth } from "../context/AuthContext";

interface SidebarProps {
  userRole: "user" | "admin";
  onLogout: () => void;
  isMobileMenuOpen?: boolean;
  onMobileMenuToggle?: () => void;
}

export function Sidebar({
  userRole,
  onLogout,
  isMobileMenuOpen = false,
  onMobileMenuToggle,
}: SidebarProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const userMenuItems = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/upload", label: "Upload Order", icon: Upload },
    { to: "/history", label: "Order History", icon: History },
  ];

  const adminMenuItems = [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { to: "/admin/mapping-rules", label: "Mapping Rules", icon: Map },
    { to: "/admin/users", label: "User Access", icon: Users },
  ];

  const menuItems = userRole === "admin" ? adminMenuItems : userMenuItems;

  const handleLogout = () => {
    onLogout();
    navigate("/login");
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => onMobileMenuToggle?.()}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-64
          bg-white border-r border-neutral-200
          flex flex-col
          transition-transform duration-300
          ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
        style={{ height: "100dvh" }}
      >
        {/* Logo */}
        <div className="p-6 border-b border-neutral-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-primary-800 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-neutral-900">
                  OrderConvert
                </h2>
                <p className="text-xs text-neutral-500">File Conversion</p>
              </div>
            </div>

            <button
              onClick={() => onMobileMenuToggle?.()}
              className="lg:hidden p-1 text-neutral-400 hover:text-neutral-600"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 overflow-y-auto">
          <div className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  onClick={() => onMobileMenuToggle?.()}
                  className={({ isActive }) =>
                    `
                      w-full flex items-center gap-3 px-4 py-3 rounded-lg
                      transition-all duration-200
                      ${
                        isActive
                          ? "bg-primary-50 text-primary-700 font-medium"
                          : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                      }
                    `
                  }
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>

        {/* User Info */}
        <div className="p-4 border-t border-neutral-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-primary-700">
                {userRole === "admin" ? "AD" : "US"}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-900 truncate">
                {user?.name || "User"}
              </p>
              <Badge
                variant={userRole === "admin" ? "info" : "neutral"}
                className="mt-1"
              >
                {userRole === "admin" ? "Admin" : "User"}
              </Badge>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2
                       text-neutral-600 hover:bg-neutral-50
                       rounded-lg transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
