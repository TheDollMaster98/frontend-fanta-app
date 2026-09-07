# TODO — Fanta Points App

Lista onesta di cosa manca, aggiornata dopo il giro di bugfix + persistenza
aste su Firestore. Non è per uso commerciale: le priorità sono "l'app non si
rompe" e "le aste funzionano per tutti", non sicurezza enterprise.

## Fatto in questo giro

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
- `types/index.ts`: `Team`, `Bid`, `AppState` sono tipi definiti ma mai
  usati nel codice reale (la persistenza usa `teamBudgets`/`players`/
  `auctions` come collezioni piatte, non l'oggetto `Team` aggregato). Non
  sono bug, sono semplicemente non ancora adottati — se un giorno serve un
  modello più ricco per team, sono già lì.
