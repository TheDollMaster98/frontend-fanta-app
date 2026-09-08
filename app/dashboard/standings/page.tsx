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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trophy, RefreshCw, CalendarDays, ChevronRight } from "lucide-react";
import { useFanta, type FantaMemberProfile } from "@/contexts/FantaContext";
import {
  getPlayerGameLog,
  getTeamGameLog,
  type PlayerGameLog,
  type TeamGameLog,
} from "@/lib/leaguepediaApi";
import type { TeamPick, TeamPickType } from "@/types";

const PICK_TYPE_LABELS: Record<TeamPickType, string> = {
  player: "Giocatore",
  jolly: "Jolly",
  team: "Squadra",
  coach: "Coach",
};

function formatGameDate(raw: string): string {
  if (!raw) return "N/D";
  const parsed = new Date(raw.replace(" ", "T") + "Z");
  return Number.isNaN(parsed.getTime())
    ? raw
    : parsed.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function StandingsPage() {
  const {
    currentFanta,
    fantaMembers,
    standings,
    calendar,
    generateCalendar,
    recalculateScores,
    isFantaAdmin,
    getMemberName,
  } = useFanta();
  const [selectedMember, setSelectedMember] = useState<FantaMemberProfile | null>(
    null,
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  // Drill-down step 3: click su un pick della rosa -> log partita per
  // partita (data, avversario/champion, stats, punti). Caricato al volo
  // solo quando si apre, non prefetchato per tutta la rosa.
  const [drillPick, setDrillPick] = useState<TeamPick | null>(null);
  const [playerLog, setPlayerLog] = useState<PlayerGameLog[]>([]);
  const [teamLog, setTeamLog] = useState<TeamGameLog[]>([]);
  const [isLoadingLog, setIsLoadingLog] = useState(false);

  const handleGenerateCalendar = async () => {
    setIsGenerating(true);
    setActionMessage("");
    try {
      await generateCalendar();
      setActionMessage("Calendario generato.");
    } catch (error) {
      console.error("Errore nella generazione del calendario:", error);
      setActionMessage("Errore nella generazione del calendario.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRecalculateScores = async () => {
    setIsRecalculating(true);
    setActionMessage("");
    try {
      await recalculateScores();
      setActionMessage("Punteggi ricalcolati.");
    } catch (error) {
      console.error("Errore nel ricalcolo dei punteggi:", error);
      setActionMessage("Errore nel ricalcolo dei punteggi.");
    } finally {
      setIsRecalculating(false);
    }
  };

  const openDrillDown = async (pick: TeamPick) => {
    if (!currentFanta?.settings.circuitType) return;
    setDrillPick(pick);
    setPlayerLog([]);
    setTeamLog([]);
    setIsLoadingLog(true);
    try {
      if (pick.pickType === "player" || pick.pickType === "jolly") {
        const log = await getPlayerGameLog(
          pick.playerName,
          currentFanta.settings.circuitType,
        );
        setPlayerLog(log);
      } else {
        // coach: le partite sono quelle della squadra allenata (playerTeam)
        const teamName =
          pick.pickType === "coach" ? pick.playerTeam : pick.playerName;
        if (teamName) {
          const log = await getTeamGameLog(
            teamName,
            currentFanta.settings.circuitType,
          );
          setTeamLog(log);
        }
      }
    } catch (error) {
      console.error("Errore nel caricamento del log partite:", error);
    } finally {
      setIsLoadingLog(false);
    }
  };

  if (!currentFanta) return null;

  const circuitMissing = !currentFanta.settings.circuitType;
  const weights = currentFanta.settings.scoringWeights;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Classifica</h1>
          <p className="text-slate-400 mt-2">
            {currentFanta.name} - Punteggio totale per membro, da statistiche
            reali Leaguepedia
          </p>
        </div>
        {isFantaAdmin && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleGenerateCalendar}
              disabled={isGenerating}
            >
              <CalendarDays className="mr-2 h-4 w-4" />
              {isGenerating ? "Genero..." : "Genera Calendario"}
            </Button>
            <Button
              onClick={handleRecalculateScores}
              disabled={isRecalculating || circuitMissing}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {isRecalculating ? "Ricalcolo..." : "Ricalcola Punteggi"}
            </Button>
          </div>
        )}
      </div>

      {circuitMissing && (
        <p className="text-sm text-amber-500">
          Nessun circuito impostato in Gestione Lega: il ricalcolo punteggi
          non sa quale torneo interrogare su Leaguepedia.
        </p>
      )}
      {actionMessage && (
        <p className="text-sm text-slate-400">{actionMessage}</p>
      )}

      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Classifica Generale
          </CardTitle>
          <CardDescription className="text-slate-400">
            Somma dei punti fantasy di ogni pick in rosa (kill/morti/assist/
            vittorie per giocatori e jolly, vittorie per squadra/coach).
            Clicca un membro per il dettaglio, poi un pick per le partite.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {standings.length === 0 ? (
            <p className="text-sm text-slate-500">Nessun membro in lega</p>
          ) : (
            <div className="space-y-2">
              {standings.map((entry, index) => {
                const member = fantaMembers.find(
                  (m) => m.userId === entry.userId,
                );
                return (
                  <div
                    key={entry.userId}
                    className="flex items-center justify-between p-3 bg-slate-800 border border-slate-700 rounded-lg cursor-pointer hover:border-slate-600 transition-colors"
                    onClick={() => member && setSelectedMember(member)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center text-slate-500 font-mono">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-slate-100 font-medium">
                          {entry.teamName}
                        </p>
                        <p className="text-xs text-slate-400">{entry.name}</p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-green-400">
                      {entry.totalPoints}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100">
            Calendario ({calendar.length} turni)
          </CardTitle>
          <CardDescription className="text-slate-400">
            Girone all&apos;italiana tra i membri della lega. Il confronto
            diretto a punti per turno non è ancora disponibile: manca una
            mappatura affidabile tra turno fantasy e data reale delle
            partite pro su Leaguepedia — per ora la classifica è a
            punteggio totale, non a vittorie/sconfitte di turno.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {calendar.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nessun calendario generato
              {isFantaAdmin ? ': usa "Genera Calendario" qui sopra.' : "."}
            </p>
          ) : (
            <div className="space-y-4">
              {calendar.map((round) => (
                <div key={round.id}>
                  <p className="text-sm font-medium text-slate-300 mb-2">
                    Turno {round.roundNumber}
                  </p>
                  <div className="grid md:grid-cols-2 gap-2">
                    {round.fixtures.map((fixture, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-slate-800 border border-slate-700 rounded text-sm"
                      >
                        <span className="text-slate-200">
                          {getMemberName(fixture.homeUserId)}
                        </span>
                        {fixture.awayUserId ? (
                          <>
                            <span className="text-slate-500">vs</span>
                            <span className="text-slate-200">
                              {getMemberName(fixture.awayUserId)}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-500">riposo</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dettaglio membro: rosa con i punti di ogni pick */}
      <Dialog
        open={Boolean(selectedMember)}
        onOpenChange={(open) => !open && setSelectedMember(null)}
      >
        <DialogContent>
          {selectedMember && (
            <>
              <DialogHeader>
                <DialogTitle className="text-slate-100">
                  {selectedMember.teamName}
                </DialogTitle>
                <DialogDescription>{selectedMember.name}</DialogDescription>
              </DialogHeader>
              {selectedMember.team.length === 0 ? (
                <p className="text-sm text-slate-500">Rosa vuota</p>
              ) : (
                <div className="space-y-2">
                  {[...selectedMember.team]
                    .sort((a, b) => (b.points || 0) - (a.points || 0))
                    .map((pick) => (
                      <div
                        key={pick.id}
                        className="flex items-center justify-between p-2 border border-slate-700 rounded-lg cursor-pointer hover:border-slate-600 transition-colors"
                        onClick={() => openDrillDown(pick)}
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {PICK_TYPE_LABELS[pick.pickType]}
                          </Badge>
                          <span className="text-slate-100">
                            {pick.playerName}
                          </span>
                          {pick.playerRole && (
                            <Badge variant="outline">{pick.playerRole}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-green-400">
                            {pick.points !== undefined ? pick.points : "—"}
                          </span>
                          <ChevronRight className="h-4 w-4 text-slate-500" />
                        </div>
                      </div>
                    ))}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-700">
                    <span className="text-slate-300 font-medium">Totale</span>
                    <span className="text-lg font-bold text-green-400">
                      {selectedMember.team.reduce(
                        (sum, p) => sum + (p.points || 0),
                        0,
                      )}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Drill-down: partite reali di un singolo pick, con punti calcolati
          partita per partita (non solo il totale già in rosa) */}
      <Dialog
        open={Boolean(drillPick)}
        onOpenChange={(open) => !open && setDrillPick(null)}
      >
        <DialogContent className="max-w-2xl">
          {drillPick && (
            <>
              <DialogHeader>
                <DialogTitle className="text-slate-100">
                  {drillPick.playerName}
                </DialogTitle>
                <DialogDescription>
                  {PICK_TYPE_LABELS[drillPick.pickType]}
                  {drillPick.pickType === "coach" && drillPick.playerTeam
                    ? ` — squadra allenata: ${drillPick.playerTeam}`
                    : ""}
                  {" — partite nel circuito "}
                  {currentFanta.settings.circuitType || "N/D"}
                </DialogDescription>
              </DialogHeader>

              {isLoadingLog ? (
                <p className="text-sm text-slate-400">Caricamento partite...</p>
              ) : drillPick.pickType === "player" ||
                drillPick.pickType === "jolly" ? (
                playerLog.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Nessuna partita trovata per questo giocatore in questo
                    circuito.
                  </p>
                ) : (
                  <div className="max-h-96 overflow-y-auto rounded-md border border-slate-700">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Torneo</TableHead>
                          <TableHead>Champion</TableHead>
                          <TableHead>K/D/A</TableHead>
                          <TableHead>Esito</TableHead>
                          <TableHead className="text-right">Punti</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {playerLog.map((game) => {
                          const points = weights
                            ? game.kills * weights.kills +
                              game.deaths * weights.deaths +
                              game.assists * weights.assists +
                              (game.win ? weights.win : 0)
                            : undefined;
                          return (
                            <TableRow key={game.gameId}>
                              <TableCell className="text-sm">
                                {formatGameDate(game.date)}
                              </TableCell>
                              <TableCell className="text-sm">
                                {game.tournament}
                              </TableCell>
                              <TableCell className="text-sm">
                                {game.champion || "N/D"}
                              </TableCell>
                              <TableCell className="text-sm">
                                {game.kills}/{game.deaths}/{game.assists}
                              </TableCell>
                              <TableCell>
                                <Badge variant={game.win ? "default" : "outline"}>
                                  {game.win ? "Vittoria" : "Sconfitta"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {points !== undefined
                                  ? Math.round(points * 100) / 100
                                  : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )
              ) : teamLog.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nessuna partita trovata per questa squadra in questo
                  circuito.
                </p>
              ) : (
                <div className="max-h-96 overflow-y-auto rounded-md border border-slate-700">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Torneo</TableHead>
                        <TableHead>Avversario</TableHead>
                        <TableHead>Esito</TableHead>
                        <TableHead className="text-right">Punti</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamLog.map((game) => (
                        <TableRow key={game.gameId}>
                          <TableCell className="text-sm">
                            {formatGameDate(game.date)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {game.tournament}
                          </TableCell>
                          <TableCell className="text-sm">
                            {game.opponent || "N/D"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={game.win ? "default" : "outline"}>
                              {game.win ? "Vittoria" : "Sconfitta"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {weights && game.win ? weights.win : 0}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
