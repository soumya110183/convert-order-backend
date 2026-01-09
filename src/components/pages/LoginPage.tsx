import React, { useState } from "react";
import { FileText, AlertCircle } from "lucide-react";
import { Button } from "../Button";
import { Input } from "../Input";
import { Card } from "../Card";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";

interface LoginPageProps {
  onLogin?: () => void; // optional, UI-safe
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    if (!email || !password) {
      setError("Please enter both email and password");
      setIsLoading(false);
      return;
    }

    try {
      const res = await api.post("/auth/login", {
        email,
        password,
      });

      const { token } = res.data;

      // 🔑 SINGLE SOURCE OF TRUTH
      await login(token);

      // Optional callback (routing, etc.)
      onLogin?.();
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "Login failed. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl mb-4 shadow-lg">
            <FileText className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">
            OrderConvert
          </h1>
          <p className="text-neutral-600">
            Universal File Conversion Platform
          </p>
        </div>

        {/* Login Form */}
        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-neutral-900 mb-1">
                Welcome back
              </h2>
              <p className="text-sm text-neutral-600">
                Sign in to your account to continue
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-error-50 border border-error-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-error-600 flex-shrink-0" />
                <p className="text-sm text-error-700">{error}</p>
              </div>
            )}

            <Input
              type="email"
              label="Email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />

            <Input
              type="password"
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={isLoading}
            >
              Sign In
            </Button>
          </form>
        </Card>

        <p className="text-center text-xs text-neutral-500 mt-6">
          Enterprise-grade order file conversion platform
        </p>
      </div>
    </div>
  );
}
