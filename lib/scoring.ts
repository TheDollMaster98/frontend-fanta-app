import type { RoleScoringWeights, TeamPick, TeamScoringWeights } from "@/types";
import type { FantasyPlayerStats, FantasyTeamStats } from "@/lib/leaguepediaApi";
import { toLolRole } from "@/lib/constants";

// Statistiche Leaguepedia del pick: giocatore per player/jolly, squadra
// per team, squadra allenata per coach. undefined se il pick non è tra i
// nomi interrogati.
function statsForPick(
  pick: TeamPick,
  playerStats: Record<string, FantasyPlayerStats>,
  teamStats: Record<string, FantasyTeamStats>,
): FantasyPlayerStats | FantasyTeamStats | undefined {
  if (pick.pickType === "player" || pick.pickType === "jolly") {
    return playerStats[pick.playerName];
  }
  if (pick.pickType === "team") return teamStats[pick.playerName];
  if (pick.pickType === "coach" && pick.playerTeam) return teamStats[pick.playerTeam];
  return undefined;
}

/** Partite Leaguepedia dietro i punti automatici di un pick (0 se nessuna). */
export function autoGamesPlayed(
  pick: TeamPick,
  playerStats: Record<string, FantasyPlayerStats>,
  teamStats: Record<string, FantasyTeamStats>,
): number {
  return statsForPick(pick, playerStats, teamStats)?.gamesPlayed ?? 0;
}

export function playerPoints(
  s: Pick<
    FantasyPlayerStats,
    "kills" | "deaths" | "assists" | "wins" | "cs" | "visionScore" | "pentakills"
  >,
  w: RoleScoringWeights[string],
): number {
  return (
    s.kills * w.kills +
    s.deaths * w.deaths +
    s.assists * w.assists +
    s.wins * w.win +
    (s.cs / 50) * w.csPer50 +
    (s.visionScore / 10) * w.visionPer10 +
    s.pentakills * w.pentakill
  );
}

export function teamPoints(
  s: Omit<FantasyTeamStats, "gamesPlayed">,
  w: TeamScoringWeights,
): number {
  return (
    s.wins * w.win +
    s.towers * w.tower +
    s.dragons * w.dragon +
    s.voidGrubs * w.voidGrub +
    s.riftHeralds * w.riftHerald +
    s.inhibitors * w.inhibitor +
    s.atakhans * w.atakhan +
    s.barons * w.baron +
    s.kills * w.kill +
    s.deaths * w.death +
    s.assists * w.assist +
    (s.cs / 100) * w.csPer100 +
    (s.gold / 10000) * w.goldPer10k
  );
}

/**
 * Punti automatici di un pick da statistiche Leaguepedia già aggregate,
 * con tutti i pesi della lega (10/10: prima solo kill/morti/assist/
 * vittoria, CS/Vision/pentakill e obiettivi erano salvati ma ignorati).
 * Stessa formula per il totale cumulativo (TeamPick.points) e per il
 * punteggio di un turno (stesse stats filtrate per data). undefined se il
 * pick non ha dati (nome non interrogato o ruolo senza pesi).
 */
export function computeAutoPoints(
  pick: TeamPick,
  playerStats: Record<string, FantasyPlayerStats>,
  teamStats: Record<string, FantasyTeamStats>,
  roleWeights: RoleScoringWeights,
  teamWeights: TeamScoringWeights,
): number | undefined {
  if (pick.pickType === "player" || pick.pickType === "jolly") {
    const s = playerStats[pick.playerName];
    // toLolRole: anche le pick salvate prima della conversione dei ruoli
    // Leaguepedia ("Mid", "Bot"...) trovano i pesi giusti.
    const role = toLolRole(pick.playerRole);
    const weights = role ? roleWeights[role] : undefined;
    if (!s || !weights) return undefined;
    return playerPoints(s, weights);
  }

  if (pick.pickType === "team" || pick.pickType === "coach") {
    const s = statsForPick(pick, playerStats, teamStats) as FantasyTeamStats | undefined;
    return s ? teamPoints(s, teamWeights) : undefined;
  }

  return undefined;
}

/**
 * Bonus punti da statistiche inserite a mano (CS/Vision Score/Pentakill per
 * player-jolly, obiettivi/CS/oro per team-coach). Dal 10/10 le stesse
 * statistiche arrivano in automatico da Leaguepedia, quindi il bonus vale
 * solo come ripiego per un pick senza partite trovate (vedi
 * manualBonusApplies): altrimenti si conterebbero due volte.
 */
export function computeManualBonus(
  pick: TeamPick,
  roleWeights: RoleScoringWeights,
  teamWeights: TeamScoringWeights,
): number {
  if (pick.pickType === "player" || pick.pickType === "jolly") {
    // toLolRole: anche le pick salvate prima della conversione dei ruoli
    // Leaguepedia ("Mid", "Bot"...) trovano i pesi giusti.
    const role = toLolRole(pick.playerRole);
    const weights = role ? roleWeights[role] : undefined;
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
 * (da statistiche inserite a mano, solo se Leaguepedia non ha partite). Arrotondato a 2 decimali per non
 * mostrare cifre inutili in UI.
 */
export function manualBonusApplies(pick: TeamPick): boolean {
  return !pick.autoGames;
}

export function totalPickPoints(
  pick: TeamPick,
  roleWeights: RoleScoringWeights,
  teamWeights: TeamScoringWeights,
): number {
  const manual = manualBonusApplies(pick)
    ? computeManualBonus(pick, roleWeights, teamWeights)
    : 0;
  const total = (pick.points || 0) + manual;
  return Math.round(total * 100) / 100;
}
