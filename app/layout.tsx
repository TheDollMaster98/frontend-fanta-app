import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { FantaProvider } from "@/contexts/FantaContext";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  // Senza, Next risolve l'URL dell'immagine Open Graph su "localhost" in
  // produzione (visto nel warning di build) — un link condiviso mostrerebbe
  // un'anteprima rotta. Dominio confermato via Cloud Shell (firebase
  // apphosting:backends:list), non indovinato.
  metadataBase: new URL("https://fam-fanta-app-be--fam-fanta-app.europe-west4.hosted.app"),
  title: {
    default: "Fanta Points",
    // Le pagine con un proprio layout.tsx (vedi app/auth/login/layout.tsx
    // e simili) impostano solo la parte specifica, questo template ci
    // aggiunge sempre "| Fanta Points" — niente tab tutte uguali.
    template: "%s | Fanta Points",
  },
  description: "Gestione leghe, aste e punteggi per fantasy sportivi",
};

// Barra del browser su mobile dello stesso colore dello sfondo (--background,
// #080b10): l'app è solo scura, una barra chiara sopra stonava.
export const viewport: Viewport = {
  themeColor: "#080b10",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`dark ${inter.variable}`} suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <AuthProvider>
          <FantaProvider>{children}</FantaProvider>
        </AuthProvider>
        {/* In basso (9/10): in alto a destra copriva selettore lega,
            notifiche e avatar dell'header, anche per i toast persistenti
            come "Asta partita". Su mobile sonner li centra in basso. */}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
