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
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Header */}
          <div className="space-y-4">
            <h1 className="text-5xl md:text-6xl font-bold text-white">
              Fanta Points App
            </h1>
            <p className="text-xl text-slate-300">
              Gestisci le tue aste fantasy per qualsiasi sport o gioco
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Gestione Utenti
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-400">
                  Admin, vice-admin e utenti con ruoli personalizzati
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Aste Live
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-400">
                  Sistema di aste con countdown e puntate in tempo reale
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Trophy className="w-5 h-5" />
                  Multi-Lega
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-400">
                  Crea e gestisci più leghe fantasy contemporaneamente
                </CardDescription>
              </CardContent>
            </Card>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
            <Button size="lg" asChild className="text-lg px-8">
              <Link href="/auth/login">Accedi</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="text-lg px-8"
            >
              <Link href="/auth/register">Registrati</Link>
            </Button>
          </div>

          {/* Features List */}
          <div className="mt-16 text-left max-w-2xl mx-auto">
            <h2 className="text-2xl font-semibold text-white mb-6">
              Funzionalità principali:
            </h2>
            <ul className="space-y-3 text-slate-300">
              <li className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <span>
                  Sistema universale per calcio, LoL, basket e qualsiasi
                  sport/gioco
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <span>
                  Campi personalizzabili: inserisci nome, ruolo e info extra a
                  piacimento
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <span>Gestione budget personalizzato per ogni utente</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <span>Puntate con bottoni predefiniti o importo custom</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <span>
                  Countdown personalizzabile per ogni asta (default 3 secondi)
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <span>Vice-admin per aiutare nella gestione dei bandi</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
