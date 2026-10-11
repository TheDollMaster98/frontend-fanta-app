import type { PickemMatch, PickemRound } from "@/types";

// Pick'em come vero tabellone (11/10). Prima ogni scontro di ogni turno
// voleva le due squadre scritte a mano dall'admin, quindi semifinali e
// finale si potevano pronosticare solo dopo che erano note, cioè quasi
// mai prima del blocco. Ora uno scontro dei turni dopo il primo può
// restare senza squadre: le sue squadre sono i vincenti dei due scontri
// che lo alimentano nel turno prima (scontro j <- scontri 2j e 2j+1).
// Per il pronostico di un membro "vincente" vuol dire il suo pronostico;
// per il risultato vero, il vincitore inserito dall'admin.

export type FeederResolver = (feeder: PickemMatch) => string | undefined;

export function isDerivedMatch(roundIndex: number, match: PickemMatch): boolean {
  return roundIndex > 0 && !match.teamA.trim() && !match.teamB.trim();
}

/** Le due squadre di uno scontro, scritte o ricavate dal turno prima. */
export function matchTeams(
  rounds: PickemRound[],
  roundIndex: number,
  matchIndex: number,
  resolve: FeederResolver,
): [string | undefined, string | undefined] {
  const match = rounds[roundIndex]?.matches[matchIndex];
  if (!match) return [undefined, undefined];
  if (!isDerivedMatch(roundIndex, match)) {
    return [match.teamA.trim() || undefined, match.teamB.trim() || undefined];
  }
  const prev = rounds[roundIndex - 1]?.matches || [];
  const a = prev[matchIndex * 2];
  const b = prev[matchIndex * 2 + 1];
  return [a ? resolve(a) : undefined, b ? resolve(b) : undefined];
}

/**
 * Toglie i pronostici rimasti senza senso dopo un cambio: se scegli un
 * altro vincente nei quarti, la semifinale che dipendeva da quella scelta
 * va rifatta. Turno per turno, così la pulizia si propaga fino alla finale.
 */
export function prunePicks(
  rounds: PickemRound[],
  picks: Record<string, string>,
): Record<string, string> {
  const next = { ...picks };
  rounds.forEach((round, roundIndex) => {
    round.matches.forEach((match, matchIndex) => {
      const pick = next[match.id];
      if (!pick) return;
      const [a, b] = matchTeams(rounds, roundIndex, matchIndex, (m) => next[m.id]);
      if (pick !== a && pick !== b) delete next[match.id];
    });
  });
  return next;
}

/** Il bracket si può salvare: turni con nome e scontri, squadre scritte o ricavabili. */
export function isValidPickemBracket(rounds: PickemRound[]): boolean {
  return (
    rounds.length > 0 &&
    rounds.every(
      (round, roundIndex) =>
        round.name.trim() &&
        round.matches.length > 0 &&
        round.matches.every((match, matchIndex) => {
          if (isDerivedMatch(roundIndex, match)) {
            const prev = rounds[roundIndex - 1].matches;
            return matchIndex * 2 + 1 < prev.length;
          }
          return match.teamA.trim() && match.teamB.trim();
        }),
    )
  );
}

/**
 * Struttura standard della fase a eliminazione dei Mondiali: quarti (8
 * squadre da scrivere), semifinali e finale che si riempiono da sole.
 * Punti crescenti, perché indovinare più avanti è più difficile.
 */
export function standardPickemRounds(newId: () => string): PickemRound[] {
  const emptyMatches = (n: number): PickemMatch[] =>
    Array.from({ length: n }, () => ({ id: newId(), teamA: "", teamB: "" }));
  return [
    { name: "Quarti di finale", points: 1, matches: emptyMatches(4) },
    { name: "Semifinali", points: 2, matches: emptyMatches(2) },
    { name: "Finale", points: 3, matches: emptyMatches(1) },
  ];
}
