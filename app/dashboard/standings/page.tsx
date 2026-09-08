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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trophy, RefreshCw, CalendarDays } from "lucide-react";
import { useFanta, type FantaMemberProfile } from "@/contexts/FantaContext";
import type { TeamPickType } from "@/types";

const PICK_TYPE_LABELS: Record<TeamPickType, string> = {
  player: "Giocatore",
  jolly: "Jolly",
  team: "Squadra",
  coach: "Coach",
};

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

  if (!currentFanta) return null;

  const circuitMissing = !currentFanta.settings.circuitType;

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
            Clicca un membro per il dettaglio.
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
                        className="flex items-center justify-between p-2 border border-slate-700 rounded-lg"
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
                        <span className="font-semibold text-green-400">
                          {pick.points !== undefined ? pick.points : "—"}
                        </span>
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
    </div>
  );
}
