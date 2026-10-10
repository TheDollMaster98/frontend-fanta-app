import { getFantaRoles } from "@/lib/constants";
import type { DraftSlot, Fanta, TeamPick } from "@/types";

// Sequenza degli "slot" del draft a turni, nell'ordine in cui si giocano i
// giri: squadra, coach, poi un giro per ruolo (nell'ordine dei ruoli dello
// sport), poi un giro per ogni jolly disponibile. Solo LoL ha squadra/
// coach/jolly (stessa distinzione già usata in app/dashboard/auctions/page
// per l'asta): gli altri sport hanno solo un giro per ruolo.
export function buildDraftSlots(
  fanta: Pick<Fanta, "sportType" | "settings">,
): DraftSlot[] {
  const isLol = fanta.sportType === "lol";
  const slots: DraftSlot[] = [];

  if (isLol) {
    slots.push({ pickType: "team" });
    slots.push({ pickType: "coach" });
  }

  const roles = getFantaRoles(fanta);
  roles.forEach((role) => slots.push({ pickType: "player", role }));

  if (isLol) {
    const maxJolly = fanta.settings.maxJolly || 0;
    for (let i = 0; i < maxJolly; i++) {
      slots.push({ pickType: "jolly" });
    }
  }

  return slots;
}

// Turno corrente: a serpentina, l'ordine si inverte ogni giro (slot pari =
// avanti, slot dispari = indietro) — es. con 3 membri [A,B,C]: giro 0 →
// A,B,C, giro 1 → C,B,A, giro 2 → A,B,C...
export function getDraftTurnUserId(
  order: string[],
  slotIndex: number,
  turnIndex: number,
): string | undefined {
  if (order.length === 0) return undefined;
  const forward = slotIndex % 2 === 0;
  return forward ? order[turnIndex] : order[order.length - 1 - turnIndex];
}

// Prossimo turno dopo una scelta (o uno skip): avanza nell'ordine, e a fine
// giro passa allo slot successivo. completed=true quando anche l'ultimo
// slot è stato completato da tutti — il draft è finito.
export function advanceDraftTurn(
  order: string[],
  totalSlots: number,
  currentSlotIndex: number,
  currentTurnIndex: number,
): { slotIndex: number; turnIndex: number; completed: boolean } {
  let slotIndex = currentSlotIndex;
  let turnIndex = currentTurnIndex + 1;
  if (turnIndex >= order.length) {
    turnIndex = 0;
    slotIndex += 1;
  }
  return { slotIndex, turnIndex, completed: slotIndex >= totalSlots };
}

// Pick di draft (turno normale o assegnazione a mano di un turno saltato).
// Ruolo: per uno slot "player" è quello fisso dello slot; per un jolly è
// il ruolo reale del giocatore scelto, senza il quale computeAutoPoints
// non trova i pesi e il jolly non prende mai punti (code review, 8/10).
// Team/coach non hanno ruolo. Campi assenti omessi, non undefined.
export function buildDraftTeamPick(
  id: string,
  slot: DraftSlot,
  input: { playerName: string; playerRole?: string; playerTeam?: string },
): TeamPick {
  const playerRole =
    slot.pickType === "player"
      ? slot.role
      : slot.pickType === "jolly"
        ? input.playerRole
        : undefined;
  return {
    id,
    pickType: slot.pickType,
    playerName: input.playerName,
    ...(playerRole ? { playerRole } : {}),
    ...(input.playerTeam ? { playerTeam: input.playerTeam } : {}),
    purchasePrice: 0,
    acquiredAt: new Date(),
  };
}
