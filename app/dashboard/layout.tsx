"use client";

import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useFanta } from "@/contexts/FantaContext";
import { Home, Crown, Zap, Users, Settings, Trophy } from "lucide-react";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const {
    currentFanta,
    fantas,
    setCurrentFanta,
    isFantaViceOrAdmin,
    isLoading: fantaLoading,
  } = useFanta();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/auth/login");
    }
  }, [user, isLoading, router]);

  // Aspetta anche il caricamento dei fanta: senza, per un attimo si vedeva
  // "0 leghe" prima che i dati reali arrivassero da Firestore.
  if (isLoading || fantaLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Caricamento...</p>
        </div>
      </div>
    );
  }

  const navigation = [
    { name: "Le Mie Leghe", href: "/dashboard", icon: Home },
    {
      name: currentFanta?.settings.draftMode === "snake" ? "Draft" : "Aste Live",
      href: "/dashboard/auctions",
      icon: Zap,
    },
    { name: "Team", href: "/dashboard/team", icon: Users },
    { name: "Impostazioni", href: "/dashboard/settings", icon: Settings },
  ];

  // Aggiungi "Importa LoL" e "Classifica" solo per leghe di tipo lol: il
  // motore di punteggio reale (step 2) interroga Leaguepedia, che ha senso
  // solo per questo sport.
  if (currentFanta?.sportType === "lol") {
    navigation.splice(3, 0, {
      name: "Importa LoL",
      href: "/dashboard/import-lol",
      icon: Users,
    });
    navigation.splice(4, 0, {
      name: "Classifica",
      href: "/dashboard/standings",
      icon: Trophy,
    });
  }

  // Mostra "Gestione" a chi può davvero entrarci: creatore, vice-admin o
  // developer (vedi isAuthorized in app/dashboard/admin/page.tsx — senza
  // i vice-admin qui, potevano aprire la pagina digitando l'URL ma non
  // la vedevano mai in sidebar). Inserito subito prima di "Impostazioni",
  // qualunque sia la sua posizione (dipende da quali voci lol sono presenti).
  if (currentFanta && user && isFantaViceOrAdmin) {
    const settingsIndex = navigation.findIndex(
      (item) => item.href === "/dashboard/settings",
    );
    navigation.splice(settingsIndex, 0, {
      name: "Gestione",
      href: "/dashboard/admin",
      icon: Crown,
    });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link
              href="/dashboard"
              className="text-xl font-bold text-foreground"
            >
              Fanta Points App
            </Link>

            <div className="flex items-center gap-4">
              {/* Selector Lega */}
              {currentFanta && fantas.length > 0 && (
                <Select
                  value={currentFanta.id}
                  onValueChange={(id) => {
                    const fanta = fantas.find((f) => f.id === id);
                    if (fanta) setCurrentFanta(fanta);
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fantas.map((fanta) => (
                      <SelectItem key={fanta.id} value={fanta.id}>
                        {fanta.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-10 w-10 rounded-full"
                  >
                    <Avatar>
                      {user.photoURL && (
                        <AvatarImage src={user.photoURL} alt={user.name} />
                      )}
                      <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/settings">Impostazioni</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={logout}>Logout</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="flex gap-6">
          {/* Sidebar Navigation */}
          <aside className="w-64 flex-shrink-0">
            <nav className="space-y-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? "bg-raised text-foreground"
                        : "text-muted-foreground hover:bg-raised hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{item.name}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
