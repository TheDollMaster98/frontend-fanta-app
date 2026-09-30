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
import { generateInviteCode } from "@/lib/utils";
import type { User } from "@/types";

const INVITE_ERROR_MESSAGE =
  "Invito non valido, già usato o mancante. Chiedi un nuovo link a chi gestisce la lega.";

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (inviteCode?: string) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
    inviteCode?: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  // Developer-only: genera un nuovo link invito a uso singolo (sezione
  // "Inviti" in Impostazioni) e ne restituisce il codice, da comporre come
  // {origin}/auth/register?invite={code}. Vedi firestore.rules
  // (users/{userId}.create, invites/{code}) per l'enforcement server-side.
  generateInvite: () => Promise<string>;
  // Anteprima locale "vista da utente normale" per chi ha davvero
  // isDeveloper:true (vedi user.isDeveloper, mai toccato da questo): non
  // scrive niente su Firestore, resta nel browser (sessionStorage) — solo
  // per guardare l'app come la vedrebbe un non-developer, senza
  // rinunciare davvero all'accesso. Il flag isDeveloper vero e proprio è
  // immutabile dal client (firestore.rules) da quando si autopromuoveva
  // chiunque da console del browser: questo sostituisce quel vecchio
  // toggle risolvendo lo stesso bisogno (vedere la vista non-dev) senza
  // riaprire il buco.
  isPreviewingAsNonDeveloper: boolean;
  setPreviewAsNonDeveloper: (value: boolean) => void;
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
  inviteCode?: string,
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
    // Richiesto da firestore.rules (users/{userId}.create, 30/9): senza un
    // invites/{code} valido e non ancora usato referenziato qui, questo
    // setDoc viene rifiutato server-side. Se inviteCode è undefined il
    // campo va omesso (stesso motivo di photoURL sopra), e la regola nega
    // per assenza — comportamento voluto, non un bug.
    ...(inviteCode ? { inviteCode } : {}),
  };
  await setDoc(ref, profile);

  // Consuma l'invito SOLO dopo che il profilo è stato creato con successo:
  // scrittura sequenziale separata, non nello stesso batch/prima del
  // setDoc sopra — stessa lezione del fix di FantaContext.addFanta di
  // oggi (un get()/write su un altro documento non deve dipendere da uno
  // scritto nella stessa operazione atomica). Se questa fallisse per un
  // problema transitorio l'account resta comunque valido: nel peggiore dei
  // casi l'invito resta riutilizzabile, preferibile a un utente
  // "registrato ma rotto" per un dettaglio di bookkeeping.
  if (inviteCode) {
    try {
      await updateDoc(doc(db, "invites", inviteCode), {
        usedBy: firebaseUser.uid,
        usedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Errore nel marcare l'invito come usato:", error);
    }
  }

  return {
    id: firebaseUser.uid,
    email: profile.email,
    name: profile.name,
    photoURL: firebaseUser.photoURL || undefined,
    isDeveloper: profile.isDeveloper,
    inviteCode,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const PREVIEW_AS_NON_DEVELOPER_KEY = "fanta:previewAsNonDeveloper";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // sessionStorage, non Firestore: resta nel browser, non richiede alcun
  // permesso di scrittura e non tocca isDeveloper vero. Letto in modo
  // difensivo (può lanciare in navigazione privata/con storage bloccato).
  const [isPreviewingAsNonDeveloper, setIsPreviewingAsNonDeveloperState] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(PREVIEW_AS_NON_DEVELOPER_KEY) === "true";
    } catch {
      return false;
    }
  });

  const setPreviewAsNonDeveloper = (value: boolean) => {
    setIsPreviewingAsNonDeveloperState(value);
    try {
      sessionStorage.setItem(PREVIEW_AS_NON_DEVELOPER_KEY, value ? "true" : "false");
    } catch {
      // storage bloccato: l'anteprima resta comunque attiva per questo
      // render, semplicemente non sopravvive a un reload.
    }
  };

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

  // inviteCode passato esplicitamente (non letto dal listener
  // onAuthStateChanged qui sotto, che continua a chiamare
  // loadOrCreateUserProfile senza invito): per un utente che esiste già
  // quell'altra chiamata cade nel ramo "profilo esistente" e non tocca
  // gli inviti, quindi non c'è conflitto. Per un utente Google nuovissimo
  // SENZA invito (es. da /auth/login, dove inviteCode non viene mai
  // passato) questa await fallisce e viene gestita qui sotto — la
  // chiamata "gemella" del listener fallirebbe allo stesso modo in
  // parallelo, ma logga soltanto in console, non tocca lo stato utente.
  const loginWithGoogle = async (inviteCode?: string) => {
    let firebaseUser: FirebaseUser;
    try {
      const credential = await signInWithPopup(auth, new GoogleAuthProvider());
      firebaseUser = credential.user;
    } catch (error) {
      throw new Error(mapAuthError(error));
    }
    try {
      await loadOrCreateUserProfile(firebaseUser, undefined, inviteCode);
    } catch (error) {
      console.error("Errore nel creare il profilo dopo il login Google:", error);
      await signOut(auth);
      throw new Error(INVITE_ERROR_MESSAGE);
    }
    router.push("/dashboard");
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    inviteCode?: string,
  ) => {
    let firebaseUser: FirebaseUser;
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      firebaseUser = credential.user;
    } catch (error) {
      throw new Error(mapAuthError(error));
    }

    await updateProfile(firebaseUser, { displayName: name });
    try {
      await loadOrCreateUserProfile(firebaseUser, name, inviteCode);
    } catch (error) {
      // L'account Firebase Auth esiste ma senza profilo Firestore l'app è
      // inutilizzabile ovunque (ogni pagina aspetta AuthContext.user):
      // meglio disconnetterlo subito con un errore chiaro che lasciarlo
      // "loggato ma rotto".
      console.error("Errore nel creare il profilo dopo la registrazione:", error);
      await signOut(auth);
      throw new Error(INVITE_ERROR_MESSAGE);
    }
    router.push("/dashboard");
  };

  const generateInvite = async (): Promise<string> => {
    if (!auth.currentUser) throw new Error("Devi essere loggato");
    const code = generateInviteCode();
    await setDoc(doc(db, "invites", code), {
      code,
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
      usedBy: null,
      usedAt: null,
    });
    return code;
  };

  const logout = async () => {
    await signOut(auth);
    router.push("/");
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
        generateInvite,
        isPreviewingAsNonDeveloper,
        setPreviewAsNonDeveloper,
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
