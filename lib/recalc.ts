import { DEFAULT_TEAM_SCORING_WEIGHTS, toLolRole } from "@/lib/constants";
import { isRoundComplete, nextRoundFromWinners } from "@/lib/bracket";
import {
  getChampionGamesInRange,
  getFantasyPlayerStats,
  getFantasyTeamStats,
} from "@/lib/leaguepediaApi";
import {
  findLeagueId,
  getGamePlayerStats,
  getTeamGameIdsInRange,
  stripTeamTagFromSummonerName,
} from "@/lib/lolesportsApi";
import {
  computeAutoPoints,
  computeLolesportsBonusPoints,
  totalPickPoints,
} from "@/lib/scoring";
import { computeChampionPickResults } from "@/lib/championPickScoring";
import type {
  BracketMatch,
  BracketRound,
  CalendarRound,
  Fanta,
  FantaMember,
  RoleScoringWeights,
} from "@/types";

// Motore di ricalcolo condiviso (9/10). Prima viveva dentro FantaContext e
// girava solo nel browser di un admin che premeva "Ricalcola". Ora è puro
// rispetto a Firestore: legge dati già caricati, chiama Leaguepedia e
// lolesports (via lib/apiTransport) e restituisce l'elenco delle scritture
// da fare. Il client le applica con l'SDK web (FantaContext), le Cloud
// Functions con l'SDK admin (functions/src/index.ts): un solo calcolo,
// niente due versioni che divergono.

export type WriteOp =
  | { type: "update"; path: string[]; data: Record<string, unknown> }
  | { type: "set"; path: string[]; data: Record<string, unknown> }
  | { type: "create"; collectionPath: string[]; data: Record<string, unknown> };

// CS + proxy Vision Score (wardsPlaced+wardsDestroyed, vedi
// lib/lolesportsApi.ts) di un turno, per membro. Si sommano SOLO ai punti di
// un turno (calendario o bracket, finestra di date nota): lolesports non
// supporta una query diretta "tutte le partite di sempre" come il Cargo.
export async function computeLolesportsRoundBonuses(
  involvedUserIds: string[],
  dateRange: { start: Date; end: Date },
  leagueId: string | null,
  roleWeights: RoleScoringWeights,
  members: FantaMember[],
): Promise<Map<string, number>> {
  const bonuses = new Map<string, number>();
  if (!leagueId) return bonuses;

  const picksByTeam = new Map<
    string,
    { userId: string; playerName: string; playerRole?: string }[]
  >();
  involvedUserIds.forEach((uid) => {
    const member = members.find((m) => m.userId === uid);
    member?.team.forEach((pick) => {
      if ((pick.pickType === "player" || pick.pickType === "jolly") && pick.playerTeam) {
        const list = picksByTeam.get(pick.playerTeam) || [];
        list.push({ userId: uid, playerName: pick.playerName, playerRole: pick.playerRole });
        picksByTeam.set(pick.playerTeam, list);
      }
    });
  });

  const teamNames = Array.from(picksByTeam.keys());
  if (teamNames.length === 0) return bonuses;

  const gameIds = await getTeamGameIdsInRange(leagueId, teamNames, dateRange);
  if (gameIds.length === 0) return bonuses;

  const gamesStats = await Promise.all(gameIds.map((id) => getGamePlayerStats(id)));

  const statsByStrippedName = new Map<
    string,
    { creepScore: number; wardsPlaced: number; wardsDestroyed: number }
  >();
  gamesStats.flat().forEach((p) => {
    const name = stripTeamTagFromSummonerName(p.summonerName).trim().toLowerCase();
    const prev = statsByStrippedName.get(name) || {
      creepScore: 0,
      wardsPlaced: 0,
      wardsDestroyed: 0,
    };
    statsByStrippedName.set(name, {
      creepScore: prev.creepScore + p.creepScore,
      wardsPlaced: prev.wardsPlaced + p.wardsPlaced,
      wardsDestroyed: prev.wardsDestroyed + p.wardsDestroyed,
    });
  });

  picksByTeam.forEach((picks) => {
    picks.forEach(({ userId, playerName, playerRole }) => {
      const role = toLolRole(playerRole);
      const weights = role ? roleWeights[role] : undefined;
      const stats = statsByStrippedName.get(playerName.trim().toLowerCase());
      if (!weights || !stats) return;
      const points = computeLolesportsBonusPoints(stats, weights);
      bonuses.set(userId, (bonuses.get(userId) || 0) + points);
    });
  });

  return bonuses;
}

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
  now?: number;
}

