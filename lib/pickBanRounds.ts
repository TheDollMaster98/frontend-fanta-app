import { bracketRoundName } from "@/lib/bracket";
import type { BracketRound, CalendarRound } from "@/types";

// Turni del Pick/Ban campione (11/10). Prima esistevano solo i turni del
// calendario normale, quindi nelle leghe Mondiali/MSI (gironi + tabellone)
// il Pick/Ban era spento, proprio durante il torneo in cui il gruppo lo
// voleva. Ora un turno Pick/Ban è una finestra di date:
// - campionato normale: ogni turno di calendario, come prima;
// - gironi: un turno per numero di turno (i gironi giocano in parallelo,
//   con le stesse date), con l'id del primo documento di calendario;
// - tabellone: ogni turno a eliminazione, con l'id del suo documento.
// L'id resta quello di un documento vero (calendar o bracket): le regole
// Firestore lo usano per negare le scelte a turno finito.
export interface PickBanRound {
  id: string;
  label: string;
  startDate: Date;
  endDate: Date;
}

export function buildPickBanRounds(
  calendar: CalendarRound[],
  bracketRounds: BracketRound[],
): PickBanRound[] {
  const rounds: PickBanRound[] = [];

  calendar
    .filter((r) => !r.groupId)
    .forEach((r) =>
      rounds.push({
        id: r.id,
        label: `Turno ${r.roundNumber}`,
        startDate: r.startDate,
        endDate: r.endDate,
      }),
    );

  const groupRoundsByNumber = new Map<number, CalendarRound[]>();
  calendar
    .filter((r) => r.groupId)
    .forEach((r) => {
      const list = groupRoundsByNumber.get(r.roundNumber) || [];
      list.push(r);
      groupRoundsByNumber.set(r.roundNumber, list);
    });
  groupRoundsByNumber.forEach((list, roundNumber) => {
    const first = [...list].sort((a, b) => a.id.localeCompare(b.id))[0];
    rounds.push({
      id: first.id,
      label: `Gironi, turno ${roundNumber}`,
      startDate: first.startDate,
      endDate: first.endDate,
    });
  });

  bracketRounds.forEach((r) =>
    rounds.push({
      id: r.id,
      label: `Tabellone: ${bracketRoundName(r.matches.length, r.roundIndex)}`,
      startDate: r.startDate,
      endDate: r.endDate,
    }),
  );

  return rounds.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}
