"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useFanta } from "@/contexts/FantaContext";
import { useAuth } from "@/contexts/AuthContext";
import { buildDraftSlots, getDraftTurnUserId } from "@/lib/draft";
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
    input: { playerName: string; playerTeam?: string },
  ) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, { name: string; team: string }>>(
    {},
  );
  const key = (p: PendingDraftAssignment) => `${p.userId}-${p.slotIndex}`;

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-400">
        Turni saltati da assegnare a mano ({pending.length}):
      </p>
      {pending.map((p) => {
        const slot = slots[p.slotIndex];
        const k = key(p);
        const draft = drafts[k] || { name: "", team: "" };
        const needsTeamField = slot?.pickType === "team" || slot?.pickType === "coach";
        return (
          <div
            key={k}
            className="flex flex-wrap items-center gap-2 rounded-md border border-slate-700 p-2"
          >
            <span className="text-sm text-slate-300">
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
              disabled={!draft.name.trim()}
              onClick={() => {
                onFill(p, {
                  playerName: draft.name.trim(),
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
  const canActForCurrentTurn = isMyTurn || isFantaViceOrAdmin;

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

  const filteredPlayers = useMemo(() => {
    const base =
      currentSlot?.pickType === "player"
        ? players.filter((p) => p.role === currentSlot.role)
        : players;
    if (!playerSearch.trim()) return base;
    const q = playerSearch.trim().toLowerCase();
    return base.filter((p) => `${p.player} ${p.team || ""}`.toLowerCase().includes(q));
  }, [players, playerSearch, currentSlot]);

  const submitPlayerPick = (player: LeaguepediaPlayer) => {
    makeDraftPick({ playerName: player.player, playerTeam: player.team });
    setPlayerSearch("");
  };
  const submitTeamPick = (team: LeaguepediaTeam) => {
    makeDraftPick({ playerName: team.name, playerTeam: team.region });
    setTeamSearch("");
  };
  const submitCoachPick = () => {
    if (!coachName.trim()) return;
    makeDraftPick({
      playerName: coachName.trim(),
      playerTeam: coachTeam.trim() || undefined,
    });
    setCoachName("");
    setCoachTeam("");
  };

  if (!currentFanta) return null;

  if (!draftState || draftState.status === "not_started") {
    return (
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100">Draft a turni</CardTitle>
          <CardDescription className="text-slate-400">
            {slots.length} slot da assegnare a {fantaMembers.length} membri
            ({slots.length * fantaMembers.length} pick totali). L&apos;ordine
            viene generato a caso all&apos;avvio e si inverte a ogni giro (1→N,
            N→1, ...): ogni giro è un ruolo fisso, uguale per tutti.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isFantaViceOrAdmin ? (
            fantaMembers.length < 2 ? (
              <p className="text-sm text-slate-500">
                Servono almeno 2 membri nella lega per avviare il draft.
              </p>
            ) : (
              <Button onClick={startDraft}>Genera ordine e avvia Draft</Button>
            )
          ) : (
            <p className="text-sm text-slate-500">
              Il draft non è ancora iniziato: aspetta che admin/vice lo avvii.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (draftState.status === "completed") {
    return (
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100">Draft completato</CardTitle>
          <CardDescription className="text-slate-400">
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
    <Card className="border-2 border-blue-500">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl text-slate-100">
            Turno di {getMemberName(currentTurnUserId || "")}
          </CardTitle>
          <div className="text-4xl font-bold text-blue-400">{countdown}s</div>
        </div>
        <CardDescription className="flex flex-wrap items-center gap-2 text-slate-400">
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
          <p className="text-sm text-slate-500">
            Aspetta il tuo turno — sta scegliendo{" "}
            {getMemberName(currentTurnUserId || "")}.
          </p>
        ) : currentSlot?.pickType === "coach" ? (
          <div className="space-y-2 rounded-md border border-slate-700 p-4">
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
          <div className="space-y-2 rounded-md border border-slate-700 p-4">
            <Label>Squadra Leaguepedia</Label>
            <Input
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
              placeholder="Cerca per nome o sigla..."
            />
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {teams.length === 0 ? (
                <p className="px-2 py-4 text-sm text-slate-500">
                  Nessuna squadra trovata
                </p>
              ) : (
                teams.map((team) => (
                  <button
                    key={team.name}
                    onClick={() => submitTeamPick(team)}
                    className="w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-800"
                  >
                    {team.name} {team.region ? `- ${team.region}` : ""}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2 rounded-md border border-slate-700 p-4">
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
                <p className="px-2 py-4 text-sm text-slate-500">
                  Nessun player trovato
                </p>
              ) : (
                filteredPlayers.map((player) => (
                  <button
                    key={player.player}
                    onClick={() => submitPlayerPick(player)}
                    className="w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-800"
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
          <div className="border-t border-slate-700 pt-3">
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
