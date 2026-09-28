import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Firebase App Hosting (Cloud Run) applica di default un
  // Cross-Origin-Opener-Policy troppo restrittivo (same-origin), che rompe
  // signInWithPopup di Firebase Auth (usato per il login Google): il popup
  // completa il login lato Google, ma la finestra principale non riesce più
  // a leggere il risultato/token perché COOP le blocca l'accesso alla
  // finestra popup. Sintomo tipico: login che "sembra" andato a buon fine
  // ma Firestore risponde permission-denied perché l'utente non risulta
  // mai autenticato per davvero. Fix standard documentato da
  // Firebase/Google: allentare COOP a "same-origin-allow-popups" (non
  // toglierlo del tutto) così il popup comunica di nuovo col chiamante.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
