// Pick/ban campione settimanale (1/10, punteggio rifatto il 6/10): ogni
// membro sceglie per il turno calendario corrente UN campione che pensa
// verrà pickato in game pro reali quella settimana, più (facoltativo) UN
// campione che pensa verrà bannato dalla sua squadra pro (il pick "team"
// in rosa). Regole e numeri in lib/championPickScoring.ts: i punti del
// pick scalano con quanti membri hanno scelto lo stesso campione (prima
// era +2 fisso, e tutti sceglievano lo stesso campione del meta), +1 se
// giocato da una squadra vincente, e il ban vale +2 sulla propria
// squadra o +1 sull'intero circuito come ripiego.
//
// Ogni lega LoL. Turni: quelli del calendario in un campionato normale;
// in WORLDS/MSI un turno per turno dei gironi e uno per turno del
// tabellone (11/10, lib/pickBanRounds.ts). Prima WORLDS/MSI erano esclusi.
//
// Si blocca al salvataggio: non modificabile dopo l'invio, e nascosto
// agli altri membri finché admin/vice non chiude il turno (rivelando
// tutte le scelte in un colpo solo) — vedi firestore.rules, la lettura
// è negata dalle regole stesse per chi non è il proprietario finché il
// turno non è chiuso, non è solo un filtro lato UI.

// fantas/{fantaId}/championPickRounds/{roundId} — stato del turno
// (PickBanRound.id: id di un turno di calendario o del tabellone): closed=true rivela le scelte di tutti e permette
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
// "team" = ban valutato sulla squadra pro del membro, "circuit" = ripiego
// sull'intero circuito (nessuna squadra in rosa, o la squadra non ha
// giocato nella finestra del turno), "none" = nessun ban scommesso.
export type ChampionPickBanScope = "team" | "circuit" | "none";

export interface ChampionPick {
  id: string;
  userId: string;
  roundId: string;
  championName: string;
  banChampionName?: string; // assente nei pick salvati prima del 6/10
  // Tutti assenti finché il turno non viene chiuso. points è il totale;
  // il dettaglio sotto manca nei turni chiusi prima del 6/10 (vecchia
  // regola, solo points).
  points?: number;
  pickPoints?: number;
  winBonus?: number;
  banPoints?: number;
  banScope?: ChampionPickBanScope;
}
