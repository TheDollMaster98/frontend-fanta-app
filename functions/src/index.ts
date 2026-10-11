import { onSchedule } from "firebase-functions/v2/scheduler";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { setApiTransport } from "@/lib/apiTransport";
import { proxyLeaguepedia } from "@/lib/server/leaguepediaProxy";
import { proxyLolesports } from "@/lib/server/lolesportsProxy";
import { closeExpiredAuctions, runRecalculation } from "./jobs";
import { closeAuctionForMember, makeDraftPickForMember, RosterError } from "./roster";

// Cloud Functions di Fanta Points (9/10). Due job pianificati:
// - ricalcolo: punteggi di tutte le leghe LoL e chiusura automatica dei
//   turni Pick/Ban finiti, due volte al giorno;
// - aste: chiude e assegna ogni asta col countdown scaduto, ogni minuto.
// Il bottone "Ricalcola" resta: fa la stessa cosa, subito.
// Due funzioni chiamate dal browser (10/10), le uniche vie con cui un
// membro normale fa crescere una rosa (vedi roster.ts):
// - closeAuction: chiusura di un'asta allo scadere del countdown;
// - makeDraftPick: pick del proprio turno di draft.

initializeApp();
const db = getFirestore();
// Come lib/firebase.ts lato client: campi undefined omessi, non errori.
db.settings({ ignoreUndefinedProperties: true });

// Stesso segreto già usato da App Hosting (apphosting.yaml).
const LEAGUEPEDIA_BOT_PASSWORD = defineSecret("LEAGUEPEDIA_BOT_PASSWORD");

// Le librerie condivise chiamano /api/leaguepedia e /api/lolesports come
// nel browser: qui non c'è un server Next, quindi le stesse richieste vanno
// direttamente ai proxy di lib/server/.
function installServerTransport(): void {
  // Nome utente del bot: pubblico, già in chiaro in apphosting.yaml.
  process.env.LEAGUEPEDIA_USERNAME ||= "PureSnake065@fanta-fam";
  process.env.LEAGUEPEDIA_BOT_PASSWORD ||= LEAGUEPEDIA_BOT_PASSWORD.value();
  setApiTransport(async (pathWithQuery) => {
    const url = new URL(pathWithQuery, "http://internal");
    const result =
      url.pathname === "/api/leaguepedia"
        ? await proxyLeaguepedia(url.searchParams)
        : url.pathname === "/api/lolesports"
          ? await proxyLolesports(url.searchParams)
          : { status: 404, body: { error: "endpoint sconosciuto" } };
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "content-type": "application/json" },
    });
  });
}

const log = (message: string, extra?: Record<string, unknown>) =>
  logger.info(message, extra);

export const scheduledRecalculation = onSchedule(
  {
    // 06:10 e 18:10 ora italiana: dopo le partite della sera e del giorno.
    schedule: "10 6,18 * * *",
    timeZone: "Europe/Rome",
    secrets: [LEAGUEPEDIA_BOT_PASSWORD],
    timeoutSeconds: 540,
    memory: "512MiB",
    retryCount: 0,
  },
  async () => {
    installServerTransport();
    const result = await runRecalculation(db, { log });
    logger.info("Ricalcolo pianificato completato", result);
  },
);

export const closeExpiredAuctionsJob = onSchedule(
  {
    schedule: "every 1 minutes",
    timeoutSeconds: 60,
    memory: "256MiB",
    retryCount: 0,
  },
  async () => {
    const closed = await closeExpiredAuctions(db, { log });
    if (closed > 0) logger.info("Aste scadute chiuse", { closed });
  },
);

// Errori di dominio -> HttpsError con lo stesso codice; il resto resta un
// "internal" generico, senza dettagli verso il client.
async function asCallable<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof RosterError) throw new HttpsError(error.code, error.message);
    logger.error("Errore funzione chiamabile", {
      reason: error instanceof Error ? error.message : String(error),
    });
    throw new HttpsError("internal", "Errore interno");
  }
}

function requireUid(auth: { uid: string } | undefined): string {
  if (!auth) throw new HttpsError("unauthenticated", "Accesso richiesto");
  return auth.uid;
}

export const closeAuction = onCall({ memory: "256MiB", timeoutSeconds: 30 }, (request) => {
  const uid = requireUid(request.auth);
  const data = (request.data || {}) as { fantaId?: string; auctionId?: string };
  return asCallable(async () => ({
    closed: await closeAuctionForMember(db, {
      uid,
      fantaId: String(data.fantaId || ""),
      auctionId: String(data.auctionId || ""),
    }),
  }));
});

export const makeDraftPick = onCall({ memory: "256MiB", timeoutSeconds: 30 }, (request) => {
  const uid = requireUid(request.auth);
  const data = (request.data || {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  return asCallable(async () => {
    const pick = await makeDraftPickForMember(db, {
      uid,
      fantaId: text(data.fantaId) || "",
      playerName: text(data.playerName) || "",
      playerRole: text(data.playerRole),
      playerTeam: text(data.playerTeam),
    });
    return { pickId: pick.id };
  });
});
