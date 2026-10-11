"use strict";

// ../../../tmp/claude-0/-home-user-frontend-fanta-app/250e9a0f-23c2-5476-bfdb-579962c4af29/scratchpad/rostertest/run.ts
var import_app = require("firebase-admin/app");
var import_firestore3 = require("firebase-admin/firestore");

// functions/src/roster.ts
var import_firestore = require("firebase-admin/firestore");

// lib/constants.ts
var MIN_COUNTDOWN_SECONDS = 30;
var LOL_ROLES = ["Top Laner", "Jungler", "Mid Laner", "ADC", "Support"];
var DEFAULT_SCORING_WEIGHTS = {
  kills: 3,
  deaths: -1,
  assists: 1.5,
  win: 2,
  csPer50: 0,
  visionPer10: 0,
  pentakill: 0
};
var DEFAULT_ROLE_SCORING_WEIGHTS = Object.fromEntries(
  LOL_ROLES.map((role) => [role, { ...DEFAULT_SCORING_WEIGHTS }])
);
var SPORT_TEMPLATES = {
  lol: {
    roles: LOL_ROLES
  },
  custom: {
    roles: []
  }
};
function getFantaRoles(fanta) {
  if (fanta.sportType === "custom") return fanta.settings.customRoles || [];
  return SPORT_TEMPLATES[fanta.sportType]?.roles || [];
}

