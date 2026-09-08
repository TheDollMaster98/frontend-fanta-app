import type { RoundFixture } from "@/types";

/**
 * Calendario a girone all'italiana (round-robin) con il metodo del
 * cerchio: N partecipanti (dispari = un "riposo" ogni turno) danno N-1
 * turni (N se dispari), ognuno con tutti gli accoppiamenti possibili senza
 * ripetizioni. Il primo elemento resta fisso, gli altri ruotano di una
 * posizione ad ogni turno.
 */
export function generateRoundRobin(userIds: string[]): RoundFixture[][] {
  if (userIds.length < 2) return [];

  const hasBye = userIds.length % 2 !== 0;
  const arr: (string | null)[] = hasBye ? [...userIds, null] : [...userIds];
  const n = arr.length;
  const rounds: RoundFixture[][] = [];

  for (let round = 0; round < n - 1; round++) {
    const fixtures: RoundFixture[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a === null && b === null) continue;
      if (a === null) {
        fixtures.push({ homeUserId: b as string, awayUserId: null });
      } else if (b === null) {
        fixtures.push({ homeUserId: a, awayUserId: null });
      } else {
        // Alterna casa/trasferta ad ogni turno, così non è sempre lo
        // stesso membro a essere "in trasferta" nello stesso accoppiamento.
        fixtures.push(
          round % 2 === 0
            ? { homeUserId: a, awayUserId: b }
            : { homeUserId: b, awayUserId: a },
        );
      }
    }
    rounds.push(fixtures);

    // Ruota tutti tranne il primo elemento (fisso): l'ultimo passa subito
    // dopo il primo.
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop()!);
    arr.splice(0, arr.length, fixed, ...rest);
  }

  return rounds;
}
