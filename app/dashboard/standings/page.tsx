"use client";

import { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trophy, RefreshCw, CalendarDays, ChevronRight } from "lucide-react";
import { useFanta, type FantaMemberProfile } from "@/contexts/FantaContext";
import {
  getPlayerGameLog,
  getTeamGameLog,
  type PlayerGameLog,
  type TeamGameLog,
} from "@/lib/leaguepediaApi";
import { computeManualBonus, totalPickPoints } from "@/lib/scoring";
import type { TeamPick, TeamPickType } from "@/types";
import { DEFAULT_TEAM_SCORING_WEIGHTS } from "@/lib/constants";

// Campi delle statistiche manuali per pickType: chiave del form -> etichetta.
// Player/jolly: CS, Vision Score, Pentakill. Team/coach: obiettivi + CS + oro.
const MANUAL_PLAYER_FIELDS: { key: string; label: string }[] = [
  { key: "cs", label: "CS" },
  { key: "visionScore", label: "Vision Score" },
  { key: "pentakills", label: "Pentakill" },
];
const MANUAL_TEAM_FIELDS: { key: string; label: string }[] = [
  { key: "towers", label: "Torri" },
  { key: "dragons", label: "Draghi" },
  { key: "voidGrubs", label: "Void Grub" },
  { key: "riftHeralds", label: "Rift Herald" },
  { key: "inhibitors", label: "Inibitori" },
  { key: "atakhans", label: "Atakhan" },
  { key: "barons", label: "Baroni" },
  { key: "cs", label: "CS" },
  { key: "gold", label: "Oro" },
];

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
    updatePickManualStats,
    isFantaAdmin,
    isFantaViceOrAdmin,
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
  const [drillMemberId, setDrillMemberId] = useState<string | null>(null);
  const [playerLog, setPlayerLog] = useState<PlayerGameLog[]>([]);
  const [teamLog, setTeamLog] = useState<TeamGameLog[]>([]);
  const [isLoadingLog, setIsLoadingLog] = useState(false);

  // Form statistiche manuali (fallback finché Leaguepedia non copre CS/
  // Vision Score/Pentakill/obiettivi in automatico — vedi lib/scoring.ts).
  // Ripopolato dal pick ogni volta che si apre un nuovo drill-down.
  const [manualForm, setManualForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!drillPick) {
      setManualForm({});
      return;
    }
    const source =
      drillPick.pickType === "team" || drillPick.pickType === "coach"
        ? drillPick.manualTeamStats
        : drillPick.manualPlayerStats;
    const next: Record<string, string> = {};
    if (source) {
      Object.entries(source).forEach(([k, v]) => {
        if (v !== undefined) next[k] = String(v);
      });
    }
    setManualForm(next);
  }, [drillPick]);

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

  const openDrillDown = async (pick: TeamPick, memberId: string) => {
    if (!currentFanta?.settings.circuitType) return;
    setDrillPick(pick);
    setDrillMemberId(memberId);
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
  const roleWeights = currentFanta.settings.scoringWeights || {};
  const drillWeights =
    drillPick?.playerRole ? roleWeights[drillPick.playerRole] : undefined;
  const teamWeights =
    currentFanta.settings.teamScoringWeights || DEFAULT_TEAM_SCORING_WEIGHTS;

  const manualFields =
    drillPick?.pickType === "team" || drillPick?.pickType === "coach"
      ? MANUAL_TEAM_FIELDS
      : MANUAL_PLAYER_FIELDS;

  const parsedManualForm = Object.fromEntries(
    Object.entries(manualForm)
      .map(([k, v]) => [k, v.trim() === "" ? undefined : Number(v)])
      .filter(([, v]) => v === undefined || !Number.isNaN(v as number)),
  );

  // Anteprima live del bonus manuale, calcolata dai valori appena digitati
  // (non da quelli salvati su drillPick, che restano quelli dell'ultimo
  // salvataggio finché non si preme "Salva").
  const manualBonusPreview = drillPick
    ? computeManualBonus(
        drillPick.pickType === "team" || drillPick.pickType === "coach"
          ? { ...drillPick, manualTeamStats: parsedManualForm }
          : { ...drillPick, manualPlayerStats: parsedManualForm },
        roleWeights,
        teamWeights,
      )
    : 0;

  const handleSaveManualStats = () => {
    if (!drillPick || !drillMemberId) return;
    if (drillPick.pickType === "team" || drillPick.pickType === "coach") {
      updatePickManualStats(drillMemberId, drillPick.id, {
        manualTeamStats: parsedManualForm,
      });
    } else {
      updatePickManualStats(drillMemberId, drillPick.id, {
        manualPlayerStats: parsedManualForm,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Classifica</h1>
          <p className="text-muted-foreground mt-2">
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
        <p className="text-sm text-warning">
          Nessun circuito impostato in Gestione Lega: il ricalcolo punteggi
          non sa quale torneo interrogare su Leaguepedia.
        </p>
      )}
      {actionMessage && (
        <p className="text-sm text-muted-foreground">{actionMessage}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Classifica Generale
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Somma dei punti fantasy di ogni pick in rosa (kill/morti/assist/
            vittorie per giocatori e jolly, vittorie per squadra/coach).
            Clicca un membro per il dettaglio, poi un pick per le partite.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {standings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun membro in lega</p>
          ) : (
            <div className="space-y-2">
              {standings.map((entry, index) => {
                const member = fantaMembers.find(
                  (m) => m.userId === entry.userId,
                );
                return (
                  <div
                    key={entry.userId}
                    className="flex items-center justify-between p-3 bg-raised border border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => member && setSelectedMember(member)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center text-muted-foreground font-mono">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-foreground font-medium">
                          {entry.teamName}
                        </p>
                        <p className="text-xs text-muted-foreground">{entry.name}</p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-success">
                      {entry.totalPoints}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">
            Calendario ({calendar.length} turni)
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Girone all&apos;italiana tra i membri della lega. Il confronto
            diretto a punti per turno non è ancora disponibile: manca una
            mappatura affidabile tra turno fantasy e data reale delle
            partite pro su Leaguepedia — per ora la classifica è a
            punteggio totale, non a vittorie/sconfitte di turno.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {calendar.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessun calendario generato
              {isFantaAdmin ? ': usa "Genera Calendario" qui sopra.' : "."}
            </p>
          ) : (
            <div className="space-y-4">
              {calendar.map((round) => (
                <div key={round.id}>
                  <p className="text-sm font-medium text-foreground mb-2">
                    Turno {round.roundNumber}
                  </p>
                  <div className="grid md:grid-cols-2 gap-2">
                    {round.fixtures.map((fixture, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-raised border border-border rounded text-sm"
                      >
                        <span className="text-foreground">
                          {getMemberName(fixture.homeUserId)}
                        </span>
                        {fixture.awayUserId ? (
                          <>
                            <span className="text-muted-foreground">vs</span>
                            <span className="text-foreground">
                              {getMemberName(fixture.awayUserId)}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">riposo</span>
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
                <DialogTitle className="text-foreground">
                  {selectedMember.teamName}
                </DialogTitle>
                <DialogDescription>{selectedMember.name}</DialogDescription>
              </DialogHeader>
              {selectedMember.team.length === 0 ? (
                <p className="text-sm text-muted-foreground">Rosa vuota</p>
              ) : (
                <div className="space-y-2">
                  {[...selectedMember.team]
                    .sort(
                      (a, b) =>
                        totalPickPoints(b, roleWeights, teamWeights) -
                        totalPickPoints(a, roleWeights, teamWeights),
                    )
                    .map((pick) => (
                      <div
                        key={pick.id}
                        className="flex items-center justify-between p-2 border border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => openDrillDown(pick, selectedMember.userId)}
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {PICK_TYPE_LABELS[pick.pickType]}
                          </Badge>
                          <span className="text-foreground">
                            {pick.playerName}
                          </span>
                          {pick.playerRole && (
                            <Badge variant="outline">{pick.playerRole}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-success">
                            {totalPickPoints(pick, roleWeights, teamWeights)}
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-foreground font-medium">Totale</span>
                    <span className="text-lg font-bold text-success">
                      {selectedMember.team.reduce(
                        (sum, p) =>
                          sum + totalPickPoints(p, roleWeights, teamWeights),
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
        onOpenChange={(open) => {
          if (!open) {
            setDrillPick(null);
            setDrillMemberId(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          {drillPick && (
            <>
              <DialogHeader>
                <DialogTitle className="text-foreground">
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

              {isFantaViceOrAdmin && (
                <div className="space-y-2 rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    Statistiche inserite a mano (CS/Vision Score/Pentakill/
                    obiettivi non sono ancora calcolati in automatico da
                    Leaguepedia): si sommano subito ai punti, senza dover
                    ricalcolare tutta la lega.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {manualFields.map(({ key, label }) => (
                      <div key={key} className="space-y-1">
                        <Label
                          htmlFor={`manual-${key}`}
                          className="text-xs font-normal"
                        >
                          {label}
                        </Label>
                        <Input
                          id={`manual-${key}`}
                          type="number"
                          value={manualForm[key] ?? ""}
                          onChange={(e) =>
                            setManualForm({
                              ...manualForm,
                              [key]: e.target.value,
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-xs text-muted-foreground">
                      Bonus da queste statistiche:{" "}
                      <span className="font-semibold text-success">
                        {Math.round(manualBonusPreview * 100) / 100}
                      </span>
                    </p>
                    <Button size="sm" onClick={handleSaveManualStats}>
                      Salva
                    </Button>
                  </div>
                </div>
              )}

              {isLoadingLog ? (
                <p className="text-sm text-muted-foreground">Caricamento partite...</p>
              ) : drillPick.pickType === "player" ||
                drillPick.pickType === "jolly" ? (
                playerLog.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nessuna partita trovata per questo giocatore in questo
                    circuito.
                  </p>
                ) : (
                  <div className="max-h-96 overflow-y-auto rounded-md border border-border">
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
                          const points = drillWeights
                            ? game.kills * drillWeights.kills +
                              game.deaths * drillWeights.deaths +
                              game.assists * drillWeights.assists +
                              (game.win ? drillWeights.win : 0)
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
                <p className="text-sm text-muted-foreground">
                  Nessuna partita trovata per questa squadra in questo
                  circuito.
                </p>
              ) : (
                <div className="max-h-96 overflow-y-auto rounded-md border border-border">
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
                            {game.win ? teamWeights.win : 0}
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
