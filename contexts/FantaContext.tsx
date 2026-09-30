"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
} from "react";
import {
  collection,
  collectionGroup,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  documentId,
  onSnapshot,
  query,
  where,
  orderBy,
  increment,
  arrayUnion,
  writeBatch,
  runTransaction,
  serverTimestamp,
  deleteField,
  Timestamp,
  type FirestoreError,
  type Unsubscribe,
  type DocumentReference,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  MIN_COUNTDOWN_SECONDS,
  MAX_COUNTDOWN_SECONDS,
  DEFAULT_TEAM_SCORING_WEIGHTS,
  PLAYOFF_CIRCUITS,
} from "@/lib/constants";
import { generateRoundRobin } from "@/lib/roundRobin";
import {
  seedFirstRound,
  isRoundComplete,
  nextRoundFromWinners,
  rankGroupMembers,
} from "@/lib/bracket";
import {
  getFantasyPlayerStats,
  getFantasyTeamStats,
} from "@/lib/leaguepediaApi";
import {
  findLeagueId,
  getTeamGameIdsInRange,
  getGamePlayerStats,
  stripTeamTagFromSummonerName,
} from "@/lib/lolesportsApi";
import { totalPickPoints, computeAutoPoints, computeLolesportsBonusPoints } from "@/lib/scoring";
import { buildDraftSlots, getDraftTurnUserId, advanceDraftTurn } from "@/lib/draft";
import type {
  Fanta,
  FantaMember,
  MemberRole,
  TeamPick,
  TeamPickType,
  HistoryEntry,
  JoinRequest,
  Auction,
  CalendarRound,
  FantaGroup,
  BracketRound,
  BracketMatch,
  RoleScoringWeights,
  ManualPlayerStats,
  ManualTeamStats,
  DraftState,
  PendingDraftAssignment,
} from "@/types";

const DEFAULT_TEAM_NAME = "I Campioni";

// onSnapshot tratta permission-denied come errore terminale e NON ritenta da
// solo: nella frazione di secondo subito dopo il login il token appena
// emesso può non essere ancora pienamente propagato al canale Firestore, e
// senza questo wrapper quel primo permission-denied ucciderebbe il listener
// per tutta la sessione (nessun altro punto lo riattacca). Su una rete lenta
// o un login appena fatto la propagazione può richiedere più di un
// tentativo: 3 retry con backoff (1.5s/3s/5s, ~9.5s totali) invece di uno
// solo — un solo tentativo (29/9) lasciava isLoading bloccato a true per
// sempre se quel retry ricadeva ancora nella stessa race, con lo spinner di
// dashboard/layout.tsx che girava senza uscita (bug reale segnalato in
// produzione, "gira" senza mai risolvere). Se anche l'ultimo retry fallisce
// il problema è reale (regole/permessi), resta comunque loggato in console
// invece di sparire silenziosamente come faceva onSnapshot senza onError —
// dashboard/layout.tsx ha comunque un timeout di sicurezza che non lascia
// più l'utente bloccato a vita sullo spinner in quel caso.
function attachWithPermissionRetry(
  subscribe: (onError: (error: FirestoreError) => void) => Unsubscribe,
  label: string,
): Unsubscribe {
  let unsubscribe: Unsubscribe;
  let retryCount = 0;
  const RETRY_DELAYS_MS = [1500, 3000, 5000];

  const handleError = (error: FirestoreError) => {
    console.error(`[Firestore] listener "${label}":`, error.code, error.message);
    if (
      error.code === "permission-denied" &&
      auth.currentUser &&
      retryCount < RETRY_DELAYS_MS.length
    ) {
      const delay = RETRY_DELAYS_MS[retryCount];
      retryCount += 1;
      setTimeout(() => {
        unsubscribe();
        unsubscribe = subscribe(handleError);
      }, delay);
    }
  };

  unsubscribe = subscribe(handleError);
  return () => unsubscribe();
}

// Documento membro così come vive su Firestore, con l'id della lega di
// appartenenza ricavato dal path (fantas/{fantaId}/members/{userId}), utile
// per lavorare su membership di più leghe insieme senza doverlo ripetere
// come campo nel documento stesso.
interface MembershipDoc extends FantaMember {
  fantaId: string;
}

// Membro arricchito col profilo utente (nome/email), per mostrarlo in UI
// senza dover risolvere l'id ogni volta.
export interface FantaMemberProfile extends MembershipDoc {
  name: string;
  email: string;
}

export interface StandingsEntry {
  userId: string;
  name: string;
  teamName: string;
  totalPoints: number;
}

interface FantaContextType {
  currentFanta: Fanta | null;
  fantas: Fanta[];
  setCurrentFanta: (fanta: Fanta) => void;
  addFanta: (fanta: Fanta) => Promise<void>;
  updateFanta: (fanta: Fanta) => void;
  // Cancella la lega e tutto il suo contenuto (admin/vice/developer, vedi
  // isAdminOrVice() in firestore.rules). Irreversibile.
  deleteFanta: (fantaId: string) => Promise<void>;
  isLoading: boolean;

  // Membri della lega corrente: ruolo, budget, rosa, uniti al profilo utente
  fantaMembers: FantaMemberProfile[];
  currentMember: FantaMemberProfile | null;
  myRole: MemberRole | null;
  isFantaAdmin: boolean; // creatore o developer (gestisce membri/vice)
  isFantaViceOrAdmin: boolean; // creatore, vice o developer (gestisce aste/impostazioni)
  getMemberName: (userId: string, fallback?: string) => string;
  getMemberCount: (fantaId: string) => number;
  getMyRoleFor: (fantaId: string) => MemberRole | null;
  getUserBudget: (userId: string) => number;
  getTeamName: (userId: string) => string;
  updateTeamName: (userId: string, name: string) => void;
  getPlayersByUser: (userId: string) => TeamPick[];
  removePlayerFromTeam: (userId: string, pickId: string) => void;
  // Statistiche inserite a mano su un pick (CS/Vision Score/Pentakill per
  // player-jolly, obiettivi/CS/oro per team-coach): fallback finché il
  // calcolo automatico da Leaguepedia non copre questi campi. Si
  // sommano subito ai punti mostrati, senza dover rilanciare "Ricalcola
  // Punteggi".
  updatePickManualStats: (
    userId: string,
    pickId: string,
    stats: { manualPlayerStats?: ManualPlayerStats; manualTeamStats?: ManualTeamStats },
  ) => void;

  // Gestione membri/vice-admin (solo isFantaAdmin)
  addViceAdmin: (userId: string) => void;
  removeViceAdmin: (userId: string) => void;
  removeMember: (userId: string) => void;

  // Storico acquisti: immutabile, resta anche se un'asta viene riaperta
  history: HistoryEntry[];

  // Calendario a girone all'italiana e punteggi reali (step 2)
  calendar: CalendarRound[];
  standings: StandingsEntry[];
  generateCalendar: (startDate?: Date, roundLengthDays?: number) => Promise<void>;
  recalculateScores: () => Promise<void>;
  // Chiude il mercato + genera il calendario in un'unica azione, e la
  // valvola di sicurezza per riaprirlo — vedi i commenti sulle
  // implementazioni per cosa viene bloccato quando settings.seasonStarted
  // è true.
  startSeason: () => Promise<void>;
  setSeasonStarted: (value: boolean) => void;

  // Doppia fase gironi + eliminazione diretta (step 5, solo circuiti
  // WORLDS/MSI — vedi PLAYOFF_CIRCUITS in lib/constants.ts). Per i circuiti
  // normali groups e bracketRounds restano vuoti e calendar/generateCalendar
  // funzionano come sempre (fase singola).
  groups: FantaGroup[];
  bracketRounds: BracketRound[];
  generateGroups: (
    groupCount: number,
    startDate?: Date,
    roundLengthDays?: number,
  ) => Promise<void>;
  generateBracket: (
    qualifiersPerGroup?: number,
    startDate?: Date,
    roundLengthDays?: number,
  ) => Promise<void>;

  // Scoperta leghe e richieste di ingresso
  discoverableFantas: Fanta[];
  myJoinRequests: JoinRequest[];
  pendingJoinRequests: JoinRequest[];
  sendJoinRequest: (fanta: Fanta) => void;
  approveJoinRequest: (request: JoinRequest) => void;
  rejectJoinRequest: (requestId: string) => void;

  // Aste, condivise in tempo reale tra tutti i membri della lega
  auctions: Auction[];
  createAuction: (
    auction: Pick<
      Auction,
      | "pickType"
      | "playerName"
      | "playerRole"
      | "playerTeam"
      | "auctionFormat"
      | "description"
      | "basePrice"
      | "countdownSeconds"
    >,
  ) => void;
  startAuction: (auctionId: string, countdownSeconds: number) => void;
  pauseAuction: (auctionId: string) => void;
  placeBid: (auctionId: string, amount: number) => void;
  closeAuction: (auctionId: string) => void;
  cancelAuction: (auctionId: string) => void;
  reopenAuction: (auctionId: string) => Promise<void>;
  assignAuctionManually: (
    auctionId: string,
    userId: string,
    userName: string,
  ) => void;

  // Draft a turni (settings.draftMode === "snake"), condiviso in tempo
  // reale come le aste: null finché non è mai stato avviato (non esiste
  // ancora il documento fantas/{id}/draft/state).
  draftState: DraftState | null;
  startDraft: () => void;
  makeDraftPick: (input: {
    playerName: string;
    playerRole?: string;
    playerTeam?: string;
  }) => void;
  skipDraftTurn: (options?: { force?: boolean }) => void;
  fillPendingDraftAssignment: (
    pending: PendingDraftAssignment,
    input: { playerName: string; playerTeam?: string },
  ) => void;
}

const FantaContext = createContext<FantaContextType | undefined>(undefined);

function toDate(value: Timestamp | Date | undefined): Date {
  if (!value) return new Date();
  return value instanceof Timestamp ? value.toDate() : value;
}

function toOptionalDate(value: Timestamp | Date | undefined | null): Date | undefined {
  if (!value) return undefined;
  return value instanceof Timestamp ? value.toDate() : value;
}

