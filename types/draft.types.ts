import type { TeamPickType } from "./team-pick.types";

// Uno "slot" della sequenza del draft a turni: cosa si sceglie in quel
// giro (es. {pickType:"player", role:"Top Laner"}). La sequenza completa
// (squadra, coach, un giro per ruolo, poi i jolly) è calcolata da
// lib/draft.ts#buildDraftSlots a partire da sportType/maxJolly della lega,
// non salvata su Firestore: è deterministica, tutti i client la ricavano
// allo stesso modo dalle stesse impostazioni.
export interface DraftSlot {
  pickType: TeamPickType;
  role?: string; // solo pickType "player"
}

// Un turno saltato per timeout: resta qui finché admin/vice non lo assegna
// a mano (vedi FantaContext.fillPendingDraftAssignment), il draft nel
// frattempo continua con gli altri turni.
export interface PendingDraftAssignment {
  userId: string;
  slotIndex: number;
}

// fantas/{fantaId}/draft/state — documento singolo (non una collezione):
// lo stato dell'intero draft a turni, condiviso in tempo reale come le
// aste. Esiste solo per leghe con settings.draftMode === "snake".
export interface DraftState {
  status: "not_started" | "active" | "completed";
  order: string[]; // userId, ordine generato una volta a caso all'avvio
  currentSlotIndex: number;
  currentTurnIndex: number; // indice in "order" PRIMA dell'inversione a serpentina
  pickDeadline?: Date; // scadenza del turno corrente, stesso pattern di Auction.countdownEndsAt
  pendingAssignments: PendingDraftAssignment[];
  startedAt?: Date;
  updatedAt: Date;
}
