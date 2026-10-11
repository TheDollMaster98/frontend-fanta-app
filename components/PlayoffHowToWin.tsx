"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { bracketRoundName, rankGroupMembers } from "@/lib/bracket";
import type { BracketRound, CalendarRound, FantaGroup } from "@/types";

// "Come si vince" per le leghe Mondiali/MSI (11/10). Feedback del gruppo:
// gironi e tabellone non si capivano, soprattutto la parte a eliminazione,
// e non era chiaro come si vince. Qui: le regole in tre passi, dove siamo
// adesso, e la situazione di chi guarda, calcolate dagli stessi dati della
// Classifica (rankGroupMembers, bracket).

interface Props {
  userId?: string;
  // Azioni del membro ancora da fare (Pick/Ban, Pick'em), calcolate dalla
  // pagina: qui solo mostrate.
  todos?: { label: string; href: string }[];
  lastRecalculatedAt?: Date;
  groups: FantaGroup[];
  calendar: CalendarRound[];
  bracketRounds: BracketRound[];
  qualifiersPerGroup: number;
  cumulativePoints: Map<string, number>;
  getMemberName: (userId: string) => string;
}

function phaseAndStatus({
  userId,
  groups,
  calendar,
  bracketRounds,
  qualifiersPerGroup,
  cumulativePoints,
  getMemberName,
}: Props): { phase: string; mine?: string } {
  if (groups.length === 0) {
    return { phase: "Non ancora iniziata: l'admin deve generare i gironi." };
  }

  const rounds = [...bracketRounds].sort((a, b) => a.roundIndex - b.roundIndex);
  if (rounds.length === 0) {
    const groupRounds = calendar.filter((r) => r.groupId);
    const total = new Set(groupRounds.map((r) => r.roundNumber)).size;
    const now = Date.now();
    const current = groupRounds
      .filter((r) => r.startDate.getTime() <= now)
      .reduce((max, r) => Math.max(max, r.roundNumber), 0);
    const phase =
      current === 0
        ? `Fase a gironi, parte il ${groupRounds[0]?.startDate.toLocaleDateString("it-IT") ?? "-"}.`
        : current >= total && groupRounds.every((r) => r.endDate.getTime() <= now)
          ? "Gironi finiti: si aspetta che l'admin generi il tabellone."
          : `Fase a gironi, turno ${current} di ${total}.`;
    const myGroup = userId ? groups.find((g) => g.memberIds.includes(userId)) : undefined;
    if (!myGroup || !userId) return { phase };
    const position = rankGroupMembers(myGroup, calendar, cumulativePoints).indexOf(userId) + 1;
    return {
      phase,
      mine:
        position <= qualifiersPerGroup
          ? `${myGroup.name}, ${position}° posto: oggi saresti qualificato.`
          : `${myGroup.name}, ${position}° posto: oggi saresti fuori (passano i primi ${qualifiersPerGroup}).`,
    };
  }

  const last = rounds[rounds.length - 1];
  const final = last.matches.length === 1 ? last.matches[0] : undefined;
  if (final?.winnerUserId) {
    return {
      phase: `Finita. Ha vinto ${getMemberName(final.winnerUserId)}.`,
      mine:
        userId && final.winnerUserId === userId ? "Hai vinto la lega." : undefined,
    };
  }

  const phase = `Tabellone: ${bracketRoundName(last.matches.length, last.roundIndex)}.`;
  if (!userId) return { phase };
  const inBracket = rounds[0].matches.some(
    (m) => m.homeUserId === userId || m.awayUserId === userId,
  );
  if (!inBracket) return { phase, mine: "Non ti sei qualificato dai gironi." };
  for (const round of rounds) {
    const match: BracketRound["matches"][number] | undefined = round.matches.find(
      (m) => m.homeUserId === userId || m.awayUserId === userId,
    );
    if (match?.winnerUserId && match.winnerUserId !== userId) {
      return {
        phase,
        mine: `Eliminato ai ${bracketRoundName(round.matches.length, round.roundIndex).toLowerCase()}.`,
      };
    }
  }
  const myMatch = last.matches.find((m) => m.homeUserId === userId || m.awayUserId === userId);
  const opponent = myMatch
    ? myMatch.homeUserId === userId
      ? myMatch.awayUserId
      : myMatch.homeUserId
    : null;
  return {
    phase,
    mine: opponent
      ? `Sei ancora in corsa: ora sfidi ${getMemberName(opponent)}.`
      : "Sei ancora in corsa.",
  };
}

export function PlayoffHowToWin(props: Props) {
  const { phase, mine } = phaseAndStatus(props);
  const todos = props.todos || [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground">Come si vince</CardTitle>
        <CardDescription className="text-muted-foreground">{phase}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {mine && <p className="font-medium text-foreground">{mine}</p>}
        {todos.length > 0 && (
          <div className="space-y-1 rounded-md border border-primary/40 bg-primary/5 p-3">
            <p className="font-medium text-foreground">Da fare ora</p>
            <ul className="space-y-1">
              {todos.map((todo) => (
                <li key={todo.href}>
                  <Link
                    href={todo.href}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {todo.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ol className="space-y-3">
          <li>
            <p className="font-medium text-foreground">1. Gironi</p>
            <p className="text-muted-foreground">
              Sei in un gruppo. Ogni turno sfidi un altro del gruppo: vince
              chi fa più punti fantasy in quei giorni, cioè i punti dei tuoi
              giocatori nelle partite vere giocate nel turno. Nel girone
              conta prima il numero di vittorie, poi i punti fatti.
            </p>
          </li>
          <li>
            <p className="font-medium text-foreground">2. Tabellone</p>
            <p className="text-muted-foreground">
              Passano i primi {props.qualifiersPerGroup} di ogni gruppo. Da
              qui è a eliminazione diretta: stessa sfida a punti, chi perde è
              fuori, chi vince passa al turno dopo. In caso di pareggio passa
              chi ha più punti in tutta la stagione.
            </p>
          </li>
          <li>
            <p className="font-medium text-foreground">3. Finale</p>
            <p className="text-muted-foreground">
              Chi vince la finale vince la lega.
            </p>
          </li>
        </ol>
        <p className="text-muted-foreground">
          Pick&apos;em e Pick/Ban hanno classifiche a parte: non cambiano chi
          vince la lega.
        </p>
        <p className="text-xs text-muted-foreground">
          Punti aggiornati:{" "}
          {props.lastRecalculatedAt
            ? props.lastRecalculatedAt.toLocaleString("it-IT", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "non ancora"}
          . Si aggiornano da soli due volte al giorno (6:10 e 18:10).
        </p>
      </CardContent>
    </Card>
  );
}
