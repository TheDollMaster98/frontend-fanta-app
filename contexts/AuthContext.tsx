"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/types";

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock users database
const MOCK_USERS: User[] = [
  {
    id: "admin-1",
    email: "admin@test.it",
    name: "Admin User",
    role: "admin",
    budget: 500,
    teamName: "Admin Team",
    fantaId: "fanta-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "user-1",
    email: "test@test.it",
    name: "Test User",
    role: "user",
    budget: 500,
    teamName: "Test Team",
    fantaId: "fanta-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Check for saved user in localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem("fanta-user");
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Mock authentication - in production use Firebase
    const foundUser = MOCK_USERS.find((u) => u.email === email);

    if (!foundUser) {
      throw new Error("Email o password non corretti");
    }

    // In a real app, verify password here
    // For mock, we accept any password for registered emails

    setUser(foundUser);
    localStorage.setItem("fanta-user", JSON.stringify(foundUser));
    router.push("/dashboard");
  };

  const register = async (name: string, email: string, password: string) => {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Check if user already exists
    const existingUser = MOCK_USERS.find((u) => u.email === email);
    if (existingUser) {
      throw new Error("Email già registrata");
    }

    // Create new mock user
    const newUser: User = {
      id: `user-${Date.now()}`,
      email,
      name,
      role: "user",
      budget: 500,
      fantaId: "fanta-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    MOCK_USERS.push(newUser);
    setUser(newUser);
    localStorage.setItem("fanta-user", JSON.stringify(newUser));
    router.push("/dashboard");
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("fanta-user");
    router.push("/");
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
