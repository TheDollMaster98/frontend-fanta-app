// Il ruolo (admin/vice-admin/membro) e tutto ciò che è per-lega (budget,
// rosa, nome team) vive nella sottocollezione fantas/{id}/members — non più
// sparso su Fanta.adminId/viceAdminIds/memberIds. L'unico attributo globale
// sull'account è isDeveloper, un flag per chi sviluppa/testa l'app (accesso
// universale, zero blocchi).
export interface User {
  id: string;
  email: string;
  name: string;
  photoURL?: string;
  isDeveloper?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

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

// Un acquisto in rosa: un giocatore pro, una squadra, un coach o uno slot
// jolly, comprato all'asta da un membro. Il draft composto (step 4) è
// "squadra + coach + 5 player di ruolo + jolly opzionali": ogni pezzo è
// acquistato con un'asta separata, pickType dice di che pezzo si tratta.
// - "player": playerName/playerRole/playerTeam sono il giocatore pro.
// - "jolly": stesso shape di "player", ma non vincolato al limite per
//   ruolo — conta invece sul tetto maxJolly della lega.
// - "team": playerName è il nome della squadra pro (playerRole assente).
// - "coach": playerName è il nome del coach, inserito a mano (Leaguepedia
//   non espone una tabella coach utilizzabile).
export type TeamPickType = "player" | "jolly" | "team" | "coach";

// Statistiche inserite a mano da admin/vice/dev per un pick "player"/
// "jolly": copre CS, Vision Score e pentakill finché il calcolo
// automatico da Leaguepedia non li supporta (nomi campo non confermati —
// vedi ScoringWeights). Contano nel punteggio insieme ai pesi csPer50/
// visionPer10/pentakill della lega, sommandosi a "points" (che resta solo
// kill/morti/assist/vittoria calcolati da Leaguepedia).
export interface ManualPlayerStats {
  cs?: number;
  visionScore?: number;
  pentakills?: number;
}

// Statistiche inserite a mano per un pick "team"/"coach": obiettivi di
// partita e oro, finché il calcolo automatico non li supporta (nomi campo
// ScoreboardGames non confermati — vedi TeamScoringWeights).
export interface ManualTeamStats {
  towers?: number;
  dragons?: number;
  voidGrubs?: number;
  riftHeralds?: number;
  inhibitors?: number;
  atakhans?: number;
  barons?: number;
  cs?: number;
  gold?: number;
}

export interface TeamPick {
  id: string;
  pickType: TeamPickType;
  playerName: string;
  playerRole?: string; // ruolo del giocatore pro, es. "Mid Laner" (solo player/jolly)
  playerTeam?: string; // squadra pro reale, es. "T1" (solo player/jolly)
  purchasePrice: number;
  auctionId?: string;
  acquiredAt: Date;
  // Punti fantasy calcolati dalle statistiche reali (step 2): assente finché
  // non gira almeno una volta "Ricalcola Punteggi", poi aggiornato ad ogni
  // ricalcolo. Per pickType "team"/"coach" sono punti-vittoria della
  // squadra; per "player"/"jolly" derivano da kill/morti/assist/vittorie
  // pesati con gli scoringWeights della lega. Il totale mostrato in UI è
  // points + il bonus calcolato da manualPlayerStats/manualTeamStats (vedi
  // lib/scoring.ts) — quest'ultimo non richiede "Ricalcola Punteggi",
  // basta salvare le statistiche manuali.
  points?: number;
  manualPlayerStats?: ManualPlayerStats; // solo pickType player/jolly
  manualTeamStats?: ManualTeamStats; // solo pickType team/coach
}

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

// fantas/{fantaId}/history/{id} — log immutabile di chi ha comprato cosa,
// da chi e quando. A differenza di FantaMember.team, una voce qui resta
// anche se il giocatore viene poi rimosso dalla rosa o l'asta riaperta.
export interface HistoryEntry {
  id: string;
  playerName: string;
  playerRole?: string;
  playerTeam?: string;
  buyerUserId: string;
  buyerName: string;
  price: number;
  auctionId?: string;
  purchasedAt: Date;
}

// Cache locale dei pro player di un circuito, presa da Leaguepedia: evita
// di richiamare l'API ad ogni ricerca. Aggiornata da un'azione manuale
// (nessun cron/Cloud Function in quest'app), non in automatico.
export interface ProPlayer {
  id: string;
  circuit: string;
  player: string;
  name: string;
  country: string;
  role: string;
  team: string;
  birthdate: string;
  residency: string;
  updatedAt: Date;
}

// Auction types
export type AuctionStatus = "pending" | "active" | "closing" | "closed";

// fantas/{fantaId}/auctions/{id}
export interface Auction {
  id: string;
  fantaId: string;
  pickType: TeamPickType; // cosa si sta aggiudicando: giocatore/jolly/squadra/coach
  playerName: string;
  playerRole?: string;
  playerTeam?: string;
  auctionFormat?: string;
  description?: string;
  basePrice: number;
  currentPrice: number;
  highestBidderId?: string;
  highestBidderName?: string;
  status: AuctionStatus;
  createdBy: string; // admin o vice-admin che ha creato l'asta
  countdownSeconds: number;
  countdownEndsAt?: Date;
  startedAt?: Date; // quando è stata avviata (per calcolare la durata)
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// fantas/{fantaId}/auctions/{auctionId}/bids/{id}
export interface Bid {
  id: string;
  auctionId: string;
  userId: string;
  userName: string;
  amount: number;
  createdAt: Date;
}

// Preset bid buttons
export interface BidPreset {
  label: string;
  value: number;
}

// Richieste di ingresso in un fanta — fantas/{fantaId}/joinRequests/{id}
export type JoinRequestStatus = "pending" | "approved" | "rejected";

export interface JoinRequest {
  id: string;
  fantaId: string;
  fantaName: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: JoinRequestStatus;
  createdAt: Date;
}

// Calendario a girone all'italiana (round-robin) tra i membri della lega:
// fantas/{fantaId}/calendar/{id}. Generato una volta dall'admin/dev con il
// metodo del cerchio; awayUserId assente = turno di riposo (numero dispari
// di membri). homePoints/awayPoints: punti fantasy totalizzati dai due
// roster SOLO nella finestra [CalendarRound.startDate, endDate) di questo
// turno (non il punteggio cumulativo di sempre, quello resta su
// TeamPick.points). Assenti finché "Ricalcola Punteggi" non viene lanciato
// almeno una volta dopo che il turno è iniziato.
export interface RoundFixture {
  homeUserId: string;
  awayUserId: string | null;
  homePoints?: number;
  awayPoints?: number;
}

export interface CalendarRound {
  id: string;
  roundNumber: number;
  fixtures: RoundFixture[];
  // Finestra temporale reale di questo turno: il confronto diretto tra i
  // due membri di una fixture è la somma dei punti fantasy ottenuti dai
  // rispettivi roster SOLO nelle partite pro giocate in questo intervallo
  // (vedi FantaContext.recalculateScores). Assegnata da generateCalendar,
  // sequenziale a partire dalla data scelta dall'admin.
  startDate: Date;
  endDate: Date;
  // Presente solo nella fase a gironi (circuiti WORLDS/MSI, vedi
  // PLAYOFF_CIRCUITS): identifica a quale FantaGroup appartiene questo
  // turno. Assente = girone unico standard (fase singola).
  groupId?: string;
}

// Gruppo della fase a gironi (WORLDS/MSI): fantas/{fantaId}/groups/{id}.
// Ogni gruppo gioca un proprio girone all'italiana (CalendarRound con
// groupId = questo id) SOLO tra i membri elencati qui. Generato da
// FantaContext.generateGroups, che distribuisce i membri della lega nei
// gruppi in sequenza (non a bilanciamento di forza: qui non c'è uno
// storico su cui bilanciare).
export interface FantaGroup {
  id: string;
  name: string; // "Gruppo A", "Gruppo B", ...
  memberIds: string[];
}

// Un incontro del tabellone a eliminazione diretta: fantas/{fantaId}/
// bracket/{roundId}, generato da FantaContext.generateBracket dopo la fase
// a gironi. homeUserId/awayUserId null = "TBD", in attesa che il match del
// turno precedente che alimenta questo slot venga deciso (non va confuso
// col "riposo" di RoundFixture: qui significa solo "non ancora noto", non
// "nessun avversario"). winnerUserId assente = match non ancora deciso
// (serve homePoints/awayPoints diversi, oppure — se uno dei due slot è
// null per un bye del primo turno — l'altro passa il turno senza giocare).
export interface BracketMatch {
  matchIndex: number; // posizione nel turno: determina l'accoppiamento nel
  // turno successivo (0 e 1 si affrontano nel prossimo match 0, 2 e 3 nel
  // prossimo match 1, ...)
  homeUserId: string | null;
  awayUserId: string | null;
  homePoints?: number;
  awayPoints?: number;
  winnerUserId?: string;
}

export interface BracketRound {
  id: string;
  roundIndex: number; // 0 = primo turno a eliminazione dopo i gironi
  matches: BracketMatch[];
  // Stessa logica di CalendarRound.startDate/endDate: finestra di date
  // reali usata per il punteggio dei match di questo turno.
  startDate: Date;
  endDate: Date;
}

// Uno "slot" della sequenza del draft a turni: cosa si sceglie in quel
// giro (es. {pickType:"player", role:"Top Laner"}). La sequenza completa
// (squadra, coach, un giro per ruolo, poi i jolly) è calcolata da
// lib/draft.ts#buildDraftSlots a partire da sportType/maxJolly della lega,
// non salvata su Firestore: è deterministica, tutti i client la ricavano
// allo stesso modo dalle stesse impostazioni.
export interface DraftSlot {
  pickType: TeamPickType;
  role?: string; // solo pickType "player"
}

// Un turno saltato per timeout: resta qui finché admin/vice non lo assegna
// a mano (vedi FantaContext.fillPendingDraftAssignment), il draft nel
// frattempo continua con gli altri turni.
export interface PendingDraftAssignment {
  userId: string;
  slotIndex: number;
}

// fantas/{fantaId}/draft/state — documento singolo (non una collezione):
// lo stato dell'intero draft a turni, condiviso in tempo reale come le
// aste. Esiste solo per leghe con settings.draftMode === "snake".
export interface DraftState {
  status: "not_started" | "active" | "completed";
  order: string[]; // userId, ordine generato una volta a caso all'avvio
  currentSlotIndex: number;
  currentTurnIndex: number; // indice in "order" PRIMA dell'inversione a serpentina
  pickDeadline?: Date; // scadenza del turno corrente, stesso pattern di Auction.countdownEndsAt
  pendingAssignments: PendingDraftAssignment[];
  startedAt?: Date;
  updatedAt: Date;
}

// Context types for state management
export interface AppState {
  currentUser: User | null;
  currentFanta: Fanta | null;
  activeAuction: Auction | null;
}
