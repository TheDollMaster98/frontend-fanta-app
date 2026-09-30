// Calendario a girone all'italiana (round-robin) tra i membri della lega:
// fantas/{fantaId}/calendar/{id}. Generato una volta dall'admin/dev con il
// metodo del cerchio; awayUserId assente = turno di riposo (numero dispari
// di membri). homePoints/awayPoints: punti fantasy totalizzati dai due
// roster SOLO nella finestra [CalendarRound.startDate, endDate) di questo
// turno (non il punteggio cumulativo di sempre, quello resta su
// TeamPick.points). Assenti finché "Ricalcola Punteggi" non viene lanciato
// almeno una volta dopo che il turno è iniziato.
export interface RoundFixture {
  homeUserId: string;
  awayUserId: string | null;
  homePoints?: number;
  awayPoints?: number;
}

export interface CalendarRound {
  id: string;
  roundNumber: number;
  fixtures: RoundFixture[];
  // Finestra temporale reale di questo turno: il confronto diretto tra i
  // due membri di una fixture è la somma dei punti fantasy ottenuti dai
  // rispettivi roster SOLO nelle partite pro giocate in questo intervallo
  // (vedi FantaContext.recalculateScores). Assegnata da generateCalendar,
  // sequenziale a partire dalla data scelta dall'admin.
  startDate: Date;
  endDate: Date;
  // Presente solo nella fase a gironi (circuiti WORLDS/MSI, vedi
  // PLAYOFF_CIRCUITS): identifica a quale FantaGroup appartiene questo
  // turno. Assente = girone unico standard (fase singola).
  groupId?: string;
}

// Gruppo della fase a gironi (WORLDS/MSI): fantas/{fantaId}/groups/{id}.
// Ogni gruppo gioca un proprio girone all'italiana (CalendarRound con
// groupId = questo id) SOLO tra i membri elencati qui. Generato da
// FantaContext.generateGroups, che distribuisce i membri della lega nei
// gruppi in sequenza (non a bilanciamento di forza: qui non c'è uno
// storico su cui bilanciare).
export interface FantaGroup {
  id: string;
  name: string; // "Gruppo A", "Gruppo B", ...
  memberIds: string[];
}

// Un incontro del tabellone a eliminazione diretta: fantas/{fantaId}/
// bracket/{roundId}, generato da FantaContext.generateBracket dopo la fase
// a gironi. homeUserId/awayUserId null = "TBD", in attesa che il match del
// turno precedente che alimenta questo slot venga deciso (non va confuso
// col "riposo" di RoundFixture: qui significa solo "non ancora noto", non
// "nessun avversario"). winnerUserId assente = match non ancora deciso
// (serve homePoints/awayPoints diversi, oppure — se uno dei due slot è
// null per un bye del primo turno — l'altro passa il turno senza giocare).
export interface BracketMatch {
  matchIndex: number; // posizione nel turno: determina l'accoppiamento nel
  // turno successivo (0 e 1 si affrontano nel prossimo match 0, 2 e 3 nel
  // prossimo match 1, ...)
  homeUserId: string | null;
  awayUserId: string | null;
  homePoints?: number;
  awayPoints?: number;
  winnerUserId?: string;
}

export interface BracketRound {
  id: string;
  roundIndex: number; // 0 = primo turno a eliminazione dopo i gironi
  matches: BracketMatch[];
  // Stessa logica di CalendarRound.startDate/endDate: finestra di date
  // reali usata per il punteggio dei match di questo turno.
  startDate: Date;
  endDate: Date;
}
