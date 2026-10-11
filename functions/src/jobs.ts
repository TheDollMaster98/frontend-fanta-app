import {
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Firestore,
} from "firebase-admin/firestore";
import { buildPickBanRounds } from "@/lib/pickBanRounds";
import {
  computeChampionPickWrites,
  computeScoreWrites,
  type ChampionPickDoc,
  type WriteOp,
} from "@/lib/recalc";
import type { BracketRound, CalendarRound, Fanta, FantaMember } from "@/types";
import { closeAuctionIfExpired } from "./roster";

// Logica dei job pianificati (9/10), separata da index.ts per poterla
// provare contro l'emulatore Firestore senza il runtime delle Functions.
// Usa l'SDK admin: le regole Firestore non si applicano, quindi qui vive
// solo ciò che il server deve poter fare per tutti (ricalcolo, chiusura
// turni e aste), con la stessa logica del client (lib/recalc.ts).

type Log = (message: string, extra?: Record<string, unknown>) => void;

// Timestamp annidati -> Date, come fanno i mapper di FantaContext: il
// motore lavora su Date. In scrittura l'SDK admin riconverte da solo.
function revive<T>(value: unknown): T {
  if (value instanceof Timestamp) return value.toDate() as T;
  if (Array.isArray(value)) return value.map((v) => revive(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      out[k] = revive(v);
    });
    return out as T;
  }
  return value as T;
}

export async function applyWritesAdmin(db: Firestore, writes: WriteOp[]): Promise<void> {
  for (let i = 0; i < writes.length; i += 450) {
    const batch = db.batch();
    writes.slice(i, i + 450).forEach((op) => {
      if (op.type === "create") {
        batch.set(db.collection(op.collectionPath.join("/")).doc(), op.data);
      } else {
        const ref = db.doc(op.path.join("/"));
        if (op.type === "update") batch.update(ref, op.data);
        else batch.set(ref, op.data);
      }
    });
    await batch.commit();
  }
}

async function loadLeague(db: Firestore, fantaDoc: QueryDocumentSnapshot) {
  const base = fantaDoc.ref;
  const [members, calendar, bracket] = await Promise.all([
    base.collection("members").get(),
    base.collection("calendar").get(),
    base.collection("bracket").get(),
  ]);
  const fanta = { id: fantaDoc.id, ...revive<DocumentData>(fantaDoc.data()) } as Fanta;
  return {
    fanta,
    members: members.docs.map((d) => {
      const data = revive<DocumentData>(d.data());
      return { ...data, userId: d.id, team: data.team || [] } as FantaMember;
    }),
    calendar: calendar.docs
      .map((d) => ({ id: d.id, ...revive<DocumentData>(d.data()) }) as CalendarRound)
      .sort((a, b) => a.roundNumber - b.roundNumber),
    bracketRounds: bracket.docs.map(
      (d) => ({ id: d.id, ...revive<DocumentData>(d.data()) }) as BracketRound,
    ),
  };
}

// Margine dopo la fine di un turno prima di chiuderlo da soli: Leaguepedia
// aggiorna le partite con qualche ora di ritardo.
const PICKBAN_GRACE_MS = 6 * 3600 * 1000;
// Turno finito da così tanto senza nessuna partita trovata: settimana
// senza match, si chiude con 0 punti invece di riprovare per sempre.
const PICKBAN_EMPTY_AFTER_MS = 3 * 86400 * 1000;

