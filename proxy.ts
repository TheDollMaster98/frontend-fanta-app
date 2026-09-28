import { NextResponse } from "next/server";

// Stesso fix di next.config.ts (headers()), ripetuto qui perché su Firebase
// App Hosting le pagine statiche/prerenderizzate (es. /auth/login, dove
// vive il bottone Google) possono essere servite da una cache che scavalca
// il punto dove next.config.ts aggiunge l'header custom. Il proxy gira
// su OGNI richiesta, prima che la risposta parta, quindi non è aggirabile
// da quella cache — vedi il commento in next.config.ts per il perché serve
// "same-origin-allow-popups" (login Google con signInWithPopup rotto da
// un Cross-Origin-Opener-Policy troppo restrittivo).
export function proxy() {
  const response = NextResponse.next();
  response.headers.set(
    "Cross-Origin-Opener-Policy",
    "same-origin-allow-popups",
  );
  return response;
}

export const config = {
  matcher: "/:path*",
};