function mapFantaDoc(id: string, data: Record<string, unknown>): Fanta {
  return {
    id,
    name: data.name,
    description: data.description,
    sportType: data.sportType,
    settings: data.settings,
    inviteCode: data.inviteCode,
    createdAt: toDate(data.createdAt as Timestamp | Date | undefined),
    updatedAt: toDate(data.updatedAt as Timestamp | Date | undefined),
    // Niente "createdBy: data.createdBy" diretto: sulle leghe create prima
    // di questo campo sarebbe undefined, e updateFanta (setDoc senza
    // ignoreUndefinedProperties) lancia un errore su un campo undefined
    // esplicito — meglio ometterlo del tutto quando manca, come già si fa
    // per photoURL in AuthContext.tsx.
    ...(data.createdBy ? { createdBy: data.createdBy as string } : {}),
  } as Fanta;
}

function mapMembershipDoc(
  fantaId: string,
  userId: string,
  data: Record<string, unknown>,
): MembershipDoc {
  const rawTeam = (data.team as Record<string, unknown>[]) || [];
  return {
    fantaId,
    userId,
    role: data.role as MemberRole,
    teamName: (data.teamName as string) || DEFAULT_TEAM_NAME,
    team: rawTeam.map((pick) => ({
      ...pick,
      acquiredAt: toDate(pick.acquiredAt as Timestamp | Date | undefined),
    })) as TeamPick[],
    budgetTot: (data.budgetTot as number) ?? 0,
    budgetSpent: (data.budgetSpent as number) ?? 0,
    budgetLeft: (data.budgetLeft as number) ?? 0,
  };
}

function mapAuctionDoc(id: string, data: Record<string, unknown>): Auction {
  return {
    id,
    fantaId: data.fantaId,
    pickType: (data.pickType as TeamPickType) || "player",
    playerName: data.playerName,
    playerRole: data.playerRole,
    playerTeam: data.playerTeam,
    auctionFormat: data.auctionFormat,
    description: data.description,
    basePrice: data.basePrice,
    currentPrice: data.currentPrice,
    highestBidderId: data.highestBidderId || undefined,
    highestBidderName: data.highestBidderName || undefined,
    status: data.status,
    createdBy: data.createdBy,
    countdownSeconds: data.countdownSeconds,
    countdownEndsAt: toOptionalDate(data.countdownEndsAt as Timestamp | Date | undefined),
    startedAt: toOptionalDate(data.startedAt as Timestamp | Date | undefined),
    closedAt: toOptionalDate(data.closedAt as Timestamp | Date | undefined),
    createdAt: toDate(data.createdAt as Timestamp | Date | undefined),
    updatedAt: toDate(data.updatedAt as Timestamp | Date | undefined),
  } as Auction;
}

function mapJoinRequestDoc(
  id: string,
  data: Record<string, unknown>,
): JoinRequest {
  return {
    id,
    fantaId: data.fantaId,
    fantaName: data.fantaName,
    userId: data.userId,
    userName: data.userName,
    userEmail: data.userEmail,
    status: data.status,
    createdAt: toDate(data.createdAt as Timestamp | Date | undefined),
  } as JoinRequest;
}

function mapCalendarRoundDoc(
  id: string,
  data: Record<string, unknown>,
): CalendarRound {
  return {
    id,
    roundNumber: (data.roundNumber as number) ?? 0,
    fixtures: (data.fixtures as CalendarRound["fixtures"]) || [],
    startDate: toDate(data.startDate as Timestamp | Date | undefined),
    endDate: toDate(data.endDate as Timestamp | Date | undefined),
    ...(typeof data.groupId === "string" ? { groupId: data.groupId } : {}),
  };
}

function mapGroupDoc(id: string, data: Record<string, unknown>): FantaGroup {
  return {
    id,
    name: (data.name as string) || "",
    memberIds: (data.memberIds as string[]) || [],
  };
}

function mapBracketRoundDoc(
  id: string,
  data: Record<string, unknown>,
): BracketRound {
  return {
    id,
    roundIndex: (data.roundIndex as number) ?? 0,
    matches: (data.matches as BracketRound["matches"]) || [],
    startDate: toDate(data.startDate as Timestamp | Date | undefined),
    endDate: toDate(data.endDate as Timestamp | Date | undefined),
  };
}

// Bonus CS + proxy Vision Score (wards) da lolesports per un turno
// (calendario a girone o bracket): per ogni membro coinvolto, somma il
// bonus dei suoi pick player/jolly con playerTeam impostato, dalle
// partite reali della loro squadra in [dateRange.start, dateRange.end).
// Usata SOLO per i turni (finestra di date nota): il totale cumulativo
// (TeamPick.points, "Classifica Generale") resta solo Leaguepedia — qui
// servirebbe sfogliare tutto lo storico del circuito squadra per squadra,
// un costo che Leaguepedia non ha (query diretta via Cargo). leagueId
// null (circuito senza corrispondente lolesports, es. "ALTRO") o nessun
// pick con playerTeam -> mappa vuota, nessun errore.
async function computeLolesportsRoundBonuses(
  involvedUserIds: string[],
  dateRange: { start: Date; end: Date },
  leagueId: string | null,
  roleWeights: RoleScoringWeights,
  fantaMembers: FantaMemberProfile[],
): Promise<Map<string, number>> {
  const bonuses = new Map<string, number>();
  if (!leagueId) return bonuses;

  const picksByTeam = new Map<
    string,
    { userId: string; playerName: string; playerRole?: string }[]
  >();
  involvedUserIds.forEach((uid) => {
    const member = fantaMembers.find((m) => m.userId === uid);
    member?.team.forEach((pick) => {
      if ((pick.pickType === "player" || pick.pickType === "jolly") && pick.playerTeam) {
        const list = picksByTeam.get(pick.playerTeam) || [];
        list.push({ userId: uid, playerName: pick.playerName, playerRole: pick.playerRole });
        picksByTeam.set(pick.playerTeam, list);
      }
    });
  });

  const teamNames = Array.from(picksByTeam.keys());
  if (teamNames.length === 0) return bonuses;

  const gameIds = await getTeamGameIdsInRange(leagueId, teamNames, dateRange);
  if (gameIds.length === 0) return bonuses;

  const gamesStats = await Promise.all(gameIds.map((id) => getGamePlayerStats(id)));

  const statsByStrippedName = new Map<
    string,
    { creepScore: number; wardsPlaced: number; wardsDestroyed: number }
  >();
  gamesStats.flat().forEach((p) => {
    const name = stripTeamTagFromSummonerName(p.summonerName).trim().toLowerCase();
    const prev = statsByStrippedName.get(name) || {
      creepScore: 0,
      wardsPlaced: 0,
      wardsDestroyed: 0,
    };
    statsByStrippedName.set(name, {
      creepScore: prev.creepScore + p.creepScore,
      wardsPlaced: prev.wardsPlaced + p.wardsPlaced,
      wardsDestroyed: prev.wardsDestroyed + p.wardsDestroyed,
    });
  });

  picksByTeam.forEach((picks) => {
    picks.forEach(({ userId, playerName, playerRole }) => {
      const weights = playerRole ? roleWeights[playerRole] : undefined;
      const stats = statsByStrippedName.get(playerName.trim().toLowerCase());
      if (!weights || !stats) return;
      const points = computeLolesportsBonusPoints(stats, weights);
      bonuses.set(userId, (bonuses.get(userId) || 0) + points);
    });
  });

  return bonuses;
}

function mapDraftStateDoc(data: Record<string, unknown>): DraftState {
  return {
    status: (data.status as DraftState["status"]) || "not_started",
    order: (data.order as string[]) || [],
    currentSlotIndex: (data.currentSlotIndex as number) ?? 0,
    currentTurnIndex: (data.currentTurnIndex as number) ?? 0,
    pickDeadline: toOptionalDate(
      data.pickDeadline as Timestamp | Date | undefined,
    ),
    pendingAssignments:
      (data.pendingAssignments as PendingDraftAssignment[]) || [],
    startedAt: toOptionalDate(data.startedAt as Timestamp | Date | undefined),
    updatedAt: toDate(data.updatedAt as Timestamp | Date | undefined),
  };
}

function mapHistoryDoc(id: string, data: Record<string, unknown>): HistoryEntry {
  return {
    id,
    playerName: data.playerName,
    playerRole: data.playerRole,
    playerTeam: data.playerTeam,
    buyerUserId: data.buyerUserId,
    buyerName: data.buyerName,
    price: data.price,
    auctionId: data.auctionId,
    purchasedAt: toDate(data.purchasedAt as Timestamp | Date | undefined),
  } as HistoryEntry;
}

