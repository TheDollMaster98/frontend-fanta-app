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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trophy, RefreshCw, CalendarDays, ChevronRight } from "lucide-react";
import { useFanta, type FantaMemberProfile } from "@/contexts/FantaContext";
import {
  getPlayerGameLog,
  getTeamGameLog,
  LEAGUEPEDIA_UNAVAILABLE,
  type PlayerGameLog,
  type TeamGameLog,
} from "@/lib/leaguepediaApi";
import { computeManualBonus, manualBonusApplies, totalPickPoints } from "@/lib/scoring";
import { bracketRoundName, rankGroupMembers } from "@/lib/bracket";
import { useAuth } from "@/contexts/AuthContext";
import { PlayoffHowToWin } from "@/components/PlayoffHowToWin";
import { WorldsAdminPanel } from "@/components/WorldsAdminPanel";
import { buildPickBanRounds } from "@/lib/pickBanRounds";
import type { TeamPick, TeamPickType, CalendarRound } from "@/types";
import { DEFAULT_TEAM_SCORING_WEIGHTS, PLAYOFF_CIRCUITS, toLolRole } from "@/lib/constants";
import { toast } from "sonner";

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

// Fixture di un turno di calendario (girone unico o girone di un gruppo,
// non il tabellone a eliminazione, che ha una sua struttura a parte).
// Estratto per non duplicarlo tra fase singola e fase a gironi.
function RoundFixturesList({
  round,
  getMemberName,
}: {
  round: CalendarRound;
  getMemberName: (userId: string, fallback?: string) => string;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground mb-2">
        Turno {round.roundNumber}
        <span className="text-muted-foreground font-normal ml-2">
          {round.startDate.toLocaleDateString("it-IT", {
            day: "2-digit",
            month: "2-digit",
          })}
          {" – "}
          {round.endDate.toLocaleDateString("it-IT", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
        </span>
      </p>
      <div className="grid md:grid-cols-2 gap-2">
        {round.fixtures.map((fixture, idx) => {
          const hasResult =
            fixture.homePoints !== undefined && fixture.awayPoints !== undefined;
          const homeWins =
            hasResult && fixture.homePoints! > fixture.awayPoints!;
          const awayWins =
            hasResult && fixture.awayPoints! > fixture.homePoints!;
          return (
            <div
              key={idx}
              className="flex items-center justify-between p-2 bg-raised border border-border rounded text-sm"
            >
              <span
                className={
                  homeWins ? "text-success font-semibold" : "text-foreground"
                }
              >
                {getMemberName(fixture.homeUserId)}
                {hasResult && (
                  <span className="text-muted-foreground font-normal ml-1">
                    ({fixture.homePoints})
                  </span>
                )}
              </span>
              {fixture.awayUserId ? (
                <>
                  <span className="text-muted-foreground">
                    {hasResult ? (homeWins || awayWins ? "-" : "pareggio") : "vs"}
                  </span>
                  <span
                    className={
                      awayWins ? "text-success font-semibold" : "text-foreground"
                    }
                  >
                    {hasResult && (
                      <span className="text-muted-foreground font-normal mr-1">
                        ({fixture.awayPoints})
                      </span>
                    )}
                    {getMemberName(fixture.awayUserId)}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">riposo</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
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
    updatePickPoints,
    isFantaAdmin,
    isFantaViceOrAdmin,
    getMemberName,
    groups,
    bracketRounds,
    generateGroups,
    generateBracket,
    championPicks,
    pickemBracket,
    pickemPredictions,
  } = useFanta();
  const { user } = useAuth();
  const [selectedMember, setSelectedMember] = useState<FantaMemberProfile | null>(
    null,
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isCalendarDialogOpen, setIsCalendarDialogOpen] = useState(false);
  const [calendarStartDate, setCalendarStartDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [roundLengthDays, setRoundLengthDays] = useState(7);

  // Fase a gironi + eliminazione diretta (solo circuiti WORLDS/MSI)
  const [isGroupsDialogOpen, setIsGroupsDialogOpen] = useState(false);
  const [isGeneratingGroups, setIsGeneratingGroups] = useState(false);
  const [groupCount, setGroupCount] = useState(2);
  const [groupsStartDate, setGroupsStartDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [groupsRoundLengthDays, setGroupsRoundLengthDays] = useState(7);

  const [isBracketDialogOpen, setIsBracketDialogOpen] = useState(false);
  const [isGeneratingBracket, setIsGeneratingBracket] = useState(false);
  // null = non toccato: vale quello salvato nella lega (o 2).
  const [qualifiersInput, setQualifiersInput] = useState<number | null>(null);
  const qualifiersPerGroup =
    qualifiersInput ?? currentFanta?.settings.qualifiersPerGroup ?? 2;
  const setQualifiersPerGroup = (value: number) => setQualifiersInput(value);
  const [bracketStartDate, setBracketStartDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [bracketRoundLengthDays, setBracketRoundLengthDays] = useState(7);

  // Drill-down step 3: click su un pick della rosa -> log partita per
  // partita (data, avversario/champion, stats, punti). Caricato al volo
  // solo quando si apre, non prefetchato per tutta la rosa.
  const [drillPick, setDrillPick] = useState<TeamPick | null>(null);
  const [drillMemberId, setDrillMemberId] = useState<string | null>(null);
  const [playerLog, setPlayerLog] = useState<PlayerGameLog[]>([]);
  const [teamLog, setTeamLog] = useState<TeamGameLog[]>([]);
  const [isLoadingLog, setIsLoadingLog] = useState(false);

  // Form statistiche manuali: ripiego per i pick senza partite su
  // Leaguepedia (vedi manualBonusApplies in lib/scoring.ts).
  // Ripopolato dal pick ogni volta che si apre un nuovo drill-down.
  const [manualForm, setManualForm] = useState<Record<string, string>>({});
  // Solo leghe "custom": punti inseriti come numero diretto (vedi il campo
  // "Punti" nel drill-down). undefined finché l'admin non lo tocca, il
  // salvataggio usa comunque drillPick.points come fallback.
  const [customPointsInput, setCustomPointsInput] = useState<string | undefined>(
    undefined,
  );
  useEffect(() => {
    setCustomPointsInput(undefined);
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
    try {
      await generateCalendar(new Date(calendarStartDate), roundLengthDays);
      toast.success("Calendario generato");
      setIsCalendarDialogOpen(false);
    } catch (error) {
      console.error("Errore nella generazione del calendario:", error);
      toast.error("Errore nella generazione del calendario");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRecalculateScores = async () => {
    setIsRecalculating(true);
    try {
      await recalculateScores();
      toast.success("Punteggi ricalcolati");
    } catch (error) {
      console.error("Errore nel ricalcolo dei punteggi:", error);
      if (error instanceof Error && error.message === LEAGUEPEDIA_UNAVAILABLE) {
        toast.error(
          "Leaguepedia non risponde (rate limit o errore): punteggi lasciati com'erano, riprova tra qualche minuto",
        );
      } else {
        toast.error("Errore nel ricalcolo dei punteggi");
      }
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleGenerateGroups = async () => {
    setIsGeneratingGroups(true);
    try {
      await generateGroups(
        groupCount,
        new Date(groupsStartDate),
        groupsRoundLengthDays,
        qualifiersPerGroup,
      );
      toast.success("Gironi generati");
      setIsGroupsDialogOpen(false);
    } catch (error) {
      console.error("Errore nella generazione dei gironi:", error);
      toast.error("Errore nella generazione dei gironi");
    } finally {
      setIsGeneratingGroups(false);
    }
  };

  const handleGenerateBracket = async () => {
    setIsGeneratingBracket(true);
    try {
      await generateBracket(
        qualifiersPerGroup,
        new Date(bracketStartDate),
        bracketRoundLengthDays,
      );
      toast.success("Tabellone generato");
      setIsBracketDialogOpen(false);
    } catch (error) {
      console.error("Errore nella generazione del tabellone:", error);
      toast.error("Errore nella generazione del tabellone");
    } finally {
      setIsGeneratingBracket(false);
    }
  };

  const openDrillDown = async (pick: TeamPick, memberId: string) => {
    if (!currentFanta) return;
    setDrillPick(pick);
    setDrillMemberId(memberId);
    setPlayerLog([]);
    setTeamLog([]);
    // Leghe "custom" (30/9): niente circuitType, niente Leaguepedia dietro
    // — il drill-down deve comunque aprirsi (serve per inserire i punti a
    // mano), solo il log partite non ha senso e va saltato.
    if (!currentFanta.settings.circuitType) return;
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
  const isPlayoffCircuit = PLAYOFF_CIRCUITS.includes(
    currentFanta.settings.circuitType || "",
  );
  // Chi è davvero nel tabellone, una volta generato: il badge dei gironi
  // segue quello, non più una stima.
  // "Da fare ora" del membro (11/10): Pick/Ban del turno aperto non ancora
  // scelto, Pick'em non ancora inviato.
  const playoffTodos: { label: string; href: string }[] = [];
  if (isPlayoffCircuit && user) {
    const nowMs = Date.now();
    const openPickBan = buildPickBanRounds(calendar, bracketRounds).find(
      (r) => r.startDate.getTime() <= nowMs && nowMs < r.endDate.getTime(),
    );
    if (
      openPickBan &&
      !championPicks.some((p) => p.userId === user.id && p.roundId === openPickBan.id)
    ) {
      playoffTodos.push({
        label: `Scegli il campione del Pick/Ban (${openPickBan.label}, entro il ${openPickBan.endDate.toLocaleDateString("it-IT")}).`,
        href: "/dashboard/championpick",
      });
    }
    const pickemMatches = pickemBracket?.rounds.flatMap((r) => r.matches) || [];
    const myPickem = pickemPredictions.find((p) => p.userId === user.id);
    const missing = pickemMatches.filter((m) => !myPickem?.picks[m.id]).length;
    if (pickemBracket && !pickemBracket.locked && missing > 0) {
      playoffTodos.push({
        label: `Completa il Pick'em: ${missing} pronostici mancanti, prima che l'admin lo blocchi.`,
        href: "/dashboard/pickem",
      });
    }
  }
  const firstBracketRound = [...bracketRounds].sort((a, b) => a.roundIndex - b.roundIndex)[0];
  const bracketUserIds = new Set(
    (firstBracketRound?.matches || []).flatMap((m) =>
      [m.homeUserId, m.awayUserId].filter((id): id is string => !!id),
    ),
  );
  const cumulativePointsByUserId = new Map(
    standings.map((s) => [s.userId, s.totalPoints]),
  );
  const roleWeights = currentFanta.settings.scoringWeights || {};
  const drillWeights =
    drillPick?.playerRole ? roleWeights[toLolRole(drillPick.playerRole) || ""] : undefined;
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
          <div className="flex gap-2 flex-wrap">
            {isPlayoffCircuit ? (
              <>
                <Dialog open={isGroupsDialogOpen} onOpenChange={setIsGroupsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <CalendarDays className="mr-2 h-4 w-4" />
                      Genera Gironi
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Genera Gironi</DialogTitle>
                      <DialogDescription>
                        Circuito a eliminazione ({currentFanta.settings.circuitType}):
                        i membri vengono divisi in gruppi, ognuno gioca un
                        proprio girone all&apos;italiana. Rigenerare cancella
                        e ricrea gruppi, calendario e tabellone da capo.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="groupCount">Numero di gruppi</Label>
                        <Input
                          id="groupCount"
                          type="number"
                          min={1}
                          max={fantaMembers.length || 1}
                          value={groupCount}
                          onChange={(e) =>
                            setGroupCount(Math.max(1, Number(e.target.value) || 1))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="groupsQualifiers">
                          Quanti passano al tabellone da ogni gruppo
                        </Label>
                        <Input
                          id="groupsQualifiers"
                          type="number"
                          min={1}
                          max={8}
                          value={qualifiersPerGroup}
                          onChange={(e) =>
                            setQualifiersPerGroup(Math.max(1, Number(e.target.value) || 1))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="groupsStartDate">
                          Data di inizio del primo turno
                        </Label>
                        <Input
                          id="groupsStartDate"
                          type="date"
                          value={groupsStartDate}
                          onChange={(e) => setGroupsStartDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="groupsRoundLengthDays">
                          Durata di ogni turno (giorni)
                        </Label>
                        <Input
                          id="groupsRoundLengthDays"
                          type="number"
                          min={1}
                          max={60}
                          value={groupsRoundLengthDays}
                          onChange={(e) =>
                            setGroupsRoundLengthDays(
                              Math.max(1, Number(e.target.value) || 1),
                            )
                          }
                        />
                      </div>
                      <Button
                        onClick={handleGenerateGroups}
                        disabled={isGeneratingGroups}
                        className="w-full"
                      >
                        {isGeneratingGroups ? "Genero..." : "Genera Gironi"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <Dialog open={isBracketDialogOpen} onOpenChange={setIsBracketDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" disabled={groups.length === 0}>
                      <Trophy className="mr-2 h-4 w-4" />
                      Genera Fase Eliminazione
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Genera Fase Eliminazione</DialogTitle>
                      <DialogDescription>
                        I migliori di ogni gruppo (per vittorie/punti nel
                        proprio girone) passano al tabellone a eliminazione
                        diretta. Lancia prima &quot;Ricalcola Punteggi&quot;
                        se i gironi non hanno ancora un risultato aggiornato.
                        Rigenerare cancella e ricrea il tabellone da capo.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="qualifiersPerGroup">
                          Qualificati per gruppo
                        </Label>
                        <Input
                          id="qualifiersPerGroup"
                          type="number"
                          min={1}
                          max={8}
                          value={qualifiersPerGroup}
                          onChange={(e) =>
                            setQualifiersPerGroup(
                              Math.max(1, Number(e.target.value) || 1),
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bracketStartDate">
                          Data di inizio del primo turno
                        </Label>
                        <Input
                          id="bracketStartDate"
                          type="date"
                          value={bracketStartDate}
                          onChange={(e) => setBracketStartDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bracketRoundLengthDays">
                          Durata di ogni turno (giorni)
                        </Label>
                        <Input
                          id="bracketRoundLengthDays"
                          type="number"
                          min={1}
                          max={60}
                          value={bracketRoundLengthDays}
                          onChange={(e) =>
                            setBracketRoundLengthDays(
                              Math.max(1, Number(e.target.value) || 1),
                            )
                          }
                        />
                      </div>
                      <Button
                        onClick={handleGenerateBracket}
                        disabled={isGeneratingBracket}
                        className="w-full"
                      >
                        {isGeneratingBracket ? "Genero..." : "Genera Fase Eliminazione"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            ) : (
              <Dialog open={isCalendarDialogOpen} onOpenChange={setIsCalendarDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    Genera Calendario
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Genera Calendario</DialogTitle>
                    <DialogDescription>
                      Girone all&apos;italiana tra i membri della lega: ogni
                      turno copre una finestra di giorni consecutivi, usata per
                      il confronto diretto a punti tra i due membri di ogni
                      fixture (vedi &quot;Ricalcola Punteggi&quot;). Rigenerare
                      cancella e ricrea tutti i turni da capo.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="calendarStartDate">
                        Data di inizio del primo turno
                      </Label>
                      <Input
                        id="calendarStartDate"
                        type="date"
                        value={calendarStartDate}
                        onChange={(e) => setCalendarStartDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="roundLengthDays">
                        Durata di ogni turno (giorni)
                      </Label>
                      <Input
                        id="roundLengthDays"
                        type="number"
                        min={1}
                        max={60}
                        value={roundLengthDays}
                        onChange={(e) =>
                          setRoundLengthDays(
                            Math.max(1, Number(e.target.value) || 1),
                          )
                        }
                      />
                    </div>
                    <Button
                      onClick={handleGenerateCalendar}
                      disabled={isGenerating}
                      className="w-full"
                    >
                      {isGenerating ? "Genero..." : "Genera Calendario"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
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

      {/* Mondiali/MSI (11/10): "Come si vince" prima di tutto. Sotto, la
          classifica a punti non decide chi vince (lo decide il
          tabellone), e messa per prima sembrava la classifica finale. */}
      {isPlayoffCircuit && isFantaViceOrAdmin && <WorldsAdminPanel />}

      {isPlayoffCircuit && (
        <PlayoffHowToWin
          todos={playoffTodos}
          lastRecalculatedAt={currentFanta.lastRecalculatedAt}
          userId={user?.id}
          groups={groups}
          calendar={calendar}
          bracketRounds={bracketRounds}
          qualifiersPerGroup={currentFanta.settings.qualifiersPerGroup ?? qualifiersPerGroup}
          cumulativePoints={cumulativePointsByUserId}
          getMemberName={getMemberName}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            {isPlayoffCircuit ? "Punti in stagione" : "Classifica Generale"}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {isPlayoffCircuit
              ? "Non decide chi vince (lo decide il tabellone): serve per gli spareggi. "
              : ""}
            Somma dei punti fantasy di ogni pick in rosa (giocatori e jolly:
            kill, morti, assist, vittorie, CS, vision, pentakill; squadre e
            coach: vittorie e obiettivi). Clicca un membro per il dettaglio,
            poi un pick per le partite.
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

      {isPlayoffCircuit ? (
        <>
          {groups.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Gironi</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Nessun girone generato
                  {isFantaAdmin ? ': usa "Genera Gironi" qui sopra.' : "."}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            groups.map((group) => {
              const ranked = rankGroupMembers(
                group,
                calendar,
                cumulativePointsByUserId,
              );
              const groupRounds = calendar.filter(
                (round) => round.groupId === group.id,
              );
              return (
                <Card key={group.id}>
                  <CardHeader>
                    <CardTitle className="text-foreground">
                      {group.name}
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Girone all&apos;italiana tra i membri del gruppo.
                      Classifica per vittorie, poi punti fatti nel girone.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1">
                      {ranked.map((userId, index) => (
                        <div
                          key={userId}
                          className="flex items-center justify-between text-sm p-2 bg-raised border border-border rounded"
                        >
                          <span className="text-foreground">
                            <span className="text-muted-foreground font-mono mr-2">
                              {index + 1}
                            </span>
                            {getMemberName(userId)}
                          </span>
                          {bracketUserIds.size > 0 ? (
                            bracketUserIds.has(userId) ? (
                              <Badge variant="success">Qualificato</Badge>
                            ) : (
                              <Badge variant="outline">Fuori</Badge>
                            )
                          ) : (
                            index < qualifiersPerGroup && (
                              <Badge variant="secondary">In zona qualificazione</Badge>
                            )
                          )}
                        </div>
                      ))}
                    </div>
                    {groupRounds.map((round) => (
                      <RoundFixturesList
                        key={round.id}
                        round={round}
                        getMemberName={getMemberName}
                      />
                    ))}
                  </CardContent>
                </Card>
              );
            })
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">Tabellone</CardTitle>
              <CardDescription className="text-muted-foreground">
                Eliminazione diretta tra i qualificati dei gironi: in ogni
                sfida passa chi fa più punti nei giorni del turno (pareggio:
                chi ha più punti in stagione). Il risultato diventa
                definitivo a fine turno e il turno dopo si crea da solo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {bracketRounds.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nessun tabellone generato
                  {isFantaAdmin
                    ? ': usa "Genera Fase Eliminazione" qui sopra.'
                    : "."}
                </p>
              ) : (
                <div className="space-y-4">
                  {[...bracketRounds]
                    .sort((a, b) => a.roundIndex - b.roundIndex)
                    .map((round) => (
                      <div key={round.id}>
                        <p className="text-sm font-medium text-foreground mb-2">
                          {bracketRoundName(round.matches.length, round.roundIndex)}
                          <span className="text-muted-foreground font-normal ml-2">
                            {round.startDate.toLocaleDateString("it-IT", {
                              day: "2-digit",
                              month: "2-digit",
                            })}
                            {" – "}
                            {round.endDate.toLocaleDateString("it-IT", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </span>
                        </p>
                        <div className="grid md:grid-cols-2 gap-2">
                          {round.matches.map((match, idx) => {
                            const hasResult =
                              match.homePoints !== undefined &&
                              match.awayPoints !== undefined;
                            const homeWins =
                              match.winnerUserId &&
                              match.winnerUserId === match.homeUserId;
                            const awayWins =
                              match.winnerUserId &&
                              match.winnerUserId === match.awayUserId;
                            return (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-2 bg-raised border border-border rounded text-sm"
                              >
                                <span
                                  className={
                                    homeWins
                                      ? "text-success font-semibold"
                                      : "text-foreground"
                                  }
                                >
                                  {match.homeUserId
                                    ? getMemberName(match.homeUserId)
                                    : "Da decidere"}
                                  {hasResult && (
                                    <span className="text-muted-foreground font-normal ml-1">
                                      ({match.homePoints})
                                    </span>
                                  )}
                                </span>
                                <span className="text-muted-foreground">
                                  {!match.homeUserId || !match.awayUserId
                                    ? match.winnerUserId
                                      ? "passa il turno"
                                      : "vs"
                                    : hasResult
                                      ? "-"
                                      : "vs"}
                                </span>
                                <span
                                  className={
                                    awayWins
                                      ? "text-success font-semibold"
                                      : "text-foreground"
                                  }
                                >
                                  {hasResult && (
                                    <span className="text-muted-foreground font-normal mr-1">
                                      ({match.awayPoints})
                                    </span>
                                  )}
                                  {match.awayUserId
                                    ? getMemberName(match.awayUserId)
                                    : "Da decidere"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">
              Calendario ({calendar.length} turni)
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Girone all&apos;italiana tra i membri della lega. Ogni turno
              copre una finestra di date: il punteggio di un confronto diretto
              è la somma dei punti fantasy ottenuti dai due roster SOLO nelle
              partite pro giocate in quella finestra (non il totale
              cumulativo della Classifica Generale sopra). Aggiornato da
              &quot;Ricalcola Punteggi&quot;.
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
                  <RoundFixturesList
                    key={round.id}
                    round={round}
                    getMemberName={getMemberName}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                  {currentFanta.sportType === "lol" &&
                    ` — partite nel circuito ${currentFanta.settings.circuitType || "N/D"}`}
                </DialogDescription>
              </DialogHeader>

              {isFantaViceOrAdmin && currentFanta.sportType === "custom" && (
                <div className="space-y-2 rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    Lega personalizzata: il punteggio va inserito a mano,
                    nessuna fonte automatica dietro un ruolo custom.
                  </p>
                  <div className="flex items-end gap-2">
                    <div className="space-y-1 flex-1">
                      <Label htmlFor="customPoints" className="text-xs font-normal">
                        Punti
                      </Label>
                      <Input
                        id="customPoints"
                        type="number"
                        defaultValue={drillPick.points ?? 0}
                        onChange={(e) => setCustomPointsInput(e.target.value)}
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!drillMemberId) return;
                        const value = Number(customPointsInput ?? drillPick.points ?? 0);
                        if (Number.isNaN(value)) return;
                        updatePickPoints(drillMemberId, drillPick.id, value);
                      }}
                    >
                      Salva
                    </Button>
                  </div>
                </div>
              )}

              {isFantaViceOrAdmin && currentFanta.sportType === "lol" && (
                <div className="space-y-2 rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    {manualBonusApplies(drillPick)
                      ? "Statistiche a mano: Leaguepedia non ha ancora partite per questo pick, quindi queste si sommano subito ai punti."
                      : `Statistiche a mano ignorate: CS, Vision Score, pentakill e obiettivi arrivano già in automatico da Leaguepedia (${drillPick.autoGames} partite). Contano solo se Leaguepedia non trova partite.`}
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
                      {manualBonusApplies(drillPick)
                        ? "Bonus da queste statistiche: "
                        : "Bonus (non conteggiato): "}
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
