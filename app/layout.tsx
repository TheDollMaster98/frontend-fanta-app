import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { FantaProvider } from "@/contexts/FantaContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Fanta Points App",
  description: "Gestione punti e aste per il fantacalcio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className="dark">
      <body className={inter.className}>
        <AuthProvider>
          <FantaProvider>{children}</FantaProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