export function FantaProvider({ children }: { children: ReactNode }) {
  const { user, isPreviewingAsNonDeveloper } = useAuth();
  const [allFantas, setAllFantas] = useState<Fanta[]>([]);
  const [fantasLoaded, setFantasLoaded] = useState(false);
  const [allMemberships, setAllMemberships] = useState<MembershipDoc[]>([]);
  const [membershipsLoaded, setMembershipsLoaded] = useState(false);
  const [currentFantaId, setCurrentFantaId] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("fanta-current-id")
      : null,
  );
  const [rawMyJoinRequests, setRawMyJoinRequests] = useState<JoinRequest[]>(
    [],
  );
  const [pendingJoinRequests, setPendingJoinRequests] = useState<
    JoinRequest[]
  >([]);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [calendar, setCalendar] = useState<CalendarRound[]>([]);
  const [groups, setGroups] = useState<FantaGroup[]>([]);
  const [bracketRounds, setBracketRounds] = useState<BracketRound[]>([]);
  const [memberProfiles, setMemberProfiles] = useState<
    Record<string, { name: string; email: string }>
  >({});

  // Ascolta in tempo reale TUTTI i fanta esistenti: serve sia per "scoprire"
  // leghe altrui sia per mostrare le proprie (filtrate via allMemberships).
  useEffect(() => {
    if (!user) return;

    return attachWithPermissionRetry(
      (onError) =>
        onSnapshot(
          collection(db, "fantas"),
          (snapshot) => {
            setAllFantas(
              snapshot.docs.map((docSnap) =>
                mapFantaDoc(docSnap.id, docSnap.data()),
              ),
            );
            setFantasLoaded(true);
          },
          onError,
        ),
      "fantas",
    );
  }, [user]);

  // Ascolta in tempo reale TUTTE le membership di TUTTE le leghe (collection
  // group su fantas/*/members): da qui derivano sia "di quali leghe faccio
  // parte" sia il conteggio membri di ogni lega, senza dover mantenere più
  // listener separati per lega.
  useEffect(() => {
    if (!user) return;

    return attachWithPermissionRetry(
      (onError) =>
        onSnapshot(
          collectionGroup(db, "members"),
          (snapshot) => {
            setAllMemberships(
              snapshot.docs.map((docSnap) => {
                const fantaId = docSnap.ref.parent.parent!.id;
                return mapMembershipDoc(fantaId, docSnap.id, docSnap.data());
              }),
            );
            setMembershipsLoaded(true);
          },
          onError,
        ),
      "members (collectionGroup)",
    );
  }, [user]);

  // Ascolta le richieste di ingresso inviate dall'utente corrente, su tutte le leghe
  useEffect(() => {
    if (!user) return;

    const requestsQuery = query(
      collectionGroup(db, "joinRequests"),
      where("userId", "==", user.id),
    );

    return attachWithPermissionRetry(
      (onError) =>
        onSnapshot(
          requestsQuery,
          (snapshot) => {
            setRawMyJoinRequests(
              snapshot.docs.map((docSnap) =>
                mapJoinRequestDoc(docSnap.id, docSnap.data()),
              ),
            );
          },
          onError,
        ),
      "myJoinRequests",
    );
  }, [user]);

  // Il flag vero (user.isDeveloper) non è mai toccato qui: l'anteprima
  // "vista da non-dev" (AuthContext.isPreviewingAsNonDeveloper, solo
  // locale/sessionStorage) lo maschera senza modificarlo, così si torna
  // developer a pieno accesso semplicemente spegnendo l'anteprima.
  const isDeveloper = !!user?.isDeveloper && !isPreviewingAsNonDeveloper;

  // Un "developer" ha accesso universale: vede/gestisce tutte le leghe.
  const fantas = useMemo(() => {
    if (!user) return [];
    if (isDeveloper) return allFantas;
    const myFantaIds = new Set(
      allMemberships.filter((m) => m.userId === user.id).map((m) => m.fantaId),
    );
    return allFantas.filter((f) => myFantaIds.has(f.id));
  }, [user, isDeveloper, allFantas, allMemberships]);

  const myJoinRequests = useMemo(
    () => (user ? rawMyJoinRequests : []),
    [user, rawMyJoinRequests],
  );

  const isLoading = !!user && !(fantasLoaded && membershipsLoaded);

  const discoverableFantas = useMemo(() => {
    if (!user || isDeveloper) return [];
    const myFantaIds = new Set(
      allMemberships.filter((m) => m.userId === user.id).map((m) => m.fantaId),
    );
    return allFantas.filter((fanta) => !myFantaIds.has(fanta.id));
  }, [allFantas, user, isDeveloper, allMemberships]);

  const currentFanta = useMemo(() => {
    if (fantas.length === 0) return null;
    return fantas.find((f) => f.id === currentFantaId) || fantas[0];
  }, [fantas, currentFantaId]);

  const setCurrentFanta = (fanta: Fanta) => {
    setCurrentFantaId(fanta.id);
    localStorage.setItem("fanta-current-id", fanta.id);
  };

  const getMemberCount = (fantaId: string): number =>
    allMemberships.filter((m) => m.fantaId === fantaId).length;

  const getMyRoleFor = (fantaId: string): MemberRole | null => {
    if (!user) return null;
    if (isDeveloper) return "admin";
    return (
      allMemberships.find((m) => m.fantaId === fantaId && m.userId === user.id)
        ?.role ?? null
    );
  };

  // NON un writeBatch atomico (era così fino al 30/9): la regola di
  // members/create per il bootstrap-admin fa un get() su fantas/{fantaId}
  // per verificarne il createdBy, ma dentro un writeBatch quel get() vede
  // lo stato DA PRIMA del batch — il documento fanta creato nello stesso
  // batch non esiste ancora dal suo punto di vista. Risultato: l'intero
  // batch falliva SEMPRE con permission-denied (Null value error sul
  // get().data di un doc inesistente), per chiunque, non solo in rari
  // casi — "Crea Nuovo Fanta" era di fatto rotto in produzione dal deploy
  // delle regole di stamattina, mascherato solo per i developer (isDeveloper
  // gli dà comunque accesso pieno più avanti, anche senza un vero member
  // doc). Scritture sequenziali risolvono alla radice: quando si crea il
  // membro admin, il documento fanta è già committato e quel get() lo vede
  // per davvero. Verificato con l'emulatore.
  const addFanta = async (fanta: Fanta): Promise<void> => {
    if (!user) return;
    await setDoc(doc(db, "fantas", fanta.id), { ...fanta, createdBy: user.id });
    const memberRef = doc(db, "fantas", fanta.id, "members", user.id);
    const generalBudget = fanta.settings.generalBudget;
    const adminMember: FantaMember = {
      userId: user.id,
      role: "admin",
      teamName: DEFAULT_TEAM_NAME,
      team: [],
      budgetTot: generalBudget,
      budgetSpent: 0,
      budgetLeft: generalBudget,
    };
    await setDoc(memberRef, adminMember);
    setCurrentFanta(fanta);
  };

  const updateFanta = (fanta: Fanta): void => {
    setDoc(doc(db, "fantas", fanta.id), fanta);
  };

  // Elimina una lega e TUTTO il suo contenuto (30/9, "Elimina Lega" in
  // Gestione): il solo documento fantas/{id} non basta, altrimenti ogni
  // sottocollezione (membri, aste, draft, storico, calendario, gironi,
  // tabellone, richieste d'ingresso) resterebbe orfana su Firestore —
  // invisibile in UI ma ancora leggibile da chiunque avesse l'id.
  // In chunk da 450 (sotto al limite di 500 operazioni per writeBatch): una
  // lega di amici non arriva mai a queste dimensioni, ma se succedesse un
  // singolo commit atomico da 1000+ operazioni fallirebbe comunque.
  const deleteDocsInBatches = async (refs: DocumentReference[]): Promise<void> => {
    const CHUNK_SIZE = 450;
    for (let i = 0; i < refs.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      refs.slice(i, i + CHUNK_SIZE).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  };

  const SUBCOLLECTIONS_TO_DELETE = [
    "members",
    "auctions",
    "draft",
    "history",
    "calendar",
    "groups",
    "bracket",
    "joinRequests",
  ] as const;

  const deleteFanta = async (fantaId: string): Promise<void> => {
    for (const sub of SUBCOLLECTIONS_TO_DELETE) {
      const snap = await getDocs(collection(db, "fantas", fantaId, sub));
      if (sub === "auctions") {
        // Le aste hanno a loro volta una sottocollezione "bids": va svuotata
        // prima, altrimenti resterebbe orfana sotto un'asta già cancellata.
        for (const auctionDoc of snap.docs) {
          const bidsSnap = await getDocs(
            collection(db, "fantas", fantaId, "auctions", auctionDoc.id, "bids"),
          );
          await deleteDocsInBatches(bidsSnap.docs.map((d) => d.ref));
        }
      }
      await deleteDocsInBatches(snap.docs.map((d) => d.ref));
    }
    await deleteDoc(doc(db, "fantas", fantaId));
    // currentFanta è derivato (fantas.find(...) || fantas[0]): appena il
    // listener rifletterà la cancellazione, si aggiorna da solo su un'altra
    // lega o null, nessun cleanup manuale di stato/localStorage necessario.
  };

  // Membri del fanta attualmente selezionato, uniti al profilo (nome/email)
  const rawFantaMembers = useMemo(
    () =>
      currentFanta
        ? allMemberships.filter((m) => m.fantaId === currentFanta.id)
        : [],
    [allMemberships, currentFanta],
  );

  // Ascolta in tempo reale i profili (nome/email) dei membri del fanta
  // attualmente selezionato: fonte unica per i nomi ovunque nell'app, così un
  // cambio nome in Impostazioni si riflette subito invece di restare
  // congelato a una copia scritta altrove in un momento precedente.
  useEffect(() => {
    const userIds = rawFantaMembers.map((m) => m.userId);
    if (userIds.length === 0) {
      setMemberProfiles({});
      return;
    }

    const membersQuery = query(
      collection(db, "users"),
      where(documentId(), "in", userIds.slice(0, 30)),
    );

    return attachWithPermissionRetry(
      (onError) =>
        onSnapshot(
          membersQuery,
          (snapshot) => {
            const profiles: Record<string, { name: string; email: string }> = {};
            snapshot.docs.forEach((docSnap) => {
              profiles[docSnap.id] = {
                name: docSnap.data().name || "Utente",
                email: docSnap.data().email || "",
              };
            });
            setMemberProfiles(profiles);
          },
          onError,
        ),
      "memberProfiles",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawFantaMembers.map((m) => m.userId).join(",")]);

  const fantaMembers: FantaMemberProfile[] = useMemo(
    () =>
      rawFantaMembers.map((m) => ({
        ...m,
        name: memberProfiles[m.userId]?.name || "Utente",
        email: memberProfiles[m.userId]?.email || "",
      })),
    [rawFantaMembers, memberProfiles],
  );

  const currentMember = useMemo(
    () => (user ? fantaMembers.find((m) => m.userId === user.id) || null : null),
    [fantaMembers, user],
  );

  const myRole: MemberRole | null = currentMember?.role ?? null;
  const isFantaAdmin = myRole === "admin" || isDeveloper;
  const isFantaViceOrAdmin =
    myRole === "admin" || myRole === "vice" || isDeveloper;

  const getMemberName = (userId: string, fallback?: string): string => {
    return (
      fantaMembers.find((m) => m.userId === userId)?.name || fallback || "Utente"
    );
  };

  const getUserBudget = (userId: string): number => {
    const member = fantaMembers.find((m) => m.userId === userId);
    return member ? member.budgetLeft : currentFanta?.settings.generalBudget ?? 0;
  };

  const getTeamName = (userId: string): string => {
    return fantaMembers.find((m) => m.userId === userId)?.teamName || DEFAULT_TEAM_NAME;
  };

  const updateTeamName = (userId: string, name: string): void => {
    if (!currentFanta) return;
    updateDoc(doc(db, "fantas", currentFanta.id, "members", userId), {
      teamName: name,
    });
  };

  const getPlayersByUser = (userId: string): TeamPick[] => {
    return fantaMembers.find((m) => m.userId === userId)?.team || [];
  };

  const removePlayerFromTeam = (userId: string, pickId: string): void => {
    if (!currentFanta) return;
    if (currentFanta.settings.seasonStarted && !isFantaViceOrAdmin) return;
    const member = fantaMembers.find((m) => m.userId === userId);
    if (!member) return;
    const pick = member.team.find((p) => p.id === pickId);
    if (!pick) return;

    updateDoc(doc(db, "fantas", currentFanta.id, "members", userId), {
      team: member.team.filter((p) => p.id !== pickId),
      budgetSpent: increment(-pick.purchasePrice),
      budgetLeft: increment(pick.purchasePrice),
    });
  };

  // Salva le statistiche inserite a mano su un pick (fallback per CS/
  // Vision Score/Pentakill/obiettivi, finché Leaguepedia non li copre in
  // automatico — vedi lib/scoring.ts). Rimuove le chiavi undefined prima
  // di scrivere: Firestore rifiuta valori undefined annidati in un oggetto.
  const updatePickManualStats = (
    userId: string,
    pickId: string,
    stats: { manualPlayerStats?: ManualPlayerStats; manualTeamStats?: ManualTeamStats },
  ): void => {
    if (!currentFanta) return;
    const member = fantaMembers.find((m) => m.userId === userId);
    if (!member) return;
    if (!member.team.some((p) => p.id === pickId)) return;

    const clean = <T extends object>(obj: T): T =>
      Object.fromEntries(
        Object.entries(obj).filter(([, v]) => v !== undefined),
      ) as T;

    const updatedTeam = member.team.map((p): TeamPick => {
      if (p.id !== pickId) return p;
      const next: TeamPick = { ...p };
      if (stats.manualPlayerStats) {
        next.manualPlayerStats = clean(stats.manualPlayerStats);
      }
      if (stats.manualTeamStats) {
        next.manualTeamStats = clean(stats.manualTeamStats);
      }
      return next;
    });

    updateDoc(doc(db, "fantas", currentFanta.id, "members", userId), {
      team: updatedTeam,
    });
  };

  const addViceAdmin = (userId: string): void => {
    if (!currentFanta) return;
    const member = fantaMembers.find((m) => m.userId === userId);
    if (!member) return;
    if (member.role === "admin") return;
    updateDoc(doc(db, "fantas", currentFanta.id, "members", userId), {
      role: "vice",
    });
  };

  const removeViceAdmin = (userId: string): void => {
    if (!currentFanta) return;
    updateDoc(doc(db, "fantas", currentFanta.id, "members", userId), {
      role: "membro",
    });
  };

  const removeMember = (userId: string): void => {
    if (!currentFanta) return;
    const member = fantaMembers.find((m) => m.userId === userId);
    if (member?.role === "admin") return;
    deleteDoc(doc(db, "fantas", currentFanta.id, "members", userId));
  };

  // Ascolta le richieste di ingresso pendenti per il fanta attualmente selezionato
  useEffect(() => {
    if (!currentFanta) {
      setPendingJoinRequests([]);
      return;
    }

    const requestsQuery = query(
      collection(db, "fantas", currentFanta.id, "joinRequests"),
      where("status", "==", "pending"),
    );

    return attachWithPermissionRetry(
      (onError) =>
        onSnapshot(
          requestsQuery,
          (snapshot) => {
            setPendingJoinRequests(
              snapshot.docs.map((docSnap) =>
                mapJoinRequestDoc(docSnap.id, docSnap.data()),
              ),
            );
          },
          onError,
        ),
      "pendingJoinRequests",
    );
  }, [currentFanta]);

  // Ascolta in tempo reale le aste del fanta attualmente selezionato
  useEffect(() => {
    if (!currentFanta) {
      setAuctions([]);
      return;
    }

    const auctionsQuery = query(
      collection(db, "fantas", currentFanta.id, "auctions"),
      orderBy("createdAt", "desc"),
    );

    return attachWithPermissionRetry(
      (onError) =>
        onSnapshot(
          auctionsQuery,
          (snapshot) => {
            setAuctions(
              snapshot.docs.map((docSnap) =>
                mapAuctionDoc(docSnap.id, docSnap.data()),
              ),
            );
          },
          onError,
        ),
      "auctions",
    );
  }, [currentFanta]);

  // Ascolta in tempo reale lo stato del draft a turni del fanta attualmente
  // selezionato: un documento singolo (non una collezione), null finché non
  // è mai stato avviato — vedi startDraft più sotto.
  useEffect(() => {
    if (!currentFanta) {
      setDraftState(null);
      return;
    }

    const ref = doc(db, "fantas", currentFanta.id, "draft", "state");
    return attachWithPermissionRetry(
      (onError) =>
        onSnapshot(
          ref,
          (snap) => {
            setDraftState(snap.exists() ? mapDraftStateDoc(snap.data()) : null);
          },
          onError,
        ),
      "draftState",
    );
  }, [currentFanta]);

  // Ascolta lo storico acquisti del fanta attualmente selezionato: log
  // immutabile, resta anche se un'asta viene poi riaperta o un giocatore
  // rimosso dalla rosa.
  useEffect(() => {
    if (!currentFanta) {
      setHistory([]);
      return;
    }

    const historyQuery = query(
      collection(db, "fantas", currentFanta.id, "history"),
      orderBy("purchasedAt", "desc"),
    );

    return attachWithPermissionRetry(
      (onError) =>
        onSnapshot(
          historyQuery,
          (snapshot) => {
            setHistory(
              snapshot.docs.map((docSnap) =>
                mapHistoryDoc(docSnap.id, docSnap.data()),
              ),
            );
          },
          onError,
        ),
      "history",
    );
  }, [currentFanta]);

  // Ascolta il calendario a girone all'italiana del fanta attualmente
  // selezionato: generato una volta dall'admin/dev con generateCalendar,
  // non si rigenera da solo.
  useEffect(() => {
    if (!currentFanta) {
      setCalendar([]);
      return;
    }

    const calendarQuery = query(
      collection(db, "fantas", currentFanta.id, "calendar"),
      orderBy("roundNumber", "asc"),
    );

    return attachWithPermissionRetry(
      (onError) =>
        onSnapshot(
          calendarQuery,
          (snapshot) => {
            setCalendar(
              snapshot.docs.map((docSnap) =>
                mapCalendarRoundDoc(docSnap.id, docSnap.data()),
              ),
            );
          },
          onError,
        ),
      "calendar",
    );
  }, [currentFanta]);

  // Ascolta gruppi e tabellone a eliminazione della fase 2 (WORLDS/MSI):
  // vuoti finché generateGroups/generateBracket non vengono lanciati, non
  // usati affatto dai circuiti a fase singola.
  useEffect(() => {
    if (!currentFanta) {
      setGroups([]);
      return;
    }

    const groupsQuery = query(
      collection(db, "fantas", currentFanta.id, "groups"),
      orderBy("name", "asc"),
    );

    return attachWithPermissionRetry(
      (onError) =>
        onSnapshot(
          groupsQuery,
          (snapshot) => {
            setGroups(
              snapshot.docs.map((docSnap) =>
                mapGroupDoc(docSnap.id, docSnap.data()),
              ),
            );
          },
          onError,
        ),
      "groups",
    );
  }, [currentFanta]);

  useEffect(() => {
    if (!currentFanta) {
      setBracketRounds([]);
      return;
    }

    const bracketQuery = query(
      collection(db, "fantas", currentFanta.id, "bracket"),
      orderBy("roundIndex", "asc"),
    );

    return attachWithPermissionRetry(
      (onError) =>
        onSnapshot(
          bracketQuery,
          (snapshot) => {
            setBracketRounds(
              snapshot.docs.map((docSnap) =>
                mapBracketRoundDoc(docSnap.id, docSnap.data()),
              ),
            );
          },
          onError,
        ),
      "bracket",
    );
  }, [currentFanta]);

  // Genera (o rigenera da capo) il calendario a girone all'italiana tra i
  // membri della lega corrente, col metodo del cerchio: cancella i turni
  // precedenti prima di scrivere i nuovi, altrimenti si accumulerebbero.
  // Ogni turno riceve una finestra di date sequenziale (roundLengthDays
  // giorni ciascuna, a partire da startDate): è quella finestra che
  // recalculateScores usa per il confronto diretto tra i due membri di ogni
  // fixture. Default 7 giorni a turno da oggi se non specificato (es. da
  // startSeason, che genera il calendario senza chiedere date).
  const generateCalendar = async (
    startDate: Date = new Date(),
    roundLengthDays = 7,
  ): Promise<void> => {
    if (!currentFanta) return;
    const userIds = fantaMembers.map((m) => m.userId);
    const rounds = generateRoundRobin(userIds);

    const calendarCollection = collection(
      db,
      "fantas",
      currentFanta.id,
      "calendar",
    );
    const existing = await getDocs(calendarCollection);
    const batch = writeBatch(db);
    existing.docs.forEach((d) => batch.delete(d.ref));
    rounds.forEach((fixtures, index) => {
      const roundStart = new Date(
        startDate.getTime() + index * roundLengthDays * 86400000,
      );
      const roundEnd = new Date(
        roundStart.getTime() + roundLengthDays * 86400000,
      );
      batch.set(doc(calendarCollection), {
        roundNumber: index + 1,
        fixtures,
        startDate: Timestamp.fromDate(roundStart),
        endDate: Timestamp.fromDate(roundEnd),
      });
    });
    await batch.commit();
  };

  // Fase 1 dei circuiti a eliminazione (WORLDS/MSI, vedi PLAYOFF_CIRCUITS):
  // distribuisce i membri della lega in `groupCount` gruppi (in sequenza,
  // round-robin sull'elenco membri — non c'è uno storico su cui bilanciare
  // la forza dei gruppi) e genera per ciascuno un proprio girone
  // all'italiana (stesso metodo del cerchio di generateCalendar), scritto
  // nella stessa collection `calendar` ma taggato con groupId. Rigenerare
  // cancella e ricrea da capo gruppi, calendario E il tabellone a
  // eliminazione (dipende dai gruppi precedenti, non ha più senso tenerlo).
  const generateGroups = async (
    groupCount: number,
    startDate: Date = new Date(),
    roundLengthDays = 7,
  ): Promise<void> => {
    if (!currentFanta || groupCount < 1) return;
    const memberIds = fantaMembers.map((m) => m.userId);

    const groupsCollection = collection(db, "fantas", currentFanta.id, "groups");
    const calendarCollection = collection(db, "fantas", currentFanta.id, "calendar");
    const bracketCollection = collection(db, "fantas", currentFanta.id, "bracket");
    const [existingGroups, existingCalendar, existingBracket] = await Promise.all([
      getDocs(groupsCollection),
      getDocs(calendarCollection),
      getDocs(bracketCollection),
    ]);

    const batch = writeBatch(db);
    existingGroups.docs.forEach((d) => batch.delete(d.ref));
    existingCalendar.docs.forEach((d) => batch.delete(d.ref));
    existingBracket.docs.forEach((d) => batch.delete(d.ref));

    const groupMemberIds: string[][] = Array.from({ length: groupCount }, () => []);
    memberIds.forEach((id, index) => {
      groupMemberIds[index % groupCount].push(id);
    });

    groupMemberIds.forEach((groupMembers, groupIndex) => {
      if (groupMembers.length === 0) return;
      const groupRef = doc(groupsCollection);
      const groupName = `Gruppo ${String.fromCharCode(65 + groupIndex)}`;
      batch.set(groupRef, { name: groupName, memberIds: groupMembers });

      const rounds = generateRoundRobin(groupMembers);
      rounds.forEach((fixtures, roundIndex) => {
        const roundStart = new Date(
          startDate.getTime() + roundIndex * roundLengthDays * 86400000,
        );
        const roundEnd = new Date(
          roundStart.getTime() + roundLengthDays * 86400000,
        );
        batch.set(doc(calendarCollection), {
          roundNumber: roundIndex + 1,
          fixtures,
          startDate: Timestamp.fromDate(roundStart),
          endDate: Timestamp.fromDate(roundEnd),
          groupId: groupRef.id,
        });
      });
    });

    await batch.commit();
  };

  // Fase 2 (dopo i gironi): calcola i qualificati di ogni gruppo — ordinati
  // per vittorie nel proprio girone (fixture con più punti), poi punti
  // fatti nel girone, poi punteggio cumulativo totale come ultimo
  // spareggio — e genera il primo turno del tabellone a eliminazione
  // diretta con seeding standard (vedi lib/bracket.ts), interlacciando i
  // gruppi (1° gruppo A, 1° gruppo B, ..., 2° gruppo A, 2° gruppo B, ...)
  // così che chi viene dallo stesso gruppo si incontri il più tardi
  // possibile. Rigenerare cancella e ricrea da capo il tabellone.
  const generateBracket = async (
    qualifiersPerGroup = 2,
    startDate: Date = new Date(),
    roundLengthDays = 7,
  ): Promise<void> => {
    if (!currentFanta || groups.length === 0) return;

    const standingsByUserId = new Map(standings.map((s) => [s.userId, s.totalPoints]));
    const qualifiersByGroup = groups.map((group) =>
      rankGroupMembers(group, calendar, standingsByUserId).slice(0, qualifiersPerGroup),
    );

    const seeds: string[] = [];
    for (let rank = 0; rank < qualifiersPerGroup; rank++) {
      qualifiersByGroup.forEach((qualifiers) => {
        if (qualifiers[rank]) seeds.push(qualifiers[rank]);
      });
    }
    if (seeds.length < 2) return;

    const bracketCollection = collection(db, "fantas", currentFanta.id, "bracket");
    const existing = await getDocs(bracketCollection);
    const batch = writeBatch(db);
    existing.docs.forEach((d) => batch.delete(d.ref));

    const roundEnd = new Date(startDate.getTime() + roundLengthDays * 86400000);
    batch.set(doc(bracketCollection), {
      roundIndex: 0,
      matches: seedFirstRound(seeds),
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(roundEnd),
    });

    await batch.commit();
    updateFanta({
      ...currentFanta,
      settings: { ...currentFanta.settings, bracketRoundLengthDays: roundLengthDays },
    });
  };

  // Chiude il mercato (niente più aste nuove/offerte/pick di draft/rimozioni
  // dai membri normali, vedi i guard su createAuction/placeBid/startDraft/
  // makeDraftPick/removePlayerFromTeam sopra) e genera il calendario, in
  // un'unica azione: è il bottone "Avvia Stagione" in Gestione Lega.
  // Admin/vice/dev restano operativi per sistemare eventuali code rimaste
  // aperte (aste attive da chiudere, draft da completare a mano).
  const startSeason = async (): Promise<void> => {
    if (!currentFanta) return;
    // Per i circuiti a eliminazione (WORLDS/MSI) il calendario non si
    // genera qui: serve prima scegliere il numero di gruppi, quindi
    // l'admin usa "Genera Gironi" in Classifica dopo aver avviato la
    // stagione (stesso motivo per cui "Genera Calendario" è comunque un
    // pulsante separato anche in fase singola: chiudere il mercato e
    // decidere le date/i gruppi sono due azioni distinte).
    if (!PLAYOFF_CIRCUITS.includes(currentFanta.settings.circuitType || "")) {
      await generateCalendar();
    }
    updateFanta({
      ...currentFanta,
      settings: { ...currentFanta.settings, seasonStarted: true },
    });
  };

  // Valvola di sicurezza per riaprire il mercato dopo un "Avvia Stagione"
  // per errore: non tocca il calendario già generato, va rigenerato a
  // parte con "Genera Calendario" se serve davvero ripartire da zero.
  const setSeasonStarted = (value: boolean): void => {
    if (!currentFanta) return;
    updateFanta({
      ...currentFanta,
      settings: { ...currentFanta.settings, seasonStarted: value },
    });
  };

  // Ricalcola i punti fantasy di ogni pick in rosa dalle statistiche reali
  // Leaguepedia (kill/morti/assist/vittorie per player/jolly, sole vittorie
  // per team/coach — vedi lib/leaguepediaApi.ts), pesati con gli
  // scoringWeights della lega — uno per ruolo (playerRole del pick), più un
  // set separato (teamScoringWeights) per le pick team/coach. Nessun
  // automatismo: va rilanciato a mano (bottone admin/dev) quando si
  // vogliono punti aggiornati, non c'è un cron/Cloud Function che lo fa da
  // solo. CS + proxy Vision Score (wardsPlaced+wardsDestroyed, vedi
  // lib/lolesportsApi.ts) si sommano SOLO ai punti di un turno (calendario
  // a girone o bracket, finestra di date nota) via
  // computeLolesportsRoundBonuses, non al totale cumulativo qui sopra:
  // lolesports non supporta una query diretta "tutte le partite di sempre"
  // come il Cargo di Leaguepedia. Obiettivi di squadra/CS-oro team/
  // pentakill/ban restano NON calcolati automaticamente — vedi
  // l'avvertenza su ScoringWeights/TeamScoringWeights in types/index.ts.
  const recalculateScores = async (): Promise<void> => {
    if (!currentFanta) return;
    const circuitType = currentFanta.settings.circuitType;
    if (!circuitType) return;
    const roleWeights = currentFanta.settings.scoringWeights || {};
    const teamWeights =
      currentFanta.settings.teamScoringWeights || DEFAULT_TEAM_SCORING_WEIGHTS;
    // Risolto una volta sola per tutta la chiamata: null per i circuiti
    // senza corrispondente lolesports (es. "ALTRO"), nel qual caso i bonus
    // CS/wards restano semplicemente 0 per ogni turno, senza errori.
    const leagueId = await findLeagueId(circuitType);

    const playerNames = new Set<string>();
    const teamNames = new Set<string>();
    fantaMembers.forEach((m) => {
      m.team.forEach((pick) => {
        if (pick.pickType === "player" || pick.pickType === "jolly") {
          playerNames.add(pick.playerName);
        } else if (pick.pickType === "team") {
          teamNames.add(pick.playerName);
        } else if (pick.pickType === "coach" && pick.playerTeam) {
          teamNames.add(pick.playerTeam);
        }
      });
    });

    const [playerStats, teamStats] = await Promise.all([
      getFantasyPlayerStats(Array.from(playerNames), circuitType),
      getFantasyTeamStats(Array.from(teamNames), circuitType),
    ]);

    const batch = writeBatch(db);
    let hasWrites = false;

    fantaMembers.forEach((m) => {
      let changed = false;
      const updatedTeam = m.team.map((pick) => {
        const points = computeAutoPoints(
          pick,
          playerStats,
          teamStats,
          roleWeights,
          teamWeights,
        );
        if (points === undefined) return pick;
        const rounded = Math.round(points * 100) / 100;
        if (rounded !== pick.points) changed = true;
        return { ...pick, points: rounded };
      });

      if (changed) {
        hasWrites = true;
        batch.update(
          doc(db, "fantas", currentFanta.id, "members", m.userId),
          { team: updatedTeam },
        );
      }
    });

    if (hasWrites) await batch.commit();

    // Punteggio di ogni turno di calendario (confronto diretto tra i due
    // membri di una fixture): stessa formula sopra, ma le stats vengono
    // richieste filtrate sulla finestra [startDate, endDate) del turno,
    // invece che cumulative di sempre — vedi getFantasyPlayerStats/
    // getFantasyTeamStats in lib/leaguepediaApi.ts. Una query per turno,
    // non per fixture: i membri coinvolti in un turno condividono la stessa
    // finestra di date.
    if (calendar.length > 0) {
      const roundBatch = writeBatch(db);
      let hasRoundWrites = false;

      for (const round of calendar) {
        const involvedUserIds = Array.from(
          new Set(
            round.fixtures.flatMap((f) =>
              [f.homeUserId, f.awayUserId].filter((id): id is string => !!id),
            ),
          ),
        );
        const roundPlayerNames = new Set<string>();
        const roundTeamNames = new Set<string>();
        involvedUserIds.forEach((uid) => {
          const member = fantaMembers.find((m) => m.userId === uid);
          member?.team.forEach((pick) => {
            if (pick.pickType === "player" || pick.pickType === "jolly") {
              roundPlayerNames.add(pick.playerName);
            } else if (pick.pickType === "team") {
              roundTeamNames.add(pick.playerName);
            } else if (pick.pickType === "coach" && pick.playerTeam) {
              roundTeamNames.add(pick.playerTeam);
            }
          });
        });

        const dateRange = { start: round.startDate, end: round.endDate };
        const [roundPlayerStats, roundTeamStats, lolesportsBonuses] = await Promise.all([
          getFantasyPlayerStats(
            Array.from(roundPlayerNames),
            circuitType,
            dateRange,
          ),
          getFantasyTeamStats(
            Array.from(roundTeamNames),
            circuitType,
            dateRange,
          ),
          computeLolesportsRoundBonuses(
            involvedUserIds,
            dateRange,
            leagueId,
            roleWeights,
            fantaMembers,
          ),
        ]);

        const memberRoundPoints = (userId: string): number => {
          const member = fantaMembers.find((m) => m.userId === userId);
          if (!member) return 0;
          const autoPoints = member.team.reduce((sum, pick) => {
            const points = computeAutoPoints(
              pick,
              roundPlayerStats,
              roundTeamStats,
              roleWeights,
              teamWeights,
            );
            return sum + (points || 0);
          }, 0);
          return autoPoints + (lolesportsBonuses.get(userId) || 0);
        };

        let roundChanged = false;
        const updatedFixtures = round.fixtures.map((f) => {
          const homePoints =
            Math.round(memberRoundPoints(f.homeUserId) * 100) / 100;
          const awayPoints = f.awayUserId
            ? Math.round(memberRoundPoints(f.awayUserId) * 100) / 100
            : undefined;
          if (homePoints !== f.homePoints || awayPoints !== f.awayPoints) {
            roundChanged = true;
          }
          return { ...f, homePoints, awayPoints };
        });

        if (roundChanged) {
          hasRoundWrites = true;
          roundBatch.update(
            doc(db, "fantas", currentFanta.id, "calendar", round.id),
            { fixtures: updatedFixtures },
          );
        }
      }

      if (hasRoundWrites) await roundBatch.commit();
    }

    // Punteggio del tabellone a eliminazione diretta (fase 2, solo
    // WORLDS/MSI): stessa logica del calendario a girone sopra, applicata a
    // ogni turno del bracket. Quando un turno risulta completamente deciso
    // (ogni match ha un vincitore, bye inclusi) e il turno successivo non
    // esiste ancora, lo genera in automatico accoppiando i vincitori (vedi
    // lib/bracket.ts) — nessun cron: basta premere di nuovo "Ricalcola
    // Punteggi" per far avanzare il tabellone di un turno alla volta.
    if (bracketRounds.length > 0) {
      const bracketBatch = writeBatch(db);
      let hasBracketWrites = false;
      const sortedRounds = [...bracketRounds].sort(
        (a, b) => a.roundIndex - b.roundIndex,
      );

      for (const round of sortedRounds) {
        const involvedUserIds = Array.from(
          new Set(
            round.matches.flatMap((m) =>
              [m.homeUserId, m.awayUserId].filter(
                (id): id is string => !!id,
              ),
            ),
          ),
        );
        const roundPlayerNames = new Set<string>();
        const roundTeamNames = new Set<string>();
        involvedUserIds.forEach((uid) => {
          const member = fantaMembers.find((m) => m.userId === uid);
          member?.team.forEach((pick) => {
            if (pick.pickType === "player" || pick.pickType === "jolly") {
              roundPlayerNames.add(pick.playerName);
            } else if (pick.pickType === "team") {
              roundTeamNames.add(pick.playerName);
            } else if (pick.pickType === "coach" && pick.playerTeam) {
              roundTeamNames.add(pick.playerTeam);
            }
          });
        });

        const dateRange = { start: round.startDate, end: round.endDate };
        const [roundPlayerStats, roundTeamStats, lolesportsBonuses] = await Promise.all([
          getFantasyPlayerStats(
            Array.from(roundPlayerNames),
            circuitType,
            dateRange,
          ),
          getFantasyTeamStats(
            Array.from(roundTeamNames),
            circuitType,
            dateRange,
          ),
          computeLolesportsRoundBonuses(
            involvedUserIds,
            dateRange,
            leagueId,
            roleWeights,
            fantaMembers,
          ),
        ]);

        const memberBracketPoints = (userId: string): number => {
          const member = fantaMembers.find((m) => m.userId === userId);
          if (!member) return 0;
          const autoPoints = member.team.reduce((sum, pick) => {
            const points = computeAutoPoints(
              pick,
              roundPlayerStats,
              roundTeamStats,
              roleWeights,
              teamWeights,
            );
            return sum + (points || 0);
          }, 0);
          return autoPoints + (lolesportsBonuses.get(userId) || 0);
        };

        let roundChanged = false;
        const updatedMatches: BracketMatch[] = round.matches.map((match) => {
          // Già deciso (giocato o bye) oppure ancora TBD in attesa del
          // turno precedente: niente da calcolare qui.
          if (match.winnerUserId || !match.homeUserId || !match.awayUserId) {
            return match;
          }
          const homePoints =
            Math.round(memberBracketPoints(match.homeUserId) * 100) / 100;
          const awayPoints =
            Math.round(memberBracketPoints(match.awayUserId) * 100) / 100;
          const winnerUserId =
            homePoints > awayPoints
              ? match.homeUserId
              : awayPoints > homePoints
                ? match.awayUserId
                : undefined;
          if (
            homePoints !== match.homePoints ||
            awayPoints !== match.awayPoints ||
            winnerUserId !== match.winnerUserId
          ) {
            roundChanged = true;
          }
          return {
            ...match,
            homePoints,
            awayPoints,
            ...(winnerUserId ? { winnerUserId } : {}),
          };
        });

        if (roundChanged) {
          hasBracketWrites = true;
          bracketBatch.update(
            doc(db, "fantas", currentFanta.id, "bracket", round.id),
            { matches: updatedMatches },
          );
        }

        const nextRoundExists = sortedRounds.some(
          (r) => r.roundIndex === round.roundIndex + 1,
        );
        if (!nextRoundExists && isRoundComplete(updatedMatches)) {
          const nextMatches = nextRoundFromWinners(updatedMatches);
          if (nextMatches.length > 0) {
            const nextRoundLengthDays =
              currentFanta.settings.bracketRoundLengthDays || 7;
            const nextStart = round.endDate;
            const nextEnd = new Date(
              nextStart.getTime() + nextRoundLengthDays * 86400000,
            );
            hasBracketWrites = true;
            bracketBatch.set(
              doc(collection(db, "fantas", currentFanta.id, "bracket")),
              {
                roundIndex: round.roundIndex + 1,
                matches: nextMatches,
                startDate: Timestamp.fromDate(nextStart),
                endDate: Timestamp.fromDate(nextEnd),
              },
            );
          }
        }
      }

      if (hasBracketWrites) await bracketBatch.commit();
    }
  };

  // Classifica: somma dei punti di ogni pick in rosa, per membro. Non è
  // (ancora) un confronto diretto giornata per giornata contro l'avversario
  // del calendario: manca una mappatura affidabile tra "giornata fantasy" e
  // data reale delle partite pro su Leaguepedia — vedi il commento su
  // CalendarRound in types/index.ts.
  const standings: StandingsEntry[] = useMemo(() => {
    const roleWeights = currentFanta?.settings.scoringWeights || {};
    const teamWeights =
      currentFanta?.settings.teamScoringWeights || DEFAULT_TEAM_SCORING_WEIGHTS;

    return [...fantaMembers]
      .map((m) => ({
        userId: m.userId,
        name: m.name,
        teamName: m.teamName,
        totalPoints: m.team.reduce(
          (sum, p) => sum + totalPickPoints(p, roleWeights, teamWeights),
          0,
        ),
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints);
  }, [fantaMembers, currentFanta]);

  const createAuction: FantaContextType["createAuction"] = (auction) => {
    if (!currentFanta || !user) return;
    if (currentFanta.settings.seasonStarted) return;
    addDoc(collection(db, "fantas", currentFanta.id, "auctions"), {
      ...auction,
      // Difensivo: il form UI ha già min/max, ma non fidarsi solo del client.
      countdownSeconds: Math.min(
        MAX_COUNTDOWN_SECONDS,
        Math.max(MIN_COUNTDOWN_SECONDS, auction.countdownSeconds),
      ),
      fantaId: currentFanta.id,
      currentPrice: auction.basePrice,
      status: "pending",
      createdBy: user.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const startAuction = (auctionId: string, countdownSeconds: number): void => {
    if (!currentFanta) return;
    updateDoc(doc(db, "fantas", currentFanta.id, "auctions", auctionId), {
      status: "active",
      countdownEndsAt: Timestamp.fromMillis(Date.now() + countdownSeconds * 1000),
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  // Blocca l'asta senza assegnarla: torna disponibile in stato "pending" e
  // può essere riavviata in seguito con "Avvia" (mantiene prezzo/offerente).
  const pauseAuction = (auctionId: string): void => {
    if (!currentFanta) return;
    updateDoc(doc(db, "fantas", currentFanta.id, "auctions", auctionId), {
      status: "pending",
      updatedAt: serverTimestamp(),
    });
  };

  const placeBid = (auctionId: string, amount: number): void => {
    if (!user || !currentFanta || !currentMember) return;
    if (currentFanta.settings.seasonStarted && !isFantaViceOrAdmin) return;
    const maxBid = currentFanta.settings.maxBid;
    const maxPlayersTotal = currentFanta.settings.maxPlayersTotal || 0;
    const maxPlayersPerRole = currentFanta.settings.maxPlayersPerRole || {};

    // Rosa e budget vengono dallo stato locale (aggiornato in tempo reale
    // via onSnapshot), non da una lettura live dentro la transazione: per
    // un'app tra amici va bene, non serve la rigidità di una vera asta
    // finanziaria.
    const myRoster = currentMember.team;
    const myBudget = currentMember.budgetLeft;
    const openSlots =
      maxPlayersTotal > 0 ? maxPlayersTotal - myRoster.length : 0;

    if (maxPlayersTotal > 0 && myRoster.length >= maxPlayersTotal) return;

    const ref = doc(db, "fantas", currentFanta.id, "auctions", auctionId);
    // La transazione può no-oppare (limiti superati, asta non più attiva):
    // logghiamo lo storico solo se l'offerta è stata davvero accettata,
    // altrimenti risulterebbe un rilancio che in realtà non è avvenuto.
    let accepted = false;

    runTransaction(db, async (tx) => {
      accepted = false;
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.status !== "active") return;

      const pickType = (data.pickType as TeamPickType) || "player";
      if (pickType === "player") {
        const role = data.playerRole as string | undefined;
        const roleLimit = role ? maxPlayersPerRole[role] : undefined;
        if (
          roleLimit &&
          myRoster.filter((p) => p.pickType === "player" && p.playerRole === role)
            .length >= roleLimit
        ) {
          return;
        }
      } else if (pickType === "team") {
        // Al massimo una squadra in rosa: è il draft composto (step 4),
        // non un'asta di più squadre.
        if (myRoster.some((p) => p.pickType === "team")) return;
      } else if (pickType === "coach") {
        if (myRoster.some((p) => p.pickType === "coach")) return;
      } else if (pickType === "jolly") {
        // maxJolly usa la convenzione "0 = nessuno" (non "0 = illimitato"
        // come maxPlayersTotal/maxPlayersPerRole): 0 blocca subito i jolly.
        const maxJolly = currentFanta.settings.maxJolly || 0;
        if (
          myRoster.filter((p) => p.pickType === "jolly").length >= maxJolly
        ) {
          return;
        }
      }

      const newPrice = (data.currentPrice as number) + amount;
      if (newPrice > maxBid) return;
      // Non si può offrire più di quanto si ha, e se ci sono altri posti
      // rosa da riempire dopo questo, il budget rimanente non può scendere
      // sotto il loro numero (1 credito minimo a slot, altrimenti si
      // arriva a fine asta senza soldi per completare la squadra).
      if (newPrice > myBudget) return;
      if (openSlots > 0 && myBudget - newPrice < openSlots) return;

      const countdownMs = (data.countdownSeconds as number) * 1000;
      tx.update(ref, {
        currentPrice: newPrice,
        highestBidderId: user.id,
        highestBidderName: user.name,
        countdownEndsAt: Timestamp.fromMillis(Date.now() + countdownMs),
        updatedAt: serverTimestamp(),
      });
      accepted = true;
    }).then(() => {
      if (!accepted) return;
      addDoc(
        collection(db, "fantas", currentFanta.id, "auctions", auctionId, "bids"),
        {
          auctionId,
          userId: user.id,
          userName: user.name,
          amount,
          createdAt: serverTimestamp(),
        },
      );
    });
  };

  // Chiude un'asta (manualmente o perché il countdown è arrivato a zero) e,
  // se non annullata, assegna il giocatore al miglior offerente: aggiunge il
  // pick alla rosa del vincitore, scala il budget e registra una voce nello
  // storico immutabile. La transazione sull'asta garantisce che, se più
  // client provano a chiuderla nello stesso momento, solo il primo esegua
  // davvero l'assegnazione.
  const finalizeAuction = (
    auctionId: string,
    options: {
      cancel?: boolean;
      overrideWinnerId?: string;
      overrideWinnerName?: string;
    } = {},
  ): void => {
    if (!currentFanta) return;
    const fantaId = currentFanta.id;
    const ref = doc(db, "fantas", fantaId, "auctions", auctionId);
    let winner: {
      userId: string;
      userName: string;
      pick: TeamPick;
    } | null = null;

    runTransaction(db, async (tx) => {
      winner = null;
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.status === "closed") return;

      // L'assegnazione manuale (admin/vice/dev) sostituisce il miglior
      // offerente registrato con chi hanno deciso loro: utile quando due
      // persone si sono già accordate fuori dall'asta e vogliono solo che
      // il gestionale registri l'esito. Il prezzo resta quello raggiunto.
      const winnerId = options.overrideWinnerId || data.highestBidderId;
      const winnerName = options.overrideWinnerId
        ? options.overrideWinnerName
        : data.highestBidderName;

      const update: Record<string, unknown> = {
        status: "closed",
        closedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (options.overrideWinnerId) {
        update.highestBidderId = winnerId;
        update.highestBidderName = winnerName;
      }
      tx.update(ref, update);

      if (!options.cancel && winnerId) {
        winner = {
          userId: winnerId as string,
          userName: (winnerName as string) || "Utente",
          pick: {
            id: auctionId,
            pickType: (data.pickType as TeamPickType) || "player",
            playerName: data.playerName,
            playerRole: data.playerRole,
            playerTeam: data.playerTeam,
            purchasePrice: data.currentPrice,
            auctionId,
            acquiredAt: new Date(),
          },
        };
      }
    })
      .then(() => {
        if (!winner) return;
        const { userId, userName, pick } = winner;
        // Le scritture sono indipendenti: se una fallisce, non deve
        // bloccare le altre in silenzio, con l'asta segnata "chiusa" ma
        // senza né giocatore né budget né storico aggiornati.
        try {
          updateDoc(doc(db, "fantas", fantaId, "members", userId), {
            team: arrayUnion(pick),
            budgetSpent: increment(pick.purchasePrice),
            budgetLeft: increment(-pick.purchasePrice),
          });
        } catch (error) {
          console.error("Errore nell'assegnazione del giocatore vinto:", error);
        }
        try {
          const entry: Omit<HistoryEntry, "id" | "purchasedAt"> = {
            playerName: pick.playerName,
            playerRole: pick.playerRole,
            playerTeam: pick.playerTeam,
            buyerUserId: userId,
            buyerName: userName,
            price: pick.purchasePrice,
            auctionId,
          };
          addDoc(collection(db, "fantas", fantaId, "history"), {
            ...entry,
            purchasedAt: serverTimestamp(),
          });
        } catch (error) {
          console.error("Errore nella scrittura dello storico:", error);
        }
      })
      .catch((error) => {
        console.error("Errore nella chiusura dell'asta:", error);
      });
  };

  // Annulla l'assegnazione di un'asta chiusa: toglie il giocatore a chi
  // l'aveva vinta (rimborsando il budget) e riporta l'asta a "pending" con
  // il prezzo resettato al base, pronta per essere riavviata da capo. Lo
  // storico NON viene toccato: resta come log di ciò che è realmente
  // avvenuto, anche se poi annullato.
  const reopenAuction = async (auctionId: string): Promise<void> => {
    if (!currentFanta) return;
    const fantaId = currentFanta.id;
    const ref = doc(db, "fantas", fantaId, "auctions", auctionId);
    const auctionSnap = await getDoc(ref);
    if (!auctionSnap.exists()) return;
    const auctionData = auctionSnap.data();
    const winnerId = auctionData.highestBidderId as string | undefined;

    if (winnerId) {
      const memberRef = doc(db, "fantas", fantaId, "members", winnerId);
      const memberSnap = await getDoc(memberRef);
      if (memberSnap.exists()) {
        const memberData = memberSnap.data();
        const team = (memberData.team as Record<string, unknown>[]) || [];
        const removed = team.filter((p) => p.auctionId === auctionId);
        const refund = removed.reduce(
          (sum, p) => sum + ((p.purchasePrice as number) || 0),
          0,
        );
        if (removed.length > 0) {
          await updateDoc(memberRef, {
            team: team.filter((p) => p.auctionId !== auctionId),
            budgetSpent: increment(-refund),
            budgetLeft: increment(refund),
          });
        }
      }
    }

    await updateDoc(ref, {
      status: "pending",
      currentPrice: auctionData.basePrice,
      highestBidderId: deleteField(),
      highestBidderName: deleteField(),
      countdownEndsAt: deleteField(),
      startedAt: deleteField(),
      closedAt: deleteField(),
      updatedAt: serverTimestamp(),
    });
  };

  const closeAuction = (auctionId: string): void => finalizeAuction(auctionId);
  const cancelAuction = (auctionId: string): void =>
    finalizeAuction(auctionId, { cancel: true });

  // Assegna manualmente l'asta a un membro scelto da admin/vice/dev, anche
  // se non è lui l'offerente più alto registrato (es. due utenti si sono
  // già accordati fuori dall'asta su chi se lo prende).
  const assignAuctionManually = (
    auctionId: string,
    userId: string,
    userName: string,
  ): void => {
    finalizeAuction(auctionId, {
      overrideWinnerId: userId,
      overrideWinnerName: userName,
    });
  };

  // Nessun backend/cron: quando il countdown di un'asta attiva scade, deve
  // essere un client con la pagina aperta a chiuderla. Se nessuno ha la
  // pagina aperta esattamente allo scadere, si chiude al successivo giro di
  // questo effetto sul primo client che la apre: accettabile per un'app tra
  // amici senza Cloud Functions.
  useEffect(() => {
    const activeAuctions = auctions.filter(
      (a) => a.status === "active" && a.countdownEndsAt,
    );
    if (activeAuctions.length === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      activeAuctions.forEach((a) => {
        if (a.countdownEndsAt && a.countdownEndsAt.getTime() <= now) {
          finalizeAuction(a.id);
        }
      });
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctions]);

  // Avvia il draft a turni: genera un ordine casuale (Fisher-Yates) tra i
  // membri attuali della lega e crea lo stato iniziale. Non tocca budget:
  // il draft a turni non ha economia, le pick sono a prezzo 0 (vedi
  // makeDraftPick). Da chiamare una sola volta; se lo stato esiste già
  // questa sovrascrive tutto da capo, quindi l'UI la mostra solo quando
  // draftState è null o status "not_started".
  const startDraft = (): void => {
    if (!currentFanta) return;
    if (currentFanta.settings.seasonStarted) return;
    const pickSeconds =
      currentFanta.settings.draftPickSeconds || MIN_COUNTDOWN_SECONDS;
    const order = fantaMembers.map((m) => m.userId);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    setDoc(doc(db, "fantas", currentFanta.id, "draft", "state"), {
      status: "active",
      order,
      currentSlotIndex: 0,
      currentTurnIndex: 0,
      pickDeadline: Timestamp.fromMillis(Date.now() + pickSeconds * 1000),
      pendingAssignments: [],
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  // Registra la scelta del turno corrente (fatta dall'utente di turno, o da
  // admin/vice/dev per suo conto, stesso privilegio dell'assegnazione
  // manuale delle aste) e avanza al turno successivo. La transazione sullo
  // stato garantisce che due client non possano avanzare lo stesso turno
  // due volte; la scrittura sulla rosa del membro è separata (stesso
  // compromesso non-atomico di finalizeAuction, accettabile qui).
  const makeDraftPick = (input: {
    playerName: string;
    playerRole?: string;
    playerTeam?: string;
  }): void => {
    if (!currentFanta || !user) return;
    const fantaId = currentFanta.id;
    const slots = buildDraftSlots(currentFanta);
    const pickSeconds =
      currentFanta.settings.draftPickSeconds || MIN_COUNTDOWN_SECONDS;
    const stateRef = doc(db, "fantas", fantaId, "draft", "state");

    let result: { targetUserId: string; pick: TeamPick } | null = null;

    runTransaction(db, async (tx) => {
      result = null;
      const snap = await tx.get(stateRef);
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.status !== "active") return;

      const order = (data.order as string[]) || [];
      const slotIndex = data.currentSlotIndex as number;
      const turnIndex = data.currentTurnIndex as number;
      const slot = slots[slotIndex];
      if (!slot) return;

      const expectedUserId = getDraftTurnUserId(order, slotIndex, turnIndex);
      if (!expectedUserId) return;
      if (!isFantaViceOrAdmin) {
        if (expectedUserId !== user.id) return;
        if (currentFanta.settings.seasonStarted) return;
      }

      const next = advanceDraftTurn(order, slots.length, slotIndex, turnIndex);
      tx.update(stateRef, {
        status: next.completed ? "completed" : "active",
        currentSlotIndex: next.slotIndex,
        currentTurnIndex: next.turnIndex,
        pickDeadline: next.completed
          ? deleteField()
          : Timestamp.fromMillis(Date.now() + pickSeconds * 1000),
        updatedAt: serverTimestamp(),
      });

      result = {
        targetUserId: expectedUserId,
        pick: {
          id: doc(collection(db, "fantas", fantaId, "history")).id,
          pickType: slot.pickType,
          playerName: input.playerName,
          playerRole: slot.pickType === "player" ? slot.role : undefined,
          playerTeam: input.playerTeam,
          purchasePrice: 0,
          acquiredAt: new Date(),
        },
      };
    }).then(() => {
      if (!result) return;
      const { targetUserId, pick } = result;
      updateDoc(doc(db, "fantas", fantaId, "members", targetUserId), {
        team: arrayUnion(pick),
      }).catch((error) => {
        console.error("Errore nell'assegnazione della pick di draft:", error);
      });
      addDoc(collection(db, "fantas", fantaId, "history"), {
        playerName: pick.playerName,
        playerRole: pick.playerRole,
        playerTeam: pick.playerTeam,
        buyerUserId: targetUserId,
        buyerName: getMemberName(targetUserId),
        price: 0,
        purchasedAt: serverTimestamp(),
      }).catch((error) => {
        console.error("Errore nella scrittura dello storico draft:", error);
      });
    });
  };

  // Salta il turno corrente senza assegnare nulla: succede da sola per
  // timeout (vedi l'effetto sotto, stesso pattern del countdown asta — un
  // client con la pagina aperta se ne accorge e chiama questa funzione, che
  // riverifica la scadenza in transazione) oppure a comando (options.force,
  // bottone admin "salta comunque" — l'UI mostra quel bottone solo ad
  // admin/vice, qui non c'è un controllo ruolo separato, stessa convenzione
  // di closeAuction/cancelAuction). Il turno saltato finisce in
  // pendingAssignments, da completare a mano con fillPendingDraftAssignment.
  const skipDraftTurn = (options: { force?: boolean } = {}): void => {
    if (!currentFanta) return;
    const fantaId = currentFanta.id;
    const slots = buildDraftSlots(currentFanta);
    const pickSeconds =
      currentFanta.settings.draftPickSeconds || MIN_COUNTDOWN_SECONDS;
    const stateRef = doc(db, "fantas", fantaId, "draft", "state");

    runTransaction(db, async (tx) => {
      const snap = await tx.get(stateRef);
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.status !== "active") return;

      if (!options.force) {
        const deadline = data.pickDeadline as Timestamp | undefined;
        if (!deadline || deadline.toMillis() > Date.now()) return;
      }

      const order = (data.order as string[]) || [];
      const slotIndex = data.currentSlotIndex as number;
      const turnIndex = data.currentTurnIndex as number;
      const expectedUserId = getDraftTurnUserId(order, slotIndex, turnIndex);
      if (!expectedUserId) return;

      const next = advanceDraftTurn(order, slots.length, slotIndex, turnIndex);
      const pending =
        (data.pendingAssignments as PendingDraftAssignment[]) || [];

      tx.update(stateRef, {
        status: next.completed ? "completed" : "active",
        currentSlotIndex: next.slotIndex,
        currentTurnIndex: next.turnIndex,
        pickDeadline: next.completed
          ? deleteField()
          : Timestamp.fromMillis(Date.now() + pickSeconds * 1000),
        pendingAssignments: [
          ...pending,
          { userId: expectedUserId, slotIndex },
        ],
        updatedAt: serverTimestamp(),
      });
    }).catch((error) => {
      console.error("Errore nel salto turno del draft:", error);
    });
  };

  // Completa a mano un turno saltato per timeout: scrive la pick sulla rosa
  // dell'utente saltato e toglie la voce da pendingAssignments, SENZA
  // toccare il turno corrente (che nel frattempo è già andato avanti da solo).
  const fillPendingDraftAssignment = (
    pending: PendingDraftAssignment,
    input: { playerName: string; playerTeam?: string },
  ): void => {
    if (!currentFanta) return;
    const fantaId = currentFanta.id;
    const slots = buildDraftSlots(currentFanta);
    const slot = slots[pending.slotIndex];
    if (!slot) return;

    const pick: TeamPick = {
      id: doc(collection(db, "fantas", fantaId, "history")).id,
      pickType: slot.pickType,
      playerName: input.playerName,
      playerRole: slot.pickType === "player" ? slot.role : undefined,
      playerTeam: input.playerTeam,
      purchasePrice: 0,
      acquiredAt: new Date(),
    };

    updateDoc(doc(db, "fantas", fantaId, "members", pending.userId), {
      team: arrayUnion(pick),
    });
    addDoc(collection(db, "fantas", fantaId, "history"), {
      playerName: pick.playerName,
      playerRole: pick.playerRole,
      playerTeam: pick.playerTeam,
      buyerUserId: pending.userId,
      buyerName: getMemberName(pending.userId),
      price: 0,
      purchasedAt: serverTimestamp(),
    });

    const remaining = (draftState?.pendingAssignments || []).filter(
      (p) => !(p.userId === pending.userId && p.slotIndex === pending.slotIndex),
    );
    updateDoc(doc(db, "fantas", fantaId, "draft", "state"), {
      pendingAssignments: remaining,
      updatedAt: serverTimestamp(),
    });
  };

  // Nessun cron: come per il countdown asta, un client con la pagina del
  // draft aperta deve accorgersi che il turno è scaduto. skipDraftTurn
  // riverifica la scadenza in transazione, quindi più client in polling
  // insieme non causano doppi salti.
  useEffect(() => {
    if (
      !draftState ||
      draftState.status !== "active" ||
      !draftState.pickDeadline
    ) {
      return;
    }

    const interval = setInterval(() => {
      if (draftState.pickDeadline && draftState.pickDeadline.getTime() <= Date.now()) {
        skipDraftTurn();
      }
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftState]);

  const sendJoinRequest = (fanta: Fanta): void => {
    if (!user) return;
    addDoc(collection(db, "fantas", fanta.id, "joinRequests"), {
      fantaId: fanta.id,
      fantaName: fanta.name,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      status: "pending",
      createdAt: new Date(),
    });
  };

  const approveJoinRequest = (request: JoinRequest): void => {
    const fanta = allFantas.find((f) => f.id === request.fantaId);
    const generalBudget = fanta?.settings.generalBudget ?? 0;
    const newMember: FantaMember = {
      userId: request.userId,
      role: "membro",
      teamName: DEFAULT_TEAM_NAME,
      team: [],
      budgetTot: generalBudget,
      budgetSpent: 0,
      budgetLeft: generalBudget,
    };
    setDoc(
      doc(db, "fantas", request.fantaId, "members", request.userId),
      newMember,
    );
    updateDoc(
      doc(db, "fantas", request.fantaId, "joinRequests", request.id),
      { status: "approved" },
    );
  };

  const rejectJoinRequest = (requestId: string): void => {
    if (!currentFanta) return;
    updateDoc(
      doc(db, "fantas", currentFanta.id, "joinRequests", requestId),
      { status: "rejected" },
    );
  };

  return (
    <FantaContext.Provider
      value={{
        currentFanta,
        fantas,
        setCurrentFanta,
        addFanta,
        updateFanta,
        deleteFanta,
        isLoading,
        fantaMembers,
        currentMember,
        myRole,
        isFantaAdmin,
        isFantaViceOrAdmin,
        getMemberName,
        getMemberCount,
        getMyRoleFor,
        getUserBudget,
        getTeamName,
        updateTeamName,
        getPlayersByUser,
        removePlayerFromTeam,
        updatePickManualStats,
        addViceAdmin,
        removeViceAdmin,
        removeMember,
        history,
        calendar,
        standings,
        generateCalendar,
        recalculateScores,
        startSeason,
        setSeasonStarted,
        groups,
        bracketRounds,
        generateGroups,
        generateBracket,
        discoverableFantas,
        myJoinRequests,
        pendingJoinRequests,
        sendJoinRequest,
        approveJoinRequest,
        rejectJoinRequest,
        auctions,
        createAuction,
        startAuction,
        pauseAuction,
        placeBid,
        closeAuction,
        cancelAuction,
        reopenAuction,
        assignAuctionManually,
        draftState,
        startDraft,
        makeDraftPick,
        skipDraftTurn,
        fillPendingDraftAssignment,
      }}
    >
      {children}
    </FantaContext.Provider>
  );
}

export function useFanta() {
  const context = useContext(FantaContext);
  if (context === undefined) {
    throw new Error("useFanta must be used within a FantaProvider");
  }
  return context;
}
