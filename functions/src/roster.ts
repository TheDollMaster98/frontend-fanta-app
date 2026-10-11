import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import {
  advanceDraftTurn,
  buildDraftSlots,
  buildDraftTeamPick,
  getDraftTurnUserId,
} from "@/lib/draft";
import { MIN_COUNTDOWN_SECONDS } from "@/lib/constants";
import { findPickOwner } from "@/lib/uniquePicks";
import type { Fanta, TeamPick } from "@/types";

// Scritture sulle rose dal server (10/10). Prima un'asta chiusa o una pick
// di draft venivano assegnate dal browser di chiunque fosse connesso, e le
// regole dovevano lasciare a ogni membro la possibilità di far crescere
// una rosa: dalla console ci si poteva aggiungere giocatori finti. Ora le
// rose crescono solo qui (o per mano di admin/vice) e le regole lo negano
// a tutti gli altri.

// Errore con un codice di HttpsError: index.ts lo gira al client così com'è.
export class RosterError extends Error {
  constructor(
    public code: "permission-denied" | "failed-precondition" | "invalid-argument" | "not-found",
    message: string,
  ) {
    super(message);
  }
}

async function memberRole(
  db: Firestore,
  fantaId: string,
  uid: string,
): Promise<string | null> {
  const snap = await db.doc(`fantas/${fantaId}/members/${uid}`).get();
  return snap.exists ? ((snap.data()?.role as string) || "membro") : null;
}

/**
 * Chiude un'asta attiva col countdown scaduto e la assegna al miglior
 * offerente, in un'unica transazione (asta chiusa + rosa e budget del
 * vincitore + storico). false se non c'era niente da fare: asta già
 * chiusa, in pausa o countdown non ancora finito. Usata dal job ogni
 * minuto e dalla funzione chiamata dal browser allo scadere.
 */
export async function closeAuctionIfExpired(
  db: Firestore,
  auctionRef: DocumentReference,
  now: Timestamp,
): Promise<boolean> {
  const fantaRef = auctionRef.parent.parent;
  if (!fantaRef) return false;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(auctionRef);
    const data = snap.data();
    if (!snap.exists || !data || data.status !== "active") return false;
    const endsAt = data.countdownEndsAt as Timestamp | undefined;
    if (!endsAt || endsAt.toMillis() > now.toMillis()) return false;

    tx.update(auctionRef, {
      status: "closed",
      closedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const winnerId = data.highestBidderId as string | undefined;
    if (winnerId) {
      const price = (data.currentPrice as number) || 0;
      const pick: Record<string, unknown> = {
        id: auctionRef.id,
        pickType: data.pickType || "player",
        playerName: data.playerName,
        purchasePrice: price,
        auctionId: auctionRef.id,
        acquiredAt: now,
        ...(data.playerRole ? { playerRole: data.playerRole } : {}),
        ...(data.playerTeam ? { playerTeam: data.playerTeam } : {}),
      };
      tx.update(fantaRef.collection("members").doc(winnerId), {
        team: FieldValue.arrayUnion(pick),
        budgetSpent: FieldValue.increment(price),
        budgetLeft: FieldValue.increment(-price),
      });
      tx.set(fantaRef.collection("history").doc(), {
        playerName: data.playerName,
        ...(data.playerRole ? { playerRole: data.playerRole } : {}),
        ...(data.playerTeam ? { playerTeam: data.playerTeam } : {}),
        buyerUserId: winnerId,
        buyerName: (data.highestBidderName as string) || "Utente",
        price,
        auctionId: auctionRef.id,
        purchasedAt: FieldValue.serverTimestamp(),
      });
    }
    return true;
  });
}

// Chiusura chiesta da un browser allo scadere del countdown: solo un
// membro della lega, e solo se l'asta è davvero scaduta.
export async function closeAuctionForMember(
  db: Firestore,
  input: { uid: string; fantaId: string; auctionId: string; now?: number },
): Promise<boolean> {
  if (!input.fantaId || !input.auctionId) {
    throw new RosterError("invalid-argument", "fantaId e auctionId obbligatori");
  }
  if (!(await memberRole(db, input.fantaId, input.uid))) {
    throw new RosterError("permission-denied", "Non sei membro di questa lega");
  }
  return closeAuctionIfExpired(
    db,
    db.doc(`fantas/${input.fantaId}/auctions/${input.auctionId}`),
    Timestamp.fromMillis(input.now ?? Date.now()),
  );
}

export interface DraftPickInput {
  uid: string;
  fantaId: string;
  playerName: string;
  playerRole?: string;
  playerTeam?: string;
  now?: number;
}

