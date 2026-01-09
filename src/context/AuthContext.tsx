import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import api from "../services/api";

interface User {
  id: string;
  role: "admin" | "user";
  email: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/* ----------------------------------
   AXIOS TOKEN INJECTOR (CRITICAL)
----------------------------------- */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /* ----------------------------------
     RESTORE SESSION ON APP LOAD
  ----------------------------------- */
  const loadUser = useCallback(async () => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const res = await api.get("/auth/me");
      setUser(res.data);
    } catch (err) {
      localStorage.removeItem("auth_token");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  /* ----------------------------------
     LOGIN
  ----------------------------------- */
  const login = async (token: string) => {
    localStorage.setItem("auth_token", token);

    // IMPORTANT: wait until user is fetched
    const res = await api.get("/auth/me");
    setUser(res.data);
  };

  /* ----------------------------------
     LOGOUT
  ----------------------------------- */
  const logout = () => {
    localStorage.removeItem("auth_token");
    setUser(null);
  };

  /* ----------------------------------
     BLOCK UI UNTIL AUTH IS READY
  ----------------------------------- */
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
