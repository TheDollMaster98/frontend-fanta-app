/**
 * Leaguepedia API Service
 * Documentazione: https://lol.fandom.com/wiki/Help:Leaguepedia_API
 * 
 * Questo servizio permette di interrogare il database di Leaguepedia
 * per ottenere dati reali su giocatori, team e partite di League of Legends
 */

const LEAGUEPEDIA_API_ENDPOINT = "https://lol.fandom.com/api.php";

export interface LeaguepediaPlayer {
  player: string; // Nome in-game
  name: string; // Nome reale
  country: string;
  birthdate: string;
  residency: string;
  role: string;
  team?: string;
  image?: string;
}

export interface LeaguepediaTeam {
  name: string;
  region: string;
  logo?: string;
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
  limit?: number;
  offset?: number;
}): Promise<any[]> {
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

  try {
    const response = await fetch(`${LEAGUEPEDIA_API_ENDPOINT}?${queryParams}`);
    const data = await response.json();

    if (data.cargoquery && Array.isArray(data.cargoquery)) {
      return data.cargoquery.map((item: any) => item.title);
    }

    return [];
  } catch (error) {
    console.error("Errore nella query Leaguepedia:", error);
    return [];
  }
}

/**
 * Cerca giocatori per nome
 */
export async function searchPlayers(
  searchTerm: string,
  limit = 20
): Promise<LeaguepediaPlayer[]> {
  const results = await cargoQuery({
    tables: "Players=P",
    fields: "P.Player, P.Name, P.Country, P.Birthdate, P.Residency, P.Role, P.Team",
    where: `P.Player LIKE "%${searchTerm}%" OR P.Name LIKE "%${searchTerm}%"`,
    limit,
    order_by: "P.Player",
  });

  return results.map((r) => ({
    player: r.Player || "",
    name: r.Name || "",
    country: r.Country || "",
    birthdate: r.Birthdate || "",
    residency: r.Residency || "",
    role: r.Role || "",
    team: r.Team || "",
  }));
}

/**
 * Ottiene tutti i giocatori di una specifica lega
 */
export async function getPlayersByLeague(
  league: string = "LEC"
): Promise<LeaguepediaPlayer[]> {
  const results = await cargoQuery({
    tables:
      "Tournaments=T, TournamentPlayers=TP, PlayerRedirects=PR, Players=P",
    fields:
      "P.Player, P.Name, P.Country, P.Birthdate, P.Residency, P.Role, P.Team",
    where: `T.League = '${league}'`,
    join_on:
      "T.OverviewPage=TP.OverviewPage, TP.Player=PR.AllName, PR.OverviewPage=P.OverviewPage",
    limit: 500,
  });

  return results.map((r) => ({
    player: r.Player || "",
    name: r.Name || "",
    country: r.Country || "",
    birthdate: r.Birthdate || "",
    residency: r.Residency || "",
    role: r.Role || "",
    team: r.Team || "",
  }));
}

/**
 * Ottiene le statistiche di un giocatore in un torneo specifico
 */
export async function getPlayerStats(
  playerName: string,
  tournamentName?: string
): Promise<LeaguepediaPlayerStats[]> {
  let whereClause = `PR.AllName="${playerName}"`;
  if (tournamentName) {
    whereClause += ` AND T.Name="${tournamentName}"`;
  }

  const results = await cargoQuery({
    tables:
      "ScoreboardPlayers=SP, ScoreboardGames=SG, Tournaments=T, PlayerRedirects=PR",
    fields:
      "SP.Link, T.Name, SP.Team, SP.Champion, SP.Kills, SP.Deaths, SP.Assists",
    where: whereClause,
    join_on:
      "SP.GameId=SG.GameId, SG.OverviewPage=T.OverviewPage, SP.Link=PR.AllName",
    limit: 100,
  });

  // Aggrega statistiche
  const statsMap = new Map<string, any>();

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

    const stat = statsMap.get(key);
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
  region: string = "Europe"
): Promise<LeaguepediaTeam[]> {
  const results = await cargoQuery({
    tables: "Teams=T",
    fields: "T.Name, T.Region",
    where: `T.Region LIKE "%${region}%"`,
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
  const results = await cargoQuery({
    tables: "Tournaments=T",
    fields: "T.League",
    limit: 500,
  });

  const leagues = new Set<string>();
  results.forEach((r) => {
    if (r.League) leagues.add(r.League);
  });

  return Array.from(leagues).sort();
}

/**
 * Ottiene URL dell'immagine di un giocatore
 */
export async function getPlayerImage(playerName: string): Promise<string | null> {
  try {
    const results = await cargoQuery({
      tables: "PlayerImages=PI, Tournaments=T",
      fields: "PI.FileName",
      where: `Link="${playerName}"`,
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

      const response = await fetch(`${LEAGUEPEDIA_API_ENDPOINT}?${imageParams}`);
      const data = await response.json();

      const pages = data.query?.pages;
      if (pages) {
        const page = Object.values(pages)[0] as any;
        return page.imageinfo?.[0]?.url || null;
      }
    }

    return null;
  } catch (error) {
    console.error("Errore nel recupero immagine:", error);
    return null;
  }
}
