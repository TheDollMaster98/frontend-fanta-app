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
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
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
        const memberIds: string[] = data.memberIds || [];
        setFantaName(data.name || "");

        if (memberIds.includes(user.id)) {
          setStatus("already-member");
          return;
        }

        await updateDoc(doc(db, "fantas", fantaDoc.id), {
          memberIds: arrayUnion(user.id),
        });
        setStatus("success");
      } catch (error) {
        console.error("Errore durante l'ingresso nel fanta:", error);
        setStatus("error");
      }
    })();
  }, [authLoading, user, params.code]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="text-center text-slate-400">Caricamento...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <Card className="w-full max-w-md border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-100">Accedi per continuare</CardTitle>
            <CardDescription className="text-slate-400">
              Devi avere un account per unirti a questa lega. Dopo aver
              effettuato l&apos;accesso o la registrazione, riapri questo
              stesso link.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button asChild>
              <Link href="/auth/login">Accedi</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/auth/register">Registrati</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <Card className="w-full max-w-md border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-slate-100">
            {status === "loading" && "Verifica in corso..."}
            {status === "success" && "Ti sei unito alla lega!"}
            {status === "already-member" && "Sei già membro"}
            {status === "not-found" && "Codice invito non valido"}
            {status === "error" && "Qualcosa è andato storto"}
          </CardTitle>
          <CardDescription className="text-slate-400">
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
