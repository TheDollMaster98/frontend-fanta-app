import type { TeamPickType } from "@/types";

// Una scelta unica per lega (10/10): lo stesso giocatore, la stessa
// squadra o lo stesso coach possono stare in una sola rosa. Player e jolly
// sono la stessa categoria (un jolly è un giocatore vero); squadra e coach
// sono categorie a parte, quindi "G2 Esports" come squadra non blocca un
// coach della G2. Nomi confrontati senza maiuscole e spazi ai bordi.
export function pickKind(pickType: TeamPickType | string | undefined): string {
  return pickType === "jolly" || !pickType ? "player" : pickType;
}

export function pickKey(pickType: TeamPickType | string | undefined, name: string): string {
  return `${pickKind(pickType)}:${(name || "").trim().toLowerCase()}`;
}

// Chi ha già in rosa quella scelta, se qualcuno.
export function findPickOwner<
  M extends { userId: string; team: { pickType?: string; playerName: string }[] },
>(members: M[], pickType: TeamPickType | string | undefined, name: string): M | undefined {
  const key = pickKey(pickType, name);
  return members.find((m) => m.team.some((p) => pickKey(p.pickType, p.playerName) === key));
}
