"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  updatePassword,
  type User as FirebaseUser,
  type AuthError,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { User } from "@/types";

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setIsDeveloper: (value: boolean) => Promise<void>;
  updateUserProfile: (name: string) => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_BUDGET = 500;

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Email o password non corretti",
  "auth/user-not-found": "Email o password non corretti",
  "auth/wrong-password": "Email o password non corretti",
  "auth/email-already-in-use": "Email già registrata",
  "auth/weak-password": "La password deve avere almeno 6 caratteri",
  "auth/invalid-email": "Email non valida",
  "auth/popup-closed-by-user": "Accesso con Google annullato",
  "auth/network-request-failed": "Errore di rete, riprova",
  "auth/requires-recent-login":
    "Per sicurezza devi rifare il login prima di cambiare la password",
};

function mapAuthError(error: unknown): string {
  const code = (error as AuthError)?.code;
  return (code && AUTH_ERROR_MESSAGES[code]) || "Si è verificato un errore, riprova";
}

function toDate(value: Timestamp | Date | undefined): Date {
  if (!value) return new Date();
  return value instanceof Timestamp ? value.toDate() : value;
}

async function loadOrCreateUserProfile(
  firebaseUser: FirebaseUser,
  nameOverride?: string,
): Promise<User> {
  const ref = doc(db, "users", firebaseUser.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();
    return {
      id: firebaseUser.uid,
      email: data.email,
      name: data.name,
      isDeveloper: data.isDeveloper ?? false,
      fantaId: data.fantaId,
      teamName: data.teamName,
      budget: data.budget,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    };
  }

  const profile = {
    email: firebaseUser.email || "",
    name: nameOverride || firebaseUser.displayName || firebaseUser.email || "Utente",
    isDeveloper: false,
    budget: DEFAULT_BUDGET,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, profile);

  return {
    id: firebaseUser.uid,
    email: profile.email,
    name: profile.name,
    isDeveloper: profile.isDeveloper,
    budget: profile.budget,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const profile = await loadOrCreateUserProfile(firebaseUser);
        setUser(profile);
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      throw new Error(mapAuthError(error));
    }
    router.push("/dashboard");
  };

  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      throw new Error(mapAuthError(error));
    }
    router.push("/dashboard");
  };

  const register = async (name: string, email: string, password: string) => {
    let firebaseUser: FirebaseUser;
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      firebaseUser = credential.user;
    } catch (error) {
      throw new Error(mapAuthError(error));
    }

    await updateProfile(firebaseUser, { displayName: name });
    await loadOrCreateUserProfile(firebaseUser, name);
    router.push("/dashboard");
  };

  const logout = async () => {
    await signOut(auth);
    router.push("/");
  };

  // La UI che espone questo toggle (Impostazioni) decide chi può vederlo;
  // qui non serve un guard aggiuntivo, altrimenti disattivarlo blocca anche
  // il poterlo riattivare nella stessa sessione.
  const setIsDeveloper = async (value: boolean) => {
    if (!auth.currentUser) return;
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      isDeveloper: value,
      updatedAt: serverTimestamp(),
    });
    setUser((prev) => (prev ? { ...prev, isDeveloper: value } : prev));
  };

  const updateUserProfile = async (name: string) => {
    if (!auth.currentUser) return;
    await updateProfile(auth.currentUser, { displayName: name });
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      name,
      updatedAt: serverTimestamp(),
    });
    setUser((prev) => (prev ? { ...prev, name } : prev));
  };

  const changePassword = async (newPassword: string) => {
    if (!auth.currentUser) return;
    try {
      await updatePassword(auth.currentUser, newPassword);
    } catch (error) {
      throw new Error(mapAuthError(error));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        loginWithGoogle,
        register,
        logout,
        setIsDeveloper,
        updateUserProfile,
        changePassword,
        isLoading,
      }}
    >
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
