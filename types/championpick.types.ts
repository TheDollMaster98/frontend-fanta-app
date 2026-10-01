// Pick/ban campione settimanale (1/10): ogni membro sceglie UN campione
// per il turno calendario corrente, scommettendo che verrà giocato in
// game pro reali quella settimana. +2pt se il campione scelto risulta
// pickato in almeno una partita della finestra del turno (anche se in
// un'altra partita della stessa finestra è stato bannato altrove — il
// ban non toglie i punti già guadagnati dal pick), 0pt se non risulta
// mai pickato (ignorato o solo bannato, mai scelto da nessuna squadra).
//
// Solo leghe a campionato normale (round-robin, CalendarRound esiste
// già): WORLDS/MSI (gironi+bracket, niente turni calendario) restano
// esclusi — non hanno un concetto di "turno settimanale" a cui agganciare
// questa feature, a differenza del Pick'em che pronostica il torneo
// intero (vedi types/pickem.types.ts).
//
// Si blocca al salvataggio: non modificabile dopo l'invio, e nascosto
// agli altri membri finché admin/vice non chiude il turno (rivelando
// tutte le scelte in un colpo solo) — vedi firestore.rules, la lettura
// è negata dalle regole stesse per chi non è il proprietario finché il
// turno non è chiuso, non è solo un filtro lato UI.

// fantas/{fantaId}/championPickRounds/{roundId} — stato del turno
// (CalendarRound.id): closed=true rivela le scelte di tutti e permette
// il ricalcolo punti.
export interface ChampionPickRoundState {
  roundId: string;
  closed: boolean;
}

// fantas/{fantaId}/championPicks/{roundId}_{userId} — un documento per
// (turno, membro). "points" assente finché il turno non viene chiuso E
// ricalcolato (closeChampionPickRound in FantaContext fa entrambe le
// cose in sequenza, non in batch — vedi il commento sull'implementazione
// per il motivo, stessa lezione già vista con addFanta/invite).
export interface ChampionPick {
  id: string;
  userId: string;
  roundId: string;
  championName: string;
  points?: number;
}
