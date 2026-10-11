"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Circle, CircleDot } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFanta } from "@/contexts/FantaContext";
import { bracketRoundName } from "@/lib/bracket";
import { buildPickBanRounds } from "@/lib/pickBanRounds";

// Percorso Mondiali per admin/vice (11/10): ogni passo per organizzare e
// seguire una lega WORLDS/MSI, con lo stato letto dai dati veri e la
// prossima azione. Prima i passi erano sparsi tra Gestione, Classifica e
// Pick'em senza un ordine, e a torneo in corso non c'era un posto dove
// vedere se tutto girava (ricalcolo, tabellone, Pick'em, Pick/Ban).

type StepState = "done" | "now" | "todo";

interface Step {
  title: string;
  detail: string;
  href?: string;
  action?: string;
  done: boolean;
}

const formatDateTime = (d: Date) =>
  d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export function WorldsAdminPanel() {
  const {
    currentFanta,
    fantaMembers,
    groups,
    calendar,
    bracketRounds,
    pickemBracket,
    pickemPredictions,
    championPickRounds,
  } = useFanta();
  // Ora fissata al montaggio: basta per stati che cambiano in giorni.
  const [now] = useState(() => Date.now());
  if (!currentFanta) return null;
  const settings = currentFanta.settings;

  const maxPlayers = settings.maxPlayersTotal || 0;
  const completeRosters = fantaMembers.filter((m) =>
    maxPlayers > 0 ? m.team.length >= maxPlayers : m.team.length > 0,
  ).length;

  const groupRounds = calendar.filter((r) => r.groupId);
  const totalGroupRounds = new Set(groupRounds.map((r) => r.roundNumber)).size;
  const currentGroupRound = groupRounds
    .filter((r) => r.startDate.getTime() <= now)
    .reduce((max, r) => Math.max(max, r.roundNumber), 0);
  const groupsEnd = groupRounds.length
    ? new Date(Math.max(...groupRounds.map((r) => r.endDate.getTime())))
    : undefined;

  const sortedBracket = [...bracketRounds].sort((a, b) => a.roundIndex - b.roundIndex);
  const lastBracket = sortedBracket[sortedBracket.length - 1];
  const champion =
    lastBracket?.matches.length === 1 ? lastBracket.matches[0].winnerUserId : undefined;
  const championName = champion
    ? fantaMembers.find((m) => m.userId === champion)?.name || "il vincitore"
    : undefined;

  const pickemMatches = pickemBracket?.rounds.flatMap((r) => r.matches) || [];
  const pickemDecided = pickemMatches.filter((m) => m.winner).length;

  const closedIds = new Set(championPickRounds.filter((r) => r.closed).map((r) => r.roundId));
  const pickBanToClose = buildPickBanRounds(calendar, bracketRounds).filter(
    // 6 ore di margine, come la chiusura automatica (functions/src/jobs.ts).
    (r) => now >= r.endDate.getTime() + 6 * 3600 * 1000 && !closedIds.has(r.id),
  ).length;

  const steps: Step[] = [
    {
      title: "Membri",
      detail: `${fantaMembers.length} nella lega. Gli altri entrano col link da Impostazioni → Inviti.`,
      href: "/dashboard/settings",
      action: "Inviti",
      done: fantaMembers.length >= 2,
    },
    {
      title: "Rose",
      detail:
        maxPlayers > 0
          ? `${completeRosters} su ${fantaMembers.length} complete (${maxPlayers} scelte a testa).${
              settings.seasonStarted && completeRosters < fantaMembers.length
                ? " Mercato chiuso: chi è incompleto gioca con meno scelte."
                : ""
            }`
          : `${completeRosters} su ${fantaMembers.length} con almeno una scelta.`,
      href: "/dashboard/auctions",
      action: "Aste",
      // A mercato chiuso le rose sono quelle che sono: non è più un passo
      // da fare, al massimo un avviso nel dettaglio.
      done:
        !!settings.seasonStarted ||
        (fantaMembers.length > 0 && completeRosters === fantaMembers.length),
    },
    {
      title: "Chiudi il mercato",
      detail: settings.seasonStarted
        ? "Mercato chiuso: le rose sono bloccate."
        : "Da Gestione → Avvia Stagione, quando le rose sono pronte.",
      href: "/dashboard/admin",
      action: "Gestione",
      done: !!settings.seasonStarted,
    },
    {
      title: "Gironi",
      detail:
        groups.length === 0
          ? 'Usa "Genera Gironi" qui sopra: numero di gruppi, date e quanti passano.'
          : currentGroupRound === 0
            ? `${groups.length} gruppi, ${totalGroupRounds} turni. Si parte il ${groupRounds[0]?.startDate.toLocaleDateString("it-IT")}.`
            : groupsEnd && now >= groupsEnd.getTime()
              ? `${groups.length} gruppi, finiti il ${groupsEnd.toLocaleDateString("it-IT")}.`
              : `${groups.length} gruppi, turno ${currentGroupRound} di ${totalGroupRounds}.`,
      done: groups.length > 0,
    },
    {
      title: "Tabellone",
      detail: championName
        ? `Finito: ha vinto ${championName}.`
        : lastBracket
          ? `In corso: ${bracketRoundName(lastBracket.matches.length, lastBracket.roundIndex)}. Ogni turno si chiude e il successivo si crea da solo.`
          : groupsEnd
            ? `Si genera da solo a fine gironi (dopo il ${groupsEnd.toLocaleDateString("it-IT")}), coi primi ${settings.qualifiersPerGroup || 2} di ogni gruppo. Puoi anche generarlo prima qui sopra.`
            : "Si genera da solo a fine gironi.",
      done: !!lastBracket,
    },
    {
      title: "Pick'em",
      detail: !pickemBracket || pickemMatches.length === 0
        ? "Crea il tabellone delle squadre vere da pronosticare."
        : !pickemBracket.locked
          ? `${pickemPredictions.length} su ${fantaMembers.length} hanno pronosticato. Bloccalo prima del primo match.`
          : `Bloccato. Risultati inseriti: ${pickemDecided} su ${pickemMatches.length}.`,
      href: "/dashboard/pickem",
      action: "Pick'em",
      done: !!pickemBracket?.locked,
    },
  ];

  const nowIndex = steps.findIndex((s) => !s.done);
  const stateOf = (i: number): StepState =>
    steps[i].done ? "done" : i === nowIndex ? "now" : "todo";

  const last = currentFanta.lastRecalculatedAt;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground">Percorso Mondiali</CardTitle>
        <CardDescription className="text-muted-foreground">
          Solo per admin e vice: cosa è fatto, cosa manca, cosa controllare.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-3">
          {steps.map((step, i) => {
            const state = stateOf(i);
            const Icon = state === "done" ? Check : state === "now" ? CircleDot : Circle;
            return (
              <li key={step.title} className="flex items-start gap-3">
                <Icon
                  className={`mt-0.5 size-4 shrink-0 ${
                    state === "done"
                      ? "text-success"
                      : state === "now"
                        ? "text-primary"
                        : "text-muted-foreground"
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium ${
                      state === "todo" ? "text-muted-foreground" : "text-foreground"
                    }`}
                  >
                    {step.title}
                    {state === "now" && (
                      <span className="ml-2 text-xs font-normal text-primary">da fare ora</span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">{step.detail}</p>
                </div>
                {step.href && (
                  <Link
                    href={step.href}
                    className="shrink-0 text-sm text-primary underline-offset-4 hover:underline"
                  >
                    {step.action}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
        <div className="space-y-1 border-t border-border pt-3 text-sm text-muted-foreground">
          <p>
            Punti aggiornati:{" "}
            <span className="text-foreground">{last ? formatDateTime(last) : "mai"}</span>.
            Il ricalcolo gira da solo alle 6:10 e alle 18:10.
          </p>
          {pickBanToClose > 0 && (
            <p>
              Pick/Ban: {pickBanToClose} turni finiti ancora da chiudere. Si chiudono
              da soli al prossimo ricalcolo, o a mano dalla pagina{" "}
              <Link href="/dashboard/championpick" className="text-primary underline-offset-4 hover:underline">
                Pick/Ban
              </Link>
              .
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
