import type { RoleScoringWeights, TeamPick, TeamScoringWeights } from "@/types";

/**
 * Bonus punti da statistiche inserite a mano (CS/Vision Score/Pentakill per
 * player-jolly, obiettivi/CS/oro per team-coach): copre quello che il
 * calcolo automatico da Leaguepedia non sa ancora fare (nomi campo non
 * confermati per queste statistiche — vedi ScoringWeights/
 * TeamScoringWeights in types/index.ts). Si somma a TeamPick.points, che
 * resta solo kill/morti/assist/vittoria calcolati da recalculateScores.
 */
export function computeManualBonus(
  pick: TeamPick,
  roleWeights: RoleScoringWeights,
  teamWeights: TeamScoringWeights,
): number {
  if (pick.pickType === "player" || pick.pickType === "jolly") {
    const weights = pick.playerRole ? roleWeights[pick.playerRole] : undefined;
    const stats = pick.manualPlayerStats;
    if (!weights || !stats) return 0;
    return (
      ((stats.cs || 0) / 50) * weights.csPer50 +
      ((stats.visionScore || 0) / 10) * weights.visionPer10 +
      (stats.pentakills || 0) * weights.pentakill
    );
  }

  if (pick.pickType === "team" || pick.pickType === "coach") {
    const stats = pick.manualTeamStats;
    if (!stats) return 0;
    return (
      (stats.towers || 0) * teamWeights.tower +
      (stats.dragons || 0) * teamWeights.dragon +
      (stats.voidGrubs || 0) * teamWeights.voidGrub +
      (stats.riftHeralds || 0) * teamWeights.riftHerald +
      (stats.inhibitors || 0) * teamWeights.inhibitor +
      (stats.atakhans || 0) * teamWeights.atakhan +
      (stats.barons || 0) * teamWeights.baron +
      ((stats.cs || 0) / 100) * teamWeights.csPer100 +
      ((stats.gold || 0) / 10000) * teamWeights.goldPer10k
    );
  }

  return 0;
}

/**
 * Punti totali di un pick: automatici (points, da Leaguepedia) + manuali
 * (da statistiche inserite a mano). Arrotondato a 2 decimali per non
 * mostrare cifre inutili in UI.
 */
export function totalPickPoints(
  pick: TeamPick,
  roleWeights: RoleScoringWeights,
  teamWeights: TeamScoringWeights,
): number {
  const total = (pick.points || 0) + computeManualBonus(pick, roleWeights, teamWeights);
  return Math.round(total * 100) / 100;
}
