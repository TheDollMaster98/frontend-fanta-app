# TODO — Fanta Points App

Lista onesta di cosa manca, aggiornata dopo il giro di bugfix + persistenza
aste su Firestore. Non è per uso commerciale: le priorità sono "l'app non si
rompe" e "le aste funzionano per tutti", non sicurezza enterprise.

## Pick/Ban Campione — punteggio rifatto (6/10)

La regola vecchia (+2 se il campione è pickato almeno una volta nella
settimana) non distingueva nessuno: un campione del meta è pickato quasi
sempre, tutti sceglievano quello e prendevano +2. Ora (numeri in
`lib/championPickScoring.ts`, funzione pura condivisa con la UI):
- pick indovinato: 4 pt se l'hai scelto solo tu, 2 se siete in due, 1 se
  in tre o più; +1 se giocato da una squadra che ha vinto la partita;
- ban facoltativo: +2 se lo banna la squadra pro in rosa (pick "team"),
  +1 col ripiego sul circuito intero se non hai una squadra in rosa o se
  la tua non ha giocato nella finestra del turno.
Dati: `getChampionGamesInRange` (Team1/Team2/Winner/Team1Picks/Team1Bans
di `ScoreboardGames`, campi verificati con `action=cargofields`). Se
Leaguepedia non restituisce partite (rate limit), il turno resta chiuso
ma i punti non vengono scritti: admin/vice rilanciano con "Ricalcola
Punti". I turni chiusi prima di questo cambio tengono i punti vecchi.

**Scoperta collaterale, da usare**: lo stesso `action=cargofields` su
`ScoreboardGames` conferma i campi obiettivo che Step 1/Step 6 davano per
bloccati: `Team1Towers`, `Team1Dragons`, `Team1Barons`, `Team1VoidGrubs`,
`Team1RiftHeralds`, `Team1Atakhans`, `Team1Inhibitors`, `Team1Gold`,
`Team1Kills` (e gli equivalenti Team2). Il calcolo automatico dei pesi
squadra (`TeamScoringWeights`) non è più bloccato dai nomi campo.

## Avvia Stagione (chiusura mercato + calendario in un'azione)

