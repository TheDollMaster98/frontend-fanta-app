// Pick'em (1/10): pronostico sul bracket VERO del torneo (squadre pro),
// non il bracket fantasy tra i membri della lega (quello è
// BracketRound/BracketMatch in calendar.types.ts — nomi diversi apposta
// per non confondere le due cose). Solo per circuiti a eliminazione
// (WORLDS/MSI, vedi PLAYOFF_CIRCUITS in lib/constants.ts).
//
// Scelte di prodotto fatte dall'utente (1/10), non assunte:
// - Solo fase a eliminazione diretta: niente play-in/gironi/swiss, che
//   cambiano formato ogni edizione (Swiss dal 2024, gironi prima).
// - Pronostici bloccati tutti insieme prima dell'inizio del torneo (non
//   round per round).
// - Punti crescenti per round (l'admin decide i punti di ogni round
//   quando crea il bracket, non un valore fisso in codice).

export interface PickemMatch {
  id: string;
  teamA: string;
  teamB: string;
  // Nome della squadra reale vincitrice, assente finché l'admin non lo
  // inserisce dopo che il match è stato giocato (nessuna fonte
  // automatica: vedi nota in FantaContext sul perché non si collega a
  // lolesports qui).
  winner?: string;
}

export interface PickemRound {
  name: string; // "Quarti", "Semifinali", "Finale", ...
  points: number; // punti per ogni pronostico corretto in questo round
  matches: PickemMatch[];
}

// fantas/{fantaId}/pickem/bracket
export interface PickemBracket {
  rounds: PickemRound[];
  // Una volta true, nessun membro può più inviare/modificare il proprio
  // pronostico (fantas/{fantaId}/pickem/prediction_{userId}) — vedi
  // firestore.rules. L'admin sblocca sulla UI (no undo automatico sul
  // lock stesso, va rifatto a mano se serve riaprire per errore).
  locked: boolean;
}

// fantas/{fantaId}/pickem/prediction_{userId}
export interface PickemPrediction {
  userId: string;
  picks: Record<string, string>; // PickemMatch.id -> nome squadra pronosticata
  submittedAt: Date;
}
