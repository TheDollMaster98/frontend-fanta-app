import type { BracketMatch, CalendarRound, FantaGroup } from "@/types";

/**
 * Classifica dei membri di un gruppo nella fase a gironi: vittorie nelle
 * fixture del proprio girone (round.groupId === group.id), poi punti fatti
 * nel girone, poi il punteggio cumulativo totale come ultimo spareggio.
 * Usata sia da FantaContext.generateBracket (per scegliere i qualificati)
 * sia dalla UI (per mostrare la stessa classifica agli utenti) — un'unica
 * fonte, per non rischiare che le due finiscano a mostrare ordini diversi.
 */
export function rankGroupMembers(
  group: FantaGroup,
  calendar: CalendarRound[],
  cumulativePoints: Map<string, number>,
): string[] {
  const groupRounds = calendar.filter((round) => round.groupId === group.id);

  const statsFor = (userId: string) => {
    let wins = 0;
    let pointsFor = 0;
    groupRounds.forEach((round) => {
      round.fixtures.forEach((f) => {
        if (f.homeUserId === userId) {
          pointsFor += f.homePoints ?? 0;
          // Turno di riposo (bye, awayUserId null): i punti fatti contano
          // (con un numero dispari di membri ognuno ha esattamente un bye,
          // quindi è simmetrico), ma non è una vittoria — prima lo era
          // appena si faceva più di 0 punti (code review, 8/10).
          if (f.awayUserId && (f.homePoints ?? 0) > (f.awayPoints ?? 0)) wins += 1;
        } else if (f.awayUserId === userId) {
          pointsFor += f.awayPoints ?? 0;
          if ((f.awayPoints ?? 0) > (f.homePoints ?? 0)) wins += 1;
        }
      });
    });
    return { wins, pointsFor };
  };

  return [...group.memberIds].sort((a, b) => {
    const statsA = statsFor(a);
    const statsB = statsFor(b);
    if (statsB.wins !== statsA.wins) return statsB.wins - statsA.wins;
    if (statsB.pointsFor !== statsA.pointsFor) return statsB.pointsFor - statsA.pointsFor;
    return (cumulativePoints.get(b) ?? 0) - (cumulativePoints.get(a) ?? 0);
  });
}

/**
 * Ordine di seeding standard di un tabellone a eliminazione diretta a
 * `size` slot (potenza di 2): per size=8 restituisce [1,8,4,5,2,7,3,6],
 * l'ordine classico che accoppia il seed 1 col peggiore (8), il 2 col
 * penultimo (7), ecc., mantenendo i seed migliori il più lontano possibile
 * tra loro nei turni successivi. Ricorsivo: dimezza il tabellone, calcola
 * l'ordine della metà, poi specchia ogni seed s in (size + 1 - s).
 */
function seedOrder(size: number): number[] {
  if (size <= 1) return [1];
  const half = seedOrder(size / 2);
  const result: number[] = [];
  half.forEach((s) => {
    result.push(s);
    result.push(size + 1 - s);
  });
  return result;
}

/**
 * Costruisce il primo turno del tabellone dai qualificati, già ordinati dal
 * migliore al peggiore (seed 1 = rankedUserIds[0]). Se il numero di
 * qualificati non è una potenza di 2, i seed mancanti (bracketSize - n)
 * diventano "bye": grazie a seedOrder, i bye finiscono sempre contro i seed
 * migliori, che passano così il turno senza giocare (winnerUserId già
 * impostato, l'altro slot resta null).
 */
export function seedFirstRound(rankedUserIds: string[]): BracketMatch[] {
  const n = rankedUserIds.length;
  if (n < 2) return [];

  const bracketSize = 2 ** Math.ceil(Math.log2(n));
  const order = seedOrder(bracketSize);
  const seedToUser = (seed: number): string | null =>
    seed <= n ? rankedUserIds[seed - 1] : null;

  const matches: BracketMatch[] = [];
  for (let i = 0; i < order.length; i += 2) {
    const homeUserId = seedToUser(order[i]);
    const awayUserId = seedToUser(order[i + 1]);
    const winnerUserId =
      homeUserId && !awayUserId
        ? homeUserId
        : awayUserId && !homeUserId
          ? awayUserId
          : undefined;
    matches.push({
      matchIndex: i / 2,
      homeUserId,
      awayUserId,
      ...(winnerUserId ? { winnerUserId } : {}),
    });
  }
  return matches;
}

/** True se ogni match del turno ha un vincitore (giocato o bye). */
export function isRoundComplete(matches: BracketMatch[]): boolean {
  return matches.length > 0 && matches.every((m) => Boolean(m.winnerUserId));
}

/**
 * Costruisce il turno successivo accoppiando i vincitori del turno appena
 * concluso (match 0 e 1 -> nuovo match 0, match 2 e 3 -> nuovo match 1,
 * ...). Va chiamata solo quando isRoundComplete(prevMatches) è true.
 * Restituisce [] se prevMatches aveva un solo match (era già la finale).
 */
export function nextRoundFromWinners(prevMatches: BracketMatch[]): BracketMatch[] {
  if (prevMatches.length <= 1) return [];
  const sorted = [...prevMatches].sort((a, b) => a.matchIndex - b.matchIndex);
  const winners = sorted.map((m) => m.winnerUserId ?? null);
  const matches: BracketMatch[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    const homeUserId = winners[i];
    const awayUserId = winners[i + 1] ?? null;
    const winnerUserId =
      homeUserId && !awayUserId
        ? homeUserId
        : awayUserId && !homeUserId
          ? awayUserId
          : undefined;
    matches.push({
      matchIndex: i / 2,
      homeUserId,
      awayUserId,
      ...(winnerUserId ? { winnerUserId } : {}),
    });
  }
  return matches;
}

// Nome di un turno del tabellone dal numero di match (11/10): "Turno 2"
// non diceva quanto mancava alla fine.
export function bracketRoundName(matchCount: number, roundIndex: number): string {
  if (matchCount === 1) return "Finale";
  if (matchCount === 2) return "Semifinali";
  if (matchCount === 4) return "Quarti di finale";
  if (matchCount === 8) return "Ottavi di finale";
  return `Turno ${roundIndex + 1}`;
}

/**
 * Qualificati dei gironi in ordine di seed: i primi `qualifiersPerGroup`
 * di ogni gruppo, interlacciati (1° A, 1° B, ..., 2° A, 2° B, ...) così
 * che chi viene dallo stesso gruppo si incontri il più tardi possibile.
 * Usata dalla generazione a mano (FantaContext.generateBracket) e da
 * quella automatica a fine gironi (lib/recalc.ts): stesso risultato.
 */
export function seedsFromGroups(
  groups: FantaGroup[],
  calendar: CalendarRound[],
  cumulativePoints: Map<string, number>,
  qualifiersPerGroup: number,
): string[] {
  const qualifiersByGroup = groups.map((group) =>
    rankGroupMembers(group, calendar, cumulativePoints).slice(0, qualifiersPerGroup),
  );
  const seeds: string[] = [];
  for (let rank = 0; rank < qualifiersPerGroup; rank++) {
    qualifiersByGroup.forEach((qualifiers) => {
      if (qualifiers[rank]) seeds.push(qualifiers[rank]);
    });
  }
  return seeds;
}
