import type { TeamPickType } from "./team-pick.types";

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
