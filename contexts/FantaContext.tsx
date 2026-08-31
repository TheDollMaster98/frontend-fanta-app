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
  documentId,
  increment,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { Fanta, Player } from "@/types";

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
}

const FantaContext = createContext<FantaContextType | undefined>(undefined);

function toDate(value: Timestamp | Date | undefined): Date {
  if (!value) return new Date();
  return value instanceof Timestamp ? value.toDate() : value;
}

export function FantaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [rawFantas, setRawFantas] = useState<Fanta[]>([]);
  const [loadedForUserId, setLoadedForUserId] = useState<string | null>(null);
  const [currentFantaId, setCurrentFantaId] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("fanta-current-id")
      : null,
  );
  const [players, setPlayers] = useState<TeamPlayer[]>([]);
  const [userBudgets, setUserBudgets] = useState<Record<string, number>>({});

  // Ascolta in tempo reale i fanta di cui l'utente è membro
  useEffect(() => {
    if (!user) return;

    const fantasQuery = query(
      collection(db, "fantas"),
      where("memberIds", "array-contains", user.id),
    );

    const unsubscribe = onSnapshot(fantasQuery, (snapshot) => {
      const loaded = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          name: data.name,
          description: data.description,
          sportType: data.sportType,
          adminId: data.adminId,
          viceAdminIds: data.viceAdminIds || [],
          settings: data.settings,
          memberIds: data.memberIds || [],
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
        } as Fanta;
      });
      setRawFantas(loaded);
      setLoadedForUserId(user.id);
    });

    return unsubscribe;
  }, [user]);

  // I fanta caricati restano validi solo finché sono dell'utente loggato attuale
  const fantas = useMemo(() => (user ? rawFantas : []), [user, rawFantas]);
  const isLoading = !!user && loadedForUserId !== user.id;

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

  // Ascolta in tempo reale il budget dei membri del fanta attualmente selezionato
  useEffect(() => {
    if (!currentFanta || currentFanta.memberIds.length === 0) return;

    const usersQuery = query(
      collection(db, "users"),
      where(documentId(), "in", currentFanta.memberIds.slice(0, 30)),
    );

    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      const budgets: Record<string, number> = {};
      snapshot.docs.forEach((docSnap) => {
        budgets[docSnap.id] = docSnap.data().budget ?? 0;
      });
      setUserBudgets(budgets);
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
    updateDoc(doc(db, "users", userId), { budget: increment(amount) });
  };

  const getUserBudget = (userId: string): number => {
    return userBudgets[userId] ?? 0;
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
