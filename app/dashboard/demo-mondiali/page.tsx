"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { FantaContext, useFanta, type FantaContextType } from "@/contexts/FantaContext";
import { buildDemoWorlds, type DemoPhase } from "@/lib/demoWorlds";
import StandingsPage from "@/app/dashboard/standings/page";
import PickemPage from "@/app/dashboard/pickem/page";
import ChampionPickPage from "@/app/dashboard/championpick/page";
import type { ChampionPick, PickemBracket, PickemPrediction } from "@/types";

// Modalità demo Mondiali (11/10), per tutti dal 11/10 (Impostazioni →
// "Inizia una demo"): prima solo developer. Le pagine vere di
// Classifica, Pick'em e Pick/Ban girano dentro un Provider con una lega
// finta (lib/demoWorlds.ts): si vede ogni fase del torneo, da admin o da
// membro, senza una lega reale. Nessuna scrittura su Firestore: ogni
// azione o cambia solo lo stato locale della demo (pronostici, Pick/Ban,
// blocco e risultati del Pick'em) o mostra un avviso.

const PHASES: { id: DemoPhase; label: string }[] = [
  { id: "gironi", label: "Gironi in corso" },
  { id: "tabellone", label: "Semifinali" },
  { id: "finita", label: "Finale conclusa" },
];
const TABS = [
  { id: "standings", label: "Classifica" },
  { id: "pickem", label: "Pick'em" },
  { id: "championpick", label: "Pick/Ban" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const demoOnly = () => {
  toast.info("Demo: qui non viene salvato niente");
  return Promise.resolve();
};

export default function DemoMondialiPage() {
  const { user } = useAuth();
  const real = useFanta();

  // Si parte come un membro qualunque a gironi in corso: il punto di
  // vista di chi sta imparando a giocare.
  const [phase, setPhase] = useState<DemoPhase>("gironi");
  const [asAdmin, setAsAdmin] = useState(false);
  const [introOpen, setIntroOpen] = useState(true);
  const [tab, setTab] = useState<TabId>("standings");
  const [now] = useState(() => Date.now());

  const base = useMemo(
    () =>
      user
        ? buildDemoWorlds(
            phase,
            { userId: user.id, name: user.name || "Tu", email: user.email || "" },
            asAdmin,
            now,
          )
        : null,
    [phase, asAdmin, user, now],
  );

  // Modifiche locali alle parti con cui si può interagire; si azzerano
  // cambiando fase o vista (si riparte dai dati finti di quella fase).
  const [overrides, setOverrides] = useState<{
    pickem?: PickemBracket;
    predictions?: PickemPrediction[];
    picks?: ChampionPick[];
  }>({});
  const changePhase = (next: DemoPhase) => {
    setPhase(next);
    setOverrides({});
  };
  const changeView = (admin: boolean) => {
    setAsAdmin(admin);
    setOverrides({});
  };
  const pickem = overrides.pickem ?? base?.pickemBracket ?? null;
  const predictions = overrides.predictions ?? base?.pickemPredictions ?? [];
  const picks = overrides.picks ?? base?.championPicks ?? [];
  const setPickem = (update: (prev: PickemBracket) => PickemBracket) =>
    pickem && setOverrides((o) => ({ ...o, pickem: update(o.pickem ?? pickem) }));
  const setPredictions = (update: (prev: PickemPrediction[]) => PickemPrediction[]) =>
    setOverrides((o) => ({ ...o, predictions: update(o.predictions ?? predictions) }));
  const setPicks = (update: (prev: ChampionPick[]) => ChampionPick[]) =>
    setOverrides((o) => ({ ...o, picks: update(o.picks ?? picks) }));

  // Ricostruito a ogni render: la demo è leggera e così le azioni locali
  // vedono sempre lo stato aggiornato.
  const value = ((): FantaContextType | null => {
    if (!base || !user || !pickem) return null;
    // Ogni funzione del contesto vero diventa un avviso, poi si
    // sostituiscono quelle che la demo sa simulare.
    const noWrites = Object.fromEntries(
      Object.entries(real).map(([key, v]) => [key, typeof v === "function" ? demoOnly : v]),
    ) as unknown as FantaContextType;
    const me = base.members[0];
    const nameOf = (userId: string, fallback?: string) =>
      base.members.find((m) => m.userId === userId)?.name || fallback || "Utente";
    return {
      ...noWrites,
      currentFanta: base.fanta,
      fantas: [base.fanta],
      isLoading: false,
      fantaMembers: base.members,
      currentMember: me,
      standings: base.standings,
      calendar: base.calendar,
      groups: base.groups,
      bracketRounds: base.bracketRounds,
      pickemBracket: pickem,
      pickemPredictions: predictions,
      championPicks: picks,
      championPickRounds: base.championPickRounds,
      isFantaAdmin: asAdmin,
      isFantaViceOrAdmin: asAdmin,
      getMemberName: nameOf,
      getTeamName: (userId: string) =>
        base.members.find((m) => m.userId === userId)?.teamName || "Squadra",
      getPlayersByUser: (userId: string) =>
        base.members.find((m) => m.userId === userId)?.team || [],
      getUserBudget: () => 415,
      getPickemPoints: (userId: string) => {
        const prediction = predictions.find((p) => p.userId === userId);
        if (!prediction) return 0;
        return pickem.rounds.reduce(
          (total, round) =>
            total +
            round.matches.filter((m) => m.winner && prediction.picks[m.id] === m.winner)
              .length *
              round.points,
          0,
        );
      },
      submitPickemPrediction: async (newPicks: Record<string, string>) => {
        setPredictions((prev) => [
          ...prev.filter((p) => p.userId !== user.id),
          { userId: user.id, picks: newPicks, submittedAt: new Date() },
        ]);
      },
      savePickemBracket: async (rounds) => {
        setPickem((prev) => ({ ...prev, rounds }));
      },
      setPickemLocked: async (locked: boolean) => {
        setPickem((prev) => ({ ...prev, locked }));
      },
      setPickemMatchWinner: async (roundIndex: number, matchId: string, winner: string) => {
        setPickem((prev) => ({
          ...prev,
          rounds: prev.rounds.map((r, i) =>
            i !== roundIndex
              ? r
              : {
                  ...r,
                  matches: r.matches.map((m) =>
                    m.id === matchId ? { ...m, winner, decidedAt: Date.now() } : m,
                  ),
                },
          ),
        }));
      },
      submitChampionPick: async (roundId: string, championName: string, banChampionName?: string) => {
        setPicks((prev) => [
          ...prev.filter((p) => !(p.roundId === roundId && p.userId === user.id)),
          {
            id: `${roundId}_${user.id}`,
            userId: user.id,
            roundId,
            championName,
            ...(banChampionName ? { banChampionName } : {}),
          },
        ]);
      },
    };
  })();

  if (!value) return null;

  const Page =
    tab === "standings" ? StandingsPage : tab === "pickem" ? PickemPage : ChampionPickPage;

  // Attivo: pieno blu (anche le varianti dark: del bottone outline, che
  // altrimenti restano sopra e lasciano testo scuro su fondo scuro).
  const pill = (active: boolean) =>
    active
      ? "border-info bg-info text-info-foreground hover:bg-info/90 dark:bg-info dark:hover:bg-info/90 hover:text-info-foreground"
      : "border-info/40 text-foreground hover:bg-info/10 dark:hover:bg-info/10";

  return (
    <div className="space-y-6">
      <Dialog open={introOpen} onOpenChange={setIntroOpen}>
        <DialogContent>
          <DialogHeader>
            <span className="w-fit rounded bg-info px-1.5 py-0.5 text-xs font-semibold text-info-foreground">
              DEMO
            </span>
            <DialogTitle>Questa è una demo</DialogTitle>
            <DialogDescription>
              Una lega Mondiali finta, con 7 avversari inventati, per capire
              come si gioca. Niente viene salvato e le tue leghe vere non
              vengono toccate.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              <span className="text-foreground">Fase</span>: passa da gironi a
              semifinali a finale per vedere come avanza il torneo.
            </li>
            <li>
              <span className="text-foreground">Vista</span>: membro per
              giocare, admin per vedere cosa deve fare chi organizza.
            </li>
            <li>
              Prova a pronosticare nel Pick&apos;em e a scegliere un campione
              nel Pick/Ban: sono i punti bonus che si sommano ai turni.
            </li>
          </ul>
          <DialogFooter>
            <Button
              className="bg-info text-info-foreground hover:bg-info/90"
              onClick={() => setIntroOpen(false)}
            >
              Ho capito, inizia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sempre visibile mentre si scorre: è una demo. */}
      <div className="pointer-events-none fixed bottom-4 left-4 z-40 rounded-full bg-info px-3 py-1 text-xs font-semibold text-info-foreground shadow-lg">
        MODALITÀ DEMO · niente viene salvato
      </div>

      <div className="space-y-3 rounded-lg border border-info/50 bg-info/10 p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-info px-1.5 py-0.5 text-xs font-semibold text-info-foreground">
              DEMO
            </span>
            <p className="font-semibold text-foreground">Fanta Mondiali/MSI di prova</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Lega finta per imparare a giocare. Pronostici e Pick/Ban cambiano
            solo questa demo; gli altri bottoni mostrano un avviso.{" "}
            <button
              type="button"
              className="text-info underline-offset-4 hover:underline"
              onClick={() => setIntroOpen(true)}
            >
              Come funziona
            </button>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-12 text-xs text-muted-foreground">Fase</span>
          {PHASES.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant="outline"
              className={pill(phase === p.id)}
              onClick={() => changePhase(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-12 text-xs text-muted-foreground">Vista</span>
          <Button size="sm" variant="outline" className={pill(!asAdmin)} onClick={() => changeView(false)}>
            Membro
          </Button>
          <Button size="sm" variant="outline" className={pill(asAdmin)} onClick={() => changeView(true)}>
            Admin
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-12 text-xs text-muted-foreground">Pagina</span>
          {TABS.map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant="outline"
              className={pill(tab === t.id)}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      <FantaContext.Provider value={value}>
        <Page />
      </FantaContext.Provider>
    </div>
  );
}
