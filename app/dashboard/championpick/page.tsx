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
import { buildPickBanRounds } from "@/lib/pickBanRounds";
import {
  CHAMPION_BAN_CIRCUIT_POINTS,
  CHAMPION_BAN_TEAM_POINTS,
  CHAMPION_PICK_RARITY_POINTS,
  CHAMPION_PICK_WIN_BONUS,
} from "@/lib/championPickScoring";
import type { ChampionPick } from "@/types";
import { LEAGUEPEDIA_UNAVAILABLE } from "@/lib/leaguepediaApi";

// Dettaglio punti di un pick chiuso; null per i turni chiusi prima del
// 6/10 (vecchia regola, solo il totale) o non ancora calcolati.
function pointsBreakdown(pick: ChampionPick): string | null {
  if (pick.pickPoints === undefined) return null;
  const parts = [`pick ${pick.pickPoints}`];
  if (pick.winBonus) parts.push(`vittoria +${pick.winBonus}`);
  if (pick.banScope === "team") parts.push(`ban squadra ${pick.banPoints ?? 0}`);
  if (pick.banScope === "circuit") parts.push(`ban circuito ${pick.banPoints ?? 0}`);
  return parts.join(" · ");
}

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
    bracketRounds,
    championPickRounds,
    championPicks,
    submitChampionPick,
    closeChampionPickRound,
    getMemberName,
  } = useFanta();

  // Pick/Ban vale per ogni lega LoL, Mondiali/MSI compresi (11/10): se
  // si cambia "Lega Attiva" verso una lega personalizzata mentre si è su
  // questa pagina, rimanda alla dashboard (bug segnalato, 2/10).
  const isValidForFanta = !!currentFanta && currentFanta.sportType === "lol";

  useEffect(() => {
    if (!fantaLoading && currentFanta && !isValidForFanta) {
      router.push("/dashboard");
    }
  }, [fantaLoading, currentFanta, isValidForFanta, router]);

  const [draftChampion, setDraftChampion] = useState<Record<string, string>>({});
  const [draftBan, setDraftBan] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState<string | null>(null);

  // Turni: calendario normale, oppure gironi e tabellone nelle leghe
  // Mondiali/MSI (lib/pickBanRounds.ts).
  const rounds = buildPickBanRounds(calendar, bracketRounds);

  // Squadra pro in rosa (pick "team"): il ban si scommette su di lei.
  const myTeamName = currentMember?.team?.find((t) => t.pickType === "team")?.playerName;

  // Stato temporale dei turni (9/10). Si sceglie solo nel turno in corso
  // o nel prossimo: prima tutti i turni futuri mostravano il form (5 form
  // aperti insieme) e, soprattutto, un turno già finito ma non ancora
  // chiuso accettava ancora scelte, cioè a risultati noti. "Chiudi Turno"
  // compare solo a turno finito: chiuderlo prima calcolava punti su
  // partite non ancora giocate. Solo UI: le regole Firestore non
  // conoscono le date dei turni (vedi REVIEW.md).
  const now = Date.now();
  const nextUpcomingId = rounds.find((r) => r.startDate.getTime() > now)?.id;
  const roundTiming = (round: (typeof rounds)[number]) => {
    const ended = now >= round.endDate.getTime();
    const started = now >= round.startDate.getTime();
    return {
      ended,
      canPick: !ended && (started || round.id === nextUpcomingId),
      farFuture: !started && round.id !== nextUpcomingId,
    };
  };

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
      await submitChampionPick(roundId, championName, draftBan[roundId]);
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
      if (error instanceof Error && error.message === "NO_GAMES") {
        toast.error(
          "Turno chiuso ma nessuna partita trovata su Leaguepedia (rate limit o settimana senza partite): punti non assegnati, riprova con Ricalcola Punti",
        );
      } else if (error instanceof Error && error.message === LEAGUEPEDIA_UNAVAILABLE) {
        toast.error(
          "Turno chiuso ma Leaguepedia non risponde (rate limit o errore): punti non assegnati, riprova con Ricalcola Punti",
        );
      } else {
        toast.error("Errore nella chiusura, riprova");
      }
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
          {currentFanta?.name} — ogni turno scegli un campione che verrà
          pickato in almeno una partita pro reale della settimana, e
          (facoltativo) uno che verrà bannato dalla tua squadra.
        </p>
        <ul className="text-sm text-muted-foreground mt-2 list-disc pl-5 space-y-1">
          <li>
            Pick indovinato: {CHAMPION_PICK_RARITY_POINTS.solo} pt se sei
            l&apos;unico ad averlo scelto, {CHAMPION_PICK_RARITY_POINTS.pair}{" "}
            se siete in due, {CHAMPION_PICK_RARITY_POINTS.crowd} se siete in
            tre o più. Rischiare fuori meta paga.
          </li>
          <li>
            +{CHAMPION_PICK_WIN_BONUS} se è stato giocato da una squadra che
            ha vinto la partita.
          </li>
          <li>
            Ban indovinato: +{CHAMPION_BAN_TEAM_POINTS} se lo banna la
            squadra pro che hai in rosa; +{CHAMPION_BAN_CIRCUIT_POINTS} se
            basta che lo banni chiunque nel circuito (succede se non hai
            una squadra in rosa o se la tua non gioca quella settimana).
          </li>
        </ul>
      </div>

      {rounds.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nessun turno ancora generato. Serve prima il calendario
            (Classifica → Genera Calendario, o Genera Gironi per Mondiali e
            MSI).
          </CardContent>
        </Card>
      ) : (
        rounds.map((round) => {
          const closed = isRoundClosed(round.id);
          const myPick = myPickFor(round.id);
          const roundPicks = championPicks.filter((p) => p.roundId === round.id);
          const { ended, canPick, farFuture } = roundTiming(round);

          if (farFuture && !closed) {
            return (
              <div
                key={round.id}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm"
              >
                <span className="font-medium text-foreground">
                  {round.label}
                </span>
                <span className="text-muted-foreground">
                  dal {round.startDate.toLocaleDateString("it-IT")}
                </span>
              </div>
            );
          }

          return (
            <Card key={round.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-foreground">
                    {round.label}
                  </CardTitle>
                  <Badge
                    variant={closed ? "outline" : ended ? "secondary" : "success"}
                  >
                    {closed ? "Chiuso" : ended ? "Da chiudere" : "Aperto"}
                  </Badge>
                </div>
                <CardDescription>
                  {round.startDate.toLocaleDateString("it-IT")} —{" "}
                  {round.endDate.toLocaleDateString("it-IT")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!closed && !myPick && canPick && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
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
                    <div className="flex-1 space-y-1">
                      <Label htmlFor={`ban-${round.id}`}>
                        {myTeamName
                          ? `Ban di ${myTeamName} (facoltativo)`
                          : "Ban nel circuito (facoltativo, non hai una squadra in rosa)"}
                      </Label>
                      <Input
                        id={`ban-${round.id}`}
                        value={draftBan[round.id] || ""}
                        onChange={(e) =>
                          setDraftBan((prev) => ({
                            ...prev,
                            [round.id]: e.target.value,
                          }))
                        }
                        placeholder="Es: Rumble"
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
                    Hai scelto <strong>{myPick.championName}</strong>
                    {myPick.banChampionName && (
                      <>
                        {" "}con ban <strong>{myPick.banChampionName}</strong>
                      </>
                    )}{" "}
                    per questo turno — non modificabile, e nascosto agli
                    altri finché il turno non chiude.
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
                              {pick.banChampionName &&
                                ` · ban ${pick.banChampionName}`}
                            </span>
                            {pointsBreakdown(pick) && (
                              <span className="block text-xs text-muted-foreground">
                                {pointsBreakdown(pick)}
                              </span>
                            )}
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

                {/* Anche a turno chiuso: se Leaguepedia era in rate limit
                    alla chiusura i punti non sono stati assegnati, e si
                    rilancia lo stesso calcolo (le scelte restano quelle). */}
                {!closed && !myPick && ended && (
                  <p className="text-sm text-muted-foreground">
                    Turno finito: non si possono più fare scelte.
                  </p>
                )}

                {isFantaViceOrAdmin && (closed || ended) && (
                  <Button
                    variant="outline"
                    onClick={() => handleClose(round.id)}
                    disabled={isClosing === round.id}
                  >
                    {isClosing === round.id
                      ? closed
                        ? "Ricalcolo..."
                        : "Chiusura..."
                      : closed
                        ? "Ricalcola Punti"
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
