"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
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

// Mock fantas database
const MOCK_FANTAS: Fanta[] = [
  {
    id: "fanta-1",
    name: "Lega Serie A 2026",
    sportType: "calcio",
    description: "La lega principale per il campionato italiano",
    adminId: "admin-1",
    viceAdminIds: [],
    settings: {
      generalBudget: 500,
      minBid: 1,
      maxBid: 1000,
      defaultCountdown: 3,
      allowCustomBids: true,
    },
    memberIds: ["admin-1", "user-1"],
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  },
  {
    id: "fanta-2",
    name: "League of Legends Pro",
    sportType: "lol",
    description: "Fantasy league per LoL Esports",
    adminId: "admin-1",
    viceAdminIds: [],
    settings: {
      generalBudget: 1000,
      minBid: 5,
      maxBid: 500,
      defaultCountdown: 5,
      allowCustomBids: true,
    },
    memberIds: ["admin-1", "user-1"],
    createdAt: new Date("2026-01-05"),
    updatedAt: new Date("2026-01-05"),
  },
];

// Mock players database (in memoria)
const MOCK_PLAYERS: TeamPlayer[] = [];

// Mock users budget (in memoria)
const MOCK_USER_BUDGETS: Record<string, number> = {
  "admin-1": 500,
  "user-1": 500,
};

export function FantaProvider({ children }: { children: ReactNode }) {
  const [currentFanta, setCurrentFantaState] = useState<Fanta | null>(null);
  const [fantas, setFantas] = useState<Fanta[]>(MOCK_FANTAS);
  const [players, setPlayers] = useState<TeamPlayer[]>(MOCK_PLAYERS);
  const [userBudgets, setUserBudgets] =
    useState<Record<string, number>>(MOCK_USER_BUDGETS);
  const [isLoading, setIsLoading] = useState(true);

  // Load current fanta from localStorage on mount
  useEffect(() => {
    const savedFantaId = localStorage.getItem("fanta-current-id");
    if (savedFantaId) {
      const fanta = fantas.find((f) => f.id === savedFantaId);
      if (fanta) {
        setCurrentFantaState(fanta);
      } else {
        setCurrentFantaState(fantas[0]);
      }
    } else {
      setCurrentFantaState(fantas[0]);
    }
    setIsLoading(false);
  }, []);

  const setCurrentFanta = (fanta: Fanta) => {
    setCurrentFantaState(fanta);
    localStorage.setItem("fanta-current-id", fanta.id);
  };

  const addFanta = (fanta: Fanta) => {
    const newFantas = [...fantas, fanta];
    setFantas(newFantas);
    setCurrentFanta(fanta);
  };

  const updateFanta = (fanta: Fanta) => {
    const newFantas = fantas.map((f) => (f.id === fanta.id ? fanta : f));
    setFantas(newFantas);
    if (currentFanta?.id === fanta.id) {
      setCurrentFantaState(fanta);
    }
  };

  const getPlayersByUser = (userId: string, fantaId: string): TeamPlayer[] => {
    return players.filter((p) => p.userId === userId && p.fantaId === fantaId);
  };

  const addPlayerToTeam = (
    player: Omit<TeamPlayer, "id" | "acquiredAt">
  ): void => {
    const newPlayer: TeamPlayer = {
      ...player,
      id: `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      acquiredAt: new Date(),
    };
    setPlayers([...players, newPlayer]);
    // TODO: Salvare su Firebase/backend
  };

  const removePlayerFromTeam = (playerId: string, userId: string): void => {
    const player = players.find(
      (p) => p.id === playerId && p.userId === userId
    );
    if (player) {
      setPlayers(players.filter((p) => p.id !== playerId));
      // Restituisci il budget all'utente
      updateUserBudget(userId, player.purchasePrice);
      // TODO: Salvare su Firebase/backend
    }
  };

  const updateUserBudget = (userId: string, amount: number): void => {
    setUserBudgets((prev) => ({
      ...prev,
      [userId]: (prev[userId] || 0) + amount,
    }));
    // TODO: Salvare su Firebase/backend
  };

  const getUserBudget = (userId: string): number => {
    return userBudgets[userId] || 0;
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
