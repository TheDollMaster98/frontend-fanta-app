/**
 * Leaguepedia API Service
 * Documentazione: https://lol.fandom.com/wiki/Help:Leaguepedia_API
 *
 * Questo servizio permette di interrogare il database di Leaguepedia
 * per ottenere dati reali su giocatori professionistici di League of Legends.
 */

const ALLOWED_PRO_ROLES = [
  "top",
  "top laner",
  "jungle",
  "jungler",
  "mid",
  "mid laner",
  "adc",
  "bot",
  "bot laner",
  "support",
];

const PRO_PLAYER_EXCLUSIONS = [
  "academy",
  "amateur",
  "private",
  "community",
  "testing",
  "trial",
  "bot",
  "coach",
];

const LEAGUE_FILTERS = [
  "TUTTI I PRO PLAYER",
  "LCK",
  "LPL",
  "LCS",
  "LEC",
  "LCP",
  "PCS",
];

const FALLBACK_PRO_PLAYERS: Omit<LeaguepediaPlayer, "image">[] = [
  {
    player: "Faker",
    name: "Lee Sang-hyeok",
    country: "KR",
    birthdate: "1996-05-07",
    residency: "South Korea",
    role: "Mid",
    team: "T1",
  },
  {
    player: "Caps",
    name: "Rasmus Winther",
    country: "DK",
    birthdate: "1999-11-17",
    residency: "Denmark",
    role: "Mid",
    team: "G2 Esports",
  },
  {
    player: "Jankos",
    name: "Marcin Jankowski",
    country: "PL",
    birthdate: "1995-09-18",
    residency: "Poland",
    role: "Jungle",
    team: "Fnatic",
  },
  {
    player: "Perkz",
    name: "Karsa",
    country: "TR",
    birthdate: "1998-07-04",
    residency: "Turkey",
    role: "Bot",
    team: "G2 Esports",
  },
  {
    player: "Chovy",
    name: "Jeong Ji-hoon",
    country: "KR",
    birthdate: "2002-03-03",
    residency: "South Korea",
    role: "Mid",
    team: "Gen.G",
  },
  {
    player: "Gumayusi",
    name: "Lee Min-hyeong",
    country: "KR",
    birthdate: "2002-02-06",
    residency: "South Korea",
    role: "Bot",
    team: "T1",
  },
  {
    player: "Zeus",
    name: "Choi Woo-je",
    country: "KR",
    birthdate: "1999-11-01",
    residency: "South Korea",
    role: "Top",
    team: "T1",
  },
  {
    player: "Bengi",
    name: "Seong-ung Bae",
    country: "KR",
    birthdate: "1994-06-30",
    residency: "South Korea",
    role: "Jungle",
    team: "DK",
  },
  {
    player: "Lehends",
    name: "Ryu Min-seok",
    country: "KR",
    birthdate: "2001-08-17",
    residency: "South Korea",
    role: "Support",
    team: "T1",
  },
  {
    player: "Ruler",
    name: "Park Jae-hyuk",
    country: "KR",
    birthdate: "1998-08-04",
    residency: "South Korea",
    role: "Bot",
    team: "Gen.G",
  },
];

export interface LeaguepediaPlayer {
  player: string; // Nome in-game
  name: string; // Nome reale
  country: string;
  birthdate: string;
  residency: string;
  role: string;
  team?: string;
  league?: string;
  image?: string;
  // Popolati solo dai risultati di getTeamRosterHistory: la squadra per cui
  // il giocatore era schierato nel torneo/anno filtrato (può differire da
  // `team`, che è sempre la squadra attuale).
  historicalTeam?: string;
  tournamentYear?: string;
  tournamentName?: string;
}

// Riga grezza restituita dalle Cargo query di Leaguepedia (campi dinamici, sempre stringhe).
type CargoRecord = Record<string, string>;

/**
 * Escape minimo per interpolare stringhe (spesso input utente da una
 * casella di ricerca) dentro una where-clause Cargo, che ha una sintassi
 * simile a SQL: senza, una " nell'input chiude la stringa in anticipo e
 * permette di iniettare condizioni Cargo arbitrarie. Leaguepedia è
 * un'API di sola lettura su dati pubblici, quindi l'impatto pratico è
 * limitato (query strane/pesanti contro il loro server, non furto di dati
 * nostri), ma resta un bug di query building da chiudere, non un'opinione.
 */
function escapeCargoValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeRole(role?: string): string {
  if (!role) return "";
  return role.trim().toLowerCase();
}

function isLikelyProPlayer(record: Partial<LeaguepediaPlayer>): boolean {
  const role = normalizeRole(record.role);
  const team = (record.team || "").trim();
  const player = (record.player || "").trim();
  const name = (record.name || "").trim();

  if (!player && !name) return false;
  if (!team) return false;
  if (!ALLOWED_PRO_ROLES.includes(role)) return false;

  const teamLower = team.toLowerCase();
  if (PRO_PLAYER_EXCLUSIONS.some((value) => teamLower.includes(value))) {
    return false;
  }

  return true;
}

function mapLeaguepediaRecord(record: CargoRecord): LeaguepediaPlayer | null {
  const mapped: LeaguepediaPlayer = {
    player: record.Player || record.player || record.Name || "",
    name: record.Name || record.name || "",
    country: record.Country || record.country || "",
    birthdate: record.Birthdate || record.birthdate || "",
    residency: record.Residency || record.residency || "",
    role: record.Role || record.role || "",
    team: record.Team || record.team || "",
    league: record.League || record.league || "",
  };

  if (!isLikelyProPlayer(mapped)) {
    return null;
  }

  return mapped;
}

export interface LeaguepediaTeam {
  name: string;
  region: string;
  logo?: string;
  short?: string;
}

export interface LeaguepediaPlayerStats {
  player: string;
  tournament: string;
  team: string;
  champion: string;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  gamesPlayed: number;
}

/**
 * Esegue una query Cargo all'API di Leaguepedia
 */
async function cargoQuery(params: {
  tables: string;
  fields: string;
  where?: string;
  join_on?: string;
  order_by?: string;
  limit?: number | "max";
  offset?: number;
  group_by?: string;
}): Promise<CargoRecord[]> {
  const queryParams = new URLSearchParams({
    action: "cargoquery",
    format: "json",
    tables: params.tables,
    fields: params.fields,
    limit: (params.limit || 50).toString(),
  });

  if (params.where) queryParams.append("where", params.where);
  if (params.join_on) queryParams.append("join_on", params.join_on);
  if (params.order_by) queryParams.append("order_by", params.order_by);
  if (params.offset) queryParams.append("offset", params.offset.toString());
  if (params.group_by) queryParams.append("group_by", params.group_by);

  try {
    const response = await fetch(`/api/leaguepedia?${queryParams.toString()}`);

    if (!response.ok) {
      console.warn(
        "Leaguepedia request failed from server route; falling back to local pro players.",
      );
      return [];
    }

    const data = await response.json();

    if (data?.error?.code === "ratelimited") {
      console.warn("Leaguepedia rate limited; using fallback pro-player data.");
      return [];
    }

    if (data?.cargoquery && Array.isArray(data.cargoquery)) {
      return data.cargoquery
        .map((item: { title?: CargoRecord } & Partial<CargoRecord>) => item.title || item)
        .filter(Boolean);
    }

    if (data?.error) {
      console.warn(
        "Leaguepedia returned an error payload; using fallback pro-player data.",
      );
      return [];
    }

    return [];
  } catch (error) {
    console.warn("Errore nella query Leaguepedia, uso fallback locale:", error);
    return [];
  }
}

/**
 * Cerca giocatori per nome
 */
export async function searchPlayers(
  searchTerm: string,
  limit = 20,
): Promise<LeaguepediaPlayer[]> {
  const normalizedSearch = searchTerm.trim();

  const results = await cargoQuery({
    tables: "Players=P",
    fields:
      "P.Player, P.Name, P.Country, P.Birthdate, P.Residency, P.Role, P.Team",
    where: normalizedSearch
      ? `P.Player LIKE "%${escapeCargoValue(normalizedSearch)}%" OR P.Name LIKE "%${escapeCargoValue(normalizedSearch)}%"`
      : undefined,
    limit,
    order_by: "P.Player",
  });

  const mapped = results
    .map((record) => mapLeaguepediaRecord(record))
    .filter(Boolean) as LeaguepediaPlayer[];

  if (mapped.length > 0) {
    return mapped.slice(0, limit);
  }

  // Leaguepedia irraggiungibile o rate-limited: meglio mostrare qualche
  // pro player noto che una lista vuota che sembra un errore.
  const query = normalizedSearch.toLowerCase();
  return FALLBACK_PRO_PLAYERS.filter(
    (player) =>
      !query ||
      player.player.toLowerCase().includes(query) ||
      player.name.toLowerCase().includes(query),
  ).slice(0, limit);
}