/**
 * Pick del turno corrente del draft: la fa l'utente di turno (a mercato
 * aperto) o admin/vice per suo conto. Stato del draft avanzato, pick in
 * rosa e storico in un'unica transazione: prima erano tre scritture
 * separate dal browser e una poteva fallire lasciando il turno avanzato
 * senza giocatore.
 */
export async function makeDraftPickForMember(
  db: Firestore,
  input: DraftPickInput,
): Promise<TeamPick> {
  const playerName = (input.playerName || "").trim();
  if (!input.fantaId || !playerName) {
    throw new RosterError("invalid-argument", "fantaId e playerName obbligatori");
  }
  const now = input.now ?? Date.now();
  const fantaRef = db.doc(`fantas/${input.fantaId}`);
  const stateRef = fantaRef.collection("draft").doc("state");
  const callerRef = fantaRef.collection("members").doc(input.uid);

  return db.runTransaction(async (tx) => {
    const [fantaSnap, stateSnap, callerSnap, membersSnap] = await Promise.all([
      tx.get(fantaRef),
      tx.get(stateRef),
      tx.get(callerRef),
      tx.get(fantaRef.collection("members")),
    ]);
    if (!fantaSnap.exists) throw new RosterError("not-found", "Lega inesistente");
    if (!callerSnap.exists) {
      throw new RosterError("permission-denied", "Non sei membro di questa lega");
    }
    const state = stateSnap.data();
    if (!state || state.status !== "active") {
      throw new RosterError("failed-precondition", "Il draft non è in corso");
    }

    const fanta = { id: fantaSnap.id, ...fantaSnap.data() } as Fanta;
    const role = (callerSnap.data()?.role as string) || "membro";
    const isAdminOrVice = role === "admin" || role === "vice";

    const order = (state.order as string[]) || [];
    const slotIndex = state.currentSlotIndex as number;
    const turnIndex = state.currentTurnIndex as number;
    const slots = buildDraftSlots(fanta);
    const slot = slots[slotIndex];
    const targetUserId = getDraftTurnUserId(order, slotIndex, turnIndex);
    if (!slot || !targetUserId) {
      throw new RosterError("failed-precondition", "Turno non valido");
    }
    if (!isAdminOrVice) {
      if (targetUserId !== input.uid) {
        throw new RosterError("permission-denied", "Non è il tuo turno");
      }
      if (fanta.settings?.seasonStarted) {
        throw new RosterError("failed-precondition", "Mercato chiuso");
      }
    }

    // Una scelta unica per lega: già in un'altra rosa (o nella propria)
    // non si può riscegliere.
    const owner = findPickOwner(
      membersSnap.docs.map((d) => ({
        userId: d.id,
        teamName: (d.data().teamName as string) || "un altro membro",
        team: (d.data().team as TeamPick[]) || [],
      })),
      slot.pickType,
      playerName,
    );
    if (owner) {
      throw new RosterError(
        "failed-precondition",
        `${playerName} è già in rosa: ${owner.userId === input.uid ? "la tua squadra" : owner.teamName}`,
      );
    }

    const pickSeconds = fanta.settings?.draftPickSeconds || MIN_COUNTDOWN_SECONDS;
    const next = advanceDraftTurn(order, slots.length, slotIndex, turnIndex);
    const historyRef = fantaRef.collection("history").doc();
    const pick = buildDraftTeamPick(historyRef.id, slot, {
      playerName,
      playerRole: input.playerRole?.trim() || undefined,
      playerTeam: input.playerTeam?.trim() || undefined,
    });
    const targetRef = fantaRef.collection("members").doc(targetUserId);
    const targetSnap = membersSnap.docs.find((d) => d.id === targetUserId);
    if (!targetSnap?.exists) {
      throw new RosterError("failed-precondition", "Il membro di turno non è più nella lega");
    }
    // Nome per lo storico dal profilo utente, come faceva il browser
    // (getMemberName): il documento membro non ha un nome.
    const targetProfile = await tx.get(db.doc(`users/${targetUserId}`));

    tx.update(stateRef, {
      status: next.completed ? "completed" : "active",
      currentSlotIndex: next.slotIndex,
      currentTurnIndex: next.turnIndex,
      pickDeadline: next.completed
        ? FieldValue.delete()
        : Timestamp.fromMillis(now + pickSeconds * 1000),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(targetRef, {
      team: FieldValue.arrayUnion({ ...pick, acquiredAt: Timestamp.fromMillis(now) }),
    });
    tx.set(historyRef, {
      playerName: pick.playerName,
      ...(pick.playerRole ? { playerRole: pick.playerRole } : {}),
      ...(pick.playerTeam ? { playerTeam: pick.playerTeam } : {}),
      buyerUserId: targetUserId,
      buyerName: (targetProfile.data()?.name as string) || "Utente",
      price: 0,
      purchasedAt: FieldValue.serverTimestamp(),
    });
    return pick;
  });
}
