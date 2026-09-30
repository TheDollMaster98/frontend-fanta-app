// Un acquisto in rosa: un giocatore pro, una squadra, un coach o uno slot
// jolly, comprato all'asta da un membro. Il draft composto (step 4) è
// "squadra + coach + 5 player di ruolo + jolly opzionali": ogni pezzo è
// acquistato con un'asta separata, pickType dice di che pezzo si tratta.
// - "player": playerName/playerRole/playerTeam sono il giocatore pro.
// - "jolly": stesso shape di "player", ma non vincolato al limite per
//   ruolo — conta invece sul tetto maxJolly della lega.
// - "team": playerName è il nome della squadra pro (playerRole assente).
// - "coach": playerName è il nome del coach, inserito a mano (Leaguepedia
//   non espone una tabella coach utilizzabile).
export type TeamPickType = "player" | "jolly" | "team" | "coach";

// Statistiche inserite a mano da admin/vice/dev per un pick "player"/
// "jolly": copre CS, Vision Score e pentakill finché il calcolo
// automatico da Leaguepedia non li supporta (nomi campo non confermati —
// vedi ScoringWeights). Contano nel punteggio insieme ai pesi csPer50/
// visionPer10/pentakill della lega, sommandosi a "points" (che resta solo
// kill/morti/assist/vittoria calcolati da Leaguepedia).
export interface ManualPlayerStats {
  cs?: number;
  visionScore?: number;
  pentakills?: number;
}

// Statistiche inserite a mano per un pick "team"/"coach": obiettivi di
// partita e oro, finché il calcolo automatico non li supporta (nomi campo
// ScoreboardGames non confermati — vedi TeamScoringWeights).
export interface ManualTeamStats {
  towers?: number;
  dragons?: number;
  voidGrubs?: number;
  riftHeralds?: number;
  inhibitors?: number;
  atakhans?: number;
  barons?: number;
  cs?: number;
  gold?: number;
}

export interface TeamPick {
  id: string;
  pickType: TeamPickType;
  playerName: string;
  playerRole?: string; // ruolo del giocatore pro, es. "Mid Laner" (solo player/jolly)
  playerTeam?: string; // squadra pro reale, es. "T1" (solo player/jolly)
  purchasePrice: number;
  auctionId?: string;
  acquiredAt: Date;
  // Punti fantasy calcolati dalle statistiche reali (step 2): assente finché
  // non gira almeno una volta "Ricalcola Punteggi", poi aggiornato ad ogni
  // ricalcolo. Per pickType "team"/"coach" sono punti-vittoria della
  // squadra; per "player"/"jolly" derivano da kill/morti/assist/vittorie
  // pesati con gli scoringWeights della lega. Il totale mostrato in UI è
  // points + il bonus calcolato da manualPlayerStats/manualTeamStats (vedi
  // lib/scoring.ts) — quest'ultimo non richiede "Ricalcola Punteggi",
  // basta salvare le statistiche manuali.
  points?: number;
  manualPlayerStats?: ManualPlayerStats; // solo pickType player/jolly
  manualTeamStats?: ManualTeamStats; // solo pickType team/coach
}

// fantas/{fantaId}/history/{id} — log immutabile di chi ha comprato cosa,
// da chi e quando. A differenza di FantaMember.team, una voce qui resta
// anche se il giocatore viene poi rimosso dalla rosa o l'asta riaperta.
export interface HistoryEntry {
  id: string;
  playerName: string;
  playerRole?: string;
  playerTeam?: string;
  buyerUserId: string;
  buyerName: string;
  price: number;
  auctionId?: string;
  purchasedAt: Date;
}

// Cache locale dei pro player di un circuito, presa da Leaguepedia: evita
// di richiamare l'API ad ogni ricerca. Aggiornata da un'azione manuale
// (nessun cron/Cloud Function in quest'app), non in automatico.
export interface ProPlayer {
  id: string;
  circuit: string;
  player: string;
  name: string;
  country: string;
  role: string;
  team: string;
  birthdate: string;
  residency: string;
  updatedAt: Date;
}
