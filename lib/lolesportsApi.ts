/**
 * Client per l'API (non ufficiale ma pubblica) che alimenta lolesports.com
 * — fonte diversa da Leaguepedia (lib/leaguepediaApi.ts), usata SOLO per
 * le statistiche che Leaguepedia non espone in modo confermato (CS/Vision
 * Score/oro), non per sostituire kill/morti/assist/vittoria che già
 * funzionano da Leaguepedia.
 *
 * Schema verificato dall'utente sull'OpenAPI non ufficiale
 * (vickz84259.github.io/lolesports-api-docs), non indovinato.
 *
 * MATCHING NOMI — verificato con una chiamata reale a /window/{gameId}
 * (game SK Gaming vs Karmine Corp): summonerName arriva SEMPRE come "{TAG
 * SQUADRA} {NomeGiocatore}", es. "SK Wunder", "KC Caliste" — non il nome
 * nudo di Leaguepedia ("Wunder", "Caliste"). Il matching è: togliere il
 * primo token (il tag squadra) da summonerName, vedi
 * stripTeamTagFromSummonerName sotto. CS (creepScore) confermato presente
 * nella stessa risposta di /window, non serve /details per quello.
 *
 * ATTENZIONE — Vision Score e Pentakill NON sono comparsi nella risposta di
 * /window testata (solo kills/deaths/assists/creepScore/totalGold/level per
 * participant): potrebbero non esistere affatto in questa API, o vivere
 * altrove (es. /details con parametri diversi) — non confermato, quindi non
 * ancora usabili per punti reali. Obiettivi di squadra (torri/baroni/
 * draghi) sembrano presenti a livello di team nei frame, ma void grub/rift
 * herald/atakhan/inibitori non ancora verificati come campi distinti.
 *
 * ATTENZIONE — non ancora collegato al calcolo punteggi reale
 * (FantaContext.recalculateScores): oltre al matching nomi, manca una
 * pipeline per trovare i gameId giocati da una squadra/giocatore in una
 * finestra di date (qui serve getSchedule/getEventDetails per evento, non
 * una query diretta come il Cargo di Leaguepedia) — lavoro separato, non
 * ancora iniziato.
 */

// Toglie il tag squadra iniziale da un summonerName lolesports ("SK Wunder"
// -> "Wunder"), per confrontarlo col nome nudo usato da Leaguepedia e già in
// rosa. Assume che il tag sia sempre il primo token separato da uno spazio
// (verificato su 10 giocatori reali, vedi il commento sopra) — se
// summonerName non contiene spazi lo restituisce invariato.
export function stripTeamTagFromSummonerName(summonerName: string): string {
  const spaceIndex = summonerName.indexOf(" ");
  return spaceIndex === -1 ? summonerName : summonerName.slice(spaceIndex + 1);
}

interface LolesportsResponse<T> {
  data: T;
}

async function gwRequest<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const query = new URLSearchParams({ source: "gw", path, hl: "en-US", ...params });
  const response = await fetch(`/api/lolesports?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`lolesports ${path} ha risposto ${response.status}`);
  }
  const body: LolesportsResponse<T> = await response.json();
  return body.data;
}

async function feedRequest<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const query = new URLSearchParams({ source: "feed", path, ...params });
  const response = await fetch(`/api/lolesports?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`lolesports ${path} ha risposto ${response.status}`);
  }
  return response.json();
}

export interface LolesportsLeague {
  id: string;
  name: string;
  slug: string;
  region: string;
}

/** Elenco dei circuiti (LEC/LCK/LPL/.../Worlds/MSI), per trovare l'id da passare a getSchedule. */
export async function getLeagues(): Promise<LolesportsLeague[]> {
  const data = await gwRequest<{ leagues: LolesportsLeague[] }>("getLeagues");
  return data.leagues;
}

export interface LolesportsScheduleEvent {
  startTime: string;
  state: "completed" | "unstarted" | "inProgress";
  league: { id: string; name: string; slug: string };
  match: { id: string; teams: { result?: { gameWins: number } }[] };
}

