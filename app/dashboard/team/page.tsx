"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import { useFanta } from "@/contexts/FantaContext";
import { useAuth } from "@/contexts/AuthContext";
import type { TeamPick, TeamPickType } from "@/types";

const PICK_TYPE_LABELS: Record<TeamPickType, string> = {
  player: "Giocatore",
  jolly: "Jolly",
  team: "Squadra",
  coach: "Coach",
};

export default function TeamPage() {
  const {
    currentFanta,
    getPlayersByUser,
    removePlayerFromTeam,
    getUserBudget,
    getTeamName,
    updateTeamName,
    isFantaViceOrAdmin,
  } = useFanta();
  const { user } = useAuth();
  const teamName = user ? getTeamName(user.id) : "I Campioni";
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(teamName);
  const [playerToRemove, setPlayerToRemove] = useState<TeamPick | null>(null);

  // Ottieni i giocatori dell'utente corrente
  const players = user && currentFanta ? getPlayersByUser(user.id) : [];

  const isSnakeDraft = currentFanta?.settings.draftMode === "snake";
  const canRemovePlayers =
    !currentFanta?.settings.seasonStarted || isFantaViceOrAdmin;
  const budget = currentFanta?.settings.generalBudget || 500;
  const remaining = user ? getUserBudget(user.id) : budget;
  const spent = budget - remaining;

  const startEditingName = () => {
    setDraftName(teamName);
    setIsEditingName(true);
  };

  const handleUpdateTeamName = () => {
    if (user && draftName.trim()) {
      updateTeamName(user.id, draftName.trim());
    }
    setIsEditingName(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Il Mio Team</h1>
        <p className="text-muted-foreground mt-2">
          {isSnakeDraft
            ? "Gestisci la tua rosa"
            : "Gestisci la tua rosa e il budget"}
        </p>
      </div>

      {/* Team Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            {isEditingName ? (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="max-w-xs"
                />
                <Button onClick={handleUpdateTeamName} size="sm">
                  Salva
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsEditingName(false)}
                  size="sm"
                >
                  Annulla
                </Button>
              </div>
            ) : (
              <>
                <CardTitle className="text-2xl text-foreground">
                  {teamName}
                </CardTitle>
                <Button
                  variant="outline"
                  onClick={startEditingName}
                  size="sm"
                >
                  Modifica Nome
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        {!isSnakeDraft && (
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="stat-tile border-success/30">
                <p className="text-sm text-muted-foreground">Rimanente</p>
                <p className="text-2xl font-bold text-success">{remaining}€</p>
              </div>
              <div className="stat-tile border-destructive/30">
                <p className="text-sm text-muted-foreground">Speso</p>
                <p className="text-2xl font-bold text-destructive">{spent}€</p>
              </div>
              <div className="stat-tile">
                <p className="text-sm text-muted-foreground">Budget Totale</p>
                <p className="text-2xl font-bold text-foreground">{budget}€</p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Rosa Giocatori */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Rosa Giocatori</CardTitle>
          <CardDescription className="text-muted-foreground">
            {players.length} giocatore{players.length !== 1 ? "i" : ""} acquisit
            {players.length !== 1 ? "i" : "o"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {players.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                Non hai ancora acquistato giocatori
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                {isSnakeDraft
                  ? "Partecipa al draft per costruire la tua rosa"
                  : "Partecipa alle aste per costruire la tua rosa"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="hidden sm:table-cell">Ruolo</TableHead>
                  <TableHead className="hidden md:table-cell">Squadra</TableHead>
                  <TableHead className="text-right">
                    Prezzo
                  </TableHead>
                  <TableHead className="text-right">Punti</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Data Acquisto</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.map((player) => (
                  <TableRow key={player.id}>
                    <TableCell>
                      <Badge variant="secondary">
                        {PICK_TYPE_LABELS[player.pickType]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {player.playerName}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {player.playerRole && (
                        <Badge variant="outline">{player.playerRole}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{player.playerTeam}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {player.purchasePrice}€
                    </TableCell>
                    <TableCell className="text-right">
                      {player.points !== undefined ? player.points : "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right text-sm text-muted-foreground">
                      {new Date(player.acquiredAt).toLocaleDateString("it-IT")}
                    </TableCell>
                    <TableCell className="text-right">
                      {canRemovePlayers && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPlayerToRemove(player)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(playerToRemove)}
        onOpenChange={(open) => !open && setPlayerToRemove(null)}
      >
        <DialogContent>
          {playerToRemove && (
            <>
              <DialogHeader>
                <DialogTitle>Rimuovere {playerToRemove.playerName}?</DialogTitle>
                <DialogDescription>
                  {isSnakeDraft
                    ? "Il pick viene tolto dalla tua rosa e il draft non torna indietro: non c'è un modo in app per rimetterlo automaticamente."
                    : `Il giocatore torna disponibile per le aste e il budget speso (${playerToRemove.purchasePrice}€) ti viene restituito.`}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setPlayerToRemove(null)}
                >
                  Annulla
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (user) {
                      removePlayerFromTeam(user.id, playerToRemove.id);
                    }
                    setPlayerToRemove(null);
                  }}
                >
                  Rimuovi
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
