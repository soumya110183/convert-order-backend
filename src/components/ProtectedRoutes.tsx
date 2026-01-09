import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({
  children,
  role,
}: {
  children: JSX.Element;
  role?: "admin" | "user";
}) {
  const { user, loading } = useAuth();

  /* ------------------------
     WAIT FOR AUTH LOAD
  ------------------------- */
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400">
        Loading...
      </div>
    );
  }

  /* ------------------------
     NOT LOGGED IN
  ------------------------- */
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  /* ------------------------
     ROLE CHECK
  ------------------------- */
  if (role && user.role !== role) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
