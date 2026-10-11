import { DEFAULT_FANTA_SETTINGS } from "@/lib/constants";
import { nextRoundFromWinners, seedFirstRound, seedsFromGroups } from "@/lib/bracket";
import { buildPickBanRounds } from "@/lib/pickBanRounds";
import { standardPickemRounds } from "@/lib/pickem";
import type {
  BracketMatch,
  BracketRound,
  CalendarRound,
  ChampionPick,
  ChampionPickRoundState,
  Fanta,
  FantaGroup,
  PickemBracket,
  PickemPrediction,
  RoundFixture,
  TeamPick,
} from "@/types";
import type { FantaMemberProfile, StandingsEntry } from "@/contexts/FantaContext";

// Lega Mondiali finta per la modalità demo dei developer (11/10): stessi
// tipi dei dati veri, così le pagine vere (Classifica, Pick'em, Pick/Ban)
// si possono guardare in ogni fase del torneo senza una lega reale e senza
// scrivere niente su Firestore. Numeri deterministici: stessa fase, stessa
// schermata, utile per confrontare prima/dopo una modifica.

export type DemoPhase = "gironi" | "tabellone" | "finita";

export interface DemoWorldsData {
  fanta: Fanta;
  members: FantaMemberProfile[];
  standings: StandingsEntry[];
  groups: FantaGroup[];
  calendar: CalendarRound[];
  bracketRounds: BracketRound[];
  pickemBracket: PickemBracket;
  pickemPredictions: PickemPrediction[];
  championPicks: ChampionPick[];
  championPickRounds: ChampionPickRoundState[];
}

export const DEMO_FANTA_ID = "demo-mondiali";
const DAY = 86400000;

const OTHERS = [
  ["Anna Riva", "Lupi"],
  ["Teo Bassi", "Nebbia"],
  ["Ivo Conti", "Rift Kings"],
  ["Lia Ferri", "Gank Bros"],
  ["Ugo Neri", "Baroni"],
  ["Rita Galli", "Tilt Squad"],
  ["Nico Moro", "Zero Flash"],
];
const PRO_TEAMS = ["T1", "Gen.G", "BLG", "HLE", "G2 Esports", "FlyQuest", "TES", "Anyone's Legend"];
const PLAYERS: [string, string][] = [
  ["Faker", "Mid Laner"], ["Chovy", "Mid Laner"], ["Zeus", "Top Laner"], ["Kiin", "Top Laner"],
  ["Canyon", "Jungler"], ["Peanut", "Jungler"], ["Gumayusi", "ADC"], ["Ruler", "ADC"],
  ["Keria", "Support"], ["Duro", "Support"], ["Caps", "Mid Laner"], ["Elk", "ADC"],
  ["Knight", "Mid Laner"], ["Bin", "Top Laner"], ["Xun", "Jungler"], ["ON", "Support"],
];
const CHAMPIONS = ["Azir", "Rell", "Vi", "Kai'Sa", "Aurora", "Skarner", "Yone", "Corki"];

// Numeri finti ma stabili.
const score = (seed: number) => 40 + ((seed * 37) % 45);

