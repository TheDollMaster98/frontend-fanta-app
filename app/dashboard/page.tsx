"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFanta } from "@/contexts/FantaContext";
import { useAuth } from "@/contexts/AuthContext";
import { CreateFantaDialog } from "@/components/CreateFantaDialog";
import { Trophy, Users, Crown, Zap } from "lucide-react";
import type { Fanta } from "@/types";

export default function DashboardPage() {
  const {
    fantas,
    setCurrentFanta,
    discoverableFantas,
    myJoinRequests,
    sendJoinRequest,
  } = useFanta();
  const { user } = useAuth();
  const [infoFanta, setInfoFanta] = useState<Fanta | null>(null);

  const getUserRole = (
    fantaId: string,
    adminId: string,
    viceAdminIds: string[],
  ) => {
    if (!user) return "Giocatore";
    if (adminId === user.id) return "Creatore";
    if (viceAdminIds.includes(user.id)) return "Vice-Admin";
    return "Giocatore";
  };

  const getRoleBadgeVariant = (role: string) => {
    if (role === "Creatore") return "default";
    if (role === "Vice-Admin") return "secondary";
    return "outline";
  };

  const getSportTypeLabel = (sportType: string) => {
    const labels: Record<string, string> = {
      calcio: "Calcio",
      lol: "League of Legends",
      basket: "Basket",
      custom: "Custom",
    };
    return labels[sportType] || sportType;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Le Mie Leghe</h1>
          <p className="text-slate-400 mt-2">
            Gestisci tutte le tue leghe fantasy - {fantas.length}{" "}
            {fantas.length === 1 ? "lega" : "leghe"}
          </p>
        </div>
        <CreateFantaDialog />
      </div>

      {/* Fanta Grid */}
      {fantas.length === 0 ? (
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="py-16 text-center">
            <Trophy className="w-16 h-16 mx-auto text-slate-600 mb-4" />
            <h3 className="text-xl font-semibold text-slate-300 mb-2">
              Nessuna lega trovata
            </h3>
            <p className="text-slate-400 mb-6">
              Crea la tua prima lega per iniziare a giocare
            </p>
            <CreateFantaDialog />
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {fantas.map((fanta) => {
            const role = getUserRole(
              fanta.id,
              fanta.adminId,
              fanta.viceAdminIds,
            );
            const activeAuctions = 0; // TODO: Contare aste attive da Firebase

            return (
              <Card
                key={fanta.id}
                className="bg-slate-900 border-slate-700 hover:border-slate-600 transition-colors cursor-pointer"
                onClick={() => setCurrentFanta(fanta)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <CardTitle className="text-slate-100 text-xl mb-1">
                        {fanta.name}
                      </CardTitle>
                      <p className="text-sm text-slate-400">
                        {getSportTypeLabel(fanta.sportType)}
                      </p>
                    </div>
                    <Badge variant={getRoleBadgeVariant(role)}>
                      {role === "Creatore" && (
                        <Crown className="w-3 h-3 mr-1" />
                      )}
                      {role}
                    </Badge>
                  </div>
                  {fanta.description && (
                    <CardDescription className="text-slate-500 line-clamp-2">
                      {fanta.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="w-4 h-4 text-slate-500" />
                      <span className="text-slate-400">
                        {fanta.memberIds.length} membri
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Zap className="w-4 h-4 text-slate-500" />
                      <span className="text-slate-400">
                        {activeAuctions} aste
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
                    <div className="text-xs text-slate-500">
                      Budget: {fanta.settings.generalBudget}€ • Min:{" "}
                      {fanta.settings.minBid}€
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInfoFanta(fanta);
                      }}
                    >
                      Info
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {discoverableFantas.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">
              Altre leghe disponibili
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Non ne fai ancora parte: richiedi di entrare, l&apos;admin dovrà
              approvare
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {discoverableFantas.map((fanta) => {
              const myRequest = myJoinRequests.find(
                (r) => r.fantaId === fanta.id,
              );
              return (
                <Card
                  key={fanta.id}
                  className="bg-slate-900 border-slate-700 flex h-full flex-col"
                >
                  <CardHeader>
                    <CardTitle className="text-slate-100 text-xl mb-1">
                      {fanta.name}
                    </CardTitle>
                    <p className="text-sm text-slate-400">
                      {getSportTypeLabel(fanta.sportType)}
                    </p>
                    <CardDescription className="text-slate-500 line-clamp-2">
                      {fanta.description || "Nessuna descrizione"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    <div className="flex items-center gap-2 text-sm mb-4">
                      <Users className="w-4 h-4 text-slate-500" />
                      <span className="text-slate-400">
                        {fanta.memberIds.length} membri
                      </span>
                    </div>
                    <div className="flex gap-2 mt-auto">
                      <Button
                        variant="outline"
                        onClick={() => setInfoFanta(fanta)}
                      >
                        Info
                      </Button>
                      {!myRequest && (
                        <Button
                          className="flex-1"
                          onClick={() => sendJoinRequest(fanta)}
                        >
                          Richiedi di entrare
                        </Button>
                      )}
                      {myRequest?.status === "pending" && (
                        <Button className="flex-1" variant="outline" disabled>
                          Richiesta inviata
                        </Button>
                      )}
                      {myRequest?.status === "rejected" && (
                        <Button className="flex-1" variant="outline" disabled>
                          Richiesta rifiutata
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Dialog
        open={Boolean(infoFanta)}
        onOpenChange={(open) => !open && setInfoFanta(null)}
      >
        <DialogContent>
          {infoFanta && (
            <>
              <DialogHeader>
                <DialogTitle className="text-slate-100">
                  {infoFanta.name}
                </DialogTitle>
                <DialogDescription>
                  {getSportTypeLabel(infoFanta.sportType)}
                </DialogDescription>
              </DialogHeader>
              {infoFanta.description && (
                <p className="text-sm text-slate-400">
                  {infoFanta.description}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 rounded-md border border-slate-700 bg-slate-800/50 p-4 text-sm">
                <div>
                  <span className="text-slate-400">Membri</span>
                  <p>{infoFanta.memberIds.length}</p>
                </div>
                <div>
                  <span className="text-slate-400">Budget Generale</span>
                  <p>{infoFanta.settings.generalBudget}€</p>
                </div>
                <div>
                  <span className="text-slate-400">Puntata Minima</span>
                  <p>{infoFanta.settings.minBid}€</p>
                </div>
                <div>
                  <span className="text-slate-400">Puntata Massima</span>
                  <p>{infoFanta.settings.maxBid}€</p>
                </div>
                <div>
                  <span className="text-slate-400">Countdown Default</span>
                  <p>{infoFanta.settings.defaultCountdown}s</p>
                </div>
                <div>
                  <span className="text-slate-400">Puntate Custom</span>
                  <p>
                    {infoFanta.settings.allowCustomBids ? "Consentite" : "No"}
                  </p>
                </div>
              </div>
              {(() => {
                const myRequest = myJoinRequests.find(
                  (r) => r.fantaId === infoFanta.id,
                );
                const isMember = fantas.some((f) => f.id === infoFanta.id);
                if (isMember) return null;
                if (!myRequest) {
                  return (
                    <Button
                      className="w-full"
                      onClick={() => sendJoinRequest(infoFanta)}
                    >
                      Richiedi di entrare
                    </Button>
                  );
                }
                return (
                  <Button className="w-full" variant="outline" disabled>
                    {myRequest.status === "pending"
                      ? "Richiesta inviata"
                      : "Richiesta rifiutata"}
                  </Button>
                );
              })()}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
