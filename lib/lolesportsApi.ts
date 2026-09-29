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
 * stripTeamTagFromSummonerName sotto.
 *
 * CAMPI VERIFICATI (su /window E /details reali dello stesso game):
 * - CS (creepScore): presente in entrambi.
 * - Oro: "totalGold" in /window, "totalGoldEarned" in /details — nomi
 *   diversi per lo stesso dato, mappati entrambi su totalGold qui.
 * - Wards: "wardsPlaced"/"wardsDestroyed" in /details, usate come proxy del
 *   Vision Score (decisione presa col progetto: Riot non espone un vero
 *   Vision Score da nessuna parte in questa API, quindi ScoringWeights.
 *   visionPer10 pesa wardsPlaced+wardsDestroyed ogni 10, non lo stesso
 *   numero del client di gioco ma un segnale reale).
 * - Pentakill e dati sui ban: ASSENTI in entrambe le risposte testate,
 *   nessun campo di alcun tipo — confermato non disponibile, non
 *   implementato (ScoringWeights.pentakill resta inerte, 0 in automatico).
 * - Obiettivi di squadra (torri/baroni/draghi/inibitori): presenti a
 *   livello di team SOLO nei frame di /window (non in /details, che ha solo
 *   "participants"), void grub/rift herald/atakhan non ancora verificati
 *   come campi distinti — non ancora wirati, fuori da questo giro.
 *
 * ANCORA MANCANTE — la pipeline che trova i gameId giocati da una squadra
 * in una finestra di date: getSchedule(leagueId) restituisce eventi con
 * match.id, ma la forma esatta di match.teams (nome/tag della squadra per
 * abbinarla al roster fantasy) non è ancora stata vista su una risposta
 * reale — LolesportsScheduleEvent va verificato prima di usarlo per
 * cercare le partite di una squadra specifica, stesso principio di tutto
 * il resto in questo file: non indovinare uno schema.
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
  // Vision Score vero e proprio NON è mai comparso in /details (verificato
  // su una risposta reale): usiamo wards piazzate/distrutte come proxy —
  // dato reale, non identico al Vision Score di Riot ma non inventato.
  wardsPlaced: number;
  wardsDestroyed: number;
}

// Forma grezza di un participant in /details/{gameId}: il campo dell'oro si
// chiama totalGoldEarned qui (diverso da totalGold di /window/{gameId}) —
// verificato su una risposta reale, non un'ipotesi.
interface RawDetailsParticipant {
  participantId: number;
  kills: number;
  deaths: number;
  assists: number;
  creepScore: number;
  totalGoldEarned: number;
  wardsPlaced: number;
  wardsDestroyed: number;
}

/**
 * Statistiche finali (kill/morti/assist/CS/oro/wards) di ogni giocatore in
 * un game già concluso: prende l'ULTIMO frame (stato finale), non l'intera
 * timeline minuto per minuto che non serve al punteggio fantasy.
 */
export async function getGameFinalStats(
  gameId: string,
): Promise<LolesportsParticipantStats[]> {
  const data = await feedRequest<{
    frames: { participants: RawDetailsParticipant[] }[];
  }>(`details/${gameId}`);
  const lastFrame = data.frames[data.frames.length - 1];
  return (lastFrame?.participants || []).map((p) => ({
    participantId: p.participantId,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    creepScore: p.creepScore,
    totalGold: p.totalGoldEarned,
    wardsPlaced: p.wardsPlaced,
    wardsDestroyed: p.wardsDestroyed,
  }));
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
