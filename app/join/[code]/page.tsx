"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { FantaMember } from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Status = "loading" | "success" | "already-member" | "not-found" | "error";

export default function JoinFantaPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [status, setStatus] = useState<Status>("loading");
  const [fantaName, setFantaName] = useState("");

  useEffect(() => {
    if (authLoading || !user) return;

    const code = params.code.toUpperCase();

    (async () => {
      try {
        const fantasQuery = query(
          collection(db, "fantas"),
          where("inviteCode", "==", code),
        );
        const snapshot = await getDocs(fantasQuery);

        if (snapshot.empty) {
          setStatus("not-found");
          return;
        }

        const fantaDoc = snapshot.docs[0];
        const data = fantaDoc.data();
        setFantaName(data.name || "");

        const memberRef = doc(db, "fantas", fantaDoc.id, "members", user.id);
        const memberSnap = await getDoc(memberRef);

        if (memberSnap.exists()) {
          setStatus("already-member");
          return;
        }

        const generalBudget = data.settings?.generalBudget ?? 0;
        const newMember: FantaMember = {
          userId: user.id,
          role: "membro",
          teamName: "I Campioni",
          team: [],
          budgetTot: generalBudget,
          budgetSpent: 0,
          budgetLeft: generalBudget,
        };
        // joinCode: le regole Firestore permettono di auto-iscriversi solo
        // col codice invito attuale della lega (vedi members.create).
        await setDoc(memberRef, { ...newMember, joinCode: code });
        setStatus("success");
      } catch (error) {
        console.error("Errore durante l'ingresso nel fanta:", error);
        setStatus("error");
      }
    })();
  }, [authLoading, user, params.code]);

  if (authLoading) {
    return (
      <div className="auth-shell">
        <div className="text-center text-muted-foreground">Caricamento...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-shell">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-foreground">Accedi per continuare</CardTitle>
            <CardDescription className="text-muted-foreground">
              Devi avere un account per unirti a questa lega. Se non ce l&apos;hai
              ancora, la registrazione richiede un link d&apos;invito separato
              (chiedilo a chi gestisce la app, non basta questo link della
              lega). Dopo aver effettuato l&apos;accesso o la registrazione,
              riapri questo stesso link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/auth/login">Accedi</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-foreground">
            {status === "loading" && "Verifica in corso..."}
            {status === "success" && "Ti sei unito alla lega!"}
            {status === "already-member" && "Sei già membro"}
            {status === "not-found" && "Codice invito non valido"}
            {status === "error" && "Qualcosa è andato storto"}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {status === "loading" && "Sto controllando il codice invito."}
            {status === "success" &&
              `Ora fai parte di "${fantaName}". Selezionala dal menu in alto nella dashboard.`}
            {status === "already-member" &&
              `Fai già parte di "${fantaName}".`}
            {status === "not-found" &&
              "Il codice invito non corrisponde a nessuna lega. Controlla il link ricevuto."}
            {status === "error" &&
              "Riprova tra poco o chiedi un nuovo link all'admin della lega."}
          </CardDescription>
        </CardHeader>
        {(status === "success" ||
          status === "already-member" ||
          status === "not-found" ||
          status === "error") && (
          <CardContent>
            <Button onClick={() => router.push("/dashboard")}>
              Vai alla dashboard
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
