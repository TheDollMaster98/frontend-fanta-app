// Il ruolo (admin/vice-admin/giocatore) e tutto ciò che è per-lega (budget,
// nome team, fanta di appartenenza) vivono altrove: vedi Fanta.adminId/
// viceAdminIds, teamBudgets (contexts/FantaContext.tsx: getUserBudget/
// getTeamName) e Fanta.memberIds. L'unico attributo globale sull'account è
// isDeveloper, un flag per chi sviluppa/testa l'app (accesso universale).
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
  adminId: string;
  viceAdminIds: string[];
  settings: FantaSettings;
  memberIds: string[];
  inviteCode: string; // Codice per unirsi via /join/[code], indipendente dall'id
  createdAt: Date;
  updatedAt: Date;
}

export interface FantaSettings {
  generalBudget: number; // Budget generale per tutti
  minBid: number; // Puntata minima
  maxBid: number; // Puntata massima
  defaultCountdown: number; // Countdown predefinito in secondi (minimo 15)
  allowCustomBids: boolean; // Se permettere puntate custom
  maxPlayersTotal?: number; // Limite rosa totale per utente (0/assente = nessun limite)
  maxPlayersPerRole?: Record<string, number>; // Limite per ruolo (assente = nessun limite per quel ruolo)
}

// Team types
export interface Team {
  id: string;
  name: string;
  userId: string;
  fantaId: string;
  budget: number;
  remainingBudget: number;
  players: Player[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Player {
  id: string;
  name: string;
  role?: string; // Ruolo personalizzabile (es: "Top Laner", "Portiere", "Point Guard")
  team?: string; // Team/Squadra personalizzabile
  purchasePrice: number;
  customFields?: Record<string, string>; // Campi extra personalizzabili
  acquiredAt: Date;
}

// Auction types
export type AuctionStatus = "pending" | "active" | "closing" | "closed";

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

// Richieste di ingresso in un fanta
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
