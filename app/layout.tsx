import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { FantaProvider } from "@/contexts/FantaContext";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  // Senza, Next risolve l'URL dell'immagine Open Graph su "localhost" in
  // produzione (visto nel warning di build) — un link condiviso mostrerebbe
  // un'anteprima rotta. Dominio confermato via Cloud Shell (firebase
  // apphosting:backends:list), non indovinato.
  metadataBase: new URL("https://fam-fanta-app-be--fam-fanta-app.europe-west4.hosted.app"),
  title: {
    default: "Fanta Points App",
    // Le pagine con un proprio layout.tsx (vedi app/auth/login/layout.tsx
    // e simili) impostano solo la parte specifica, questo template ci
    // aggiunge sempre "| Fanta Points App" — niente tab tutte uguali.
    template: "%s | Fanta Points App",
  },
  description: "Gestione leghe, aste e punteggi per fantasy sportivi",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className="dark" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <AuthProvider>
          <FantaProvider>{children}</FantaProvider>
        </AuthProvider>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
