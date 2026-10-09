import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/Logo";
import { Users, Zap, Trophy } from "lucide-react";

// Landing (9/10): marchio, una frase su cosa fa l'app, le due azioni, tre
// punti. Prima c'erano anche un'etichetta "Fantasy management" e un
// elenco puntato che ripeteva le card, più testi in bianco fisso invece
// dei token del tema.
const FEATURES = [
  {
    icon: Zap,
    title: "Aste live",
    text: "Countdown condiviso, rilanci in tempo reale, chiusura automatica.",
  },
  {
    icon: Trophy,
    title: "Classifiche vere",
    text: "Punti calcolati dalle statistiche reali delle partite, turno per turno.",
  },
  {
    icon: Users,
    title: "Tra amici",
    text: "Più leghe, ruoli chiari tra creatore, vice e giocatori.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-4 py-16">
        <div className="space-y-6 text-center">
          <LogoMark className="mx-auto size-16" />
          <h1 className="text-4xl font-semibold text-foreground md:text-6xl">
            Fanta Points
          </h1>
          <p className="mx-auto max-w-xl text-lg text-muted-foreground">
            Leghe, aste live e classifiche per il tuo fantasy tra amici.
          </p>
          <div className="flex flex-col justify-center gap-3 pt-2 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/auth/login">Accedi</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/auth/register">Registrati</Link>
            </Button>
          </div>
        </div>

        <ul className="mt-16 grid gap-6 border-t border-border pt-10 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="space-y-2">
              <Icon className="size-5 text-primary" aria-hidden="true" />
              <p className="font-medium text-foreground">{title}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
