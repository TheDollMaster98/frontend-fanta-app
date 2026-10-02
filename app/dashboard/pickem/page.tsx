"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { useFanta } from "@/contexts/FantaContext";
import { useAuth } from "@/contexts/AuthContext";
import { PLAYOFF_CIRCUITS } from "@/lib/constants";
import type { PickemRound } from "@/types";

// Stato locale di editing: stessa forma di PickemRound/PickemMatch ma con
// un id client-side su ogni match (crypto.randomUUID) per poterli
// aggiungere/rimuovere nella UI prima ancora di salvare su Firestore — gli
// id salvati restano quelli generati qui, non vengono mai rigenerati dopo
// il primo salvataggio (altrimenti i pronostici già inviati, che puntano a
// quegli id, smetterebbero di matchare).
function emptyRound(): PickemRound {
  return { name: "", points: 1, matches: [] };
}

export default function PickemPage() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    currentFanta,
    isLoading: fantaLoading,
    fantaMembers,
    currentMember,
    isFantaViceOrAdmin,
    pickemBracket,
    pickemPredictions,
    savePickemBracket,
    setPickemLocked,
    setPickemMatchWinner,
    submitPickemPrediction,
    getPickemPoints,
  } = useFanta();

  // Pick'em ha senso solo per i circuiti a eliminazione (WORLDS/MSI): se
  // si cambia "Lega Attiva" verso una lega che non lo è mentre si è su
  // questa pagina, rimanda alla dashboard invece di restare su una
  // sezione che per quella lega non esiste (bug segnalato, 2/10).
  const isValidForFanta =
    !!currentFanta &&
    currentFanta.sportType === "lol" &&
    PLAYOFF_CIRCUITS.includes(currentFanta.settings.circuitType || "");

  useEffect(() => {
    if (!fantaLoading && currentFanta && !isValidForFanta) {
      router.push("/dashboard");
    }
  }, [fantaLoading, currentFanta, isValidForFanta, router]);

  const [editRounds, setEditRounds] = useState<PickemRound[]>([]);
  const [isSavingBracket, setIsSavingBracket] = useState(false);
  const [myPicks, setMyPicks] = useState<Record<string, string>>({});
  const [isSubmittingPrediction, setIsSubmittingPrediction] = useState(false);

  const myPrediction = pickemPredictions.find(
    (p) => p.userId === currentMember?.userId,
  );

  // Precarica l'editor admin con il bracket già salvato (se c'è) e il
  // proprio pronostico già inviato (se c'è) — solo al cambio lega/bracket,
  // non ad ogni render, altrimenti sovrascriverebbe le modifiche in corso.
  useEffect(() => {
    setEditRounds(pickemBracket?.rounds || []);
  }, [pickemBracket, currentFanta?.id]);

  useEffect(() => {
    setMyPicks(myPrediction?.picks || {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPrediction?.submittedAt, currentFanta?.id]);

  const addRound = () => setEditRounds((prev) => [...prev, emptyRound()]);
  const removeRound = (index: number) =>
    setEditRounds((prev) => prev.filter((_, i) => i !== index));
  const updateRound = (index: number, patch: Partial<PickemRound>) =>
    setEditRounds((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  const addMatch = (roundIndex: number) =>
    setEditRounds((prev) =>
      prev.map((r, i) =>
        i === roundIndex
          ? {
              ...r,
              matches: [
                ...r.matches,
                { id: crypto.randomUUID(), teamA: "", teamB: "" },
              ],
            }
          : r,
      ),
    );
  const removeMatch = (roundIndex: number, matchId: string) =>
    setEditRounds((prev) =>
      prev.map((r, i) =>
        i === roundIndex
          ? { ...r, matches: r.matches.filter((m) => m.id !== matchId) }
          : r,
      ),
    );
  const updateMatch = (
    roundIndex: number,
    matchId: string,
    patch: { teamA?: string; teamB?: string },
  ) =>
    setEditRounds((prev) =>
      prev.map((r, i) =>
        i === roundIndex
          ? {
              ...r,
              matches: r.matches.map((m) =>
                m.id === matchId ? { ...m, ...patch } : m,
              ),
            }
          : r,
      ),
    );

  const canSaveBracket = editRounds.every(
    (r) =>
      r.name.trim() &&
      r.matches.length > 0 &&
      r.matches.every((m) => m.teamA.trim() && m.teamB.trim()),
  );

  const handleSaveBracket = async () => {
    setIsSavingBracket(true);
    try {
      await savePickemBracket(editRounds);
      toast.success("Bracket Pick'em salvato");
    } catch (error) {
      console.error("Errore nel salvataggio del bracket Pick'em:", error);
      toast.error("Errore nel salvataggio del bracket");
    } finally {
      setIsSavingBracket(false);
    }
  };

  const handleToggleLock = async () => {
    if (!pickemBracket) return;
    try {
      await setPickemLocked(!pickemBracket.locked);
      toast.success(
        pickemBracket.locked
          ? "Pronostici sbloccati"
          : "Pronostici bloccati: nessuno può più modificarli",
      );
    } catch (error) {
      console.error("Errore nel blocco/sblocco pronostici:", error);
      toast.error("Errore, riprova");
    }
  };

  const canSubmitPrediction =
    !!pickemBracket &&
    !pickemBracket.locked &&
    pickemBracket.rounds.every((r) => r.matches.every((m) => myPicks[m.id]));

  const handleSubmitPrediction = async () => {
    setIsSubmittingPrediction(true);
    try {
      await submitPickemPrediction(myPicks);
      toast.success("Pronostico inviato");
    } catch (error) {
      console.error("Errore nell'invio del pronostico:", error);
      toast.error("Errore nell'invio del pronostico");
    } finally {
      setIsSubmittingPrediction(false);
    }
  };

  const leaderboard = fantaMembers
    .map((m) => ({
      userId: m.userId,
      name: m.name,
      points: getPickemPoints(m.userId),
      hasPrediction: pickemPredictions.some((p) => p.userId === m.userId),
    }))
    .sort((a, b) => b.points - a.points);

  if (fantaLoading || !currentFanta || !isValidForFanta) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Pick&apos;em</h1>
        <p className="text-muted-foreground mt-2">
          {currentFanta?.name} — pronostica il vincitore di ogni scontro del
          bracket a eliminazione diretta. Niente play-in/gironi: si parte da
          dove l&apos;admin ha impostato il bracket.
        </p>
      </div>

      {isFantaViceOrAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">
              Gestione Bracket (admin/vice)
            </CardTitle>
            <CardDescription>
              Round, scontri e punti per pronostico corretto in ogni round.
              Salvare sostituisce l&apos;intero bracket — gli id dei match già
              esistenti restano invariati, i pronostici già inviati per quei
              match restano validi.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pickemBracket && (
              <div className="flex items-center justify-between rounded-md border border-border bg-raised/50 p-3">
                <div>
                  <p className="font-medium text-foreground">
                    {pickemBracket.locked
                      ? "Pronostici bloccati"
                      : "Pronostici aperti"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {pickemBracket.locked
                      ? "Nessun membro può più inviare o modificare il proprio pronostico"
                      : "I membri possono ancora inviare o modificare il pronostico"}
                  </p>
                </div>
                <Button
                  variant={pickemBracket.locked ? "outline" : "default"}
                  onClick={handleToggleLock}
                >
                  {pickemBracket.locked ? "Sblocca" : "Blocca Pronostici"}
                </Button>
              </div>
            )}

            {editRounds.map((round, roundIndex) => (
              <div
                key={roundIndex}
                className="space-y-3 rounded-md border border-border p-4"
              >
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label>Nome Round</Label>
                    <Input
                      value={round.name}
                      onChange={(e) =>
                        updateRound(roundIndex, { name: e.target.value })
                      }
                      placeholder="Es: Quarti, Semifinali, Finale"
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label>Punti</Label>
                    <Input
                      type="number"
                      min={1}
                      value={round.points}
                      onChange={(e) =>
                        updateRound(roundIndex, {
                          points: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRound(roundIndex)}
                    aria-label="Rimuovi round"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  {round.matches.map((match) => (
                    <div key={match.id} className="flex items-center gap-2">
                      <Input
                        value={match.teamA}
                        onChange={(e) =>
                          updateMatch(roundIndex, match.id, {
                            teamA: e.target.value,
                          })
                        }
                        placeholder="Squadra A"
                      />
                      <span className="text-muted-foreground text-sm">vs</span>
                      <Input
                        value={match.teamB}
                        onChange={(e) =>
                          updateMatch(roundIndex, match.id, {
                            teamB: e.target.value,
                          })
                        }
                        placeholder="Squadra B"
                      />
                      {pickemBracket && (
                        <Select
                          value={match.winner || ""}
                          onValueChange={(winner) =>
                            setPickemMatchWinner(roundIndex, match.id, winner)
                          }
                        >
                          <SelectTrigger className="w-40 shrink-0">
                            <SelectValue placeholder="Vincitore" />
                          </SelectTrigger>
                          <SelectContent>
                            {match.teamA && (
                              <SelectItem value={match.teamA}>
                                {match.teamA}
                              </SelectItem>
                            )}
                            {match.teamB && (
                              <SelectItem value={match.teamB}>
                                {match.teamB}
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMatch(roundIndex, match.id)}
                        aria-label="Rimuovi scontro"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addMatch(roundIndex)}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Aggiungi Scontro
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex gap-2">
              <Button variant="outline" onClick={addRound}>
                <Plus className="w-4 h-4 mr-1" />
                Aggiungi Round
              </Button>
              <Button
                onClick={handleSaveBracket}
                disabled={!canSaveBracket || isSavingBracket}
              >
                {isSavingBracket ? "Salvataggio..." : "Salva Bracket"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {pickemBracket && pickemBracket.rounds.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Il tuo pronostico</CardTitle>
            <CardDescription>
              {pickemBracket.locked
                ? "Pronostici bloccati: questo è quello che hai inviato."
                : "Scegli il vincitore di ogni scontro, poi invia."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pickemBracket.rounds.map((round, roundIndex) => (
              <div key={roundIndex} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">
                    {round.name || `Round ${roundIndex + 1}`}
                  </h3>
                  <Badge variant="secondary">{round.points} pt</Badge>
                </div>
                {round.matches.map((match) => (
                  <div
                    key={match.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border p-3"
                  >
                    <span className="text-sm text-foreground">
                      {match.teamA} vs {match.teamB}
                    </span>
                    <div className="flex items-center gap-2">
                      {match.winner && (
                        <Badge variant="outline">Vinta: {match.winner}</Badge>
                      )}
                      <Select
                        value={myPicks[match.id] || ""}
                        onValueChange={(winner) =>
                          setMyPicks((prev) => ({
                            ...prev,
                            [match.id]: winner,
                          }))
                        }
                        disabled={pickemBracket.locked}
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue placeholder="Il tuo pronostico" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={match.teamA}>
                            {match.teamA}
                          </SelectItem>
                          <SelectItem value={match.teamB}>
                            {match.teamB}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {!pickemBracket.locked && (
              <Button
                onClick={handleSubmitPrediction}
                disabled={!canSubmitPrediction || isSubmittingPrediction}
                className="w-full"
              >
                {isSubmittingPrediction
                  ? "Invio..."
                  : myPrediction
                    ? "Aggiorna Pronostico"
                    : "Invia Pronostico"}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        !isFantaViceOrAdmin && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              L&apos;admin non ha ancora impostato il bracket Pick&apos;em per
              questa lega.
            </CardContent>
          </Card>
        )
      )}

      {pickemBracket && (
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Classifica Pick&apos;em</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {leaderboard.map((entry, index) => (
                <div
                  key={entry.userId}
                  className={`flex items-center justify-between p-3 rounded-lg border border-border ${
                    entry.userId === user?.id ? "bg-raised/50" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-5">
                      {index + 1}
                    </span>
                    <span className="font-medium text-foreground">
                      {entry.name}
                    </span>
                    {!entry.hasPrediction && (
                      <Badge variant="outline" className="text-xs">
                        Nessun pronostico
                      </Badge>
                    )}
                  </div>
                  <span className="font-semibold text-foreground">
                    {entry.points} pt
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