// Pick/Ban di una lega: chiude da solo ogni turno finito (più il margine)
// e ricalcola quelli già chiusi con pick non ancora rivelati (turni chiusi
// prima del campo "revealed", o rimasti senza punti per un rate limit).
async function settleChampionPicks(
  db: Firestore,
  league: Awaited<ReturnType<typeof loadLeague>>,
  now: number,
  log: Log,
): Promise<void> {
  const { fanta, members, calendar, bracketRounds } = league;
  const circuitType = fanta.settings.circuitType || "";
  if (!circuitType) return;

  const base = db.collection("fantas").doc(fanta.id);
  const [statesSnap, picksSnap] = await Promise.all([
    base.collection("championPickRounds").get(),
    base.collection("championPicks").get(),
  ]);
  const closedRounds = new Set(
    statesSnap.docs.filter((d) => d.data().closed === true).map((d) => d.id),
  );

  // Anche gironi e tabellone di Mondiali/MSI (lib/pickBanRounds.ts).
  for (const round of buildPickBanRounds(calendar, bracketRounds)) {
    const endedAt = round.endDate.getTime();
    if (now < endedAt + PICKBAN_GRACE_MS) continue;

    const roundPicks = picksSnap.docs.filter((d) => d.data().roundId === round.id);
    const alreadyClosed = closedRounds.has(round.id);
    const needsWork =
      !alreadyClosed || roundPicks.some((d) => d.data().revealed !== true);
    if (!needsWork) continue;

    const picks: ChampionPickDoc[] = roundPicks.map((d) => ({
      id: d.id,
      userId: (d.data().userId as string) || "",
      championName: (d.data().championName as string) || "",
      banChampionName: d.data().banChampionName as string | undefined,
    }));

    try {
      const writes = await computeChampionPickWrites({
        fantaId: fanta.id,
        circuitType,
        round,
        picks,
        members,
        allowEmpty: now >= endedAt + PICKBAN_EMPTY_AFTER_MS,
      });
      await applyWritesAdmin(db, writes);
      if (!alreadyClosed) {
        await base.collection("championPickRounds").doc(round.id).set({ closed: true });
      }
      log("Pick/Ban turno chiuso", { fantaId: fanta.id, roundId: round.id, picks: picks.length });
    } catch (error) {
      // NO_GAMES (dati non ancora su Leaguepedia) o LEAGUEPEDIA_UNAVAILABLE:
      // il turno resta com'è, si riprova al giro successivo.
      log("Pick/Ban turno rimandato", {
        fantaId: fanta.id,
        roundId: round.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// Job "ricalcolo": per ogni lega LoL con un circuito, punteggi (rose,
// calendario, tabellone) e poi Pick/Ban. Un errore su una lega non ferma
// le altre.
export async function runRecalculation(
  db: Firestore,
  options: { now?: number; log?: Log } = {},
): Promise<{ leagues: number; failed: number }> {
  const now = options.now ?? Date.now();
  const log: Log = options.log ?? (() => {});
  const fantas = await db.collection("fantas").where("sportType", "==", "lol").get();
  let failed = 0;

  for (const fantaDoc of fantas.docs) {
    try {
      const league = await loadLeague(db, fantaDoc);
      if (!league.fanta.settings?.circuitType) continue;
      const writes = await computeScoreWrites({ ...league, now });
      await applyWritesAdmin(db, writes);
      log("Punteggi ricalcolati", { fantaId: fantaDoc.id, writes: writes.length });
      await settleChampionPicks(db, league, now, log);
    } catch (error) {
      failed += 1;
      log("Ricalcolo lega fallito", {
        fantaId: fantaDoc.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { leagues: fantas.size, failed };
}

// Job "aste scadute": chiude ogni asta attiva col countdown finito e la
// assegna al miglior offerente (closeAuctionIfExpired, roster.ts). Il
// browser allo scadere chiama closeAuction, che fa la stessa cosa subito:
// chi arriva prima vince, la transazione controlla lo stato.
export async function closeExpiredAuctions(
  db: Firestore,
  options: { now?: number; log?: Log } = {},
): Promise<number> {
  const now = Timestamp.fromMillis(options.now ?? Date.now());
  const log: Log = options.log ?? (() => {});
  const expired = await db
    .collectionGroup("auctions")
    .where("status", "==", "active")
    .where("countdownEndsAt", "<=", now)
    .get();

  let closed = 0;
  for (const auctionDoc of expired.docs) {
    if (await closeAuctionIfExpired(db, auctionDoc.ref, now)) {
      closed += 1;
      log("Asta chiusa", {
        fantaId: auctionDoc.ref.parent.parent?.id,
        auctionId: auctionDoc.id,
      });
    }
  }
  return closed;
}
