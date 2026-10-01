// Barrel file (30/9): i tipi erano tutti in un solo file da ~430 righe,
// suddivisi qui per dominio in types/<dominio>.types.ts. Questo file resta
// il punto d'ingresso unico (import ... from "@/types") così nessun altro
// file del progetto ha dovuto cambiare i propri import.
export * from "./user.types";
export * from "./fanta.types";
export * from "./team-pick.types";
export * from "./auction.types";
export * from "./join-request.types";
export * from "./calendar.types";
export * from "./draft.types";
export * from "./pickem.types";

// Context types for state management
import type { User } from "./user.types";
import type { Fanta } from "./fanta.types";
import type { Auction } from "./auction.types";

export interface AppState {
  currentUser: User | null;
  currentFanta: Fanta | null;
  activeAuction: Auction | null;
}
