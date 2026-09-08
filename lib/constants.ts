import { BidPreset, ScoringWeights } from "@/types";

// Default bid presets
export const DEFAULT_BID_PRESETS: BidPreset[] = [
  { label: "+1", value: 1 },
  { label: "+5", value: 5 },
  { label: "+10", value: 10 },
  { label: "+50", value: 50 },
  { label: "+100", value: 100 },
];

// Countdown minimo consentito per un'asta, sia come default di lega sia come
// valore custom quando se ne crea una: mai possibile scendere sotto questo.
export const MIN_COUNTDOWN_SECONDS = 15;

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

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  kills: 3,
  deaths: -1,
  assists: 1.5,
  win: 2,
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
  scoringWeights: DEFAULT_SCORING_WEIGHTS,
};

// Esempi di ruoli per diversi sport/giochi (personalizzabili)
export const SPORT_TEMPLATES = {
  calcio: {
    roles: ["Portiere", "Difensore", "Centrocampista", "Attaccante"],
  },
  lol: {
    roles: ["Top Laner", "Jungler", "Mid Laner", "ADC", "Support"],
  },
  basket: {
    roles: ["Playmaker", "Guardia", "Ala Piccola", "Ala Grande", "Centro"],
  },
  custom: {
    roles: [] as string[],
  },
};