export function buildDemoWorlds(
  phase: DemoPhase,
  viewer: { userId: string; name: string; email: string },
  viewerIsAdmin: boolean,
  now: number,
): DemoWorldsData {
  const ids = [viewer.userId, ...OTHERS.map((_, i) => `demo-u${i + 1}`)];
  const names = [viewer.name, ...OTHERS.map((o) => o[0])];
  const teamNames = ["La tua squadra", ...OTHERS.map((o) => o[1])];

  const members: FantaMemberProfile[] = ids.map((userId, i) => {
    const team: TeamPick[] = [
      {
        id: `t${i}`,
        pickType: "team",
        playerName: PRO_TEAMS[i],
        purchasePrice: 30,
        acquiredAt: new Date(now - 30 * DAY),
        points: score(i + 3) / 2,
        autoGames: 9,
      },
      ...[0, 1].map((k) => {
        const [playerName, playerRole] = PLAYERS[(i * 2 + k) % PLAYERS.length];
        return {
          id: `p${i}${k}`,
          pickType: "player" as const,
          playerName,
          playerRole,
          playerTeam: PRO_TEAMS[(i + k) % PRO_TEAMS.length],
          purchasePrice: 20 + k * 15,
          acquiredAt: new Date(now - 30 * DAY),
          points: score(i * 2 + k),
          autoGames: 9,
        };
      }),
    ];
    return {
      fantaId: DEMO_FANTA_ID,
      userId,
      role: i === 0 ? (viewerIsAdmin ? "admin" : "membro") : i === 1 && !viewerIsAdmin ? "admin" : "membro",
      teamName: teamNames[i],
      team,
      budgetTot: 500,
      budgetSpent: 85,
      budgetLeft: 415,
      name: names[i],
      email: i === 0 ? viewer.email : `demo${i}@esempio.it`,
    };
  });

  const seasonPoints = new Map(
    members.map((m) => [m.userId, m.team.reduce((s, p) => s + (p.points || 0), 0)]),
  );
  const standings: StandingsEntry[] = members
    .map((m) => ({
      userId: m.userId,
      name: m.name,
      teamName: m.teamName,
      totalPoints: Math.round((seasonPoints.get(m.userId) || 0) * 100) / 100,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);

  // Due gruppi da 4, 3 turni da 7 giorni. "gironi": siamo nel turno 2.
  const groups: FantaGroup[] = [
    { id: "dg0", name: "Gruppo A", memberIds: [ids[0], ids[2], ids[4], ids[6]] },
    { id: "dg1", name: "Gruppo B", memberIds: [ids[1], ids[3], ids[5], ids[7]] },
  ];
  const groupsStart =
    phase === "gironi" ? now - 10 * DAY : phase === "tabellone" ? now - 23 * DAY : now - 37 * DAY;
  const pairs = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ];

  // Pick/Ban chiusi: tutti i turni già finiti. Punti finti per membro.
  const pickBanPoints = (userId: string, roundSeed: number) =>
    [0, 1, 2, 4, 5][(ids.indexOf(userId) + roundSeed) % 5];

  const calendar: CalendarRound[] = [];
  groups.forEach((group, g) => {
    for (let r = 0; r < 3; r++) {
      const startDate = new Date(groupsStart + r * 7 * DAY);
      const endDate = new Date(startDate.getTime() + 7 * DAY);
      const ended = now >= endDate.getTime();
      const started = now >= startDate.getTime();
      const fixtures: RoundFixture[] = pairs[r].map(([a, b], j) => {
        const home = group.memberIds[a];
        const away = group.memberIds[b];
        if (!started) return { homeUserId: home, awayUserId: away };
        const homeBonus = ended ? pickBanPoints(home, r) : 0;
        const awayBonus = ended ? pickBanPoints(away, r) : 0;
        const partial = ended ? 1 : 0.5;
        // Chi guarda va forte: si qualifica e si vede il percorso fino
        // alla finale dal suo punto di vista.
        const boost = (userId: string) => (userId === viewer.userId ? 30 : 0);
        return {
          homeUserId: home,
          awayUserId: away,
          homePoints:
            Math.round((score(g * 7 + r * 3 + j + a) + boost(home)) * partial) + homeBonus,
          awayPoints:
            Math.round((score(g * 5 + r * 11 + j + b * 2) + boost(away)) * partial) + awayBonus,
          homeBonus,
          awayBonus,
        };
      });
      calendar.push({
        id: `dc${g}r${r}`,
        roundNumber: r + 1,
        groupId: group.id,
        startDate,
        endDate,
        fixtures,
      });
    }
  });

  // Tabellone: 4 qualificati (primi 2 per gruppo), semifinali e finale.
  const bracketRounds: BracketRound[] = [];
  if (phase !== "gironi") {
    const seeds = seedsFromGroups(groups, calendar, seasonPoints, 2);
    const semisStart = groupsStart + 21 * DAY;
    const semiEnded = now >= semisStart + 7 * DAY;
    const semis: BracketMatch[] = seedFirstRound(seeds).map((m, i) => {
      const homePoints = score(i * 13 + 5) + (semiEnded ? 4 : 0);
      const awayPoints = score(i * 7 + 9) + (semiEnded ? 2 : 0);
      return {
        ...m,
        homePoints: semiEnded ? homePoints : Math.round(homePoints / 2),
        awayPoints: semiEnded ? awayPoints : Math.round(awayPoints / 2),
        homeBonus: semiEnded ? 4 : 0,
        awayBonus: semiEnded ? 2 : 0,
        ...(semiEnded
          ? { winnerUserId: homePoints >= awayPoints ? m.homeUserId! : m.awayUserId! }
          : {}),
      };
    });
    bracketRounds.push({
      id: "dbr0",
      roundIndex: 0,
      matches: semis,
      startDate: new Date(semisStart),
      endDate: new Date(semisStart + 7 * DAY),
    });
    if (phase === "finita") {
      const finalMatch = nextRoundFromWinners(semis)[0];
      bracketRounds.push({
        id: "dbr1",
        roundIndex: 1,
        startDate: new Date(semisStart + 7 * DAY),
        endDate: new Date(semisStart + 14 * DAY),
        matches: [
          {
            ...finalMatch,
            homePoints: 88,
            awayPoints: 81,
            homeBonus: 5,
            awayBonus: 3,
            winnerUserId: finalMatch.homeUserId!,
          },
        ],
      });
    }
  }

  // Pick'em: struttura Mondiali coi quarti veri; bloccato dal tabellone.
  let n = 0;
  const rounds = standardPickemRounds(() => `dpk${n++}`);
  rounds[0].matches.forEach((m, i) => {
    m.teamA = PRO_TEAMS[i * 2];
    m.teamB = PRO_TEAMS[i * 2 + 1];
  });
  if (phase !== "gironi") {
    const decidedAt = now - 2 * DAY;
    ["T1", "HLE", "G2 Esports", "TES"].forEach((w, i) => {
      Object.assign(rounds[0].matches[i], { winner: w, decidedAt });
    });
    if (phase === "finita") {
      Object.assign(rounds[1].matches[0], { winner: "T1", decidedAt });
      Object.assign(rounds[1].matches[1], { winner: "TES", decidedAt });
      Object.assign(rounds[2].matches[0], { winner: "T1", decidedAt });
    }
  }
  const pickemBracket: PickemBracket = { rounds, locked: phase !== "gironi" };
  const fullPicks = (variant: number): Record<string, string> => {
    const q = rounds[0].matches.map((m, i) => ((i + variant) % 3 === 0 ? m.teamB : m.teamA));
    const picks: Record<string, string> = {};
    rounds[0].matches.forEach((m, i) => (picks[m.id] = q[i]));
    picks[rounds[1].matches[0].id] = q[variant % 2];
    picks[rounds[1].matches[1].id] = q[2 + (variant % 2)];
    picks[rounds[2].matches[0].id] = picks[rounds[1].matches[variant % 2].id];
    return picks;
  };
  const pickemPredictions: PickemPrediction[] = ids
    .map((userId, i) => ({ userId, picks: fullPicks(i), submittedAt: new Date(now - 20 * DAY) }))
    // Ai gironi chi guarda non ha ancora pronosticato: si vede "Da fare ora".
    .filter((p, i) => !(phase === "gironi" && i === 0) && i !== 5);

  // Pick/Ban: turni finiti chiusi e rivelati; quello in corso solo per gli
  // altri (il tuo manca, così compare "Da fare ora").
  const pickBanRounds = buildPickBanRounds(calendar, bracketRounds);
  const championPickRounds: ChampionPickRoundState[] = [];
  const championPicks: ChampionPick[] = [];
  pickBanRounds.forEach((round, r) => {
    if (now < round.endDate.getTime()) return;
    championPickRounds.push({ roundId: round.id, closed: true });
    ids.forEach((userId, i) => {
      const points = pickBanPoints(userId, r);
      championPicks.push({
        id: `${round.id}_${userId}`,
        userId,
        roundId: round.id,
        championName: CHAMPIONS[(i + r) % CHAMPIONS.length],
        points,
        pickPoints: Math.max(points - 1, 0),
        winBonus: points > 0 ? 1 : 0,
        banPoints: 0,
        banScope: "none",
      });
    });
  });

  const fanta: Fanta = {
    id: DEMO_FANTA_ID,
    name: "Demo Mondiali",
    description: "Lega finta, solo per i developer",
    sportType: "lol",
    inviteCode: "DEMO0000",
    createdAt: new Date(now - 40 * DAY),
    updatedAt: new Date(now),
    lastRecalculatedAt: new Date(now - 3 * 3600 * 1000),
    settings: {
      ...DEFAULT_FANTA_SETTINGS,
      circuitType: "WORLDS",
      seasonStarted: true,
      maxPlayersTotal: 3,
      maxJolly: 0,
      qualifiersPerGroup: 2,
      bracketRoundLengthDays: 7,
    },
  } as Fanta;

  return {
    fanta,
    members,
    standings,
    groups,
    calendar,
    bracketRounds,
    pickemBracket,
    pickemPredictions,
    championPicks,
    championPickRounds,
  };
}
