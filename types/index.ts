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
  // giocatori. Bloccati (modificabili solo da admin/dev, non vice) una
  // volta che le partite del torneo sono iniziate.
  scoringWeights?: ScoringWeights;
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
  // pesati con gli scoringWeights della lega.
  points?: number;
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