// lib/draft.ts
function buildDraftSlots(fanta) {
  const isLol = fanta.sportType === "lol";
  const slots = [];
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
function getDraftTurnUserId(order, slotIndex, turnIndex) {
  if (order.length === 0) return void 0;
  const forward = slotIndex % 2 === 0;
  return forward ? order[turnIndex] : order[order.length - 1 - turnIndex];
}
function advanceDraftTurn(order, totalSlots, currentSlotIndex, currentTurnIndex) {
  let slotIndex = currentSlotIndex;
  let turnIndex = currentTurnIndex + 1;
  if (turnIndex >= order.length) {
    turnIndex = 0;
    slotIndex += 1;
  }
  return { slotIndex, turnIndex, completed: slotIndex >= totalSlots };
}
function buildDraftTeamPick(id, slot, input) {
  const playerRole = slot.pickType === "player" ? slot.role : slot.pickType === "jolly" ? input.playerRole : void 0;
  return {
    id,
    pickType: slot.pickType,
    playerName: input.playerName,
    ...playerRole ? { playerRole } : {},
    ...input.playerTeam ? { playerTeam: input.playerTeam } : {},
    purchasePrice: 0,
    acquiredAt: /* @__PURE__ */ new Date()
  };
}

// lib/uniquePicks.ts
function pickKind(pickType) {
  return pickType === "jolly" || !pickType ? "player" : pickType;
}
function pickKey(pickType, name) {
  return `${pickKind(pickType)}:${(name || "").trim().toLowerCase()}`;
}
function findPickOwner(members, pickType, name) {
  const key = pickKey(pickType, name);
  return members.find((m) => m.team.some((p) => pickKey(p.pickType, p.playerName) === key));
}

// functions/src/roster.ts
var RosterError = class extends Error {
  constructor(code2, message) {
    super(message);
    this.code = code2;
  }
};
async function memberRole(db2, fantaId, uid) {
  const snap = await db2.doc(`fantas/${fantaId}/members/${uid}`).get();
  return snap.exists ? snap.data()?.role || "membro" : null;
}
async function closeAuctionIfExpired(db2, auctionRef, now) {
  const fantaRef = auctionRef.parent.parent;
  if (!fantaRef) return false;
  return db2.runTransaction(async (tx) => {
    const snap = await tx.get(auctionRef);
    const data = snap.data();
    if (!snap.exists || !data || data.status !== "active") return false;
    const endsAt = data.countdownEndsAt;
    if (!endsAt || endsAt.toMillis() > now.toMillis()) return false;
    tx.update(auctionRef, {
      status: "closed",
      closedAt: import_firestore.FieldValue.serverTimestamp(),
      updatedAt: import_firestore.FieldValue.serverTimestamp()
    });
    const winnerId = data.highestBidderId;
    if (winnerId) {
      const price = data.currentPrice || 0;
      const pick = {
        id: auctionRef.id,
        pickType: data.pickType || "player",
        playerName: data.playerName,
        purchasePrice: price,
        auctionId: auctionRef.id,
        acquiredAt: now,
        ...data.playerRole ? { playerRole: data.playerRole } : {},
        ...data.playerTeam ? { playerTeam: data.playerTeam } : {}
      };
      tx.update(fantaRef.collection("members").doc(winnerId), {
        team: import_firestore.FieldValue.arrayUnion(pick),
        budgetSpent: import_firestore.FieldValue.increment(price),
        budgetLeft: import_firestore.FieldValue.increment(-price)
      });
      tx.set(fantaRef.collection("history").doc(), {
        playerName: data.playerName,
        ...data.playerRole ? { playerRole: data.playerRole } : {},
        ...data.playerTeam ? { playerTeam: data.playerTeam } : {},
        buyerUserId: winnerId,
        buyerName: data.highestBidderName || "Utente",
        price,
        auctionId: auctionRef.id,
        purchasedAt: import_firestore.FieldValue.serverTimestamp()
      });
    }
    return true;
  });
}
async function closeAuctionForMember(db2, input) {
  if (!input.fantaId || !input.auctionId) {
    throw new RosterError("invalid-argument", "fantaId e auctionId obbligatori");
  }
  if (!await memberRole(db2, input.fantaId, input.uid)) {
    throw new RosterError("permission-denied", "Non sei membro di questa lega");
  }
  return closeAuctionIfExpired(
    db2,
    db2.doc(`fantas/${input.fantaId}/auctions/${input.auctionId}`),
    import_firestore.Timestamp.fromMillis(input.now ?? Date.now())
  );
}
async function makeDraftPickForMember(db2, input) {
  const playerName = (input.playerName || "").trim();
  if (!input.fantaId || !playerName) {
    throw new RosterError("invalid-argument", "fantaId e playerName obbligatori");
  }
  const now = input.now ?? Date.now();
  const fantaRef = db2.doc(`fantas/${input.fantaId}`);
  const stateRef = fantaRef.collection("draft").doc("state");
  const callerRef = fantaRef.collection("members").doc(input.uid);
  return db2.runTransaction(async (tx) => {
    const [fantaSnap, stateSnap, callerSnap, membersSnap] = await Promise.all([
      tx.get(fantaRef),
      tx.get(stateRef),
      tx.get(callerRef),
      tx.get(fantaRef.collection("members"))
    ]);
    if (!fantaSnap.exists) throw new RosterError("not-found", "Lega inesistente");
    if (!callerSnap.exists) {
      throw new RosterError("permission-denied", "Non sei membro di questa lega");
    }
    const state = stateSnap.data();
    if (!state || state.status !== "active") {
      throw new RosterError("failed-precondition", "Il draft non \xE8 in corso");
    }
    const fanta = { id: fantaSnap.id, ...fantaSnap.data() };
    const role = callerSnap.data()?.role || "membro";
    const isAdminOrVice = role === "admin" || role === "vice";
    const order = state.order || [];
    const slotIndex = state.currentSlotIndex;
    const turnIndex = state.currentTurnIndex;
    const slots = buildDraftSlots(fanta);
    const slot = slots[slotIndex];
    const targetUserId = getDraftTurnUserId(order, slotIndex, turnIndex);
    if (!slot || !targetUserId) {
      throw new RosterError("failed-precondition", "Turno non valido");
    }
    if (!isAdminOrVice) {
      if (targetUserId !== input.uid) {
        throw new RosterError("permission-denied", "Non \xE8 il tuo turno");
      }
      if (fanta.settings?.seasonStarted) {
        throw new RosterError("failed-precondition", "Mercato chiuso");
      }
    }
    const owner = findPickOwner(
      membersSnap.docs.map((d) => ({
        userId: d.id,
        teamName: d.data().teamName || "un altro membro",
        team: d.data().team || []
      })),
      slot.pickType,
      playerName
    );
    if (owner) {
      throw new RosterError(
        "failed-precondition",
        `${playerName} \xE8 gi\xE0 in rosa: ${owner.userId === input.uid ? "la tua squadra" : owner.teamName}`
      );
    }
    const pickSeconds = fanta.settings?.draftPickSeconds || MIN_COUNTDOWN_SECONDS;
    const next = advanceDraftTurn(order, slots.length, slotIndex, turnIndex);
    const historyRef = fantaRef.collection("history").doc();
    const pick = buildDraftTeamPick(historyRef.id, slot, {
      playerName,
      playerRole: input.playerRole?.trim() || void 0,
      playerTeam: input.playerTeam?.trim() || void 0
    });
    const targetRef = fantaRef.collection("members").doc(targetUserId);
    const targetSnap = membersSnap.docs.find((d) => d.id === targetUserId);
    if (!targetSnap?.exists) {
      throw new RosterError("failed-precondition", "Il membro di turno non \xE8 pi\xF9 nella lega");
    }
    const targetProfile = await tx.get(db2.doc(`users/${targetUserId}`));
    tx.update(stateRef, {
      status: next.completed ? "completed" : "active",
      currentSlotIndex: next.slotIndex,
      currentTurnIndex: next.turnIndex,
      pickDeadline: next.completed ? import_firestore.FieldValue.delete() : import_firestore.Timestamp.fromMillis(now + pickSeconds * 1e3),
      updatedAt: import_firestore.FieldValue.serverTimestamp()
    });
    tx.update(targetRef, {
      team: import_firestore.FieldValue.arrayUnion({ ...pick, acquiredAt: import_firestore.Timestamp.fromMillis(now) })
    });
    tx.set(historyRef, {
      playerName: pick.playerName,
      ...pick.playerRole ? { playerRole: pick.playerRole } : {},
      ...pick.playerTeam ? { playerTeam: pick.playerTeam } : {},
      buyerUserId: targetUserId,
      buyerName: targetProfile.data()?.name || "Utente",
      price: 0,
      purchasedAt: import_firestore.FieldValue.serverTimestamp()
    });
    return pick;
  });
}

// functions/src/jobs.ts
var import_firestore2 = require("firebase-admin/firestore");
var PICKBAN_GRACE_MS = 6 * 3600 * 1e3;
var PICKBAN_EMPTY_AFTER_MS = 3 * 86400 * 1e3;
async function closeExpiredAuctions(db2, options = {}) {
  const now = import_firestore2.Timestamp.fromMillis(options.now ?? Date.now());
  const log = options.log ?? (() => {
  });
  const expired = await db2.collectionGroup("auctions").where("status", "==", "active").where("countdownEndsAt", "<=", now).get();
  let closed = 0;
  for (const auctionDoc of expired.docs) {
    if (await closeAuctionIfExpired(db2, auctionDoc.ref, now)) {
      closed += 1;
      log("Asta chiusa", {
        fantaId: auctionDoc.ref.parent.parent?.id,
        auctionId: auctionDoc.id
      });
    }
  }
  return closed;
}

// ../../../tmp/claude-0/-home-user-frontend-fanta-app/250e9a0f-23c2-5476-bfdb-579962c4af29/scratchpad/rostertest/run.ts
var ok = (c, m) => {
  console.log(c ? "PASS" : "FAIL", "|", m);
  if (!c) process.exitCode = 1;
};
(0, import_app.initializeApp)({ projectId: "demo-test" });
var db = (0, import_firestore3.getFirestore)();
db.settings({ ignoreUndefinedProperties: true });
var NOW = Date.UTC(2026, 9, 10, 12);
var ts = (ms) => import_firestore3.Timestamp.fromMillis(ms);
var F = db.collection("fantas").doc("lg");
var code = async (p) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof RosterError ? e.code : "other:" + e.message;
  }
};
async function main() {
  await F.set({ name: "L", sportType: "lol", settings: { circuitType: "LEC", maxJolly: 1, seasonStarted: false, draftPickSeconds: 60 } });
  for (const [id, role] of [["adm", "admin"], ["u1", "membro"], ["u2", "membro"]]) {
    await F.collection("members").doc(id).set({ userId: id, name: id.toUpperCase(), role, team: [], budgetTot: 500, budgetSpent: 0, budgetLeft: 500 });
  }
  await F.collection("auctions").doc("exp").set({ status: "active", pickType: "player", playerName: "Caps", playerRole: "Mid Laner", currentPrice: 40, highestBidderId: "u1", highestBidderName: "U1", countdownEndsAt: ts(NOW - 1e3) });
  await F.collection("auctions").doc("live").set({ status: "active", pickType: "player", playerName: "Yike", currentPrice: 10, highestBidderId: "u2", countdownEndsAt: ts(NOW + 6e4) });
  ok(await code(closeAuctionForMember(db, { uid: "stranger", fantaId: "lg", auctionId: "exp", now: NOW })) === "permission-denied", "asta: estraneo non pu\xF2 chiudere");
  ok(await closeAuctionForMember(db, { uid: "u2", fantaId: "lg", auctionId: "live", now: NOW }) === false, "asta: countdown non finito, non si chiude");
  ok((await db.doc("fantas/lg/auctions/live").get()).data()?.status === "active", "asta in corso resta attiva");
  ok(await closeAuctionForMember(db, { uid: "u2", fantaId: "lg", auctionId: "exp", now: NOW }) === true, "asta scaduta chiusa da un membro qualsiasi");
  ok(await closeAuctionForMember(db, { uid: "u1", fantaId: "lg", auctionId: "exp", now: NOW }) === false, "seconda chiusura: niente da fare");
  const u1 = (await F.collection("members").doc("u1").get()).data();
  ok(u1.team.length === 1 && u1.team[0].playerName === "Caps" && u1.budgetLeft === 460 && u1.budgetSpent === 40, "vincitore: pick una volta sola e budget scalato");
  ok((await F.collection("history").where("auctionId", "==", "exp").get()).size === 1, "storico asta scritto una volta");
  ok(await closeExpiredAuctions(db, { now: NOW }) === 0, "job: niente da chiudere dopo la chiusura dal browser");
  await F.collection("draft").doc("state").set({ status: "active", order: ["u1", "u2"], currentSlotIndex: 0, currentTurnIndex: 0, pickDeadline: ts(NOW + 3e4), pendingAssignments: [] });
  ok(await code(makeDraftPickForMember(db, { uid: "u2", fantaId: "lg", playerName: "G2 Esports", now: NOW })) === "permission-denied", "draft: non \xE8 il turno di u2");
  ok(await code(makeDraftPickForMember(db, { uid: "stranger", fantaId: "lg", playerName: "X", now: NOW })) === "permission-denied", "draft: estraneo");
  ok(await code(makeDraftPickForMember(db, { uid: "u1", fantaId: "lg", playerName: "  ", now: NOW })) === "invalid-argument", "draft: nome vuoto");
  ok(await code(makeDraftPickForMember(db, { uid: "u1", fantaId: "lg", playerName: "G2 Esports", playerTeam: "EMEA", now: NOW })) === "ok", "draft: u1 sceglie la squadra al suo turno");
  let st = (await F.collection("draft").doc("state").get()).data();
  ok(st.currentTurnIndex === 1 && st.currentSlotIndex === 0 && st.pickDeadline.toMillis() === NOW + 6e4, "draft: turno avanzato a u2, scadenza +60s");
  ok(await code(makeDraftPickForMember(db, { uid: "adm", fantaId: "lg", playerName: " g2 esports ", now: NOW })) === "failed-precondition", "draft: squadra gi\xE0 in rosa di u1 (maiuscole/spazi diversi) rifiutata");
  ok((await F.collection("draft").doc("state").get()).data().currentTurnIndex === 1, "draft: pick rifiutata, turno fermo");
  ok(await code(makeDraftPickForMember(db, { uid: "adm", fantaId: "lg", playerName: "Fnatic", now: NOW })) === "ok", "draft: admin sceglie per conto di u2");
  st = (await F.collection("draft").doc("state").get()).data();
  ok(st.currentSlotIndex === 1 && st.currentTurnIndex === 0, "draft: secondo giro (coach), a serpentina parte u2");
  const u2 = (await F.collection("members").doc("u2").get()).data();
  ok(u2.team.length === 1 && u2.team[0].playerName === "Fnatic" && u2.team[0].pickType === "team" && u2.budgetLeft === 500, "draft: pick in rosa di u2, budget invariato");
  ok((await F.collection("history").where("buyerUserId", "==", "u2").get()).size === 1, "draft: storico della pick di u2");
  await F.collection("members").doc("u1").update({ team: [{ id: "x", pickType: "player", playerName: "Caps", purchasePrice: 0 }, { id: "y", pickType: "team", playerName: "G2 Esports", purchasePrice: 0 }] });
  ok(await code(makeDraftPickForMember(db, { uid: "u2", fantaId: "lg", playerName: "G2 Esports", now: NOW })) === "ok", "draft: coach di nome come una squadra in rosa ammesso (categorie diverse)");
  await F.collection("draft").doc("state").update({ currentSlotIndex: 3, currentTurnIndex: 0 });
  ok(await code(makeDraftPickForMember(db, { uid: "adm", fantaId: "lg", playerName: "caps", now: NOW })) === "failed-precondition", "draft: giocatore gi\xE0 in rosa rifiutato anche come altro slot");
  await F.update({ "settings.seasonStarted": true });
  ok(await code(makeDraftPickForMember(db, { uid: "u2", fantaId: "lg", playerName: "Coach", now: NOW })) === "failed-precondition", "draft: a mercato chiuso il membro non sceglie");
  await F.collection("draft").doc("state").update({ status: "completed" });
  ok(await code(makeDraftPickForMember(db, { uid: "adm", fantaId: "lg", playerName: "Coach", now: NOW })) === "failed-precondition", "draft finito: nessuna pick");
}
main().then(() => process.exit()).catch((e) => {
  console.error(e);
  process.exit(1);
});
