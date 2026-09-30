import type { TeamPick } from "./team-pick.types";

// Fanta (League) types
export type SportType = "calcio" | "lol" | "basket" | "custom";

export interface Fanta {
  id: string;
  name: string;
  description?: string;
  sportType: SportType; // Tipo di sport/gioco
  settings: FantaSettings;
  inviteCode: string; // Codice per unirsi via /join/[code], indipendente dall'id
  createdAt: Date;
  updatedAt: Date;
  // uid di chi ha creato la lega, impostato una volta in addFanta e mai più
  // toccato: firestore.rules lo usa per permettere al creatore di
  // auto-nominarsi admin SOLO nel momento in cui la lega nasce (altrimenti
  // qualunque utente potrebbe scriversi admin in una lega già esistente).
  // Assente sulle leghe create prima di questo campo — non un problema:
  // quel bootstrap è già avvenuto per loro sotto le regole precedenti, non
  // va ripetuto.
  createdBy?: string;
}

export interface ScoringWeights {
  kills: number;
  deaths: number;
  assists: number;
  win: number; // bonus se la squadra del giocatore vince quella partita
  // csPer50/visionPer10/pentakill: punti ogni 50 CS, ogni 10 di Vision
  // Score, e bonus per ogni pentakill segnata. NON calcolati
  // automaticamente da Leaguepedia in FantaContext.recalculateScores —
  // servono i nomi esatti dei campi (ScoreboardPlayers) per CS, Vision
  // Score e Pentakills, non ancora confermati. Contano comunque nel
  // punteggio se admin/vice/dev inseriscono le statistiche a mano su un
  // pick (TeamPick.manualPlayerStats, vedi lib/scoring.ts).
  csPer50: number;
  visionPer10: number;
  pentakill: number;
}

// Pesi punteggio per ruolo (es. "Top Laner", "Jungler", ... — le stesse
// stringhe di SPORT_TEMPLATES.lol.roles in lib/constants.ts): kill/morti/
// assist/vittoria/CS/vision non valgono uguale per ogni ruolo, quindi ogni
// ruolo ha il proprio set. Applicati in base al playerRole reale del pick
// — vale anche per i jolly, che contano col peso del loro ruolo vero, non
// un set a parte.
export type RoleScoringWeights = Record<string, ScoringWeights>;

// Pesi per le pick "team"/"coach": la squadra (o quella allenata dal
// coach) non è un giocatore singolo, quindi ha un set di statistiche
// completamente diverso — obiettivi di partita invece di kill/morti/
// assist individuali. Stessa nota di ScoringWeights: tower/dragon/
// voidGrub/riftHerald/inhibitor/atakhan/csPer100/goldPer10k NON sono
// calcolati automaticamente (servono i nomi esatti dei campi Leaguepedia
// ScoreboardGames, non ancora confermati), ma contano se inseriti a mano
// su un pick (TeamPick.manualTeamStats, vedi lib/scoring.ts). kill/death/
// assist/csPer100 restano 0 di default: sono qui per completezza
// (rispecchiano lo schema a cui si è ispirata la lega), ma un pick "team"
// non ha kill/morti/assist propri — solo obiettivi e vittoria.
export interface TeamScoringWeights {
  win: number;
  tower: number;
  dragon: number; // dragone elementale
  voidGrub: number;
  riftHerald: number;
  inhibitor: number;
  atakhan: number;
  baron: number;
  kill: number;
  death: number;
  assist: number;
  csPer100: number;
  goldPer10k: number;
}

// "auction" (default, comportamento storico): admin crea un'asta per volta,
// tutti rilanciano in tempo reale, vince chi offre di più. "snake": niente
// aste/budget, si sceglie a turno in un ordine generato a caso che si
// inverte ogni giro (1..N, N..1, 1..N, ...), un ruolo fisso per giro — vedi
// lib/draft.ts per la sequenza esatta degli slot e la logica del turno.
export type DraftMode = "auction" | "snake";

export interface FantaSettings {
  generalBudget: number; // Budget generale per tutti
  minBid: number; // Puntata minima
  maxBid: number; // Puntata massima
  defaultCountdown: number; // Countdown predefinito in secondi (30-300)
  allowCustomBids: boolean; // Se permettere puntate custom
  maxPlayersTotal?: number; // Limite rosa totale per utente (0/assente = nessun limite)
  maxPlayersPerRole?: Record<string, number>; // Limite per ruolo (assente = nessun limite per quel ruolo)
  // Solo per leghe LoL: circuito seguito (LCK/LPL/.../WORLDS/MSI/ALTRO) e
  // numero di slot jolly (giocatori extra senza vincolo di ruolo). WORLDS e
  // MSI sono a eliminazione: attiveranno la doppia fase gironi/finale.
  circuitType?: string;
  maxJolly?: number;
  // Pesi per calcolare i punti fantasy dalle statistiche reali dei
  // giocatori, uno per ruolo. Bloccati (modificabili solo da admin/dev,
  // non vice) una volta che le partite del torneo sono iniziate.
  scoringWeights?: RoleScoringWeights;
  // Pesi per le pick "team"/"coach": obiettivi di partita + vittoria,
  // niente kill/morti/assist perché non sono un giocatore singolo.
  teamScoringWeights?: TeamScoringWeights;
  // Assente = "auction" (leghe create prima di questo campo restano aste).
  draftMode?: DraftMode;
  // Secondi a disposizione per ogni scelta nel draft a turni. Stessi limiti
  // min/max del countdown asta (MIN/MAX_COUNTDOWN_SECONDS): non serve un
  // secondo intervallo per lo stesso concetto.
  draftPickSeconds?: number;
  // true = mercato chiuso, girone iniziato (vedi FantaContext.startSeason):
  // i membri normali non possono più creare/avviare aste, fare offerte,
  // avviare il draft, fare pick di draft o togliersi giocatori dalla
  // propria rosa. Admin/vice/dev restano operativi (assegnazione manuale,
  // chiusura/annullamento aste, rimozione pick) per sistemare eventuali
  // codini rimasti in sospeso. Assente/false = mercato aperto (default).
  seasonStarted?: boolean;
  // Durata in giorni di ogni turno del tabellone a eliminazione diretta
  // (fase 2 dei circuiti WORLDS/MSI), impostata da generateBracket e letta
  // da recalculateScores quando genera automaticamente il turno successivo
  // a un round completato. Assente = 7 giorni di default.
  bracketRoundLengthDays?: number;
}

// Ruolo di un membro NELLA LEGA (permessi) — non va confuso col ruolo del
// giocatore pro comprato (es. "Mid Laner"), che vive su TeamPick.playerRole.
export type MemberRole = "admin" | "vice" | "membro";

// fantas/{fantaId}/members/{userId}
export interface FantaMember {
  userId: string;
  role: MemberRole;
  teamName: string; // nome della squadra fantasy scelto dal membro
  team: TeamPick[]; // rosa: tutti gli acquisti
  budgetTot: number;
  budgetSpent: number;
  budgetLeft: number;
}
