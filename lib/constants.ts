import { BidPreset } from "@/types";

// Default bid presets
export const DEFAULT_BID_PRESETS: BidPreset[] = [
  { label: "+1", value: 1 },
  { label: "+5", value: 5 },
  { label: "+10", value: 10 },
  { label: "+50", value: 50 },
  { label: "+100", value: 100 },
];

// Default fanta settings
export const DEFAULT_FANTA_SETTINGS = {
  generalBudget: 500,
  minBid: 1,
  maxBid: 1000,
  defaultCountdown: 3,
  allowCustomBids: true,
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
