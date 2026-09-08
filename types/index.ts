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

// Un acquisto in rosa: un giocatore pro (o, dallo step 4, una squadra/coach)
// comprato all'asta da un membro. pickType distingue di che tipo di slot
// si tratta quando il draft composto sarà pronto.
export interface TeamPick {
  id: string;
  pickType: "player" | "jolly";
  playerName: string;
  playerRole?: string; // ruolo del giocatore pro, es. "Mid Laner"
  playerTeam?: string; // squadra pro reale, es. "T1"
  purchasePrice: number;
  auctionId?: string;
  acquiredAt: Date;
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

// Context types for state management
export interface AppState {
  currentUser: User | null;
  currentFanta: Fanta | null;
  activeAuction: Auction | null;
}
