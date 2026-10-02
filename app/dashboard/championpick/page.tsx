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
import { toast } from "sonner";
import { useFanta } from "@/contexts/FantaContext";
import { useAuth } from "@/contexts/AuthContext";
import { PLAYOFF_CIRCUITS } from "@/lib/constants";

export default function ChampionPickPage() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    currentFanta,
    isLoading: fantaLoading,
    fantaMembers,
    currentMember,
    isFantaViceOrAdmin,
    calendar,
    championPickRounds,
    championPicks,
    submitChampionPick,
    closeChampionPickRound,
    getMemberName,
  } = useFanta();

  // Pick/Ban ha senso solo per leghe lol SENZA circuito a eliminazione
  // (serve il calendario a girone, che WORLDS/MSI non hanno): se si
  // cambia "Lega Attiva" verso una lega dove non si applica mentre si è
  // su questa pagina, rimanda alla dashboard (bug segnalato, 2/10).
  const isValidForFanta =
    !!currentFanta &&
    currentFanta.sportType === "lol" &&
    !PLAYOFF_CIRCUITS.includes(currentFanta.settings.circuitType || "");

  useEffect(() => {
    if (!fantaLoading && currentFanta && !isValidForFanta) {
      router.push("/dashboard");
    }
  }, [fantaLoading, currentFanta, isValidForFanta, router]);

  const [draftChampion, setDraftChampion] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState<string | null>(null);

  // Solo i turni di un girone normale (niente groupId): la fase a gironi/
  // bracket dei circuiti a eliminazione non ha questo concetto di "turno
  // settimanale" a cui agganciare il pick campione (vedi
  // types/championpick.types.ts).
  const rounds = calendar
    .filter((r) => !r.groupId)
    .sort((a, b) => a.roundNumber - b.roundNumber);

  const isRoundClosed = (roundId: string) =>
    !!championPickRounds.find((r) => r.roundId === roundId)?.closed;

  const myPickFor = (roundId: string) =>
    championPicks.find(
      (p) => p.roundId === roundId && p.userId === currentMember?.userId,
    );

  const handleSubmit = async (roundId: string) => {
    const championName = draftChampion[roundId]?.trim();
    if (!championName) return;
    setIsSubmitting(roundId);
    try {
      await submitChampionPick(roundId, championName);
      toast.success("Scelta inviata, nascosta agli altri finché il turno non chiude");
    } catch (error) {
      console.error("Errore nell'invio del pick campione:", error);
      toast.error("Errore nell'invio, riprova");
    } finally {
      setIsSubmitting(null);
    }
  };

  const handleClose = async (roundId: string) => {
    setIsClosing(roundId);
    try {
      await closeChampionPickRound(roundId);
      toast.success("Turno chiuso: scelte rivelate e punti calcolati");
    } catch (error) {
      console.error("Errore nella chiusura del turno:", error);
      toast.error("Errore nella chiusura, riprova");
    } finally {
      setIsClosing(null);
    }
  };

  if (fantaLoading || !currentFanta || !isValidForFanta) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Pick/Ban Campione</h1>
        <p className="text-muted-foreground mt-2">
          {currentFanta?.name} — scegli un campione ogni turno: 2 punti se
          viene pickato in almeno una partita pro reale di quella settimana
          (anche se in un&apos;altra partita è stato bannato), 0 se non
          viene mai scelto da nessuna squadra.
        </p>
      </div>

      {rounds.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nessun turno ancora generato. Serve prima un calendario a girone
            (Classifica → Genera Calendario).
          </CardContent>
        </Card>
      ) : (
        rounds.map((round) => {
          const closed = isRoundClosed(round.id);
          const myPick = myPickFor(round.id);
          const roundPicks = championPicks.filter((p) => p.roundId === round.id);

          return (
            <Card key={round.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-foreground">
                    Turno {round.roundNumber}
                  </CardTitle>
                  <Badge variant={closed ? "outline" : "default"}>
                    {closed ? "Chiuso" : "Aperto"}
                  </Badge>
                </div>
                <CardDescription>
                  {round.startDate.toLocaleDateString("it-IT")} —{" "}
                  {round.endDate.toLocaleDateString("it-IT")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!closed && !myPick && (
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor={`champ-${round.id}`}>
                        Il tuo campione per questo turno
                      </Label>
                      <Input
                        id={`champ-${round.id}`}
                        value={draftChampion[round.id] || ""}
                        onChange={(e) =>
                          setDraftChampion((prev) => ({
                            ...prev,
                            [round.id]: e.target.value,
                          }))
                        }
                        placeholder="Es: Ahri"
                      />
                    </div>
                    <Button
                      onClick={() => handleSubmit(round.id)}
                      disabled={
                        !draftChampion[round.id]?.trim() ||
                        isSubmitting === round.id
                      }
                    >
                      {isSubmitting === round.id ? "Invio..." : "Invia"}
                    </Button>
                  </div>
                )}

                {!closed && myPick && (
                  <p className="text-sm text-muted-foreground">
                    Hai scelto <strong>{myPick.championName}</strong> per
                    questo turno — non modificabile, e nascosto agli altri
                    finché il turno non chiude.
                  </p>
                )}

                {closed && (
                  <div className="space-y-1">
                    {roundPicks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nessuno ha fatto una scelta in questo turno.
                      </p>
                    ) : (
                      roundPicks.map((pick) => (
                        <div
                          key={pick.id}
                          className={`flex items-center justify-between rounded-md border border-border p-2 text-sm ${
                            pick.userId === user?.id ? "bg-raised/50" : ""
                          }`}
                        >
                          <span>
                            {getMemberName(pick.userId)} —{" "}
                            <span className="text-muted-foreground">
                              {pick.championName}
                            </span>
                          </span>
                          <Badge
                            variant={pick.points ? "default" : "outline"}
                          >
                            {pick.points ?? 0} pt
                          </Badge>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {isFantaViceOrAdmin && !closed && (
                  <Button
                    variant="outline"
                    onClick={() => handleClose(round.id)}
                    disabled={isClosing === round.id}
                  >
                    {isClosing === round.id
                      ? "Chiusura..."
                      : "Chiudi Turno e Calcola Punti"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {fantaMembers.length > 0 && championPicks.some((p) => p.points !== undefined) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">
              Classifica Pick/Ban Campione
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[...fantaMembers]
                .map((m) => ({
                  userId: m.userId,
                  name: m.name,
                  points: championPicks
                    .filter((p) => p.userId === m.userId)
                    .reduce((sum, p) => sum + (p.points || 0), 0),
                }))
                .sort((a, b) => b.points - a.points)
                .map((entry, index) => (
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
