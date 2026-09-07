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
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  increment,
  arrayUnion,
  runTransaction,
  serverTimestamp,
  deleteField,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { Fanta, Player, JoinRequest, Auction } from "@/types";

export interface TeamPlayer extends Player {
  userId: string; // ID dell'utente proprietario
  fantaId: string; // ID della lega
  auctionId?: string; // asta da cui è stato assegnato, se presente (serve a "Riapri Asta")
}

interface FantaContextType {
  currentFanta: Fanta | null;
  fantas: Fanta[];
  setCurrentFanta: (fanta: Fanta) => void;
  addFanta: (fanta: Fanta) => void;
  updateFanta: (fanta: Fanta) => void;
  isLoading: boolean;
  // Gestione giocatori
  getPlayersByUser: (userId: string, fantaId: string) => TeamPlayer[];
  addPlayerToTeam: (player: Omit<TeamPlayer, "id" | "acquiredAt">) => void;
  removePlayerFromTeam: (playerId: string, userId: string) => void;
  updateUserBudget: (userId: string, amount: number) => void;
  getUserBudget: (userId: string) => number;
  getTeamName: (userId: string) => string;
  updateTeamName: (userId: string, name: string) => void;
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
}

const FantaContext = createContext<FantaContextType | undefined>(undefined);

const DEFAULT_TEAM_NAME = "I Campioni";

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
    adminId: data.adminId,
    viceAdminIds: data.viceAdminIds || [],
    settings: data.settings,
    memberIds: data.memberIds || [],
    inviteCode: data.inviteCode,
    createdAt: toDate(data.createdAt as Timestamp | Date | undefined),
    updatedAt: toDate(data.updatedAt as Timestamp | Date | undefined),
  } as Fanta;
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

