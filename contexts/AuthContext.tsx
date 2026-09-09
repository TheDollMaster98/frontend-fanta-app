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
  updateEmail,
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
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import type { User } from "@/types";

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setIsDeveloper: (value: boolean) => Promise<void>;
  updateUserProfile: (name: string) => Promise<void>;
  updateUserEmail: (email: string) => Promise<void>;
  updateUserPhoto: (file: File) => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
    // Firebase Auth resta la fonte di verità per nome/email (es. dopo un
    // cambio email confermato via link, o un profilo aggiornato altrove):
    // se il documento Firestore è rimasto indietro, lo riallineiamo qui,
    // così ogni punto dell'app che legge da "users" vede sempre il valore
    // corrente, non quello congelato al momento della creazione.
    const authEmail = firebaseUser.email || data.email;
    const authName = firebaseUser.displayName || data.name;
    // Il photoURL invece NON si riallinea a quello di Auth una volta che
    // l'utente ne ha caricato uno suo (updateUserPhoto scrive su entrambi):
    // altrimenti un login Google con foto vecchia/assente sovrascriverebbe
    // ogni volta l'avatar caricato a mano. Si aggiorna da Auth solo se su
    // Firestore non c'è ancora nulla (es. primo login Google).
    const authPhoto = data.photoURL || firebaseUser.photoURL || undefined;
    if (
      authEmail !== data.email ||
      authName !== data.name ||
      (!data.photoURL && firebaseUser.photoURL)
    ) {
      updateDoc(ref, {
        email: authEmail,
        name: authName,
        ...(!data.photoURL && firebaseUser.photoURL
          ? { photoURL: firebaseUser.photoURL }
          : {}),
        updatedAt: serverTimestamp(),
      });
    }
    return {
      id: firebaseUser.uid,
      email: authEmail,
      name: authName,
      photoURL: authPhoto,
      isDeveloper: data.isDeveloper ?? false,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    };
  }

  const profile = {
    email: firebaseUser.email || "",
    name: nameOverride || firebaseUser.displayName || firebaseUser.email || "Utente",
    isDeveloper: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    // Niente firebaseUser.photoURL || undefined qui: Firestore rifiuta un
    // campo undefined esplicito in setDoc, quindi il campo va omesso del
    // tutto quando non c'è una foto (es. registrazione email/password).
    ...(firebaseUser.photoURL ? { photoURL: firebaseUser.photoURL } : {}),
  };
  await setDoc(ref, profile);

  return {
    id: firebaseUser.uid,
    email: profile.email,
    name: profile.name,
    photoURL: firebaseUser.photoURL || undefined,
    isDeveloper: profile.isDeveloper,
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

  // Nascondere il toggle in UI a chi non è già developer NON basta come
  // controllo: chiunque può chiamare updateDoc direttamente dalla console
  // del browser bypassando questo componente. Il guard vero è in
  // firestore.rules su users/{uid}: da false a true il campo può essere
  // scritto solo a mano dalla Firebase Console, mai da qui — questa
  // funzione può solo lasciarlo invariato o, una volta già true almeno una
  // volta, spegnerlo/riaccenderlo liberamente (da cui il "true" non
  // rifiutato qui: se il valore non doveva salire, ci pensa la regola).
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

  // Percorso fisso users/{uid}/avatar (non uno per upload): ogni nuova
  // foto sovrascrive la precedente, niente file orfani ad accumularsi su
  // Storage. storage.rules limita già la scrittura al proprio uid.
  const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
  const updateUserPhoto = async (file: File) => {
    if (!auth.currentUser) return;
    if (!file.type.startsWith("image/")) {
      throw new Error("Il file deve essere un'immagine");
    }
    if (file.size > MAX_PHOTO_BYTES) {
      throw new Error("Immagine troppo grande (max 5MB)");
    }

    const photoRef = ref(storage, `users/${auth.currentUser.uid}/avatar`);
    await uploadBytes(photoRef, file);
    const photoURL = await getDownloadURL(photoRef);

    await updateProfile(auth.currentUser, { photoURL });
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      photoURL,
      updatedAt: serverTimestamp(),
    });
    setUser((prev) => (prev ? { ...prev, photoURL } : prev));
  };

  const updateUserEmail = async (email: string) => {
    if (!auth.currentUser) return;
    try {
      await updateEmail(auth.currentUser, email);
    } catch (error) {
      throw new Error(mapAuthError(error));
    }
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      email,
      updatedAt: serverTimestamp(),
    });
    setUser((prev) => (prev ? { ...prev, email } : prev));
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
        updateUserEmail,
        updateUserPhoto,
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
