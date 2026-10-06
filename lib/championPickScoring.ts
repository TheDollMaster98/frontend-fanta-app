import type { ChampionGame } from "@/lib/leaguepediaApi";
import type { ChampionPickBanScope } from "@/types";

// Punteggio del pick/ban campione settimanale (6/10). Pure functions,
// condivise tra FantaContext (chiusura turno) e UI (testo delle regole),
// così i numeri mostrati e quelli calcolati non si disallineano.
//
// Perché non più "+2 se pickato almeno una volta": su 10-20 partite a
// settimana un campione forte del meta è pickato quasi sempre, quindi
// tutti sceglievano lo stesso e prendevano tutti +2 — classifica piatta.
// Ora i punti del pick dipendono da quanti membri hanno scelto lo stesso
// campione nel turno (rischiare fuori meta paga), più un bonus vittoria,
// più una scommessa sul ban della propria squadra pro.

// Punti del pick per numero di membri che hanno scelto lo stesso
// campione nel turno: da solo 4, in due 2 a testa, in tre o più 1.
export const CHAMPION_PICK_RARITY_POINTS = { solo: 4, pair: 2, crowd: 1 };
// +1 se il campione è stato giocato da una squadra che ha vinto la
// partita, in almeno una partita della finestra (solo se pickato).
export const CHAMPION_PICK_WIN_BONUS = 1;
// Ban indovinato: +2 se è la squadra pro del membro (pick "team" in
// rosa) a bannarlo, +1 col ripiego sull'intero circuito — il ripiego
// scatta se il membro non ha una squadra in rosa o se la sua squadra non
// ha giocato nessuna partita nella finestra (altrimenti quel membro non
// potrebbe fare punti sul ban per motivi che non dipendono da lui).
// Vale meno perché indovinare un ban fisso del meta è facile.
export const CHAMPION_BAN_TEAM_POINTS = 2;
export const CHAMPION_BAN_CIRCUIT_POINTS = 1;

// "Kai'Sa", "kaisa", " KaiSa " → "kaisa": il nome è testo libero
// scritto dal membro, Leaguepedia usa la forma ufficiale con apostrofi/
// spazi/punti (Kai'Sa, Lee Sin, Dr. Mundo, Nunu & Willump).
export const normalizeChampionName = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface ChampionPickInput {
  id: string;
  userId: string;
  championName: string;
  banChampionName?: string;
}

export interface ChampionPickResult {
  points: number;
  pickPoints: number;
  winBonus: number;
  banPoints: number;
  banScope: ChampionPickBanScope;
}

export function computeChampionPickResults(
  picks: ChampionPickInput[],
  games: ChampionGame[],
  // userId → nome della squadra pro in rosa (pick "team"), se ce l'ha.
  memberTeams: Record<string, string | undefined>,
): Record<string, ChampionPickResult> {
  const picked = new Set<string>();
  const pickedByWinner = new Set<string>();
  const bannedAnywhere = new Set<string>();
  // nome squadra normalizzato → campioni bannati da quella squadra
  const bansByTeam = new Map<string, Set<string>>();
  const teamsThatPlayed = new Set<string>();

  const teamKey = (team: string) => team.trim().toLowerCase();

  games.forEach((game) => {
    const sides = [
      { team: game.team1, picks: game.team1Picks, bans: game.team1Bans, won: game.winner === 1 },
      { team: game.team2, picks: game.team2Picks, bans: game.team2Bans, won: game.winner === 2 },
    ];
    sides.forEach((side) => {
      const key = teamKey(side.team);
      if (key) teamsThatPlayed.add(key);
      side.picks.forEach((champ) => {
        const c = normalizeChampionName(champ);
        picked.add(c);
        if (side.won) pickedByWinner.add(c);
      });
      side.bans.forEach((champ) => {
        const c = normalizeChampionName(champ);
        bannedAnywhere.add(c);
        if (!key) return;
        if (!bansByTeam.has(key)) bansByTeam.set(key, new Set());
        bansByTeam.get(key)!.add(c);
      });
    });
  });

  const choiceCount = new Map<string, number>();
  picks.forEach((p) => {
    const c = normalizeChampionName(p.championName);
    if (c) choiceCount.set(c, (choiceCount.get(c) || 0) + 1);
  });

  const results: Record<string, ChampionPickResult> = {};
  picks.forEach((p) => {
    const champ = normalizeChampionName(p.championName);
    let pickPoints = 0;
    let winBonus = 0;
    if (champ && picked.has(champ)) {
      const count = choiceCount.get(champ) || 1;
      pickPoints =
        count === 1
          ? CHAMPION_PICK_RARITY_POINTS.solo
          : count === 2
            ? CHAMPION_PICK_RARITY_POINTS.pair
            : CHAMPION_PICK_RARITY_POINTS.crowd;
      if (pickedByWinner.has(champ)) winBonus = CHAMPION_PICK_WIN_BONUS;
    }

    const ban = normalizeChampionName(p.banChampionName || "");
    let banPoints = 0;
    let banScope: ChampionPickBanScope = "none";
    if (ban) {
      const team = memberTeams[p.userId];
      const key = team ? teamKey(team) : "";
      if (key && teamsThatPlayed.has(key)) {
        banScope = "team";
        if (bansByTeam.get(key)?.has(ban)) banPoints = CHAMPION_BAN_TEAM_POINTS;
      } else {
        banScope = "circuit";
        if (bannedAnywhere.has(ban)) banPoints = CHAMPION_BAN_CIRCUIT_POINTS;
      }
    }

    results[p.id] = {
      points: pickPoints + winBonus + banPoints,
      pickPoints,
      winBonus,
      banPoints,
      banScope,
    };
  });

  return results;
}
