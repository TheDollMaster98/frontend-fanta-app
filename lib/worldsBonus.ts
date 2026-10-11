import type { PickemBracket, PickemPrediction } from "@/types";

// Bonus Mondiali (11/10, decisione: "così la gente non si lamenta"): nelle
// leghe WORLDS/MSI i punti di Pick/Ban e Pick'em si sommano ai punti fantasy
// del turno, nei gironi e nel tabellone. Prima erano classifiche a parte e
// chi pronosticava bene non ne ricavava niente per vincere la lega.
// - Pick/Ban: i punti del turno Pick/Ban che corrisponde al turno
//   (lib/pickBanRounds.ts), solo a turno Pick/Ban chiuso (prima non ci
//   sono punti).
// - Pick'em: i punti dei pronostici giusti sui match veri il cui vincitore
//   è stato inserito dentro la finestra del turno (PickemMatch.decidedAt).

export interface WorldsBonusData {
  championPicks: { roundId: string; userId: string; points?: number }[];
  closedPickBanRounds: Set<string>;
  pickemBracket: PickemBracket | null;
  pickemPredictions: PickemPrediction[];
}

export function pickemPointsInWindow(
  data: WorldsBonusData,
  userId: string,
  window: { start: Date; end: Date },
): number {
  const prediction = data.pickemPredictions.find((p) => p.userId === userId);
  if (!data.pickemBracket || !prediction) return 0;
  const start = window.start.getTime();
  const end = window.end.getTime();
  return data.pickemBracket.rounds.reduce(
    (total, round) =>
      total +
      round.matches.reduce((sum, match) => {
        if (!match.winner || match.decidedAt === undefined) return sum;
        if (match.decidedAt < start || match.decidedAt >= end) return sum;
        return prediction.picks[match.id] === match.winner ? sum + round.points : sum;
      }, 0),
    0,
  );
}

export function pickBanPoints(
  data: WorldsBonusData,
  userId: string,
  pickBanRoundId: string | undefined,
): number {
  if (!pickBanRoundId || !data.closedPickBanRounds.has(pickBanRoundId)) return 0;
  const pick = data.championPicks.find(
    (p) => p.roundId === pickBanRoundId && p.userId === userId,
  );
  return pick?.points || 0;
}

export function worldsBonus(
  data: WorldsBonusData,
  userId: string,
  pickBanRoundId: string | undefined,
  window: { start: Date; end: Date },
): number {
  return (
    pickBanPoints(data, userId, pickBanRoundId) + pickemPointsInWindow(data, userId, window)
  );
}
