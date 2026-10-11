import { DEFAULT_TEAM_SCORING_WEIGHTS } from "@/lib/constants";
import {
  isRoundComplete,
  nextRoundFromWinners,
  seedFirstRound,
  seedsFromGroups,
} from "@/lib/bracket";
import {
  getChampionGamesInRange,
  getFantasyPlayerStats,
  getFantasyTeamStats,
} from "@/lib/leaguepediaApi";
import { autoGamesPlayed, computeAutoPoints, totalPickPoints } from "@/lib/scoring";
import { computeChampionPickResults } from "@/lib/championPickScoring";
import type {
  BracketMatch,
  BracketRound,
  CalendarRound,
  Fanta,
  FantaGroup,
  FantaMember,
} from "@/types";

// Motore di ricalcolo condiviso (9/10). Prima viveva dentro FantaContext e
// girava solo nel browser di un admin che premeva "Ricalcola". Ora è puro
// rispetto a Firestore: legge dati già caricati, chiama Leaguepedia (via
// lib/apiTransport) e restituisce l'elenco delle scritture
// da fare. Il client le applica con l'SDK web (FantaContext), le Cloud
// Functions con l'SDK admin (functions/src/index.ts): un solo calcolo,
// niente due versioni che divergono.

export type WriteOp =
  | { type: "update"; path: string[]; data: Record<string, unknown> }
  | { type: "set"; path: string[]; data: Record<string, unknown> }
  | { type: "create"; collectionPath: string[]; data: Record<string, unknown> };

function namesForMembers(
  userIds: string[],
  members: FantaMember[],
): { players: string[]; teams: string[] } {
  const players = new Set<string>();
  const teams = new Set<string>();
  userIds.forEach((uid) => {
    const member = members.find((m) => m.userId === uid);
    member?.team.forEach((pick) => {
      if (pick.pickType === "player" || pick.pickType === "jolly") {
        players.add(pick.playerName);
      } else if (pick.pickType === "team") {
        teams.add(pick.playerName);
      } else if (pick.pickType === "coach" && pick.playerTeam) {
        teams.add(pick.playerTeam);
      }
    });
  });
  return { players: Array.from(players), teams: Array.from(teams) };
}

export interface ScoreRecalcInput {
  fanta: Fanta;
  members: FantaMember[];
  calendar: CalendarRound[];
  bracketRounds: BracketRound[];
  // Gironi di WORLDS/MSI: servono per generare da soli il tabellone a
  // fine gironi. Assenti = nessuna generazione automatica.
  groups?: FantaGroup[];
  now?: number;
}

