"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFanta } from "@/contexts/FantaContext";

interface AppNotification {
  id: string;
  text: string;
  createdAt: Date;
  read: boolean;
  href: string;
}

const MAX_NOTIFICATIONS = 30;

// Centro notifiche reale (30/9), al posto del vecchio form "Preferenze
// Notifiche" in Impostazioni che non era mai collegato a nulla (salvava
// solo in localStorage, l'app non ha mai inviato una notifica vera).
// Tutto qui viene da dati già real-time nel context, nessuna
// sottoscrizione Firestore nuova: richieste di ingresso da approvare,
// esito delle proprie richieste, aste che partono. "Partite finite" non
// c'è ancora — richiede di interrogare periodicamente lolesports
// (nessun cron in quest'app), lavoro a parte.
export function NotificationCenter() {
  const router = useRouter();
  const { pendingJoinRequests, myJoinRequests, auctions, isFantaViceOrAdmin } =
    useFanta();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const seenJoinRequestIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isFantaViceOrAdmin) return;
    const fresh = pendingJoinRequests.filter(
      (r) => !seenJoinRequestIds.current.has(r.id),
    );
    if (fresh.length === 0) return;
    fresh.forEach((r) => seenJoinRequestIds.current.add(r.id));
    setNotifications((prev) =>
      [
        ...fresh.map((r) => ({
          id: `join-request-${r.id}`,
          text: `${r.userName} vuole entrare in "${r.fantaName}"`,
          createdAt: r.createdAt,
          read: false,
          href: "/dashboard/admin",
        })),
        ...prev,
      ].slice(0, MAX_NOTIFICATIONS),
    );
  }, [pendingJoinRequests, isFantaViceOrAdmin]);

  // Esito delle TUE richieste (accettata/rifiutata): una notifica quando lo
  // status cambia rispetto all'ultima volta vista, non al primo caricamento.
  const prevRequestStatuses = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    myJoinRequests.forEach((r) => {
      const prevStatus = prevRequestStatuses.current.get(r.id);
      if (prevStatus && prevStatus !== r.status && r.status !== "pending") {
        setNotifications((prev) =>
          [
            {
              id: `join-request-resolved-${r.id}-${r.status}`,
              text:
                r.status === "approved"
                  ? `Richiesta accettata: sei entrato in "${r.fantaName}"`
                  : `Richiesta rifiutata per "${r.fantaName}"`,
              createdAt: new Date(),
              read: false,
              href: "/dashboard",
            },
            ...prev,
          ].slice(0, MAX_NOTIFICATIONS),
        );
      }
      prevRequestStatuses.current.set(r.id, r.status);
    });
  }, [myJoinRequests]);

  // Asta avviata: notifica in lista + toast con azione rapida per chi non
  // è già sulla pagina aste ("vuoi partecipare?"). Solo transizioni verso
  // "active", non lo stato già attivo al primo caricamento — altrimenti
  // si spammano notifiche per aste avviate da tempo appena si apre l'app.
  const prevAuctionStatuses = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (prevAuctionStatuses.current === null) {
      prevAuctionStatuses.current = new Map(auctions.map((a) => [a.id, a.status]));
      return;
    }
    const prevMap = prevAuctionStatuses.current;
    auctions.forEach((a) => {
      const prevStatus = prevMap.get(a.id);
      if (prevStatus !== "active" && a.status === "active") {
        const text = `Asta partita: ${a.playerName}`;
        toast(text, {
          description: "Vuoi partecipare?",
          action: {
            label: "Vai alle Aste",
            onClick: () => router.push("/dashboard/auctions"),
          },
        });
        setNotifications((prevN) =>
          [
            {
              id: `auction-started-${a.id}-${Date.now()}`,
              text,
              createdAt: new Date(),
              read: false,
              href: "/dashboard/auctions",
            },
            ...prevN,
          ].slice(0, MAX_NOTIFICATIONS),
        );
      }
      prevMap.set(a.id, a.status);
    });
  }, [auctions, router]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () =>
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

  const handleClick = (n: AppNotification) => {
    setNotifications((prev) =>
      prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
    );
    router.push(n.href);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative shrink-0"
          aria-label="Notifiche"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifiche</DropdownMenuLabel>
          {notifications.length > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Segna tutte lette
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            Nessuna notifica
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {notifications.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onClick={() => handleClick(n)}
                className={n.read ? "opacity-60" : ""}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm">{n.text}</span>
                  <span className="text-xs text-muted-foreground">
                    {n.createdAt.toLocaleTimeString("it-IT", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