/** Calendario/partite di un circuito. pageToken (da schedule.pages.older) per andare indietro nel tempo. */
export async function getSchedule(
  leagueId: string,
  pageToken?: string,
): Promise<{
  events: LolesportsScheduleEvent[];
  olderPageToken: string | null;
}> {
  const data = await gwRequest<{
    schedule: {
      events: LolesportsScheduleEvent[];
      pages: { older: string | null; newer: string | null };
    };
  }>("getSchedule", {
    leagueId,
    ...(pageToken ? { pageToken } : {}),
  });
  return { events: data.schedule.events, olderPageToken: data.schedule.pages.older };
}

export interface LolesportsGame {
  id: string;
  state: "completed" | "unstarted" | "inProgress";
  number: number;
}

/** Dettaglio di una serie (match): un game per ogni game giocato (Bo1/Bo3/Bo5). */
export async function getEventDetails(matchId: string): Promise<{
  games: LolesportsGame[];
}> {
  const data = await gwRequest<{
    event: { match: { games: LolesportsGame[] } };
  }>("getEventDetails", { id: matchId });
  return { games: data.event.match.games };
}

export interface LolesportsParticipantMeta {
  participantId: number;
  summonerName: string;
  championId: string;
  role: "top" | "jungle" | "mid" | "bottom" | "support";
  esportsPlayerId?: string;
}

/** Mappa participantId (1-10) -> summonerName/ruolo/campione per un game — necessaria per interpretare /details. */
export async function getGameWindow(gameId: string): Promise<{
  blueTeam: { esportsTeamId: string; participants: LolesportsParticipantMeta[] };
  redTeam: { esportsTeamId: string; participants: LolesportsParticipantMeta[] };
}> {
  const data = await feedRequest<{
    gameMetadata: {
      blueTeamMetadata: {
        esportsTeamId: string;
        participantMetadata: LolesportsParticipantMeta[];
      };
      redTeamMetadata: {
        esportsTeamId: string;
        participantMetadata: LolesportsParticipantMeta[];
      };
    };
  }>(`window/${gameId}`);
  return {
    blueTeam: {
      esportsTeamId: data.gameMetadata.blueTeamMetadata.esportsTeamId,
      participants: data.gameMetadata.blueTeamMetadata.participantMetadata,
    },
    redTeam: {
      esportsTeamId: data.gameMetadata.redTeamMetadata.esportsTeamId,
      participants: data.gameMetadata.redTeamMetadata.participantMetadata,
    },
  };
}

export interface LolesportsParticipantStats {
  participantId: number;
  kills: number;
  deaths: number;
  assists: number;
  creepScore: number;
  totalGold: number;
}

/**
 * Statistiche finali (kill/morti/assist/CS/oro) di ogni giocatore in un
 * game già concluso: prende l'ULTIMO frame (stato finale), non l'intera
 * timeline minuto per minuto che non serve al punteggio fantasy.
 */
export async function getGameFinalStats(
  gameId: string,
): Promise<LolesportsParticipantStats[]> {
  const data = await feedRequest<{
    frames: { participants: LolesportsParticipantStats[] }[];
  }>(`details/${gameId}`);
  const lastFrame = data.frames[data.frames.length - 1];
  return lastFrame?.participants || [];
}

/**
 * Statistiche di un game unite ai nomi/ruoli dei giocatori (window +
 * details in un'unica chiamata): la forma pronta da incrociare con i nomi
 * Leaguepedia già in rosa — vedi l'avvertenza in cima al file sul
 * matching non ancora verificato.
 */
export async function getGamePlayerStats(gameId: string): Promise<
  (LolesportsParticipantMeta & LolesportsParticipantStats)[]
> {
  const [window, stats] = await Promise.all([
    getGameWindow(gameId),
    getGameFinalStats(gameId),
  ]);
  const allMeta = [...window.blueTeam.participants, ...window.redTeam.participants];
  const statsByParticipant = new Map(stats.map((s) => [s.participantId, s]));

  return allMeta
    .map((meta) => {
      const s = statsByParticipant.get(meta.participantId);
      if (!s) return null;
      return { ...meta, ...s };
    })
    .filter((v): v is LolesportsParticipantMeta & LolesportsParticipantStats => v !== null);
}
