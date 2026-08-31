import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Users, Zap, Trophy } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-5xl space-y-10">
          <div className="space-y-4 text-center">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
              Fantasy management
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
              Fanta Points App
            </h1>
            <p className="mx-auto max-w-2xl text-base text-slate-300 md:text-lg">
              Gestisci leghe, aste e budget in un unico sistema pensato per
              sport e giochi fantasy.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-slate-800 bg-slate-900">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-white">
                  <Users className="h-4 w-4 text-slate-300" />
                  Gestione utenti
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-400">
                  Ruoli chiari per creatori, vice-admin e giocatori.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-white">
                  <Zap className="h-4 w-4 text-slate-300" />
                  Aste live
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-400">
                  Countdown, puntate e chiusura automatica del bando.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-white">
                  <Trophy className="h-4 w-4 text-slate-300" />
                  Multi lega
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-400">
                  Crea più leghe e gestisci anche sport diversi.
                </CardDescription>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/auth/login">Accedi</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/auth/register">Registrati</Link>
            </Button>
          </div>

          <div className="mx-auto max-w-3xl rounded-lg border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">
              Funzionalità principali
            </h2>
            <ul className="space-y-3 text-sm text-slate-300">
              <li>
                • Sistema universale per calcio, LoL, basket e sport custom.
              </li>
              <li>
                • Campi personalizzabili con nome, ruolo e dettagli extra.
              </li>
              <li>• Budget e offerte gestiti in modo centralizzato.</li>
              <li>• Countdown e chiusura dell’asta in tempo reale.</li>
              <li>• Gestione dei vice-admin e dei membri della lega.</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
