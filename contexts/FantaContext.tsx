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
  onSnapshot,
  query,
  where,
  increment,
  arrayUnion,
  runTransaction,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { Fanta, Player, JoinRequest } from "@/types";

export interface TeamPlayer extends Player {
  userId: string; // ID dell'utente proprietario
  fantaId: string; // ID della lega
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
  // Scoperta leghe e richieste di ingresso
  discoverableFantas: Fanta[];
  myJoinRequests: JoinRequest[];
  pendingJoinRequests: JoinRequest[];
  sendJoinRequest: (fanta: Fanta) => void;
  approveJoinRequest: (request: JoinRequest) => void;
  rejectJoinRequest: (requestId: string) => void;
}

const FantaContext = createContext<FantaContextType | undefined>(undefined);

function toDate(value: Timestamp | Date | undefined): Date {
  if (!value) return new Date();
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
    createdAt: toDate(data.createdAt as Timestamp | Date | undefined),
    updatedAt: toDate(data.updatedAt as Timestamp | Date | undefined),
  } as Fanta;
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
  const [rawMyJoinRequests, setRawMyJoinRequests] = useState<JoinRequest[]>(
    [],
  );
  const [pendingJoinRequests, setPendingJoinRequests] = useState<
    JoinRequest[]
  >([]);

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
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        budgets[data.userId] = data.budget;
      });
      setUserBudgets(budgets);
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
        });
      }
    });
  };

  const getUserBudget = (userId: string): number => {
    if (userId in userBudgets) return userBudgets[userId];
    return currentFanta?.settings.generalBudget ?? 0;
  };

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
        discoverableFantas,
        myJoinRequests,
        pendingJoinRequests,
        sendJoinRequest,
        approveJoinRequest,
        rejectJoinRequest,
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
