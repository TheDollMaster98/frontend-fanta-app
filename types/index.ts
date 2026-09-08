// Il ruolo (admin/vice-admin/membro) e tutto ciò che è per-lega (budget,
// rosa, nome team) vive nella sottocollezione fantas/{id}/members — non più
// sparso su Fanta.adminId/viceAdminIds/memberIds. L'unico attributo globale
// sull'account è isDeveloper, un flag per chi sviluppa/testa l'app (accesso
// universale, zero blocchi).
export interface User {
  id: string;
  email: string;
  name: string;
  isDeveloper?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Fanta (League) types
export type SportType = "calcio" | "lol" | "basket" | "custom";

export interface Fanta {
  id: string;
  name: string;
  description?: string;
  sportType: SportType; // Tipo di sport/gioco
  settings: FantaSettings;
  inviteCode: string; // Codice per unirsi via /join/[code], indipendente dall'id
  createdAt: Date;
  updatedAt: Date;
}

export interface ScoringWeights {
  kills: number;
  deaths: number;
  assists: number;
  win: number; // bonus se la squadra del giocatore vince quella partita
  // csPer50/visionPer10/pentakill: punti ogni 50 CS, ogni 10 di Vision
  // Score, e bonus per ogni pentakill segnata. NON calcolati
  // automaticamente da Leaguepedia in FantaContext.recalculateScores —
  // servono i nomi esatti dei campi (ScoreboardPlayers) per CS, Vision
  // Score e Pentakills, non ancora confermati. Contano comunque nel
  // punteggio se admin/vice/dev inseriscono le statistiche a mano su un
  // pick (TeamPick.manualPlayerStats, vedi lib/scoring.ts).
  csPer50: number;
  visionPer10: number;
  pentakill: number;
}

// Pesi punteggio per ruolo (es. "Top Laner", "Jungler", ... — le stesse
// stringhe di SPORT_TEMPLATES.lol.roles in lib/constants.ts): kill/morti/
// assist/vittoria/CS/vision non valgono uguale per ogni ruolo, quindi ogni
// ruolo ha il proprio set. Applicati in base al playerRole reale del pick
// — vale anche per i jolly, che contano col peso del loro ruolo vero, non
// un set a parte.
export type RoleScoringWeights = Record<string, ScoringWeights>;

// Pesi per le pick "team"/"coach": la squadra (o quella allenata dal
// coach) non è un giocatore singolo, quindi ha un set di statistiche
// completamente diverso — obiettivi di partita invece di kill/morti/
// assist individuali. Stessa nota di ScoringWeights: tower/dragon/
// voidGrub/riftHerald/inhibitor/atakhan/csPer100/goldPer10k NON sono
// calcolati automaticamente (servono i nomi esatti dei campi Leaguepedia
// ScoreboardGames, non ancora confermati), ma contano se inseriti a mano
// su un pick (TeamPick.manualTeamStats, vedi lib/scoring.ts). kill/death/
// assist/csPer100 restano 0 di default: sono qui per completezza
// (rispecchiano lo schema a cui si è ispirata la lega), ma un pick "team"
// non ha kill/morti/assist propri — solo obiettivi e vittoria.
export interface TeamScoringWeights {
  win: number;
  tower: number;
  dragon: number; // dragone elementale
  voidGrub: number;
  riftHerald: number;
  inhibitor: number;
  atakhan: number;
  baron: number;
  kill: number;
  death: number;
  assist: number;
  csPer100: number;
  goldPer10k: number;
}

export interface FantaSettings {
  generalBudget: number; // Budget generale per tutti
  minBid: number; // Puntata minima
  maxBid: number; // Puntata massima
  defaultCountdown: number; // Countdown predefinito in secondi (30-300)
  allowCustomBids: boolean; // Se permettere puntate custom
  maxPlayersTotal?: number; // Limite rosa totale per utente (0/assente = nessun limite)
  maxPlayersPerRole?: Record<string, number>; // Limite per ruolo (assente = nessun limite per quel ruolo)
  // Solo per leghe LoL: circuito seguito (LCK/LPL/.../WORLDS/MSI/ALTRO) e
  // numero di slot jolly (giocatori extra senza vincolo di ruolo). WORLDS e
  // MSI sono a eliminazione: attiveranno la doppia fase gironi/finale.
  circuitType?: string;
  maxJolly?: number;
  // Pesi per calcolare i punti fantasy dalle statistiche reali dei
  // giocatori, uno per ruolo. Bloccati (modificabili solo da admin/dev,
  // non vice) una volta che le partite del torneo sono iniziate.
  scoringWeights?: RoleScoringWeights;
  // Pesi per le pick "team"/"coach": obiettivi di partita + vittoria,
  // niente kill/morti/assist perché non sono un giocatore singolo.
  teamScoringWeights?: TeamScoringWeights;
}

// Ruolo di un membro NELLA LEGA (permessi) — non va confuso col ruolo del
// giocatore pro comprato (es. "Mid Laner"), che vive su TeamPick.playerRole.
export type MemberRole = "admin" | "vice" | "membro";

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

// fantas/{fantaId}/members/{userId}
export interface FantaMember {
  userId: string;
  role: MemberRole;
  teamName: string; // nome della squadra fantasy scelto dal membro
  team: TeamPick[]; // rosa: tutti gli acquisti
  budgetTot: number;
  budgetSpent: number;
  budgetLeft: number;
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

// Auction types
export type AuctionStatus = "pending" | "active" | "closing" | "closed";

// fantas/{fantaId}/auctions/{id}
export interface Auction {
  id: string;
  fantaId: string;
  pickType: TeamPickType; // cosa si sta aggiudicando: giocatore/jolly/squadra/coach
  playerName: string;
  playerRole?: string;
  playerTeam?: string;
  auctionFormat?: string;
  description?: string;
  basePrice: number;
  currentPrice: number;
  highestBidderId?: string;
  highestBidderName?: string;
  status: AuctionStatus;
  createdBy: string; // admin o vice-admin che ha creato l'asta
  countdownSeconds: number;
  countdownEndsAt?: Date;
  startedAt?: Date; // quando è stata avviata (per calcolare la durata)
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// fantas/{fantaId}/auctions/{auctionId}/bids/{id}
export interface Bid {
  id: string;
  auctionId: string;
  userId: string;
  userName: string;
  amount: number;
  createdAt: Date;
}

// Preset bid buttons
export interface BidPreset {
  label: string;
  value: number;
}

// Richieste di ingresso in un fanta — fantas/{fantaId}/joinRequests/{id}
export type JoinRequestStatus = "pending" | "approved" | "rejected";

export interface JoinRequest {
  id: string;
  fantaId: string;
  fantaName: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: JoinRequestStatus;
  createdAt: Date;
}

// Calendario a girone all'italiana (round-robin) tra i membri della lega:
// fantas/{fantaId}/calendar/{id}. Generato una volta dall'admin/dev con il
// metodo del cerchio; awayUserId assente = turno di riposo (numero dispari
// di membri). Il risultato del confronto diretto (chi ha totalizzato più
// punti fantasy in quel turno) non è ancora calcolato: serve prima una
// mappatura affidabile giornata-fantasy ↔ data reale delle partite pro, che
// Leaguepedia non offre in modo diretto — per ora la classifica è per
// punteggio totale, non per punti-partita da confronto diretto.
export interface RoundFixture {
  homeUserId: string;
  awayUserId: string | null;
}

export interface CalendarRound {
  id: string;
  roundNumber: number;
  fixtures: RoundFixture[];
}

// Context types for state management
export interface AppState {
  currentUser: User | null;
  currentFanta: Fanta | null;
  activeAuction: Auction | null;
}