// Ricalcola i punti fantasy di ogni pick in rosa dalle statistiche reali
// Leaguepedia (player/jolly: kill/morti/assist/vittorie/CS/Vision Score/
// pentakill; team/coach: vittorie e obiettivi), pesati con gli
// scoringWeights della lega — uno per ruolo — più un set separato
// (teamScoringWeights) per team/coach. Poi i punti di ogni turno di
// calendario (confronto diretto) e del tabellone a eliminazione, con
// avanzamento automatico al turno successivo. Nelle leghe WORLDS/MSI, a
// gironi finiti, genera anche il primo turno del tabellone (11/10: prima
// serviva che un admin se ne ricordasse e premesse il bottone).
// Se Leaguepedia non risponde lancia LEAGUEPEDIA_UNAVAILABLE prima di
// produrre qualunque scrittura (vedi cargoQuery strict).
export async function computeScoreWrites(input: ScoreRecalcInput): Promise<WriteOp[]> {
  const { fanta, members, calendar, bracketRounds } = input;
  const groups = input.groups || [];
  const now = input.now ?? Date.now();
  const writes: WriteOp[] = [];
  const circuitType = fanta.settings.circuitType;
  if (!circuitType) return writes;
  const roleWeights = fanta.settings.scoringWeights || {};
  const teamWeights = fanta.settings.teamScoringWeights || DEFAULT_TEAM_SCORING_WEIGHTS;
  // Assist e CS di squadra richiedono una query in più su
  // ScoreboardPlayers: solo se la lega dà loro un peso.
  const teamOptions = {
    includePlayerTotals: teamWeights.assist !== 0 || teamWeights.csPer100 !== 0,
  };

  // 1. Punti cumulativi di ogni pick in rosa.
  const allNames = namesForMembers(
    members.map((m) => m.userId),
    members,
  );
  const [playerStats, teamStats] = await Promise.all([
    getFantasyPlayerStats(allNames.players, circuitType),
    getFantasyTeamStats(allNames.teams, circuitType, undefined, teamOptions),
  ]);

  // Rose coi punti appena ricalcolati: servono agli spareggi più sotto.
  const updatedTeams = new Map<string, FantaMember["team"]>();
  members.forEach((m) => {
    let changed = false;
    const updatedTeam = m.team.map((pick) => {
      const points = computeAutoPoints(pick, playerStats, teamStats, roleWeights, teamWeights);
      if (points === undefined) return pick;
      const rounded = Math.round(points * 100) / 100;
      const autoGames = autoGamesPlayed(pick, playerStats, teamStats);
      if (rounded !== pick.points || autoGames !== pick.autoGames) changed = true;
      return { ...pick, points: rounded, autoGames };
    });
    updatedTeams.set(m.userId, updatedTeam);
    if (changed) {
      writes.push({
        type: "update",
        path: ["fantas", fanta.id, "members", m.userId],
        data: { team: updatedTeam },
      });
    }
  });

  // Punti di un insieme di membri in una finestra di date (turno).
  const roundPointsFor = async (
    involvedUserIds: string[],
    dateRange: { start: Date; end: Date },
  ): Promise<(userId: string) => number> => {
    const names = namesForMembers(involvedUserIds, members);
    const [roundPlayerStats, roundTeamStats] = await Promise.all([
      getFantasyPlayerStats(names.players, circuitType, dateRange),
      getFantasyTeamStats(names.teams, circuitType, dateRange, teamOptions),
    ]);
    return (userId: string) => {
      const member = members.find((m) => m.userId === userId);
      if (!member) return 0;
      return member.team.reduce((sum, pick) => {
        const points = computeAutoPoints(
          pick,
          roundPlayerStats,
          roundTeamStats,
          roleWeights,
          teamWeights,
        );
        return sum + (points || 0);
      }, 0);
    };
  };

  // Punti totali in stagione dalla rosa aggiornata (stessa somma della
  // Classifica, totalPickPoints): spareggio di gironi e tabellone.
  const memberSeasonPoints = (userId: string): number => {
    const team = updatedTeams.get(userId) || [];
    return team.reduce((sum, pick) => sum + totalPickPoints(pick, roleWeights, teamWeights), 0);
  };

  // 2. Calendario a girone: punti di ogni fixture nella finestra del turno.
  const updatedCalendar: CalendarRound[] = [];
  for (const round of calendar) {
    const involvedUserIds = Array.from(
      new Set(
        round.fixtures.flatMap((f) =>
          [f.homeUserId, f.awayUserId].filter((id): id is string => !!id),
        ),
      ),
    );
    const pointsOf = await roundPointsFor(involvedUserIds, {
      start: round.startDate,
      end: round.endDate,
    });

    let roundChanged = false;
    const updatedFixtures = round.fixtures.map((f) => {
      const homePoints = Math.round(pointsOf(f.homeUserId) * 100) / 100;
      const awayPoints = f.awayUserId
        ? Math.round(pointsOf(f.awayUserId) * 100) / 100
        : undefined;
      if (homePoints !== f.homePoints || awayPoints !== f.awayPoints) {
        roundChanged = true;
      }
      // awayPoints omesso (non undefined) sul turno di riposo.
      return {
        ...f,
        homePoints,
        ...(awayPoints !== undefined ? { awayPoints } : {}),
      };
    });

    updatedCalendar.push({ ...round, fixtures: updatedFixtures });
    if (roundChanged) {
      writes.push({
        type: "update",
        path: ["fantas", fanta.id, "calendar", round.id],
        data: { fixtures: updatedFixtures },
      });
    }
  }

  // 2b. Fine gironi (WORLDS/MSI): se tutti i turni dei gironi sono finiti e
  // il tabellone non esiste ancora, lo genera coi qualificati (stessi
  // criteri e seeding del bottone "Genera Fase Eliminazione"). Id fisso
  // "auto-r0": due ricalcoli insieme (bottone e job) scrivono lo stesso
  // documento invece di creare due tabelloni.
  const groupRounds = updatedCalendar.filter((r) => r.groupId);
  if (
    groups.length > 0 &&
    bracketRounds.length === 0 &&
    groupRounds.length > 0 &&
    groupRounds.every((r) => now >= r.endDate.getTime())
  ) {
    const seasonPoints = new Map(members.map((m) => [m.userId, memberSeasonPoints(m.userId)]));
    const seeds = seedsFromGroups(
      groups,
      updatedCalendar,
      seasonPoints,
      fanta.settings.qualifiersPerGroup || 2,
    );
    if (seeds.length >= 2) {
      const start = new Date(Math.max(...groupRounds.map((r) => r.endDate.getTime())));
      const last = groupRounds[groupRounds.length - 1];
      const groupRoundDays = Math.round(
        (last.endDate.getTime() - last.startDate.getTime()) / 86400000,
      );
      const lengthDays = fanta.settings.bracketRoundLengthDays || groupRoundDays || 7;
      writes.push({
        type: "set",
        path: ["fantas", fanta.id, "bracket", "auto-r0"],
        data: {
          roundIndex: 0,
          matches: seedFirstRound(seeds),
          startDate: start,
          endDate: new Date(start.getTime() + lengthDays * 86400000),
        },
      });
    }
  }

  // 3. Tabellone a eliminazione (fase 2, solo WORLDS/MSI). Quando un turno
  // è completamente deciso e il successivo non esiste ancora, lo genera
  // accoppiando i vincitori (vedi lib/bracket.ts).
  if (bracketRounds.length > 0) {
    const sortedRounds = [...bracketRounds].sort((a, b) => a.roundIndex - b.roundIndex);

    for (const round of sortedRounds) {
      const involvedUserIds = Array.from(
        new Set(
          round.matches.flatMap((m) =>
            [m.homeUserId, m.awayUserId].filter((id): id is string => !!id),
          ),
        ),
      );
      const pointsOf = await roundPointsFor(involvedUserIds, {
        start: round.startDate,
        end: round.endDate,
      });

      // Il vincitore si decide solo a turno finito: un ricalcolo a metà
      // turno fissava per sempre chi era avanti in quel momento.
      const roundEnded = now >= round.endDate.getTime();

      let roundChanged = false;
      const updatedMatches: BracketMatch[] = round.matches.map((match) => {
        // Già deciso (bye, o turno finito e già calcolato) oppure ancora
        // TBD in attesa del turno precedente.
        if (match.winnerUserId || !match.homeUserId || !match.awayUserId) {
          return match;
        }
        const homePoints = Math.round(pointsOf(match.homeUserId) * 100) / 100;
        const awayPoints = Math.round(pointsOf(match.awayUserId) * 100) / 100;
        // Pareggio a turno finito: passa chi ha più punti cumulativi in
        // stagione, poi il seed migliore (home).
        const winnerUserId = !roundEnded
          ? undefined
          : homePoints > awayPoints
            ? match.homeUserId
            : awayPoints > homePoints
              ? match.awayUserId
              : memberSeasonPoints(match.awayUserId) > memberSeasonPoints(match.homeUserId)
                ? match.awayUserId
                : match.homeUserId;
        if (
          homePoints !== match.homePoints ||
          awayPoints !== match.awayPoints ||
          winnerUserId !== match.winnerUserId
        ) {
          roundChanged = true;
        }
        return {
          ...match,
          homePoints,
          awayPoints,
          ...(winnerUserId ? { winnerUserId } : {}),
        };
      });

      if (roundChanged) {
        writes.push({
          type: "update",
          path: ["fantas", fanta.id, "bracket", round.id],
          data: { matches: updatedMatches },
        });
      }

      const nextRoundExists = sortedRounds.some((r) => r.roundIndex === round.roundIndex + 1);
      if (!nextRoundExists && isRoundComplete(updatedMatches)) {
        const nextMatches = nextRoundFromWinners(updatedMatches);
        if (nextMatches.length > 0) {
          const lengthDays = fanta.settings.bracketRoundLengthDays || 7;
          const nextStart = round.endDate;
          writes.push({
            type: "create",
            collectionPath: ["fantas", fanta.id, "bracket"],
            data: {
              roundIndex: round.roundIndex + 1,
              matches: nextMatches,
              startDate: nextStart,
              endDate: new Date(nextStart.getTime() + lengthDays * 86400000),
            },
          });
        }
      }
    }
  }

  // Ora dell'ultimo ricalcolo, mostrata ad admin e membri ("punti
  // aggiornati alle ..."): così si vede subito se il ricalcolo gira.
  writes.push({
    type: "update",
    path: ["fantas", fanta.id],
    data: { lastRecalculatedAt: new Date(now) },
  });

  return writes;
}

