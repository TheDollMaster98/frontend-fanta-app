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
import { Label } from "@/components/ui/label";
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
import { useFanta, type TeamPlayer } from "@/contexts/FantaContext";
import { useAuth } from "@/contexts/AuthContext";

export default function TeamPage() {
  const {
    currentFanta,
    getPlayersByUser,
    removePlayerFromTeam,
    getUserBudget,
  } = useFanta();
  const { user } = useAuth();
  const [teamName, setTeamName] = useState("I Campioni");
  const [isEditingName, setIsEditingName] = useState(false);
  const [playerToRemove, setPlayerToRemove] = useState<TeamPlayer | null>(null);

  // Ottieni i giocatori dell'utente corrente
  const players =
    user && currentFanta ? getPlayersByUser(user.id, currentFanta.id) : [];

  const budget = currentFanta?.settings.generalBudget || 500;
  const userBudget = user ? getUserBudget(user.id) : budget;
  const spent = budget - userBudget;
  const remaining = budget - spent;

  const handleUpdateTeamName = () => {
    // TODO: Salvare su Firebase
    console.log("Update team name:", teamName);
    setIsEditingName(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-100">Il Mio Team</h1>
        <p className="text-slate-400 mt-2">Gestisci la tua rosa e il budget</p>
      </div>

      {/* Team Info */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            {isEditingName ? (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
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
                <CardTitle className="text-2xl text-slate-100">
                  {teamName}
                </CardTitle>
                <Button
                  variant="outline"
                  onClick={() => setIsEditingName(true)}
                  size="sm"
                >
                  Modifica Nome
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
              <p className="text-sm text-slate-400">Budget Totale</p>
              <p className="text-2xl font-bold text-slate-100">{budget}€</p>
            </div>
            <div className="bg-slate-800 p-4 rounded-lg border border-red-900/50">
              <p className="text-sm text-slate-400">Speso</p>
              <p className="text-2xl font-bold text-red-400">{spent}€</p>
            </div>
            <div className="bg-slate-800 p-4 rounded-lg border border-green-900/50">
              <p className="text-sm text-slate-400">Rimanente</p>
              <p className="text-2xl font-bold text-green-400">{remaining}€</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rosa Giocatori */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100">Rosa Giocatori</CardTitle>
          <CardDescription className="text-slate-400">
            {players.length} giocatore{players.length !== 1 ? "i" : ""} acquisit
            {players.length !== 1 ? "i" : "o"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {players.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-400">
                Non hai ancora acquistato giocatori
              </p>
              <p className="text-sm text-slate-500 mt-2">
                Partecipa alle aste per costruire la tua rosa
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Ruolo</TableHead>
                  <TableHead>Squadra</TableHead>
                  <TableHead className="text-right">
                    Prezzo di Acquisto
                  </TableHead>
                  <TableHead className="text-right">Data Acquisto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.map((player) => (
                  <TableRow key={player.id}>
                    <TableCell className="font-medium">{player.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{player.role}</Badge>
                    </TableCell>
                    <TableCell>{player.team}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {player.purchasePrice}€
                    </TableCell>
                    <TableCell className="text-right text-sm text-slate-400">
                      {new Date(player.acquiredAt).toLocaleDateString("it-IT")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
