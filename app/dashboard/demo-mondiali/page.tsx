"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { FantaContext, useFanta, type FantaContextType } from "@/contexts/FantaContext";
import { buildDemoWorlds, type DemoPhase } from "@/lib/demoWorlds";
import StandingsPage from "@/app/dashboard/standings/page";
import PickemPage from "@/app/dashboard/pickem/page";
import ChampionPickPage from "@/app/dashboard/championpick/page";
import type { ChampionPick, PickemBracket, PickemPrediction } from "@/types";

// Modalità demo Mondiali, solo developer (11/10). Le pagine vere di
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
  const router = useRouter();
  const { user, isPreviewingAsNonDeveloper } = useAuth();
  const real = useFanta();
  const isDeveloper = !!user?.isDeveloper && !isPreviewingAsNonDeveloper;

  useEffect(() => {
    if (user && !isDeveloper) router.push("/dashboard");
  }, [user, isDeveloper, router]);

  const [phase, setPhase] = useState<DemoPhase>("tabellone");
  const [asAdmin, setAsAdmin] = useState(true);
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

  if (!isDeveloper || !value) return null;

  const Page =
    tab === "standings" ? StandingsPage : tab === "pickem" ? PickemPage : ChampionPickPage;

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-lg border border-dashed border-primary/60 bg-primary/5 p-4">
        <div>
          <p className="font-semibold text-foreground">Demo Mondiali (solo developer)</p>
          <p className="text-sm text-muted-foreground">
            Lega finta, pagine vere. Niente viene salvato: pronostici, Pick/Ban,
            blocco e risultati del Pick&apos;em cambiano solo questa demo, il
            resto mostra un avviso.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PHASES.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={phase === p.id ? "default" : "outline"}
              onClick={() => changePhase(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={asAdmin ? "default" : "outline"} onClick={() => changeView(true)}>
            Vista admin
          </Button>
          <Button size="sm" variant={!asAdmin ? "default" : "outline"} onClick={() => changeView(false)}>
            Vista membro
          </Button>
          <span className="mx-1 hidden w-px bg-border sm:block" />
          {TABS.map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant={tab === t.id ? "secondary" : "ghost"}
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