export interface ChampionPickDoc {
  id: string;
  userId: string;
  championName: string;
  banChampionName?: string;
}

// Punti di un turno Pick/Ban (vedi lib/championPickScoring.ts) e "revealed"
// su ogni pick, che lo rende visibile agli altri (firestore.rules).
// Nessuna partita trovata: lancia NO_GAMES, a meno di allowEmpty (usato dal
// ricalcolo automatico quando un turno è finito da giorni senza partite:
// settimana senza match, 0 punti a tutti invece di un turno mai chiuso).
export async function computeChampionPickWrites(input: {
  fantaId: string;
  circuitType: string;
  round: { startDate: Date; endDate: Date };
  picks: ChampionPickDoc[];
  members: FantaMember[];
  allowEmpty?: boolean;
}): Promise<WriteOp[]> {
  const { fantaId, circuitType, round, picks, members } = input;
  if (picks.length === 0) return [];

  const games = await getChampionGamesInRange(circuitType, {
    start: round.startDate,
    end: round.endDate,
  });
  if (games.length === 0 && !input.allowEmpty) {
    throw new Error("NO_GAMES");
  }

  // Squadra pro in rosa di ogni membro, per valutare il ban sulla sua
  // squadra (ripiego sul circuito se non ce l'ha o se non ha giocato).
  const memberTeams: Record<string, string | undefined> = {};
  members.forEach((m) => {
    memberTeams[m.userId] = m.team?.find((t) => t.pickType === "team")?.playerName;
  });

  const results = computeChampionPickResults(picks, games, memberTeams);
  return picks.map((p) => ({
    type: "update" as const,
    path: ["fantas", fantaId, "championPicks", p.id],
    data: { ...results[p.id], revealed: true },
  }));
}
