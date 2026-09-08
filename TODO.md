# TODO — Fanta Points App

Lista onesta di cosa manca, aggiornata dopo il giro di bugfix + persistenza
aste su Firestore. Non è per uso commerciale: le priorità sono "l'app non si
rompe" e "le aste funzionano per tutti", non sicurezza enterprise.

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
- [ ] **Step 3 — Drill-down**: parzialmente coperto in anticipo dalla
      pagina Classifica (click su un membro mostra il dettaglio pick per
      pick con i punti), ma manca il livello sotto: click su un giocatore
      per vedere le partite reali giocate e quanti punti ha fatto in
      ognuna. Serve salvare i dati partita per partita, non solo il totale
      aggregato come ora.
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
