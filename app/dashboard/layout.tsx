"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { useFanta } from "@/contexts/FantaContext";
import { NotificationCenter } from "@/components/NotificationCenter";
import { Home, Crown, Zap, Users, Settings, Trophy, Menu } from "lucide-react";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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

  // Valvola di sicurezza: se lo spinner qui sotto resta bloccato troppo a
  // lungo (i listener Firestore di FantaContext non superano mai
  // fantasLoaded/membershipsLoaded, es. propagazione del token lenta dopo
  // un login o una sessione ormai invalida) l'utente restava bloccato a
  // vita senza nessun redirect, doveva navigare a mano (bug reale
  // segnalato in produzione, 30/9). Dopo 15s si forza un logout pulito e
  // si torna alla landing, con un avviso invece di sparire nel nulla.
  const stuckLoading = (isLoading || fantaLoading) && !!user;
  // logout non è memoizzata in AuthContext (nuova identità ad ogni render):
  // metterla nelle dep dell'effect sotto avrebbe resettato il timeout ad
  // ogni render mentre stuckLoading resta true (es. per gli stessi retry
  // dei listener), vanificando i 15s. Una ref la tiene aggiornata senza
  // far ripartire l'effect quando cambia solo lei.
  const logoutRef = useRef(logout);
  useEffect(() => {
    logoutRef.current = logout;
  });
  useEffect(() => {
    if (!stuckLoading) return;
    const timeout = setTimeout(() => {
      toast.error("Sessione scaduta o connessione lenta, accedi di nuovo");
      logoutRef.current();
    }, 15000);
    return () => clearTimeout(timeout);
  }, [stuckLoading]);

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

  // "Classifica" per tutte le leghe lol, chiunque ne faccia parte (sola
  // lettura). "Importa LoL" invece scrive nel pool condiviso di pro player
  // (proplayers) usato per creare le aste: riservato a chi gestisce la
  // lega (developer/admin/vice), non un membro qualsiasi — prima era
  // visibile a chiunque, richiesto esplicitamente di restringerlo (30/9).
  if (currentFanta?.sportType === "lol") {
    if (isFantaViceOrAdmin) {
      navigation.splice(3, 0, {
        name: "Importa LoL",
        href: "/dashboard/import-lol",
        icon: Users,
      });
    }
    const standingsIndex = navigation.findIndex(
      (item) => item.href === "/dashboard/team",
    );
    navigation.splice(standingsIndex + 1, 0, {
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

  const renderNavLinks = (onNavigate?: () => void) => (
    <nav className="space-y-1">
      {navigation.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
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
  );

  const leagueSelect = currentFanta && fantas.length > 0 && (
    <Select
      value={currentFanta.id}
      onValueChange={(id) => {
        const fanta = fantas.find((f) => f.id === id);
        if (fanta) setCurrentFanta(fanta);
      }}
    >
      <SelectTrigger className="w-full lg:w-[200px]">
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
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16 gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden shrink-0"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Apri il menu"
              >
                <Menu className="w-5 h-5" />
              </Button>
              <Link
                href="/dashboard"
                className="text-lg sm:text-xl font-bold text-foreground truncate"
              >
                Fanta Points App
              </Link>
            </div>

            <div className="flex items-center gap-3 sm:gap-4">
              {/* Selector Lega: visibile in header solo da lg in su, sotto
                  vive nel drawer mobile insieme alla nav. */}
              <div className="hidden lg:block">{leagueSelect}</div>

              {currentFanta && <NotificationCenter key={currentFanta.id} />}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-10 w-10 rounded-full shrink-0"
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

      {/* Drawer di navigazione mobile: stessa nav e selettore lega
          dell'header/sidebar desktop, niente duplicazione di logica. */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 max-w-[85vw] p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle>Fanta Points App</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 p-4 overflow-y-auto">
            {fantas.length > 0 && leagueSelect}
            {renderNavLinks(() => setMobileNavOpen(false))}
          </div>
        </SheetContent>
      </Sheet>

      <div className="container mx-auto px-4 py-6 sm:py-8">
        <div className="flex gap-6">
          {/* Sidebar Navigation: solo da lg in su, sotto c'è il drawer */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            {renderNavLinks()}
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