Su richiesta: `settings.seasonStarted` (default false/assente = mercato
aperto). Bottone "Avvia Stagione" in Gestione Lega → Impostazioni
(`startSeason` in FantaContext) genera il calendario e lo mette a true in
un colpo solo; "Riapri Mercato" lo rimette a false senza toccare il
calendario già generato (valvola di sicurezza per errori). Quando true:
- `createAuction`/`startDraft`: bloccati per tutti (niente nuove aste o
  nuovi draft dopo l'avvio stagione).
- `placeBid`/`makeDraftPick` (per il proprio turno)/`removePlayerFromTeam`:
  bloccati per i membri normali, restano disponibili per admin/vice/dev —
  così possono ancora chiudere/annullare aste rimaste attive, completare
  assegnazioni di draft in sospeso o correggere una rosa.
- UI aggiornata di conseguenza in `auctions/page.tsx`, `team/page.tsx`,
  `DraftPanel.tsx` (bottoni nascosti o messaggio esplicativo al posto
  dell'azione bloccata).

## Draft a turni (snake), alternativa all'asta live

Su richiesta: una seconda modalità di lega, scelta alla creazione
(`settings.draftMode`, "auction" default o "snake", non cambiabile dopo —
stessa filosofia di `sportType`) e non più modificabile da Impostazioni.
Niente budget/offerte: si sceglie a turno in un ordine generato a caso
all'avvio (Fisher-Yates) che si inverte a ogni giro (1→N, N→1, 1→N, ...);
un giro = un ruolo fisso uguale per tutti (squadra, coach, poi un giro per
ruolo LoL, poi un giro per ogni jolly). Timer configurabile per scelta
(`draftPickSeconds`, stessi limiti min/max del countdown asta): se scade,
il turno passa al successivo e finisce in una lista "da assegnare a mano"
che admin/vice possono completare in qualsiasi momento, senza bloccare il
resto del draft.
- `lib/draft.ts`: `buildDraftSlots` (sequenza slot da sportType/maxJolly),
  `getDraftTurnUserId` (chi tocca, con l'inversione a serpentina),
  `advanceDraftTurn` (turno/giro successivo).
- `fantas/{fantaId}/draft/state`: documento singolo, stesso pattern
  real-time delle aste (`FantaContext.draftState`, `startDraft`,
  `makeDraftPick`, `skipDraftTurn`, `fillPendingDraftAssignment`). La
  transazione sul documento di stato impedisce che due client avanzino lo
  stesso turno insieme; la scrittura sulla rosa del membro resta separata
  (stesso compromesso non-atomico già accettato per `finalizeAuction`).
  Le pick del draft hanno `purchasePrice: 0` (nessuna economia).
- `components/DraftPanel.tsx`: sostituisce l'intera UI aste in
  `app/dashboard/auctions/page.tsx` quando `draftMode === "snake"` (stessa
  pagina/nav, contenuto diverso — la voce sidebar diventa "Draft").
  Ricerca player Leaguepedia filtrata per il ruolo dello slot corrente,
  squadre via `searchTeams`, coach a mano (nessuna tabella Leaguepedia
  utilizzabile, stessa nota già presente per le aste).
- **Non ancora testato dal vivo** (nessun ambiente di test con più utenti
  in questa sessione): la logica è stata verificata solo staticamente
  (`tsc`/`lint`/`build` puliti). Da provare con la lega vera prima di
  fidarsi ciecamente, in particolare: la transazione di turno sotto race
  reale (due che cliccano insieme), e il conteggio corretto dei giri con
  jolly > 0.

## Revisione sicurezza (giro dedicato)

Su richiesta esplicita, giro mirato a cercare buchi reali nel codice
(non teorici). Trovati 3 problemi concreti, sistemati tutti:

- [x] **Escalation di privilegi su `isDeveloper`** — il più serio dei tre.
      `isDeveloper` concede accesso admin universale a OGNI lega (bypassa
      completamente ruoli/membership, vedi `isFantaAdmin`/
      `isFantaViceOrAdmin` in `FantaContext.tsx`). Il toggle in
      Impostazioni era protetto solo nascondendo la checkbox in UI a chi
      non era già developer — ma le regole Firestore erano "loggato = può
      scrivere qualsiasi cosa", quindi bastava aprire la console del
      browser e scrivere `isDeveloper: true` sul proprio documento
      `users/{uid}` per autopromuoversi admin di ogni lega esistente,
      anche senza esserne mai stati invitati. **Sistemato**:
      `firestore.rules` ora ha una regola dedicata su `users/{uid}` che
      impedisce la transizione false→true da client (resta possibile solo
      a mano dalla Firebase Console); il toggle libero resta funzionante
      per chi ce l'ha già avuto almeno una volta. Corretto anche il
      commento in `AuthContext.tsx` che affermava (erroneamente) che non
      servisse un guard. **Da fare tu**: questa regola va deployata
      (`npm run deploy` la include) prima che il fix valga qualcosa — fino
      ad allora il buco è ancora aperto in produzione.
- [x] **Injection nelle query Cargo verso Leaguepedia** — diverse funzioni
      in `lib/leaguepediaApi.ts` (ricerca giocatori, ricerca squadre,
      roster storico, stats) interpolavano input utente (dalle caselle di
      ricerca) direttamente dentro una where-clause Cargo (sintassi
      simile a SQL) senza escape: un carattere `"` nell'input rompeva la
      stringa e permetteva di iniettare condizioni arbitrarie. Impatto
      pratico basso (Leaguepedia è un'API di sola lettura su dati
      pubblici, non c'è niente di nostro da rubare), ma resta un bug di
      query building vero, non un'opinione — poteva anche produrre query
      pesanti/moleste contro il server di terzi usando le credenziali del
      nostro bot. **Sistemato**: nuova `escapeCargoValue()` applicata a
      ogni stringa interpolata in una where-clause, in tutte le funzioni.
- [x] **Proxy Leaguepedia aperto a qualsiasi `action`** — `app/api/
      leaguepedia/route.ts` inoltra qualsiasi query string ricevuta a
      `lol.fandom.com/api.php`, allegando sempre la sessione autenticata
      del bot. La route non richiede login all'app: chiunque trovi l'URL
      pubblico poteva mandare un `action` MediaWiki qualsiasi (non solo
      `cargoquery`/`query`, gli unici che l'app usa davvero) con le
      credenziali del bot. Le action che scrivono (edit/delete/block)
      richiedono comunque POST + CSRF token lato MediaWiki quindi non
      erano comunque eseguibili da una route GET-only, ma non c'era
      motivo di lasciare la porta più aperta del necessario — e chiunque
      poteva comunque tempestare l'endpoint di query costose usando
      l'identità del bot, rischiando di farlo bannare o rallentare per
      tutti. **Sistemato**: allowlist esplicita di `action` (solo
      `cargoquery` e `query`), tutto il resto risponde 400.

**ROLLBACK D'EMERGENZA (9/9)**: la regola su `users/{uid}` sopra ha rotto
il login in produzione — `permission-denied` su tutti i listener Firestore
appena il deploy è andato live, tutto il gruppo bloccato fuori. Non ho
ancora isolato la causa esatta (analisi statica delle regole non ha
trovato un bug ovvio: sembrano corrette lette a mente, e questo è
esattamente il problema — vanno testate, non solo lette). Ho **ripristinato
la versione precedente** (`loggato = può leggere/scrivere qualsiasi cosa`,
nessuna regola dedicata su `users/{uid}`) per riportare subito l'accesso.
Conseguenza esplicita: **la falla di escalation `isDeveloper` sopra è di
nuovo aperta** finché non trovo il bug vero e riprovo con una regola
testata davvero (emulatore Firestore, non solo lettura del file), non
un'altra ipotesi shippata direttamente in produzione.
- [ ] Ridebuggare `firestore.rules` per `users/{uid}` usando l'emulatore
      Firestore locale (`firebase emulators:start --only firestore` +
      `@firebase/rules-unit-testing`) PRIMA di rideployare, non a mente.
- [ ] Sospetto principale da verificare per primo: interazione tra
      `resource.data.get('isDeveloper', false)` e il fatto che `update()`
      lato client manda un patch parziale — se `request.resource.data` in
      fase di regola non include davvero il merge dei campi esistenti nel
      modo atteso, il confronto fallisce sempre. Da confermare con test
      reali, non supposizioni.

**Rischio noto, non toccato** — aggiornato dopo il fix sotto:
`proplayers/**` e la maggior parte di `fantas/**` (create/delete ovunque,
`history`/`calendar`/`joinRequests`) restano su "loggato = può leggere/
scrivere qualsiasi cosa", senza verificare che sia davvero membro della
lega che sta toccando. `auctions`/`members`/`draft` ora hanno controlli
mirati (vedi sezione "Lock mercato lato regole" sotto) ma SOLO per il
blocco a mercato chiuso, non per la membership in generale: un non-membro
autenticato può ancora, ad es., leggere le aste di una lega a cui non
appartiene, o (a mercato aperto) scrivere dati arbitrari se conosce gli
id giusti. Per un gruppo di amici va bene; se l'app dovesse mai crescere
o diventare pubblica, andrebbe rifatta sul serio con controlli di
membership su OGNI operazione, non solo sul lock. La route
`/api/leaguepedia` resta anche senza rate limiting o verifica di login
all'app: l'allowlist sulle action chiude il rischio più concreto (abuso
delle credenziali del bot per azioni arbitrarie), ma resta comunque
chiamabile da chiunque — se un giorno diventasse un problema reale (costi
Firebase App Hosting, bot bannato per troppe richieste), la soluzione è
richiedere un token Firebase Auth valido su questa route, non ancora
fatto perché non richiesto e perché per un gruppo di amici il rischio
pratico è basso.

## Lock mercato lato regole (9/9, testato con l'emulatore)

Il blocco di "Avvia Stagione" (`settings.seasonStarted`) era solo
client-side: bottoni nascosti, ma niente lo impediva davvero da console
del browser. Su richiesta esplicita, spostato anche in `firestore.rules`
per `fantas/{fantaId}/auctions`, `members`, `draft` — **questa volta
testato per davvero** con l'emulatore Firestore locale
(`firebase emulators:exec` + `@firebase/rules-unit-testing`, 21 casi,
tutti verdi) PRIMA di scrivere il file vero, non solo letto a mente come
la volta che ha rotto il login. `users/{uid}` non è stato toccato
(resta identico alla versione di rollback): quel bug resta aperto e
separato, vedi sopra.

Cosa bloccano le nuove regole a mercato chiuso, per i membri normali
(admin/vice restano sempre operativi):
- `auctions`: `create` sempre negato, per chiunque incluso admin/vice a
  mercato chiuso (niente nuove aste) — e comunque, a prescindere dal
  mercato, riservato ad admin/vice: un membro normale non può crearne
  una nemmeno a mercato aperto, stesso vincolo già imposto in UI.
  `update` negato solo se cambia `currentPrice` (= un'offerta vera —
  avvio/pausa/chiusura/annullamento/assegnazione manuale non toccano
  quel campo, restano permessi).
- `members/{uid}`: `update` negato solo se il campo `team` si accorcia
  (rimozione di un pick). La CRESCITA di `team` resta permessa a
  qualsiasi membro autenticato, non solo al proprietario o all'admin:
  è necessario, perché la chiusura di un'asta o l'assegnazione di una
  pick di draft possono arrivare dal browser di un membro qualsiasi
  (nessun cron/Cloud Function in quest'app — vedi i commenti in
  `FantaContext.tsx`), non solo da chi vince o da chi amministra.
  **Test di regressione dedicato per questo esatto punto**, proprio
  perché bloccarlo per sbaglio avrebbe rotto l'assegnazione automatica.
- `draft/{docId}`: `create` sempre riservato ad admin/vice (mai a
  mercato chiuso, stesso discorso delle aste). `update` negato se
  chi scrive è esattamente l'utente il cui turno è quello corrente
  (calcolato in regola con la stessa logica a serpentina di
  `lib/draft.ts#getDraftTurnUserId`) e il mercato è chiuso — uno skip
  per timeout innescato da un client diverso resta permesso, stesso
  motivo di sopra. **Aggiornamento (stesso giorno)**: bloccato anche il
  reset totale del draft — il campo `order` (l'ordine dei turni) può
  essere scritto solo in fase di creazione da admin/vice; qualunque
  `update` successivo che lo cambia è negato a chiunque non sia
  admin/vice, a prescindere dal mercato (non è un problema di lock
  stagione, è integrità dei dati: `order` non cambia mai in una pick o
  skip legittimi). Chiudeva un residuo che avevo lasciato aperto la
  prima volta ("un membro smaliziato potrebbe riscrivere l'intero
  documento draft/state") — richiesto esplicitamente, sistemato con lo
  stesso metodo (emulatore prima, 26 casi totali tutti verdi, non
  21 come alla prima versione di questo fix).

## Motore fantacampionato — piano a step (in corso)

Il gruppo ha chiesto un sistema molto più completo (punteggi da statistiche
reali, calendario a girone, draft composto squadra+coach+jolly, doppia fase
gironi/finale). È stato spezzato in 6 step, ognuno usabile da solo prima di
passare al successivo — vedi la chat per tutte le decisioni di design prese.

- [x] **Step 1 — Fondamenta**: `FantaSettings` ha ora `circuitType`
      (LCK/LPL/LEC/LCS/MSI/WORLDS/ALTRO), `maxJolly` (slot extra senza
      vincolo di ruolo) e `scoringWeights` (kills/morti/assist/vittoria,
      default 3/-1/1.5/2). Campi obbligatori in `CreateFantaDialog` quando
      si crea una lega LoL, modificabili dopo in Gestione Lega. I
      vice-admin ora possono entrare in Gestione Lega e modificare le
      impostazioni (prima era solo creatore+dev — incoerente con gli altri
      poteri che hanno già altrove nell'app); non possono però gestire
      membri/vice-admin, resta creatore+dev.
      **Aggiornamento successivo**: `scoringWeights` non è più un unico set
      globale ma un set per ruolo (`RoleScoringWeights`, chiave = stringa
      ruolo esatta di `SPORT_TEMPLATES.lol.roles`/`LOL_ROLES`) — kill/morti/
      assist/vittoria non valgono uguale per Top e Support. Editor
      condiviso `components/RoleScoringWeightsEditor.tsx` (tab per ruolo +
      tab Squadra/Coach), usato sia in `CreateFantaDialog` che in Gestione
      Lega, così non si disallineano.
      **Secondo aggiornamento** (schema ripreso da un tool di riferimento
      mostrato dall'utente): aggiunti `csPer50`/`visionPer10` a
      `ScoringWeights` (per ruolo) e sostituito il vecchio
      `teamScoringWeight` (un numero) con `teamScoringWeights`
      (`TeamScoringWeights`: tower/dragon/voidGrub/riftHerald/inhibitor/
      atakhan/baron/kill/death/assist/csPer100/win/goldPer10k — stessi
      campi del tool di riferimento). **Attenzione, non è un dettaglio**:
      questi campi nuovi (CS, Vision Score, tutti gli obiettivi di
      squadra, oro) si SALVANO e si mostrano in UI (marcati con ● in
      giallo nell'editor) ma NON entrano ancora nel calcolo punti reale —
      `FantaContext.recalculateScores` continua a usare solo kill/morti/
      assist/vittoria, gli unici campi Leaguepedia confermati finora.
      Bloccato in attesa dei cargofields di `ScoreboardPlayers` (CS,
      Vision Score) e di `ScoreboardGames` al completo (nomi esatti dei
      campi obiettivo) — richiesti all'utente, non ancora ricevuti.
      **Terzo aggiornamento**: aggiunto `pentakill` a `ScoringWeights` (per
      ruolo, stesso trattamento di kill/morti/assist — non un valore
      unico globale). Stesso pallino giallo degli altri campi nuovi: non
      ho conferma che `ScoreboardPlayers` esponga un campo Pentakills, non
      applicato al calcolo reale finché non è verificato.
      **Quarto aggiornamento — fallback manuale**: dato che Leaguepedia
      resta bloccato per CS/Vision Score/Pentakill/obiettivi (nomi campo
      mai confermati), aggiunto un inserimento a mano per pick invece di
      aspettare oltre. `TeamPick.manualPlayerStats`/`manualTeamStats`
      (nuovi tipi in `types/index.ts`) + `lib/scoring.ts`
      (`computeManualBonus`/`totalPickPoints`, pure functions condivise
      tra context e UI) + `FantaContext.updatePickManualStats`. In
      Classifica → dettaglio membro → dettaglio pick, admin/vice/dev
      vedono un form (CS/Vision Score/Pentakill per player-jolly,
      obiettivi/CS/oro per team-coach) che si somma subito ai punti
      mostrati — non serve rilanciare "Ricalcola Punteggi". Il pallino
      giallo nell'editor pesi ora dice questo esplicitamente invece di
      lasciar credere che quei pesi siano morti.
- [x] **Step 2 — Punteggio reale + calendario**: nuova pagina "Classifica"
      (solo leghe LoL). `lib/roundRobin.ts` genera il calendario a girone
      all'italiana (metodo del cerchio) tra i membri, salvato in
      `fantas/{id}/calendar`. `lib/leaguepediaApi.ts` ha
      `getFantasyPlayerStats`/`getFantasyTeamStats`: interrogano
      ScoreboardPlayers+ScoreboardGames per kill/morti/assist/vittorie
      reali, filtrate per `circuitType` della lega. Il bottone admin/dev
      "Ricalcola Punteggi" applica gli `scoringWeights` della lega e scrive
      `points` su ogni pick in rosa (`TeamPick.points`); "Genera
      Calendario" rigenera da capo i turni. **Limite onesto, non
      nascosto**: la classifica è per punteggio totale cumulato, NON per
      confronto diretto punti-contro-punti a ogni turno del calendario —
      manca una mappatura affidabile tra "turno fantasy" e data reale
      delle partite pro (Leaguepedia non la offre in modo diretto), quindi
      il calendario mostra solo chi affronta chi, senza calcolare
      vittoria/sconfitta di turno. Nessun automatismo: il ricalcolo va
      rilanciato a mano, non c'è un cron/Cloud Function che lo fa da solo.
- [x] **Step 3 — Drill-down**: nella pagina Classifica, click su un membro
      apre la rosa con i punti di ogni pick; click su un pick apre il log
      partita per partita, caricato al volo da Leaguepedia (non salvato,
      non prefetchato per tutta la rosa — solo quando si apre il
      dettaglio). Per player/jolly: `getPlayerGameLog` in
      `lib/leaguepediaApi.ts` (data, torneo, champion, K/D/A, vittoria/
      sconfitta, punti calcolati partita per partita con gli
      scoringWeights della lega). Per team/coach: `getTeamGameLog` (data,
      torneo, avversario, vittoria/sconfitta, punti). Per il coach usa le
      partite della squadra allenata (`playerTeam`), coerente con come
      viene già calcolato il suo punteggio totale.
- [x] **Step 4 — Draft composto**: `TeamPick.pickType` ora è
      `player | jolly | team | coach` (`types/index.ts`). In "Crea Nuova
      Asta" (solo leghe LoL) si sceglie il tipo di oggetto: Giocatore
      (ruolo, invariato), Jolly (stesso player-search, senza vincolo di
      ruolo, tetto `maxJolly` — **occhio**: `maxJolly` usa la convenzione
      "0 = nessuno", diversa da `maxPlayersTotal`/`maxPlayersPerRole` dove
      "0 = illimitato"), Squadra (ricerca Leaguepedia via nuova
      `searchTeams()` sulla tabella `Teams`), Coach (nome + squadra
      allenata inseriti a mano — **confermato**: Leaguepedia non ha una
      tabella coach utilizzabile, resta testo libero come previsto).
      `FantaContext.placeBid` blocca un secondo pick "team" o "coach" per
      lo stesso membro (uno solo di ciascuno) e i jolly oltre il tetto.
- [ ] **Step 5 — Doppia fase**: dipende da Step 2 e 4. Step 4 è pronto;
      step 2 ha solo la fase singola (nessuna logica di
      girone→eliminazione ancora).
- [ ] **Step 6 — Statistiche extra (MVP/CS/obiettivi)**: da verificare se
      Leaguepedia le ha davvero, non scontato.

## Fatto in questo giro (asta live)

- [x] Offerta custom: invio anche con Enter, non solo col bottone.
- [x] Pannello "Crediti di tutti" nell'asta attiva: budget di ogni membro
      della lega, per capire quanto possono ancora spingere gli altri.
- [x] Storico offerte: chi ha rilanciato, quando e di quanto (prima si
      vedeva solo l'offerta più alta corrente). Nuova collection `bids` —
      usa il tipo `Bid` che esisteva già in types/index.ts ma non era mai
      stato collegato a nulla.
- [x] **Ristrutturazione completa del modello dati Firestore, richiesta
      esplicitamente e in modo vincolante dal gruppo**: `Fanta` non ha più
      `adminId`/`viceAdminIds`/`memberIds` — ogni membro è ora un
      documento in `fantas/{id}/members/{userId}` con `role`
      (admin/vice/membro), `teamName`, `team` (rosa: array di
      `TeamPick` con tutte le info del giocatore pro + prezzo pagato),
      `budgetTot`/`budgetSpent`/`budgetLeft`. Aggiunte anche
      `fantas/{id}/history` (log immutabile di chi ha comprato cosa, da
      chi e quando — resta anche se un'asta viene poi riaperta o il
      giocatore rimosso dalla rosa) e `fantas/{id}/joinRequests`. Aste e
      offerte sono diventate sottocollezioni annidate:
      `fantas/{id}/auctions` e `fantas/{id}/auctions/{id}/bids`. Rimosse
      del tutto le vecchie collezioni piatte `players`, `teamBudgets`,
      `auctions`, `bids`, `joinRequests` — **cutover netto, senza
      migrazione dati**: qualunque fanta/asta/giocatore di test creato
      prima di questo giro resta nel vecchio schema e non verrà più letto
      dall'app. Aggiunta anche `proplayers` (cache dei giocatori pro di un
      circuito presa da Leaguepedia, da riempire con una sync manuale —
      non ancora costruita, solo il tipo esiste). Nota tecnica: avevo
      inizialmente sconsigliato un array `member[]` embedded dentro
      `Fanta` per il rischio di scritture concorrenti sullo stesso
      documento durante un'asta live — la richiesta è stata confermata
      comunque, quindi ho usato sottocollezioni (un documento per membro,
      non un array unico) per ottenere la stessa forma dei dati voluta
      senza quel rischio specifico.

## Ancora da discutere prima di implementare (feedback ricevuto dal gruppo)

- [ ] **Titolari/panchina**: interfaccia per scegliere quali giocatori
      della rosa schierare. Da decidere: vincoli per ruolo (es. esatto un
      titolare a ruolo) o scelta libera?
- [ ] **Voti/punteggio**: serve un modo di assegnare punti alle prestazioni
      reali dei giocatori. Da decidere: chi li inserisce (admin a mano
      dopo ogni giornata, o import automatico — fattibile solo per LoL via
      Leaguepedia, non per calcio/basket) e con quale formula/struttura.
- [ ] **Andamento partita vs avversario**: serve un concetto di
      giornata/turno con un calendario di chi affronta chi. Da decidere:
      calendario generato a mano dall'admin o automaticamente
      (round-robin), e se "andamento" significa davvero live o solo
      "ultimo risultato inserito" (dipende dalla risposta sui voti).

## Fatto in giri precedenti

- [x] Regole Firestore: rimossa la scadenza automatica al 30/9/2026 e
      l'accesso anonimo aperto a chiunque (ora richiede solo login).
- [x] Aste (creazione/avvio/offerte/chiusura) spostate da `useState` locale
      a Firestore: sincronizzate in tempo reale tra tutti i membri.
- [x] Invite code delle leghe: non era mai davvero univoco (primi 8
      caratteri di `fanta-<timestamp>`, identici per anni), ora è un campo
      dedicato generato a caso.
- [x] Impostazioni profilo: non più hardcoded ("Mario Rossi"), nome e
      password ora si salvano davvero su Firebase.
- [x] Team: rimozione giocatore dalla rosa (rimborso budget) collegata
      all'interfaccia — prima era codice morto.
- [x] Rimossa `/dashboard/fantas/new`, doppione morto di `CreateFantaDialog`.
- [x] GitHub Actions: CI (lint+build), deploy regole Firestore/Storage,
      deploy manuale App Hosting.
- [x] `dashboard/layout.tsx`: la schermata di caricamento non aspettava
      anche `fantaLoading` — poteva mostrare per un attimo "0 leghe" prima
      che i dati reali arrivassero da Firestore.
- [x] Leaguepedia: `FALLBACK_PRO_PLAYERS` esisteva già nel codice ma non
      era mai usato — ora scatta se l'API non risponde o non trova nulla,
      invece di mostrare una lista vuota.
- [x] Nome squadra (Team + Impostazioni): era solo `console.log`, non
      salvava nulla — ora persiste su Firestore (stesso documento del
      budget per-lega).
- [x] Aste: i limiti configurati dall'admin (puntata massima, puntate
      personalizzate disattivabili) non venivano mai controllati — ora sono
      rispettati sia in UI che lato `placeBid`.
- [x] Pulizia lint: variabili/costanti morte in `lib/leaguepediaApi.ts` e
      `app/api/leaguepedia/route.ts`.
- [x] Tab "Team e Fanta" in Impostazioni: il campo "Nome Lega" era dati
      morti (mai renderizzato in nessuna UI) — rimosso; il nome team ora è
      collegato allo stesso salvataggio reale della pagina Team, e si
      ricarica quando cambi lega dal selettore in questa stessa pagina.
- [x] Tab "Notifiche" in Impostazioni: i checkbox erano `defaultChecked`
      fissi, nessuno stato, "Salva Preferenze" non salvava nulla. Ora sono
      controllati e persistono in `localStorage`. **Non è un fix completo,
      lo dico chiaro**: nell'app non esiste nessun meccanismo che invia
      notifiche (niente push, niente email, niente centro notifiche
      in-app) — quindi questa preferenza oggi non pilota ancora nulla,
      semplicemente non si resetta più ad ogni refresh. Costruire un vero
      sistema di notifiche è una feature nuova, non un bug, e non l'ho
      fatta perché non richiesta: se la vuoi, dimmelo esplicitamente.

- [x] Bug CSS: nessun elemento cliccabile mostrava il cursore a manina
      sull'hover (`Button`, `TabsTrigger`, `SelectTrigger` non avevano mai
      `cursor-pointer` — Tailwind non lo aggiunge di default su `<button>`,
      a differenza di Bootstrap). Sistemato in tutti e tre i componenti UI
      condivisi, quindi vale ovunque nell'app.
- [x] Limiti rosa configurabili dall'admin: numero massimo di giocatori
      totali e per ruolo. Un'offerta che porterebbe a superarli viene
      bloccata sia in UI (bottoni disabilitati, messaggio) sia in
      `placeBid` lato context.
- [x] Countdown minimo 15s: sia come default di lega sia come valore
      custom per singola asta, con clamp difensivo anche lato context (non
      solo `min` sull'input). **Aggiornato in seguito a 30s minimo, 5 minuti
      (300s) massimo** — richiesta esplicita, vedi voce sulla
      ristrutturazione del modello dati più sopra.
- [x] Assegnazione manuale del vincitore: admin/vice/dev possono assegnare
      l'asta attiva a un membro scelto dalla lista, anche se non è lui
      l'offerente più alto registrato (utile per accordi presi fuori
      dall'app). Riusa la stessa logica di chiusura/assegnazione di
      `finalizeAuction`.
- [x] Floor di budget legato ai posti rosa liberi: un'offerta non può mai
      portare il budget rimanente sotto il numero di slot ancora da
      riempire (1 credito minimo a slot). Aggiunto anche un controllo che
      mancava del tutto: non si poteva offrire più di quanto si avesse in
      budget.
- [x] Rimossi `User.budget`, `User.fantaId`, `User.teamName`: erano dati
      morti (il budget/nome team veri sono per-lega in `teamBudgets`,
      nessun altro punto del codice li leggeva).
- [x] Cambio email vero in Impostazioni (prima era un campo disabilitato
      con su scritto "contatta chi gestisce l'app").
- [x] Nomi utente risolti live per id invece che congelati: un cambio nome
      in Impostazioni ora si riflette subito nell'offerente di un'asta
      attiva/chiusa (prima restava quello scritto al momento dell'offerta).
      `AuthContext` inoltre riallinea da solo Firestore se Firebase Auth
      risulta più aggiornato (es. dopo un cambio email).
- [x] Bug grafico: la card "Tutte le Aste" e la card "Asta in Corso" (pagina
      Aste) usavano ancora classi Tailwind da tema chiaro mai convertite
      (`hover:bg-slate-50`, `bg-slate-100`, `text-slate-600`, ecc.) mentre
      il resto dell'app è scuro. Risultato: badge/bottoni con testo bianco
      su sfondo quasi bianco all'hover, illeggibili. Sistemato in entrambe
      le card; anche 3 righe in Impostazioni > Notifiche avevano lo stesso
      colore scuro-su-scuro non voluto.
- [x] Dettaglio asta chiusa: ora mostra anche ruolo, squadra e descrizione
      del giocatore comprato (per i giocatori LoL importati, la
      descrizione contiene nome reale/paese/residenza), non solo prezzo e
      vincitore.
- [x] Aggiunta la riapertura di un'asta chiusa (dev/admin/vice): toglie il
      giocatore a chi l'aveva vinta, rimborsa il budget, e resetta l'asta a
      "pending" col prezzo base — pronta per essere riavviata da capo.
- [x] Aggiunto il dettaglio di un'asta chiusa: click sulla riga per vedere
      giocatore, prezzo base/finale, chi l'ha vinta e la durata.
- [x] Investigato il bug "il giocatore vinto non compare in Team e il
      budget non si scala": tracciato tutto il percorso di assegnazione
      riga per riga, non ho trovato un difetto logico certo per analisi
      statica (non posso far girare l'app con Firebase vero in questo
      sandbox). Ho comunque **irrobustito** il codice: prima le due
      scritture (assegna giocatore, scala budget) erano nello stesso
      blocco senza gestione errori — se la prima falliva silenziosamente
      (es. Firestore rifiuta un valore), la seconda non partiva proprio, e
      l'asta restava "chiusa" senza né giocatore né budget aggiornati,
      senza nessun errore visibile. Ora sono disaccoppiate (un fallimento
      nell'una non blocca l'altra) e ogni errore finisce loggato in
      console invece di sparire nel nulla. **Se ricapita**, apri la
      console del browser (F12) subito dopo aver chiuso un'asta vinta e
      mandami quello che c'è scritto in rosso — con quello trovo la causa
      vera al primo colpo.
- [x] Aggiunto in "Importa Pro Players LoL" un filtro per squadra, anno e
      Mondiali: usa `TournamentPlayers.Team` (la squadra del giocatore *in
      quel torneo*, diversa da `Players.Team` che è sempre quella attuale)
      per mostrare il roster storico e confrontarlo con la squadra di oggi
      ("Ancora in squadra" vs "Nel <anno>: <altra squadra>"). Schema Cargo
      verificato a mano con l'utente prima di scrivere la query (l'accesso
      di rete a lol.fandom.com è bloccato in questo sandbox).

## Ancora aperto

### Da decidere/fare tu
- [ ] **Secret GitHub `FIREBASE_SERVICE_ACCOUNT`**: serve perché i workflow
      di deploy funzionino (JSON di una service account, ruolo "Firebase
      Admin" sul progetto `fam-fanta-app`). Se ne hai già uno con un altro
      nome, dimmelo e sistemo il riferimento nei workflow.
- [ ] Verificare in Firebase Console se App Hosting è già collegato a
      GitHub per il rollout automatico — se sì, il workflow
      `deploy-apphosting.yml` va usato solo come emergenza manuale, non
      abilitato di default (lo è già solo manuale, ma confermalo).

### Limiti noti, non banali da risolvere senza infrastruttura in più
(Entrambi i punti qui sotto sono "roba Firebase" — Cloud Functions/regole
Firestore — quindi non toccati su richiesta esplicita.)
- [ ] La chiusura automatica di un'asta allo scadere del countdown richiede
      che *qualcuno* abbia la pagina Aste aperta in quel momento (niente
      Cloud Functions/cron). Se nessuno ce l'ha aperta, si chiude al
      successivo accesso. Accettabile per un gruppo di amici, ma è un
      limite architetturale, non un bug che si sistema in un file.
- [ ] Le regole Firestore ora richiedono solo "utente loggato", non
      verificano che sia davvero membro della lega che sta leggendo/
      scrivendo (fidelizzato al gruppo di amici). Se in futuro l'app
      cresce o diventa pubblica, va rifatto seriamente con controlli di
      membership nelle regole.

### Feature ancora finte/incomplete (basso impatto)
- [ ] Non esiste nessun invio reale di notifiche (push/email/in-app): il
      tab Notifiche ora salva la preferenza ma niente la legge ancora.
      Serve un canale di invio vero prima che questi checkbox contino
      qualcosa — è una feature nuova, non un bug, quindi non l'ho aggiunta
      di mia iniziativa.
- [ ] Nessuna validazione server-side seria su budget/puntate oltre ai
      limiti min/max: un utente "furbo" con accesso alla console Firebase
      potrebbe scrivere direttamente su Firestore bypassando i controlli
      client. Per soli amici è un rischio bassissimo. (Roba Firebase/regole
      Firestore, non toccata su richiesta esplicita.)

## Non toccare senza un motivo preciso
- `types/index.ts`: `AppState` è un tipo definito ma mai usato nel codice
  reale. Non è un bug, semplicemente non ancora adottato.
