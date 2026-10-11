"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { pickKey } from "@/lib/uniquePicks";
import { useFanta } from "@/contexts/FantaContext";
import { useAuth } from "@/contexts/AuthContext";
import { buildDraftSlots, getDraftTurnUserId } from "@/lib/draft";
import { LOL_ROLES } from "@/lib/constants";
import {
  getPlayersByLeague,
  searchTeams,
  type LeaguepediaPlayer,
  type LeaguepediaTeam,
} from "@/lib/leaguepediaApi";
import type { DraftSlot, PendingDraftAssignment, TeamPickType } from "@/types";

const PICK_TYPE_LABELS: Record<TeamPickType, string> = {
  player: "Giocatore",
  jolly: "Jolly",
  team: "Squadra",
  coach: "Coach",
};

function slotLabel(slot: DraftSlot | undefined): string {
  if (!slot) return "";
  return slot.pickType === "player"
    ? slot.role || "Giocatore"
    : PICK_TYPE_LABELS[slot.pickType];
}

// Form di assegnazione a mano per un turno saltato per timeout: resta
// "sganciato" dal turno corrente del draft, che nel frattempo è già andato
// avanti da solo (vedi FantaContext.fillPendingDraftAssignment).
function PendingAssignmentsList({
  pending,
  slots,
  getMemberName,
  onFill,
}: {
  pending: PendingDraftAssignment[];
  slots: DraftSlot[];
  getMemberName: (userId: string, fallback?: string) => string;
  onFill: (
    pending: PendingDraftAssignment,
    input: { playerName: string; playerRole?: string; playerTeam?: string },
  ) => void;
}) {
  const [drafts, setDrafts] = useState<
    Record<string, { name: string; team: string; role: string }>
  >({});
  const key = (p: PendingDraftAssignment) => `${p.userId}-${p.slotIndex}`;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Turni saltati da assegnare a mano ({pending.length}):
      </p>
      {pending.map((p) => {
        const slot = slots[p.slotIndex];
        const k = key(p);
        const draft = drafts[k] || { name: "", team: "", role: "" };
        const needsTeamField = slot?.pickType === "team" || slot?.pickType === "coach";
        // Il jolly non ha un ruolo fisso di slot: senza ruolo non prende
        // punti (i pesi sono per ruolo), quindi va scelto qui.
        const needsRoleField = slot?.pickType === "jolly";
        return (
          <div
            key={k}
            className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2"
          >
            <span className="text-sm text-foreground">
              {getMemberName(p.userId)} — {slotLabel(slot)}
            </span>
            <Input
              className="w-40"
              placeholder="Nome"
              value={draft.name}
              onChange={(e) =>
                setDrafts({ ...drafts, [k]: { ...draft, name: e.target.value } })
              }
            />
            {needsRoleField && (
              <Select
                value={draft.role}
                onValueChange={(value) =>
                  setDrafts({ ...drafts, [k]: { ...draft, role: value } })
                }
              >
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Ruolo" />
                </SelectTrigger>
                <SelectContent>
                  {LOL_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {needsTeamField && (
              <Input
                className="w-32"
                placeholder="Squadra"
                value={draft.team}
                onChange={(e) =>
                  setDrafts({ ...drafts, [k]: { ...draft, team: e.target.value } })
                }
              />
            )}
            <Button
              size="sm"
              disabled={!draft.name.trim() || (needsRoleField && !draft.role)}
              onClick={() => {
                onFill(p, {
                  playerName: draft.name.trim(),
                  playerRole: needsRoleField ? draft.role : undefined,
                  playerTeam: draft.team.trim() || undefined,
                });
                setDrafts((prev) => {
                  const next = { ...prev };
                  delete next[k];
                  return next;
                });
              }}
            >
              Assegna
            </Button>
          </div>
        );
      })}
    </div>
  );
}

export function DraftPanel() {
  const {
    currentFanta,
    draftState,
    fantaMembers,
    getMemberName,
    isFantaViceOrAdmin,
    startDraft,
    makeDraftPick,
    skipDraftTurn,
    fillPendingDraftAssignment,
  } = useFanta();
  const { user } = useAuth();
  const [isStartingDraft, setIsStartingDraft] = useState(false);

  const handleStartDraft = async () => {
    setIsStartingDraft(true);
    try {
      await startDraft();
    } catch (error) {
      console.error("Errore nell'avvio del draft:", error);
      toast.error("Errore nell'avvio del draft, riprova");
    } finally {
      setIsStartingDraft(false);
    }
  };

  const slots = useMemo(
    () => (currentFanta ? buildDraftSlots(currentFanta) : []),
    [currentFanta],
  );

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (draftState?.status !== "active") return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [draftState?.status]);

  const countdown = draftState?.pickDeadline
    ? Math.max(0, Math.ceil((draftState.pickDeadline.getTime() - now) / 1000))
    : 0;

  const currentSlot =
    draftState?.status === "active" ? slots[draftState.currentSlotIndex] : undefined;
  const currentTurnUserId =
    draftState?.status === "active"
      ? getDraftTurnUserId(
          draftState.order,
          draftState.currentSlotIndex,
          draftState.currentTurnIndex,
        )
      : undefined;
  const isMyTurn = !!user && !!currentTurnUserId && currentTurnUserId === user.id;
  const seasonStarted = !!currentFanta?.settings.seasonStarted;
  const canActForCurrentTurn = isFantaViceOrAdmin || (isMyTurn && !seasonStarted);

  // Ricerca Leaguepedia per la pick corrente: player filtrati per il ruolo
  // dello slot (nessun filtro per i jolly), squadre solo per lo slot "team".
  const [players, setPlayers] = useState<LeaguepediaPlayer[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [teams, setTeams] = useState<LeaguepediaTeam[]>([]);
  const [teamSearch, setTeamSearch] = useState("");
  const [coachName, setCoachName] = useState("");
  const [coachTeam, setCoachTeam] = useState("");

  useEffect(() => {
    if (!currentFanta || currentFanta.sportType !== "lol") return;
    if (!currentSlot || (currentSlot.pickType !== "player" && currentSlot.pickType !== "jolly")) {
      return;
    }
    let cancelled = false;
    getPlayersByLeague("TUTTI I PRO PLAYER").then((list) => {
      if (!cancelled) setPlayers(list);
    });
    return () => {
      cancelled = true;
    };
  }, [currentFanta, currentSlot]);

  useEffect(() => {
    if (!currentFanta || currentFanta.sportType !== "lol") return;
    if (!currentSlot || currentSlot.pickType !== "team") return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      searchTeams(teamSearch).then((list) => {
        if (!cancelled) setTeams(list);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [currentFanta, currentSlot, teamSearch]);

  // Una scelta unica per lega: chi è già in una rosa non compare più
  // (il server lo rifiuta comunque, vedi makeDraftPick).
  const takenKeys = useMemo(
    () =>
      new Set(
        fantaMembers.flatMap((m) => m.team.map((p) => pickKey(p.pickType, p.playerName))),
      ),
    [fantaMembers],
  );
  const availableTeams = useMemo(
    () => teams.filter((t) => !takenKeys.has(pickKey("team", t.name))),
    [teams, takenKeys],
  );

  const filteredPlayers = useMemo(() => {
    const base = (
      currentSlot?.pickType === "player"
        ? players.filter((p) => p.role === currentSlot.role)
        : players
    ).filter((p) => !takenKeys.has(pickKey("player", p.player)));
    if (!playerSearch.trim()) return base;
    const q = playerSearch.trim().toLowerCase();
    return base.filter((p) => `${p.player} ${p.team || ""}`.toLowerCase().includes(q));
  }, [players, playerSearch, currentSlot, takenKeys]);

  // La pick la registra il server (makeDraftPick): se rifiuta (turno
  // scaduto, non è il tuo turno, mercato chiuso) lo dice il messaggio.
  const [isPicking, setIsPicking] = useState(false);
  const submitPick = async (
    input: Parameters<typeof makeDraftPick>[0],
    reset: () => void,
  ) => {
    if (isPicking) return;
    setIsPicking(true);
    try {
      await makeDraftPick(input);
      reset();
    } catch (error) {
      console.error("Errore nella pick di draft:", error);
      const message = (error as { message?: string })?.message;
      toast.error(message ? `Pick non registrata: ${message}` : "Pick non registrata, riprova");
    } finally {
      setIsPicking(false);
    }
  };
  const submitPlayerPick = (player: LeaguepediaPlayer) =>
    submitPick(
      { playerName: player.player, playerRole: player.role, playerTeam: player.team },
      () => setPlayerSearch(""),
    );
  const submitTeamPick = (team: LeaguepediaTeam) =>
    submitPick({ playerName: team.name, playerTeam: team.region }, () => setTeamSearch(""));
  const submitCoachPick = () => {
    if (!coachName.trim()) return;
    submitPick(
      { playerName: coachName.trim(), playerTeam: coachTeam.trim() || undefined },
      () => {
        setCoachName("");
        setCoachTeam("");
      },
    );
  };

  if (!currentFanta) return null;

  if (!draftState || draftState.status === "not_started") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Draft a turni</CardTitle>
          <CardDescription className="text-muted-foreground">
            {slots.length} slot da assegnare a {fantaMembers.length} membri
            ({slots.length * fantaMembers.length} pick totali). L&apos;ordine
            viene generato a caso all&apos;avvio e si inverte a ogni giro (1→N,
            N→1, ...): ogni giro è un ruolo fisso, uguale per tutti.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {seasonStarted ? (
            <p className="text-sm text-muted-foreground">
              Il mercato è chiuso (stagione iniziata): il draft non può più
              essere avviato.
            </p>
          ) : isFantaViceOrAdmin ? (
            fantaMembers.length < 2 ? (
              <p className="text-sm text-muted-foreground">
                Servono almeno 2 membri nella lega per avviare il draft.
              </p>
            ) : (
              <Button onClick={handleStartDraft} disabled={isStartingDraft}>
                {isStartingDraft ? "Avvio..." : "Genera ordine e avvia Draft"}
              </Button>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              Il draft non è ancora iniziato: aspetta che admin/vice lo avvii.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (draftState.status === "completed") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Draft completato</CardTitle>
          <CardDescription className="text-muted-foreground">
            Tutte le rose sono state assegnate. Controlla &quot;Team&quot; per
            vedere la tua.
          </CardDescription>
        </CardHeader>
        {draftState.pendingAssignments.length > 0 && isFantaViceOrAdmin && (
          <CardContent>
            <PendingAssignmentsList
              pending={draftState.pendingAssignments}
              slots={slots}
              getMemberName={getMemberName}
              onFill={fillPendingDraftAssignment}
            />
          </CardContent>
        )}
      </Card>
    );
  }

  return (
    <Card className="border-2 border-info">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl text-foreground">
            Turno di {getMemberName(currentTurnUserId || "")}
          </CardTitle>
          <div className="text-4xl font-bold text-info">{countdown}s</div>
        </div>
        <CardDescription className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <Badge variant="secondary">
            {currentSlot ? PICK_TYPE_LABELS[currentSlot.pickType] : ""}
          </Badge>
          {currentSlot?.role && <Badge>{currentSlot.role}</Badge>}
          <span>
            Giro {draftState.currentSlotIndex + 1}/{slots.length}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {draftState.order.map((uid, idx) => {
            const forward = draftState.currentSlotIndex % 2 === 0;
            const position = forward ? idx : draftState.order.length - 1 - idx;
            const isCurrent = uid === currentTurnUserId;
            return (
              <Badge
                key={uid}
                variant={isCurrent ? "default" : "outline"}
                className={isCurrent ? "" : "opacity-60"}
              >
                {position + 1}. {getMemberName(uid)}
              </Badge>
            );
          })}
        </div>

        {!canActForCurrentTurn ? (
          <p className="text-sm text-muted-foreground">
            {seasonStarted
              ? "Il mercato è chiuso (stagione iniziata): non puoi più fare pick."
              : `Aspetta il tuo turno — sta scegliendo ${getMemberName(currentTurnUserId || "")}.`}
          </p>
        ) : currentSlot?.pickType === "coach" ? (
          <div className="space-y-2 rounded-md border border-border p-4">
            <Label htmlFor="draftCoachName">Nome Coach *</Label>
            <Input
              id="draftCoachName"
              value={coachName}
              onChange={(e) => setCoachName(e.target.value)}
              placeholder="Es: kkOma"
            />
            <Label htmlFor="draftCoachTeam">Squadra Allenata</Label>
            <Input
              id="draftCoachTeam"
              value={coachTeam}
              onChange={(e) => setCoachTeam(e.target.value)}
              placeholder="Es: T1"
            />
            <Button onClick={submitCoachPick} disabled={!coachName.trim()}>
              Scegli
            </Button>
          </div>
        ) : currentSlot?.pickType === "team" ? (
          <div className="space-y-2 rounded-md border border-border p-4">
            <Label>Squadra Leaguepedia</Label>
            <Input
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
              placeholder="Cerca per nome o sigla..."
            />
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {availableTeams.length === 0 ? (
                <p className="px-2 py-4 text-sm text-muted-foreground">
                  Nessuna squadra trovata
                </p>
              ) : (
                availableTeams.map((team) => (
                  <button
                    key={team.name}
                    onClick={() => submitTeamPick(team)}
                    className="w-full rounded px-2 py-1 text-left text-sm hover:bg-raised"
                  >
                    {team.name} {team.region ? `- ${team.region}` : ""}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2 rounded-md border border-border p-4">
            <Label>
              Player Leaguepedia
              {currentSlot?.role ? ` (${currentSlot.role})` : ""}
            </Label>
            <Input
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              placeholder="Cerca per nome o team..."
            />
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {filteredPlayers.length === 0 ? (
                <p className="px-2 py-4 text-sm text-muted-foreground">
                  Nessun player trovato
                </p>
              ) : (
                filteredPlayers.map((player) => (
                  <button
                    key={player.player}
                    onClick={() => submitPlayerPick(player)}
                    className="w-full rounded px-2 py-1 text-left text-sm hover:bg-raised"
                  >
                    {player.player} {player.team ? `- ${player.team}` : ""}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {isFantaViceOrAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => skipDraftTurn({ force: true })}
          >
            Salta turno (assegna a mano dopo)
          </Button>
        )}

        {draftState.pendingAssignments.length > 0 && isFantaViceOrAdmin && (
          <div className="border-t border-border pt-3">
            <PendingAssignmentsList
              pending={draftState.pendingAssignments}
              slots={slots}
              getMemberName={getMemberName}
              onFill={fillPendingDraftAssignment}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
