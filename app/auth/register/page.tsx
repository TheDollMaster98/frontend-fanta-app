"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";

// useSearchParams() richiede un Suspense boundary in App Router, altrimenti
// il build fallisce ("should be wrapped in a suspense boundary").
export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const { register, loginWithGoogle } = useAuth();
  const searchParams = useSearchParams();
  // App per un gruppo chiuso di amici, registrazione a invito (30/9): senza
  // un ?invite=CODE valido in query, users/{uid}.create viene rifiutato
  // lato server (firestore.rules) comunque — bloccare qui il form invece
  // di far compilare tutto e fallire al submit.
  const inviteCode = searchParams.get("invite") || "";

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Le password non corrispondono!");
      return;
    }

    setIsLoading(true);

    try {
      await register(name, email, password, inviteCode);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore durante la registrazione",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setError("");
    setIsGoogleLoading(true);

    try {
      await loginWithGoogle(inviteCode);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore durante la registrazione",
      );
    } finally {
      setIsGoogleLoading(false);
    }
  };

  if (!inviteCode) {
    return (
      <div className="auth-shell">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold text-white">
              Serve un invito
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              La registrazione è possibile solo tramite un link d&apos;invito.
              Chiedi un link a chi gestisce la lega.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center text-sm text-muted-foreground">
              Hai già un account?{" "}
              <Link
                href="/auth/login"
                className="text-foreground underline-offset-4 hover:underline"
              >
                Accedi
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold text-white">
            Registrati
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Crea un account per iniziare a gestire le tue aste.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                type="text"
                placeholder="Il tuo nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isLoading}
              />
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
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Conferma password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Registrazione in corso..." : "Registrati"}
            </Button>
          </form>
          <div className="my-4 flex items-center gap-3">
            <Separator className="flex-1 bg-raised" />
            <span className="text-xs text-muted-foreground">oppure</span>
            <Separator className="flex-1 bg-raised" />
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogleRegister}
            disabled={isGoogleLoading}
          >
            {isGoogleLoading ? "Registrazione in corso..." : "Registrati con Google"}
          </Button>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            Hai già un account?{" "}
            <Link
              href="/auth/login"
              className="text-foreground underline-offset-4 hover:underline"
            >
              Accedi
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
