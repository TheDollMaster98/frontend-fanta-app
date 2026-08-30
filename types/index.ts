// User roles and types
export type UserRole = "admin" | "vice-admin" | "user";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  fantaId?: string; // ID del fanta a cui appartiene
  teamName?: string;
  budget: number;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface FantaSettings {
  generalBudget: number; // Budget generale per tutti
  minBid: number; // Puntata minima
  maxBid: number; // Puntata massima
  defaultCountdown: number; // Countdown predefinito in secondi (default 3)
  allowCustomBids: boolean; // Se permettere puntate custom
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
  description?: string;
  basePrice: number;
  currentPrice: number;
  highestBidderId?: string;
  highestBidderName?: string;
  status: AuctionStatus;
  createdBy: string; // admin o vice-admin che ha creato l'asta
  countdownSeconds: number;
  countdownEndsAt?: Date;
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

// Context types for state management
export interface AppState {
  currentUser: User | null;
  currentFanta: Fanta | null;
  activeAuction: Auction | null;
}