export function FantaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [rawFantas, setRawFantas] = useState<Fanta[]>([]);
  const [allFantas, setAllFantas] = useState<Fanta[]>([]);
  const [loadedForUserId, setLoadedForUserId] = useState<string | null>(null);
  const [currentFantaId, setCurrentFantaId] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("fanta-current-id")
      : null,
  );
  const [players, setPlayers] = useState<TeamPlayer[]>([]);
  const [userBudgets, setUserBudgets] = useState<Record<string, number>>({});
  const [userTeamNames, setUserTeamNames] = useState<Record<string, string>>(
    {},
  );
  const [rawMyJoinRequests, setRawMyJoinRequests] = useState<JoinRequest[]>(
    [],
  );
  const [pendingJoinRequests, setPendingJoinRequests] = useState<
    JoinRequest[]
  >([]);
  const [auctions, setAuctions] = useState<Auction[]>([]);

  // Ascolta in tempo reale i fanta di cui l'utente è membro
  useEffect(() => {
    if (!user) return;

    const fantasQuery = query(
      collection(db, "fantas"),
      where("memberIds", "array-contains", user.id),
    );

    const unsubscribe = onSnapshot(fantasQuery, (snapshot) => {
      setRawFantas(
        snapshot.docs.map((docSnap) => mapFantaDoc(docSnap.id, docSnap.data())),
      );
      setLoadedForUserId(user.id);
    });

    return unsubscribe;
  }, [user]);

  // Ascolta in tempo reale TUTTI i fanta esistenti, per la "scoperta" di leghe altrui
  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(collection(db, "fantas"), (snapshot) => {
      setAllFantas(
        snapshot.docs.map((docSnap) => mapFantaDoc(docSnap.id, docSnap.data())),
      );
    });

    return unsubscribe;
  }, [user]);

  // Ascolta le richieste di ingresso inviate dall'utente corrente
  useEffect(() => {
    if (!user) return;

    const requestsQuery = query(
      collection(db, "joinRequests"),
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

  // I fanta caricati restano validi solo finché sono dell'utente loggato attuale.
  // Un "developer" ha accesso universale: vede/gestisce tutte le leghe, zero blocchi.
  const isDeveloper = !!user?.isDeveloper;
  const fantas = useMemo(() => {
    if (!user) return [];
    return isDeveloper ? allFantas : rawFantas;
  }, [user, isDeveloper, allFantas, rawFantas]);
  const myJoinRequests = useMemo(
    () => (user ? rawMyJoinRequests : []),
    [user, rawMyJoinRequests],
  );
  const isLoading = !!user && !isDeveloper && loadedForUserId !== user.id;

  const discoverableFantas = useMemo(() => {
    if (!user || isDeveloper) return [];
    return allFantas.filter((fanta) => !fanta.memberIds.includes(user.id));
  }, [allFantas, user, isDeveloper]);

  const currentFanta = useMemo(() => {
    if (fantas.length === 0) return null;
    return fantas.find((f) => f.id === currentFantaId) || fantas[0];
  }, [fantas, currentFantaId]);

  const setCurrentFanta = (fanta: Fanta) => {
    setCurrentFantaId(fanta.id);
    localStorage.setItem("fanta-current-id", fanta.id);
  };

  const addFanta = (fanta: Fanta) => {
    setDoc(doc(db, "fantas", fanta.id), fanta);
    setCurrentFanta(fanta);
  };

  const updateFanta = (fanta: Fanta) => {
    setDoc(doc(db, "fantas", fanta.id), fanta);
  };

  // Ascolta in tempo reale i giocatori del fanta attualmente selezionato
  useEffect(() => {
    if (!currentFanta) return;

    const playersQuery = query(
      collection(db, "players"),
      where("fantaId", "==", currentFanta.id),
    );

    const unsubscribe = onSnapshot(playersQuery, (snapshot) => {
      const loaded = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          name: data.name,
          role: data.role,
          team: data.team,
          purchasePrice: data.purchasePrice,
          customFields: data.customFields,
          acquiredAt: toDate(data.acquiredAt),
          userId: data.userId,
          fantaId: data.fantaId,
        } as TeamPlayer;
      });
      setPlayers(loaded);
    });

    return unsubscribe;
  }, [currentFanta]);

  // Ascolta in tempo reale i budget del fanta attualmente selezionato
  // (il budget è per-lega, non per account: ogni utente può avere budget
  // diversi in leghe diverse, tutti a partire dallo stesso generalBudget)
  useEffect(() => {
    if (!currentFanta) return;

    const budgetsQuery = query(
      collection(db, "teamBudgets"),
      where("fantaId", "==", currentFanta.id),
    );

    const unsubscribe = onSnapshot(budgetsQuery, (snapshot) => {
      const budgets: Record<string, number> = {};
      const teamNames: Record<string, string> = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        budgets[data.userId] = data.budget;
        teamNames[data.userId] = data.teamName || DEFAULT_TEAM_NAME;
      });
      setUserBudgets(budgets);
      setUserTeamNames(teamNames);
    });

    return unsubscribe;
  }, [currentFanta]);

  // Ascolta le richieste di ingresso pendenti per il fanta attualmente selezionato
  useEffect(() => {
    if (!currentFanta) return;

    const requestsQuery = query(
      collection(db, "joinRequests"),
      where("fantaId", "==", currentFanta.id),
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

  // Ascolta in tempo reale le aste del fanta attualmente selezionato:
  // è ciò che rende un'asta visibile e sincronizzata su tutti i dispositivi
  // (prima vivevano solo nello useState locale della pagina Aste).
  useEffect(() => {
    if (!currentFanta) {
      setAuctions([]);
      return;
    }

    const auctionsQuery = query(
      collection(db, "auctions"),
      where("fantaId", "==", currentFanta.id),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(auctionsQuery, (snapshot) => {
      setAuctions(
        snapshot.docs.map((docSnap) => mapAuctionDoc(docSnap.id, docSnap.data())),
      );
    });

    return unsubscribe;
  }, [currentFanta]);

  const getPlayersByUser = (userId: string, fantaId: string): TeamPlayer[] => {
    return players.filter((p) => p.userId === userId && p.fantaId === fantaId);
  };

  const addPlayerToTeam = (
    player: Omit<TeamPlayer, "id" | "acquiredAt">,
  ): void => {
    addDoc(collection(db, "players"), {
      ...player,
      acquiredAt: new Date(),
    });
  };

  const removePlayerFromTeam = (playerId: string, userId: string): void => {
    const player = players.find(
      (p) => p.id === playerId && p.userId === userId,
    );
    if (player) {
      deleteDoc(doc(db, "players", playerId));
      updateUserBudget(userId, player.purchasePrice);
    }
  };

  const updateUserBudget = (userId: string, amount: number): void => {
    if (!currentFanta) return;
    const budgetId = `${currentFanta.id}_${userId}`;
    const ref = doc(db, "teamBudgets", budgetId);
    const generalBudget = currentFanta.settings.generalBudget;

    runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        tx.update(ref, { budget: increment(amount) });
      } else {
        tx.set(ref, {
          fantaId: currentFanta.id,
          userId,
          budget: generalBudget + amount,
          teamName: DEFAULT_TEAM_NAME,
        });
      }
    });
  };

  const getUserBudget = (userId: string): number => {
    if (userId in userBudgets) return userBudgets[userId];
    return currentFanta?.settings.generalBudget ?? 0;
  };

  const getTeamName = (userId: string): string => {
    return userTeamNames[userId] || DEFAULT_TEAM_NAME;
  };

  const updateTeamName = (userId: string, name: string): void => {
    if (!currentFanta) return;
    const budgetId = `${currentFanta.id}_${userId}`;
    const ref = doc(db, "teamBudgets", budgetId);
    const generalBudget = currentFanta.settings.generalBudget;

    runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        tx.update(ref, { teamName: name });
      } else {
        tx.set(ref, {
          fantaId: currentFanta.id,
          userId,
          budget: generalBudget,
          teamName: name,
        });
      }
    });
  };

  const createAuction: FantaContextType["createAuction"] = (auction) => {
    if (!currentFanta || !user) return;
    addDoc(collection(db, "auctions"), {
      ...auction,
      fantaId: currentFanta.id,
      currentPrice: auction.basePrice,
      status: "pending",
      createdBy: user.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const startAuction = (auctionId: string, countdownSeconds: number): void => {
    updateDoc(doc(db, "auctions", auctionId), {
      status: "active",
      countdownEndsAt: Timestamp.fromMillis(Date.now() + countdownSeconds * 1000),
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  // Blocca l'asta senza assegnarla: torna disponibile in stato "pending" e
  // può essere riavviata in seguito con "Avvia" (mantiene prezzo/offerente).
  const pauseAuction = (auctionId: string): void => {
    updateDoc(doc(db, "auctions", auctionId), {
      status: "pending",
      updatedAt: serverTimestamp(),
    });
  };

  const placeBid = (auctionId: string, amount: number): void => {
    if (!user || !currentFanta) return;
    const maxBid = currentFanta.settings.maxBid;
    const ref = doc(db, "auctions", auctionId);
    runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.status !== "active") return;

      const newPrice = (data.currentPrice as number) + amount;
      if (newPrice > maxBid) return;
      const countdownMs = (data.countdownSeconds as number) * 1000;
      tx.update(ref, {
        currentPrice: newPrice,
        highestBidderId: user.id,
        highestBidderName: user.name,
        countdownEndsAt: Timestamp.fromMillis(Date.now() + countdownMs),
        updatedAt: serverTimestamp(),
      });
    });
  };

  // Chiude un'asta (manualmente o perché il countdown è arrivato a zero) e,
  // se non annullata, assegna il giocatore al miglior offerente. La
  // transazione garantisce che, se più client provano a chiuderla nello
  // stesso momento (es. countdown scaduto su più dispositivi aperti in
  // contemporanea), solo il primo esegua davvero l'assegnazione.
  const finalizeAuction = (
    auctionId: string,
    options: { cancel?: boolean } = {},
  ): void => {
    const ref = doc(db, "auctions", auctionId);
    let winner: {
      userId: string;
      player: Omit<TeamPlayer, "id" | "acquiredAt">;
    } | null = null;

    runTransaction(db, async (tx) => {
      winner = null;
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.status === "closed") return;

      tx.update(ref, {
        status: "closed",
        closedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (!options.cancel && data.highestBidderId) {
        winner = {
          userId: data.highestBidderId as string,
          player: {
            name: data.playerName,
            role: data.playerRole,
            team: data.playerTeam,
            purchasePrice: data.currentPrice,
            userId: data.highestBidderId,
            fantaId: data.fantaId,
            auctionId,
            customFields: {},
          },
        };
      }
    })
      .then(() => {
        if (!winner) return;
        // Le due scritture sono indipendenti: se una fallisce (es. un
        // valore imprevisto che Firestore rifiuta), non deve bloccare
        // l'altra in silenzio come succedeva prima, con l'asta segnata
        // "chiusa" ma senza né giocatore né budget aggiornati.
        try {
          addPlayerToTeam(winner.player);
        } catch (error) {
          console.error("Errore nell'assegnazione del giocatore vinto:", error);
        }
        try {
          updateUserBudget(winner.userId, -winner.player.purchasePrice);
        } catch (error) {
          console.error("Errore nell'aggiornamento del budget:", error);
        }
      })
      .catch((error) => {
        console.error("Errore nella chiusura dell'asta:", error);
      });
  };

  // Annulla l'assegnazione di un'asta chiusa: toglie il giocatore a chi
  // l'aveva vinta (rimborsando il budget) e riporta l'asta a "pending" con
  // il prezzo resettato al base, pronta per essere riavviata da capo.
  const reopenAuction = async (auctionId: string): Promise<void> => {
    const ref = doc(db, "auctions", auctionId);
    const [auctionSnap, assignedSnap] = await Promise.all([
      getDoc(ref),
      getDocs(
        query(collection(db, "players"), where("auctionId", "==", auctionId)),
      ),
    ]);
    if (!auctionSnap.exists()) return;
    const auctionData = auctionSnap.data();

    await Promise.all(
      assignedSnap.docs.map(async (playerSnap) => {
        const playerData = playerSnap.data();
        await deleteDoc(playerSnap.ref);
        updateUserBudget(playerData.userId, playerData.purchasePrice);
      }),
    );

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
    addDoc(collection(db, "joinRequests"), {
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
    updateDoc(doc(db, "fantas", request.fantaId), {
      memberIds: arrayUnion(request.userId),
    });
    updateDoc(doc(db, "joinRequests", request.id), { status: "approved" });
  };

  const rejectJoinRequest = (requestId: string): void => {
    updateDoc(doc(db, "joinRequests", requestId), { status: "rejected" });
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
        getPlayersByUser,
        addPlayerToTeam,
        removePlayerFromTeam,
        updateUserBudget,
        getUserBudget,
        getTeamName,
        updateTeamName,
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
