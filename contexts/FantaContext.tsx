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
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { MIN_COUNTDOWN_SECONDS, MAX_COUNTDOWN_SECONDS } from "@/lib/constants";
import type {
  Fanta,
  FantaMember,
  MemberRole,
  TeamPick,
  HistoryEntry,
  JoinRequest,
  Auction,
} from "@/types";

const DEFAULT_TEAM_NAME = "I Campioni";

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

interface FantaContextType {
  currentFanta: Fanta | null;
  fantas: Fanta[];
  setCurrentFanta: (fanta: Fanta) => void;
  addFanta: (fanta: Fanta) => void;
  updateFanta: (fanta: Fanta) => void;
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

  // Gestione membri/vice-admin (solo isFantaAdmin)
  addViceAdmin: (userId: string) => void;
  removeViceAdmin: (userId: string) => void;
  removeMember: (userId: string) => void;

  // Storico acquisti: immutabile, resta anche se un'asta viene riaperta
  history: HistoryEntry[];

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
  const { user } = useAuth();
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
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [memberProfiles, setMemberProfiles] = useState<
    Record<string, { name: string; email: string }>
  >({});

  // Ascolta in tempo reale TUTTI i fanta esistenti: serve sia per "scoprire"
  // leghe altrui sia per mostrare le proprie (filtrate via allMemberships).
  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(collection(db, "fantas"), (snapshot) => {
      setAllFantas(
        snapshot.docs.map((docSnap) => mapFantaDoc(docSnap.id, docSnap.data())),
      );
      setFantasLoaded(true);
    });

    return unsubscribe;
  }, [user]);

  // Ascolta in tempo reale TUTTE le membership di TUTTE le leghe (collection
  // group su fantas/*/members): da qui derivano sia "di quali leghe faccio
  // parte" sia il conteggio membri di ogni lega, senza dover mantenere più
  // listener separati per lega.
  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(
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
    );

    return unsubscribe;
  }, [user]);

  // Ascolta le richieste di ingresso inviate dall'utente corrente, su tutte le leghe
  useEffect(() => {
    if (!user) return;

    const requestsQuery = query(
      collectionGroup(db, "joinRequests"),
      where("userId", "==", user.id),
    );

    const unsubscribe = onSnapshot(requestsQuery, (snapshot) => {
      setRawMyJoinRequests(
        snapshot.docs.map((docSnap) =>
          mapJoinRequestDoc(docSnap.id, docSnap.data()),
        ),
      );
    });

    return unsubscribe;
  }, [user]);

  const isDeveloper = !!user?.isDeveloper;

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

  const addFanta = (fanta: Fanta): void => {
    if (!user) return;
    const batch = writeBatch(db);
    batch.set(doc(db, "fantas", fanta.id), fanta);
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
    batch.set(memberRef, adminMember);
    batch.commit();
    setCurrentFanta(fanta);
  };

  const updateFanta = (fanta: Fanta): void => {
    setDoc(doc(db, "fantas", fanta.id), fanta);
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

    const unsubscribe = onSnapshot(membersQuery, (snapshot) => {
      const profiles: Record<string, { name: string; email: string }> = {};
      snapshot.docs.forEach((docSnap) => {
        profiles[docSnap.id] = {
          name: docSnap.data().name || "Utente",
          email: docSnap.data().email || "",
        };
      });
      setMemberProfiles(profiles);
    });

    return unsubscribe;
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

    const unsubscribe = onSnapshot(requestsQuery, (snapshot) => {
      setPendingJoinRequests(
        snapshot.docs.map((docSnap) =>
          mapJoinRequestDoc(docSnap.id, docSnap.data()),
        ),
      );
    });

    return unsubscribe;
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

    const unsubscribe = onSnapshot(auctionsQuery, (snapshot) => {
      setAuctions(
        snapshot.docs.map((docSnap) => mapAuctionDoc(docSnap.id, docSnap.data())),
      );
    });

    return unsubscribe;
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

    const unsubscribe = onSnapshot(historyQuery, (snapshot) => {
      setHistory(
        snapshot.docs.map((docSnap) => mapHistoryDoc(docSnap.id, docSnap.data())),
      );
    });

    return unsubscribe;
  }, [currentFanta]);

  const createAuction: FantaContextType["createAuction"] = (auction) => {
    if (!currentFanta || !user) return;
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

      const role = data.playerRole as string | undefined;
      const roleLimit = role ? maxPlayersPerRole[role] : undefined;
      if (
        roleLimit &&
        myRoster.filter((p) => p.playerRole === role).length >= roleLimit
      ) {
        return;
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
            pickType: "player",
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
        addViceAdmin,
        removeViceAdmin,
        removeMember,
        history,
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
