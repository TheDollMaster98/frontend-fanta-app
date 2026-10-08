import { getApp, getApps, initializeApp } from "firebase/app";
import { type Analytics, isSupported, getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { type Firestore, getFirestore, initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Next.js esegue questo modulo sia in SSR che nel browser: evita di
// re-inizializzare l'app ad ogni hot-reload/render lato server.
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
// ignoreUndefinedProperties: senza, qualunque campo opzionale lasciato a
// undefined (playerRole di team/coach, awayPoints di un bye, playerTeam
// assente...) fa fallire l'intera scrittura con "Unsupported field value:
// undefined" — aste coach impossibili da creare, pick di draft perse dopo
// che il turno era già avanzato, ricalcolo bloccato con un numero dispari
// di membri (code review, 8/10). Con questa opzione il campo viene
// semplicemente omesso, che è ciò che ogni chiamante si aspettava.
// initializeFirestore va chiamato una volta sola per app: in hot-reload o
// in SSR il modulo può essere rivalutato, e lì si riusa l'istanza esistente.
function createDb(): Firestore {
  try {
    return initializeFirestore(app, { ignoreUndefinedProperties: true });
  } catch {
    return getFirestore(app);
  }
}
export const db = createDb();
export const storage = getStorage(app);

// getAnalytics richiede `window` e IndexedDB, quindi va inizializzato
// solo lato client e solo se il browser lo supporta.
export let analytics: Analytics | undefined;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) analytics = getAnalytics(app);
  });
}