// Ricalcola i punti fantasy di ogni pick in rosa dalle statistiche reali
// Leaguepedia (kill/morti/assist/vittorie per player/jolly, sole vittorie
// per team/coach), pesati con gli scoringWeights della lega — uno per ruolo
// — più un set separato (teamScoringWeights) per team/coach. Poi i punti di
// ogni turno di calendario (confronto diretto) e del tabellone a
// eliminazione, con avanzamento automatico al turno successivo.
// Obiettivi di squadra/CS-oro team/pentakill/ban restano NON calcolati
// automaticamente: vedi ScoringWeights/TeamScoringWeights in types/.
// Se Leaguepedia non risponde lancia LEAGUEPEDIA_UNAVAILABLE prima di
// produrre qualunque scrittura (vedi cargoQuery strict).
export async function computeScoreWrites(input: ScoreRecalcInput): Promise<WriteOp[]> {
  const { fanta, members, calendar, bracketRounds } = input;
  const now = input.now ?? Date.now();
  const writes: WriteOp[] = [];
  const circuitType = fanta.settings.circuitType;
  if (!circuitType) return writes;
  const roleWeights = fanta.settings.scoringWeights || {};
  const teamWeights = fanta.settings.teamScoringWeights || DEFAULT_TEAM_SCORING_WEIGHTS;
  // null per i circuiti senza corrispondente lolesports (es. "ALTRO"): i
  // bonus CS/wards restano 0, senza errori.
  const leagueId = await findLeagueId(circuitType);

  // 1. Punti cumulativi di ogni pick in rosa.
  const allNames = namesForMembers(
    members.map((m) => m.userId),
    members,
  );
  const [playerStats, teamStats] = await Promise.all([
    getFantasyPlayerStats(allNames.players, circuitType),
    getFantasyTeamStats(allNames.teams, circuitType),
  ]);

  members.forEach((m) => {
    let changed = false;
    const updatedTeam = m.team.map((pick) => {
      const points = computeAutoPoints(pick, playerStats, teamStats, roleWeights, teamWeights);
      if (points === undefined) return pick;
      const rounded = Math.round(points * 100) / 100;
      if (rounded !== pick.points) changed = true;
      return { ...pick, points: rounded };
    });
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
    const [roundPlayerStats, roundTeamStats, lolesportsBonuses] = await Promise.all([
      getFantasyPlayerStats(names.players, circuitType, dateRange),
      getFantasyTeamStats(names.teams, circuitType, dateRange),
      computeLolesportsRoundBonuses(involvedUserIds, dateRange, leagueId, roleWeights, members),
    ]);
    return (userId: string) => {
      const member = members.find((m) => m.userId === userId);
      if (!member) return 0;
      const autoPoints = member.team.reduce((sum, pick) => {
        const points = computeAutoPoints(
          pick,
          roundPlayerStats,
          roundTeamStats,
          roleWeights,
          teamWeights,
        );
        return sum + (points || 0);
      }, 0);
      return autoPoints + (lolesportsBonuses.get(userId) || 0);
    };
  };

  // 2. Calendario a girone: punti di ogni fixture nella finestra del turno.
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

    if (roundChanged) {
      writes.push({
        type: "update",
        path: ["fantas", fanta.id, "calendar", round.id],
        data: { fixtures: updatedFixtures },
      });
    }
  }

  // 3. Tabellone a eliminazione (fase 2, solo WORLDS/MSI). Quando un turno
  // è completamente deciso e il successivo non esiste ancora, lo genera
  // accoppiando i vincitori (vedi lib/bracket.ts).
  if (bracketRounds.length > 0) {
    // Spareggio dei pareggi: punti totali in stagione dalla rosa (stessa
    // somma mostrata in Classifica, totalPickPoints).
    const memberSeasonPoints = (userId: string): number => {
      const member = members.find((m) => m.userId === userId);
      if (!member) return 0;
      return member.team.reduce(
        (sum, pick) => sum + totalPickPoints(pick, roleWeights, teamWeights),
        0,
      );
    };
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
  round: CalendarRound;
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
