"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il login");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <Card className="w-full max-w-md border-slate-800 bg-slate-900">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold text-white">
            Accedi
          </CardTitle>
          <CardDescription className="text-slate-400">
            Inserisci le tue credenziali per accedere all’app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="rounded-md border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">
                {error}
              </div>
            )}
            <div className="rounded-md border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-300">
              <p className="font-medium text-slate-100">Account demo</p>
              <p className="mt-1">Admin: admin@test.it</p>
              <p>User: test@test.it</p>
              <p className="mt-1 text-xs text-slate-400">
                Qualsiasi password funziona.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="nome@esempio.it"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Accesso in corso..." : "Accedi"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-slate-400">
            Non hai un account?{" "}
            <Link
              href="/auth/register"
              className="text-slate-100 underline-offset-4 hover:underline"
            >
              Registrati
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