/**
 * Ottiene tutti i giocatori di una specifica lega
 */
export async function getPlayersByLeague(
  league: string = "TUTTI I PRO PLAYER",
): Promise<LeaguepediaPlayer[]> {
  const isAllPlayers = league === "TUTTI I PRO PLAYER";
  const results: CargoRecord[] = [];
  const pageSize = 500;
  let offset = 0;

  while (true) {
    const page = await cargoQuery({
      tables:
        "Tournaments=T, TournamentPlayers=TP, PlayerRedirects=PR, Players=P",
      fields:
        "P.Player, P.Name, P.Country, P.Birthdate, P.Residency, P.Role, P.Team, T.Name=League",
      where: isAllPlayers
        ? undefined
        : `(T.Name LIKE "%${escapeCargoValue(league)}%" OR T.League LIKE "%${escapeCargoValue(league)}%")`,
      join_on:
        "T.OverviewPage=TP.OverviewPage, TP.Player=PR.AllName, PR.OverviewPage=P.OverviewPage",
      order_by: "P.Player",
      group_by: "P.OverviewPage",
      limit: pageSize,
      offset,
    });

    results.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  const mapped = results
    .map((record) => mapLeaguepediaRecord(record))
    .filter(Boolean) as LeaguepediaPlayer[];

  if (mapped.length > 0) {
    return mapped;
  }

  // Leaguepedia irraggiungibile o rate-limited: il fallback locale non ha un
  // campo lega affidabile, quindi lo usiamo solo per "tutti i pro player".
  return isAllPlayers ? FALLBACK_PRO_PLAYERS : [];
}

/**
 * Roster storico: chi ha giocato per una squadra (in un anno e/o ai
 * Mondiali) secondo TournamentPlayers.Team, che è la squadra al momento di
 * quel torneo — diversa da Players.Team, che è sempre la squadra attuale.
 * Confrontando i due campi si vede se il giocatore è ancora in quella
 * squadra oggi. Nessun fallback locale: senza l'API non ha senso mostrare
 * dati storici inventati.
 */
export async function getTeamRosterHistory(filters: {
  team?: string;
  year?: string;
  worldsOnly?: boolean;
}): Promise<LeaguepediaPlayer[]> {
  const team = filters.team?.trim();
  const year = filters.year?.trim();
  const worldsOnly = !!filters.worldsOnly;

  if (!team && !year && !worldsOnly) return [];

  const whereClauses: string[] = [];
  if (team) whereClauses.push(`TP.Team LIKE "%${escapeCargoValue(team)}%"`);
  if (year) whereClauses.push(`T.Year="${escapeCargoValue(year)}"`);
  if (worldsOnly) whereClauses.push(`T.Name LIKE "%World Championship%"`);

  const results = await cargoQuery({
    tables: "Tournaments=T, TournamentPlayers=TP, PlayerRedirects=PR, Players=P",
    fields:
      "P.Player, P.Name, P.Country, P.Birthdate, P.Residency, P.Role, P.Team, TP.Team=HistoricalTeam, T.Name=TournamentName, T.Year",
    where: whereClauses.join(" AND "),
    join_on:
      "T.OverviewPage=TP.OverviewPage, TP.Player=PR.AllName, PR.OverviewPage=P.OverviewPage",
    order_by: "T.DateStart DESC",
    group_by: "P.OverviewPage",
    limit: 300,
  });

  return results
    .map((record) => {
      const mapped = mapLeaguepediaRecord(record);
      if (!mapped) return null;
      return {
        ...mapped,
        historicalTeam: record.HistoricalTeam || "",
        tournamentYear: record.Year || "",
        tournamentName: record.TournamentName || "",
      };
    })
    .filter(Boolean) as LeaguepediaPlayer[];
}

/**
 * Ottiene le statistiche di un giocatore in un torneo specifico
 */
export async function getPlayerStats(
  playerName: string,
  tournamentName?: string,
): Promise<LeaguepediaPlayerStats[]> {
  let whereClause = `PR.AllName="${escapeCargoValue(playerName)}"`;
  if (tournamentName) {
    whereClause += ` AND T.Name="${escapeCargoValue(tournamentName)}"`;
  }

  const results: CargoRecord[] = [];
  const pageSize = 500;
  let offset = 0;

  while (true) {
    const page = await cargoQuery({
      tables:
        "ScoreboardPlayers=SP, ScoreboardGames=SG, Tournaments=T, PlayerRedirects=PR",
      fields:
        "SP.Link, T.Name, SP.Team, SP.Champion, SP.Kills, SP.Deaths, SP.Assists",
      where: whereClause,
      join_on:
        "SP.GameId=SG.GameId, SG.OverviewPage=T.OverviewPage, SP.Link=PR.AllName",
      limit: pageSize,
      offset,
    });

    results.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  // Aggrega statistiche
  interface StatsAccumulator {
    player: string;
    tournament: string;
    team: string;
    kills: number;
    deaths: number;
    assists: number;
    gamesPlayed: number;
    champions: Set<string>;
  }
  const statsMap = new Map<string, StatsAccumulator>();

  results.forEach((r) => {
    const key = `${r.Link}-${r["T.Name"]}`;
    if (!statsMap.has(key)) {
      statsMap.set(key, {
        player: r.Link,
        tournament: r["T.Name"],
        team: r.Team,
        kills: 0,
        deaths: 0,
        assists: 0,
        gamesPlayed: 0,
        champions: new Set(),
      });
    }

    const stat = statsMap.get(key)!;
    stat.kills += parseInt(r.Kills || "0");
    stat.deaths += parseInt(r.Deaths || "0");
    stat.assists += parseInt(r.Assists || "0");
    stat.gamesPlayed += 1;
    if (r.Champion) stat.champions.add(r.Champion);
  });

  return Array.from(statsMap.values()).map((stat) => ({
    player: stat.player,
    tournament: stat.tournament,
    team: stat.team,
    champion: Array.from(stat.champions).join(", "),
    kills: stat.kills,
    deaths: stat.deaths,
    assists: stat.assists,
    kda:
      stat.deaths === 0
        ? stat.kills + stat.assists
        : parseFloat(((stat.kills + stat.assists) / stat.deaths).toFixed(2)),
    gamesPlayed: stat.gamesPlayed,
  }));
}

/**
 * Ottiene i team di una specifica regione
 */
export async function getTeamsByRegion(
  region: string = "Europe",
): Promise<LeaguepediaTeam[]> {
  const results = await cargoQuery({
    tables: "Teams=T",
    fields: "T.Name, T.Region",
    where: `T.Region LIKE "%${escapeCargoValue(region)}%"`,
    limit: 100,
  });

  return results.map((r) => ({
    name: r.Name || "",
    region: r.Region || "",
  }));
}

/**
 * Ottiene lista delle leghe disponibili
 */
export async function getAvailableLeagues(): Promise<string[]> {
  return LEAGUE_FILTERS;
}

/**
 * Ottiene URL dell'immagine di un giocatore
 */
export async function getPlayerImage(
  playerName: string,
): Promise<string | null> {
  try {
    const results = await cargoQuery({
      tables: "PlayerImages=PI, Tournaments=T",
      fields: "PI.FileName",
      where: `Link="${escapeCargoValue(playerName)}"`,
      join_on: "PI.Tournament=T.OverviewPage",
      order_by: "PI.SortDate DESC, T.DateStart DESC",
      limit: 1,
    });

    if (results.length > 0 && results[0].FileName) {
      // Costruisci URL immagine
      const filename = results[0].FileName;
      const imageParams = new URLSearchParams({
        action: "query",
        format: "json",
        titles: `File:${filename}`,
        prop: "imageinfo",
        iiprop: "url",
      });

      const response = await fetch(
        `/api/leaguepedia?${imageParams.toString()}`,
      );
      const data = await response.json();

      const pages = data.query?.pages;
      if (pages) {
        const page = Object.values(pages)[0] as {
          imageinfo?: { url?: string }[];
        };
        return page.imageinfo?.[0]?.url || null;
      }
    }

    return null;
  } catch (error) {
    console.error("Errore nel recupero immagine:", error);
    return null;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Cerca squadre pro per nome (draft composto, pick "Squadra"). Nessun
 * fallback locale: se Leaguepedia non risponde, l'admin può comunque
 * inserire il nome a mano nell'asta (come già succede per il coach).
 */
export async function searchTeams(
  searchTerm: string,
  limit = 20,
): Promise<LeaguepediaTeam[]> {
  const normalizedSearch = searchTerm.trim();

  const results = await cargoQuery({
    tables: "Teams=T",
    fields: "T.Name, T.Short, T.Region, T.IsDisbanded",
    where: normalizedSearch
      ? `T.Name LIKE "%${escapeCargoValue(normalizedSearch)}%" OR T.Short LIKE "%${escapeCargoValue(normalizedSearch)}%"`
      : undefined,
    order_by: "T.Name",
    limit,
  });

  return results
    .filter((r) => !["1", "true", "yes"].includes((r.IsDisbanded || "").trim().toLowerCase()))
    .map((r) => ({
      name: r.Name || "",
      region: r.Region || "",
      short: r.Short || "",
    }))
    .filter((t) => t.name);
}

export interface FantasyPlayerStats {
  kills: number;
  deaths: number;
  assists: number;
  wins: number;
  gamesPlayed: number;
}

/**
 * Statistiche reali (kill/morti/assist/vittorie) di una lista di giocatori
 * in un circuito, aggregate da ScoreboardPlayers+ScoreboardGames. La
 * formula punti (pesi kill/morti/assist/vittoria) resta fuori da qui: la
 * applica il chiamante con gli scoringWeights della lega, così questa
 * funzione non deve sapere nulla delle impostazioni di una lega specifica.
 * Nomi in batch da 30 per non costruire where-clause troppo lunghe.
 */
export async function getFantasyPlayerStats(
  playerNames: string[],
  circuitType: string,
): Promise<Record<string, FantasyPlayerStats>> {
  const names = Array.from(new Set(playerNames.map((n) => n.trim()).filter(Boolean)));
  const stats: Record<string, FantasyPlayerStats> = {};
  names.forEach((n) => {
    stats[n] = { kills: 0, deaths: 0, assists: 0, wins: 0, gamesPlayed: 0 };
  });
  if (names.length === 0) return stats;

  for (const group of chunk(names, 30)) {
    const nameList = group.map((n) => `"${escapeCargoValue(n)}"`).join(",");
    const results: CargoRecord[] = [];
    const pageSize = 500;
    let offset = 0;

    while (true) {
      const page = await cargoQuery({
        tables: "ScoreboardPlayers=SP, ScoreboardGames=SG, Tournaments=T, PlayerRedirects=PR",
        fields:
          "PR.AllName=QueryName, SP.Team, SP.Kills, SP.Deaths, SP.Assists, SG.WinTeam",
        where: `PR.AllName IN (${nameList}) AND (T.Name LIKE "%${escapeCargoValue(circuitType)}%" OR T.League LIKE "%${escapeCargoValue(circuitType)}%")`,
        join_on:
          "SP.GameId=SG.GameId, SG.OverviewPage=T.OverviewPage, SP.Link=PR.AllName",
        limit: pageSize,
        offset,
      });

      results.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }

    results.forEach((r) => {
      const key = r.QueryName;
      const stat = stats[key];
      if (!stat) return;
      stat.kills += parseInt(r.Kills || "0");
      stat.deaths += parseInt(r.Deaths || "0");
      stat.assists += parseInt(r.Assists || "0");
      stat.gamesPlayed += 1;
      if (r.Team && r.WinTeam && r.Team === r.WinTeam) stat.wins += 1;
    });
  }

  return stats;
}

/**
 * Vittorie/partite di una lista di squadre in un circuito. Unica statistica
 * di squadra usabile via Leaguepedia per il punteggio fantasy: obiettivi e
 * MVP non sono disponibili a livello di singola squadra/giocatore in
 * ScoreboardGames (verificato a mano con l'utente, vedi step 6 nel TODO).
 */
export async function getFantasyTeamStats(
  teamNames: string[],
  circuitType: string,
): Promise<Record<string, { wins: number; gamesPlayed: number }>> {
  const names = Array.from(new Set(teamNames.map((n) => n.trim()).filter(Boolean)));
  const stats: Record<string, { wins: number; gamesPlayed: number }> = {};
  names.forEach((n) => {
    stats[n] = { wins: 0, gamesPlayed: 0 };
  });
  if (names.length === 0) return stats;

  for (const group of chunk(names, 30)) {
    const nameList = group.map((n) => `"${escapeCargoValue(n)}"`).join(",");
    const results: CargoRecord[] = [];
    const pageSize = 500;
    let offset = 0;

    while (true) {
      const page = await cargoQuery({
        tables: "ScoreboardGames=SG, Tournaments=T",
        fields: "SG.WinTeam, SG.LossTeam",
        where: `(SG.WinTeam IN (${nameList}) OR SG.LossTeam IN (${nameList})) AND (T.Name LIKE "%${escapeCargoValue(circuitType)}%" OR T.League LIKE "%${escapeCargoValue(circuitType)}%")`,
        join_on: "SG.OverviewPage=T.OverviewPage",
        limit: pageSize,
        offset,
      });

      results.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }

    results.forEach((r) => {
      if (r.WinTeam && stats[r.WinTeam]) {
        stats[r.WinTeam].wins += 1;
        stats[r.WinTeam].gamesPlayed += 1;
      }
      if (r.LossTeam && stats[r.LossTeam]) {
        stats[r.LossTeam].gamesPlayed += 1;
      }
    });
  }

  return stats;
}

export interface PlayerGameLog {
  gameId: string;
  date: string; // DateTime_UTC grezzo da Leaguepedia
  tournament: string;
  team: string;
  champion: string;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
}

/**
 * Log partita per partita di un giocatore in un circuito (drill-down
 * step 3): stesso dato aggregato da getFantasyPlayerStats, ma riga per
 * riga invece che sommato, per poter mostrare "in questa partita ha fatto
 * X kill, Y punti".
 */
export async function getPlayerGameLog(
  playerName: string,
  circuitType: string,
): Promise<PlayerGameLog[]> {
  const name = playerName.trim();
  if (!name) return [];

  const results = await cargoQuery({
    tables: "ScoreboardPlayers=SP, ScoreboardGames=SG, Tournaments=T, PlayerRedirects=PR",
    fields:
      "SG.GameId, SG.DateTime_UTC, T.Name=Tournament, SP.Team, SP.Champion, SP.Kills, SP.Deaths, SP.Assists, SG.WinTeam",
    where: `PR.AllName="${escapeCargoValue(name)}" AND (T.Name LIKE "%${escapeCargoValue(circuitType)}%" OR T.League LIKE "%${escapeCargoValue(circuitType)}%")`,
    join_on:
      "SP.GameId=SG.GameId, SG.OverviewPage=T.OverviewPage, SP.Link=PR.AllName",
    order_by: "SG.DateTime_UTC DESC",
    limit: 200,
  });

  return results.map((r) => ({
    gameId: r.GameId || "",
    date: r.DateTime_UTC || "",
    tournament: r.Tournament || "",
    team: r.Team || "",
    champion: r.Champion || "",
    kills: parseInt(r.Kills || "0"),
    deaths: parseInt(r.Deaths || "0"),
    assists: parseInt(r.Assists || "0"),
    win: !!r.Team && !!r.WinTeam && r.Team === r.WinTeam,
  }));
}

export interface TeamGameLog {
  gameId: string;
  date: string;
  tournament: string;
  opponent: string;
  win: boolean;
}

/**
 * Log partita per partita di una squadra in un circuito (drill-down dei
 * pick "team"/"coach" — per il coach si usa la squadra che allena).
 */
export async function getTeamGameLog(
  teamName: string,
  circuitType: string,
): Promise<TeamGameLog[]> {
  const name = teamName.trim();
  if (!name) return [];
  const escaped = escapeCargoValue(name);

  const results = await cargoQuery({
    tables: "ScoreboardGames=SG, Tournaments=T",
    fields: "SG.GameId, SG.DateTime_UTC, T.Name=Tournament, SG.WinTeam, SG.LossTeam",
    where: `(SG.WinTeam="${escaped}" OR SG.LossTeam="${escaped}") AND (T.Name LIKE "%${escapeCargoValue(circuitType)}%" OR T.League LIKE "%${escapeCargoValue(circuitType)}%")`,
    join_on: "SG.OverviewPage=T.OverviewPage",
    order_by: "SG.DateTime_UTC DESC",
    limit: 200,
  });

  return results.map((r) => {
    const win = r.WinTeam === name;
    return {
      gameId: r.GameId || "",
      date: r.DateTime_UTC || "",
      tournament: r.Tournament || "",
      opponent: (win ? r.LossTeam : r.WinTeam) || "",
      win,
    };
  });
}
