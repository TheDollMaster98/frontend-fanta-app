import {
  BidPreset,
  ScoringWeights,
  RoleScoringWeights,
  TeamScoringWeights,
} from "@/types";

// Default bid presets
export const DEFAULT_BID_PRESETS: BidPreset[] = [
  { label: "+1", value: 1 },
  { label: "+5", value: 5 },
  { label: "+10", value: 10 },
  { label: "+50", value: 50 },
  { label: "+100", value: 100 },
];

// Countdown minimo e massimo consentiti per un'asta, sia come default di
// lega sia come valore custom quando se ne crea una: mai fuori da questo
// intervallo (30s - 5min).
export const MIN_COUNTDOWN_SECONDS = 30;
export const MAX_COUNTDOWN_SECONDS = 300;

// Circuiti LoL selezionabili alla creazione di una lega. WORLDS e MSI sono
// a eliminazione (girone poi bracket): attivano la doppia fase quando la
// costruiamo (step 5). Gli altri sono campionati "normali", fase unica.
export const CIRCUIT_TYPES = [
  "LCK",
  "LPL",
  "LEC",
  "LCS",
  "MSI",
  "WORLDS",
  "ALTRO",
] as const;
export const PLAYOFF_CIRCUITS: readonly string[] = ["MSI", "WORLDS"];

// Ruoli LoL, definiti qui (non dentro SPORT_TEMPLATES) perché servono anche
// a costruire i pesi punteggio di default, uno per ruolo.
export const LOL_ROLES = ["Top Laner", "Jungler", "Mid Laner", "ADC", "Support"];

// Template usato per popolare ogni ruolo la prima volta: stessi numeri di
// prima quando i pesi erano un unico set globale, più csPer50/visionPer10/
// pentakill a 0 (nessun valore di default sensato finché non sono attivi —
// vedi l'avvertenza su ScoringWeights in types/index.ts). Da qui in poi
// ogni ruolo ha il proprio set modificabile indipendentemente.
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  kills: 3,
  deaths: -1,
  assists: 1.5,
  win: 2,
  csPer50: 0,
  visionPer10: 0,
  pentakill: 0,
};

export const DEFAULT_ROLE_SCORING_WEIGHTS: RoleScoringWeights =
  Object.fromEntries(
    LOL_ROLES.map((role) => [role, { ...DEFAULT_SCORING_WEIGHTS }]),
  );

// Pesi per le pick "team"/"coach": stessa struttura del "Mock Draft" preso
// come riferimento (tower/dragon/void grub/rift herald/inhibitor/atakhan/
// baron + kill/death/assist/CS/win/gold). Solo gli obiettivi hanno un
// default diverso da 0: kill/death/assist/CS/win restano 0 perché un pick
// "team" non ha statistiche individuali, sono lì solo per rispecchiare lo
// schema del riferimento — modificabili comunque se un giorno servono.
export const DEFAULT_TEAM_SCORING_WEIGHTS: TeamScoringWeights = {
  win: 0,
  tower: 0.5,
  dragon: 1,
  voidGrub: 0.5,
  riftHerald: 0.75,
  inhibitor: 0.75,
  atakhan: 1,
  baron: 2,
  kill: 0,
  death: 0,
  assist: 0,
  csPer100: 0,
  goldPer10k: 0,
};

// Default fanta settings
export const DEFAULT_FANTA_SETTINGS = {
  generalBudget: 500,
  minBid: 1,
  maxBid: 1000,
  defaultCountdown: MIN_COUNTDOWN_SECONDS,
  allowCustomBids: true,
  maxPlayersTotal: 0,
  maxPlayersPerRole: {} as Record<string, number>,
  maxJolly: 0,
  scoringWeights: DEFAULT_ROLE_SCORING_WEIGHTS,
  teamScoringWeights: DEFAULT_TEAM_SCORING_WEIGHTS,
  draftMode: "auction" as const,
  draftPickSeconds: MIN_COUNTDOWN_SECONDS,
};

// Esempi di ruoli per diversi sport/giochi (personalizzabili)
export const SPORT_TEMPLATES = {
  calcio: {
    roles: ["Portiere", "Difensore", "Centrocampista", "Attaccante"],
  },
  lol: {
    roles: LOL_ROLES,
  },
  basket: {
    roles: ["Playmaker", "Guardia", "Ala Piccola", "Ala Grande", "Centro"],
  },
  custom: {
    roles: [] as string[],
  },
};
