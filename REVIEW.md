# REVIEW — Revisione design Fanta Points App

Branch: `chore/design-review` (da `master` @ `c932ef0`). **Stato (9/10): mergiato in develop e master, deployato.** Le cose ancora aperte sono in `TODO.md`.
Scopo: revisionare il design dell'app esistente (UI, sistema visivo,
identità) prima di toccare codice. Questo file viene scritto PRIMA della
revisione: fissa cosa si guarda, con quali criteri e cosa è già emerso da
una prima lettura del codice. I risultati della revisione vera vanno nella
sezione "Esiti" in fondo, schermata per schermata.

Regola del branch: niente feature nuove qui. Solo correzioni di design
(token, tipografia, spaziature, gerarchia, stati, mobile, identità).
Ogni modifica deve citare il punto di questo file che risolve.

---

## 1. Cosa c'è oggi (inventario, letto dal codice)

- **Stack UI**: Next.js + Tailwind v4 (CSS-first, niente
  `tailwind.config`) + shadcn/ui stile "new-york", icone `lucide-react`,
  toast `sonner`.
- **Palette** (`app/globals.css`, decisa il 28/9): base carbone freddo
  (hue 255-260) + oro (`--primary`, oklch hue 75) come unico accento
  caldo; verde/ambra/rosso/blu solo come stati semantici
  (`--success`/`--warning`/`--destructive`/`--info`). Niente gradienti.
- **Tema**: `<html className="dark">` fisso in `app/layout.tsx`. Esiste
  una palette chiara completa in `:root`, ma non c'è nessun modo di
  attivarla.
- **Font**: Inter caricato con `next/font` e applicato via `className`
  sul `body`.
- **Utility condivise**: `auth-shell` (pagine login/register/join),
  `stat-tile` (box statistiche).
- **Colori hardcoded**: zero classi Tailwind a colore fisso
  (`bg-red-500` e simili) nelle pagine; gli unici hex sono in
  `app/opengraph-image.tsx` (necessari lì, ma duplicano a mano i token).
- **Pagine e peso** (righe di codice, indicatore di complessità UI):
  aste 1678, classifica 1167, admin 978, import LoL 796, impostazioni
  532, pick'em 501, dashboard 364, pick/ban 359, team 271, guida 231.

## 2. Problemi già visibili prima di iniziare

Non sono ancora gli esiti della revisione; sono cose verificate nel codice
che la revisione deve confermare a schermo e prioritizzare.

1. **Nessuna identità**: `app/favicon.ico` è quella di default di
   create-next-app (stessa dimensione byte, 25931). In `public/` ci sono
   ancora `next.svg`, `vercel.svg`, `file.svg`, `globe.svg`,
   `window.svg` del template, non usati da nessun file. L'app non ha un
   logo né un marchio: il nome "Fanta Points App" è solo testo.
2. **Token font rotto**: `--font-sans`/`--font-mono` in `@theme`
   puntano a `--font-geist-sans`/`--font-geist-mono`, che non sono
   definiti da nessuna parte (si carica Inter, non Geist). Inter si vede
   solo perché è applicato con `className`; qualunque `font-mono`
   ricade sul font di sistema.
3. **Palette chiara morta**: mantenuta in `:root` ma irraggiungibile.
   O si offre un toggle, o si toglie e si dichiara l'app solo scura.
   Tenerla così è manutenzione senza beneficio.
4. **Pagine monolitiche**: aste (1678 righe) e classifica (1167) sono
   un solo file ciascuna. Rischio concreto di design incoerente dentro la
   stessa pagina (spaziature, gerarchie, stati vuoti diversi).
5. **OG image con hex copiati**: `#171b26`/`#c99a3f` ecc. sono la
   palette tradotta a mano. Se cambia un token, l'anteprima condivisa non
   segue.

### Stato dei punti sopra (8/10)

1. **Fatto (9/10).** Rimossi i 5 SVG del template da `public/`; marchio,
   favicon, icona iPhone e anteprima social nuovi (vedi E3).
2. **Fatto, ed era peggio del previsto.** `font-mono` è usato davvero
   (codici invito in `settings/page.tsx` e `admin/page.tsx`, posizioni
   in `standings/page.tsx`) e con la variabile Geist inesistente quei
   testi uscivano in Inter, non monospaziati. Ora `--font-sans` usa la
   variabile `--font-inter` di `next/font` (`app/layout.tsx`) e
   `--font-mono` lo stack monospaziato di sistema.
3. **Aperto, decisione tua**: tema chiaro con selettore oppure togliere
   la palette chiara e dichiarare l'app solo scura.
4. **Aperto, fuori scope del branch**: spezzare aste/classifica è un
   refactor di codice, non una correzione di design. Va fatto pagina per
   pagina durante la revisione delle schermate, non alla cieca.
5. **Aperto, basso valore**: `opengraph-image.tsx` gira come
   ImageResponse e non legge le variabili CSS; l'unica alternativa sono
   costanti condivise che però non seguirebbero comunque i token oklch.
   Lasciato com'è, da riallineare a mano se cambia la palette.

## 3. Criteri di revisione

Ogni schermata viene giudicata su questi punti, in quest'ordine di peso:

1. **Gerarchia**: in 3 secondi si capisce cosa conta e qual è l'azione
   principale? Una sola azione primaria (oro) per vista.
2. **Uso dell'accento**: l'oro resta raro. Se compare in più di 1-2
   elementi per schermata smette di guidare l'occhio.
3. **Stati**: vuoto, caricamento, errore, disabilitato, bloccato
   (stagione avviata, turno chiuso). Ognuno con testo che dice cosa fare.
4. **Mobile** (360-414 px): niente scroll orizzontale, tap target
   ≥ 44 px, tabelle che non esplodono, dialog che stanno nello schermo.
5. **Coerenza**: stessi pattern per stesse cose (card turno, riga
   classifica, badge punti, form a due campi) in tutte le pagine.
6. **Leggibilità**: contrasto `--muted-foreground` su `--card` e
   `--raised` (WCAG AA ≥ 4.5:1 per il testo), dimensioni minime 14 px.
7. **Densità**: le pagine admin possono essere dense; quelle del membro
   (dashboard, pick/ban, pick'em, team) no.
8. **Identità**: l'app si riconosce senza leggere il titolo?

## 4. Ordine di revisione

Dal più usato al meno usato, perché lì il costo di un design debole è più
alto:

- [ ] Dashboard (`app/dashboard/page.tsx`) + layout/navigazione
      (`app/dashboard/layout.tsx`)
- [ ] Aste (`app/dashboard/auctions/page.tsx`) + `DraftPanel`
- [ ] Classifica (`app/dashboard/standings/page.tsx`)
- [ ] Team (`app/dashboard/team/page.tsx`)
- [ ] Pick/Ban (`app/dashboard/championpick/page.tsx`)
- [ ] Pick'em (`app/dashboard/pickem/page.tsx`)
- [ ] Notifiche (`components/NotificationCenter.tsx`)
- [ ] Auth/join (`app/auth/*`, `app/join/*`) e landing (`app/page.tsx`)
- [ ] Admin, impostazioni, import LoL, guida
- [ ] Identità: favicon, logo, OG image

## 5. Metodo

- Screenshot reali dell'app (desktop 1440 px e mobile 390 px) per ogni
  schermata, non giudizio sul solo codice.
- Per ogni problema: schermata, cosa non va, perché conta, fix proposto,
  priorità (P1 rompe l'uso / P2 confonde / P3 estetica).
- Le correzioni si fanno su questo branch solo dopo che l'elenco è
  approvato, in commit piccoli, uno per tema.

## 6. Fuori scope

- Logica di gioco, punteggi, regole Firestore.
- Nuove feature o nuove pagine.
- Cambio di stack (Tailwind/shadcn restano).

---

## Esiti

### E1 — Animazioni (8/10)

**Domanda: serve GSAP? No.** L'app è un gestionale usato decine di volte
al giorno dagli stessi membri, non un sito marketing. Tutto il movimento
che esiste è "di sistema": dialog e menu che si aprono, il menu mobile,
le hover sui colori, uno spinner e i toast. Per questo bastano le
transizioni CSS che ci sono già (`tw-animate-css`, Radix, Sonner).
GSAP aggiungerebbe una libreria JS che anima dal main thread (sotto
carico perde frame più del CSS), per effetti (timeline, scroll,
pinning) che qui non hanno nessuno scopo. Se l'idea dietro GSAP è "far
sembrare l'app più premium", è la leva sbagliata: il vuoto vero è
l'identità (punto 2.1), non il movimento. GSAP diventa sensato solo se
un giorno si fa una landing pubblica con racconto a scroll.

Inventario completo del movimento (tutto il resto è statico):
- entrata/uscita di dialog, alert dialog, dropdown, select, sheet via
  `tw-animate-css` (keyframe, default 150 ms `ease`);
- menu mobile = `Sheet` laterale (`app/dashboard/layout.tsx:288`);
- `transition-colors` su card/righe cliccabili (dashboard, classifica,
  aste, impostazioni, navigazione);
- freccia della guida che ruota (`app/dashboard/guide/page.tsx:218`);
- spinner di caricamento (`app/dashboard/layout.tsx:93`);
- toast Sonner (gestisce da sé movimento e interruzioni).

Verificato e già corretto, niente da fare:
- dropdown e select scalano dal trigger
  (`origin-(--radix-*-content-transform-origin)`), non dal centro;
- dialog centrati con `zoom-in-95` + fade, 200 ms (corretto: i modali
  restano centrati, e nessun `scale(0)` da nessuna parte);
- hover: in Tailwind v4 `hover:` vale solo su dispositivi con hover
  reale, quindi niente hover "appiccicate" su mobile;
- nessuna proprietà di layout animata (`width`/`height`/`top`/...).

#### Risultati

| Prima | Dopo | Perché |
| --- | --- | --- |
| `components/ui/sheet.tsx:61` menu mobile: `ease-in-out`, apertura `duration-500`, chiusura `duration-300` | apertura 250 ms, chiusura 200 ms, `ease-[cubic-bezier(0.32,0.72,0,1)]` (curva drawer) | Il menu mobile si apre a ogni cambio pagina da telefono (decine di volte al giorno). 500 ms + `ease-in-out` partono lenti: è la sensazione di app impastata. Un drawer va sotto i 300 ms con una curva che parte veloce |
| `components/ui/sheet.tsx:61` classe `transition` insieme a `animate-in/out` | togliere `transition` | L'animazione è già fatta dai keyframe; `transition` aggiunge una transizione su tutte le proprietà che non serve a niente |
| `components/ui/button.tsx:8` `transition-all` | `transition-[color,background-color,border-color,box-shadow,transform]` | `all` anima qualunque proprietà cambi, comprese quelle che non dovrebbero (dimensioni, padding) e fuori GPU. Vanno elencate quelle volute |
| nessuna gestione di `prefers-reduced-motion` in tutto il progetto (`tw-animate-css` non ne ha) | in `app/globals.css`, fuori da ogni layer: `@media (prefers-reduced-motion: reduce) { [data-state] { --tw-enter-scale: 1; --tw-exit-scale: 1; --tw-enter-translate-x: 0; --tw-enter-translate-y: 0; --tw-exit-translate-x: 0; --tw-exit-translate-y: 0; } }` | Chi ha chiesto meno movimento al sistema operativo deve vedere solo dissolvenze, non zoom e scivolamenti. Così resta l'opacità (che spiega il cambio di stato) e sparisce il movimento |
| entrate di dialog/dropdown/select con l'`ease` di default | `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` come token in `@theme` e applicato a quelle entrate | L'`ease` di base è debole: a 150-200 ms quasi non si nota, ma una curva decisa fa sembrare l'apertura più pronta a parità di durata |
| bottoni senza feedback alla pressione | `active:scale-[0.97]` con `transition: transform 160ms ease-out` | Conferma tattile del tocco, utile soprattutto su mobile dove non c'è hover. Rifinitura, non urgente |

#### Verdetto

1. **Rompe la sensazione d'uso**: il menu mobile a 500 ms con
   `ease-in-out`. È l'unico problema che un utente percepisce davvero, e
   lo percepisce ogni volta che naviga da telefono.
2. **Prestazioni**: `transition-all` sui bottoni. Oggi non fa danni
   visibili, ma è la classica trappola che salta fuori quando qualcuno
   aggiunge un cambio di dimensione a un bottone.
3. **Accessibilità**: nessun rispetto di `prefers-reduced-motion`. Fix
   da 6 righe CSS, nessun motivo per non farlo.
4. **Coerenza/rifinitura**: curva di easing di default troppo morbida,
   nessun feedback alla pressione. Bassa priorità.

**Decisione: Block** finché non si sistemano il menu mobile (punto 1) e
`transition-all` (punto 2), che hanno entrambi una correzione banale.
Reduced motion va nello stesso commit perché costa uguale. Il resto è
rifinitura e può aspettare. GSAP: non serve, non va aggiunto.

#### Pulizia applicata (8/10)

| Punto | Stato | Dove |
| --- | --- | --- |
| Menu mobile 500/300 ms `ease-in-out` | **Fatto**: 250 ms apertura, 200 ms chiusura, curva `ease-drawer` (`cubic-bezier(0.32, 0.72, 0, 1)`); tolta la classe `transition` ridondante | `components/ui/sheet.tsx:61` |
| `transition-all` sui bottoni | **Fatto**: `transition-[color,background-color,border-color,box-shadow,opacity]` | `components/ui/button.tsx:8` |
| `prefers-reduced-motion` assente | **Fatto**: regola fuori da ogni layer che azzera zoom e scivolamenti di `tw-animate-css`, restano le dissolvenze | `app/globals.css` (in fondo) |
| Curva di default debole | **Fatto**: token `--ease-out-strong` (`cubic-bezier(0.23, 1, 0.32, 1)`) applicato a dialog, alert dialog, dropdown (menu e sottomenu), select | `app/globals.css` `@theme`, `components/ui/{dialog,alert-dialog,dropdown-menu,select}.tsx` |
| Feedback alla pressione sui bottoni | **Fatto (8/10, su richiesta)**: `active:scale-[0.97]`, transizione 150 ms `ease-out` sulla proprietà `scale` (in Tailwind v4 `scale-*` usa la proprietà CSS `scale`, non `transform`: con `transform` nella lista la pressione scattava senza transizione), annullato con `motion-reduce` | `components/ui/button.tsx:8` |

Verifica a schermo del feedback alla pressione (Chromium headless sulla
landing, che non richiede login): a riposo `scale: none`, premuto
`0.97`, transizione `scale` 150 ms `cubic-bezier(0, 0, 0.2, 1)`; con
`prefers-reduced-motion: reduce` premuto resta `1`.

Verifiche: `next build` passa; nel CSS compilato ci sono le utility
`ease-drawer`/`ease-out-strong` (impostano `--tw-ease`, che è la
variabile letta da `tw-animate-css`), `duration-250` sullo stato aperto
e la regola `prefers-reduced-motion`. **Non verificato a schermo**: le
pagine della dashboard richiedono login Firebase, quindi la resa del menu
mobile va controllata da telefono dopo il deploy di prova.

Nota sulla skill `gpt-taste` usata per questo passaggio: impone GSAP con
pinning/scroll, hover `scale-105` a 700 ms, struttura da landing (hero,
bento, CTA) e vieta Inter. Sono regole per pagine marketing; applicate a
un gestionale peggiorerebbero esattamente i problemi trovati qui sopra
(movimento lento su azioni frequenti). Usata solo per la parte "pulisci
le animazioni". L'unico posto dove potrebbe avere senso è la landing
`app/page.tsx`, se un giorno diventa una pagina pubblica vera.

### E2 — Code review completa: logica e regole (8/10)

Fonte: `/code-review` su tutta la codebase, 10 segnalazioni. Ognuna
verificata sul codice prima di correggerla; quelle su Firestore anche
nell'emulatore, contro le regole attualmente in produzione (master).
Durante la verifica sono emersi altri 2 bug, aggiunti in fondo.

| # | Problema | Verificato | Correzione | Dove |
| --- | --- | --- | --- | --- |
| 1 | "Ricalcola Punteggi" con Leaguepedia in rate limit scriveva 0 punti a tutte le pick e a tutti i turni | Sì: `cargoQuery` restituiva `[]` su ogni errore e le statistiche erano pre-riempite a 0 | `cargoQuery` ha una modalità strict che lancia `LEAGUEPEDIA_UNAVAILABLE`; la usano le 3 funzioni che producono punteggi. Il ricalcolo si ferma prima di scrivere e mostra un messaggio chiaro. Le ricerche giocatori mantengono il fallback | `lib/leaguepediaApi.ts`, `app/dashboard/standings/page.tsx`, `app/dashboard/championpick/page.tsx` |
| 2 | Ingresso in lega da link `/join/{code}` sempre negato | Sì, emulatore con regole di master: `permission-denied` | Nuovo caso nella regola `members.create`: solo se stessi, solo "membro", con il codice invito attuale della lega (`joinCode`), rosa vuota e budget di partenza della lega | `firestore.rules`, `app/join/[code]/page.tsx` |
| 3 | Pick di draft persa dopo che il turno era già avanzato (team/coach con `playerRole: undefined`); jolly senza ruolo, quindi mai punti | Sì: Firestore senza `ignoreUndefinedProperties`, `arrayUnion` falliva (riprodotto nell'emulatore) | `ignoreUndefinedProperties: true` in `lib/firebase.ts`; pick di draft costruita da una funzione unica che omette i campi vuoti e tiene il ruolo del jolly; il pannello passa il ruolo e il form dei turni saltati lo chiede per i jolly | `lib/firebase.ts`, `contexts/FantaContext.tsx`, `components/DraftPanel.tsx` |
| 4 | Con un numero dispari di membri il ricalcolo dei turni falliva (`awayPoints: undefined` sul bye) | Sì (emulatore) | Coperto da `ignoreUndefinedProperties` | `lib/firebase.ts` |
| 5 | Impossibile creare aste per il coach (`playerRole: undefined` in `addDoc`) | Sì (emulatore) | Coperto da `ignoreUndefinedProperties` | `lib/firebase.ts` |
| 6 | Pick/Ban: listener e chiusura turno negati dalle regole (le regole non filtrano le query) | Sì, emulatore con regole di master: negato **per tutti, admin compreso**. La feature in produzione non ha mai funzionato | Regola divisa in `get` (per id, come prima) e `list` (solo `userId == me` o `revealed == true`). Listener = due query vincolate unite. La chiusura legge il pick di ogni membro per id e scrive `revealed: true`. Nessuno, admin compreso, può interrogare le scelte non ancora rivelate | `firestore.rules`, `contexts/FantaContext.tsx` |
| 7 | Tabellone: vincitore fissato al primo ricalcolo anche a metà turno; un pareggio bloccava il tabellone per sempre | Sì | Vincitore deciso solo a turno finito (`endDate` passata); pareggio vinto da chi ha più punti in stagione, poi dal seed migliore (home) | `contexts/FantaContext.tsx` |
| 8 | Gironi: il turno di riposo (bye) contava come vittoria | Sì | Il bye conta per i punti fatti (simmetrico: con un numero dispari di membri ognuno ne ha uno) ma non come vittoria | `lib/bracket.ts` |
| 9 | Offerta: riserva di budget sbagliata di uno (lo slot in asta veniva riservato due volte) | Sì, il commento stesso diceva "dopo questo" | Riserva = posti da riempire **dopo** quello in asta, in `placeBid` e nel tetto mostrato in UI | `contexts/FantaContext.tsx`, `app/dashboard/auctions/page.tsx` |
| 10 | Chiunque loggato, anche di un'altra lega, poteva riscrivere budget e rose dei membri, e calendario/gironi/tabellone/storico/offerte | Sì, emulatore con regole di master: consentito | `members.update` richiede di essere membro; calendario, gironi e tabellone scrivibili solo da admin/vice/developer; storico e offerte solo dai membri | `firestore.rules` |
| 11 | **Nuovo**: ruoli Leaguepedia ("Mid", "Bot", "Top", "Jungle") diversi da quelli di pesi e limiti ("Mid Laner", "ADC", ...). Un giocatore LoL preso all'asta prendeva punti solo se Support; limiti per ruolo mai applicati; nel draft liste per ruolo vuote tranne Support | Sì: `mapLeaguepediaRecord` copiava il ruolo grezzo, le chiavi dei pesi sono `LOL_ROLES` | `toLolRole()` in `lib/constants.ts`, applicata dove nascono i dati Leaguepedia e in ogni confronto o lookup per ruolo, così anche le pick già salvate col ruolo grezzo prendono i pesi giusti | `lib/constants.ts`, `lib/leaguepediaApi.ts`, `lib/scoring.ts`, `contexts/FantaContext.tsx`, `app/dashboard/{auctions,standings}/page.tsx` |
| 13 | **Completamento del 10**: aste e draft modificabili da chiunque loggato; `proplayers` scrivibile da chiunque; pronostici Pick'em salvabili da non membri; un membro poteva alzarsi il budget o toccare nome e budget degli altri | Sì, leggendo le regole; ogni caso coperto da un test nell'emulatore | Aste, draft e pronostici richiedono di essere membri. `proplayers` scrivibile solo dai developer (nessuna pagina la scrive). Membri normali: budget coerente (`budgetTot` fisso, quanto scende `budgetLeft` tanto sale `budgetSpent`, mai oltre il totale); sul documento di un altro solo un'assegnazione (rosa che cresce, spesa che non scende, nient'altro). Admin/vice/developer restano liberi | `firestore.rules` |
| 14 | `finalizeAuction`: `try/catch` attorno a `updateDoc`/`addDoc` non catturava niente (errori asincroni), un'assegnazione negata spariva senza log | Sì | `.catch()` sulle due scritture | `contexts/FantaContext.tsx` |
| 12 | **Nuovo, mio, del 6/10**: il listener dei pick copiava solo nome e punti, quindi ban e dettaglio punti non arrivavano mai alla pagina | Sì | Il listener riscritto per il punto 6 copia tutti i campi | `contexts/FantaContext.tsx` |

#### Verifiche fatte

- Regole Firestore, emulatore: **64/64** casi passano (join valido e 6
  varianti invalide, estranei respinti su membri, calendario, gironi,
  tabellone, storico, offerte, aste, draft, cache giocatori e pronostici,
  budget manomessi respinti, assegnazioni legittime di asta e draft dal
  browser di un altro membro consentite, query consentite e vietate sui
  pick, flusso di chiusura turno completo). Le stesse prove sulle regole di
  master confermano che i punti 2, 6 e 10 erano reali.
- `ignoreUndefinedProperties`, emulatore: senza l'opzione `arrayUnion`,
  la fixture col bye e l'asta coach falliscono; con l'opzione passano.
- Logica pura: classifica girone con bye (A, B, C come atteso), mappa dei
  ruoli, punti di una pick vecchia con ruolo "Mid" (prima `undefined`,
  ora calcolati).
- `tsc`, `eslint` (solo 2 warning già esistenti), `next build` puliti.

#### Da sapere prima del merge

- **Le regole vanno in produzione da sole** col merge su master
  (workflow `deploy-firestore.yml`). Vanno insieme al codice: le regole
  nuove senza il client nuovo romperebbero listener e chiusura dei pick.
  Stesso merge, nessun problema.
- **Turni Pick/Ban già chiusi**: i pick lì non hanno `revealed`, quindi
  dopo il deploy ognuno vede solo i propri finché un admin non preme
  "Ricalcola Punti" su ciascun turno chiuso (rilegge, ricalcola e rivela).
- **Limite che resta, ridotto**: un membro non può più alzarsi il budget
  né togliere o rinominare niente agli altri, ma può ancora "assegnare"
  a un altro membro un giocatore inventato scalandogli il budget, perché
  l'assegnazione legittima di un'asta parte dal browser di chiunque sia
  connesso e le regole non possono verificare che l'asta esista davvero.
  Si chiude solo con una Cloud Function (già in TODO.md).
- **Non provato a schermo**: le pagine della dashboard richiedono login
  Firebase. Il primo test reale è dopo il deploy: join da link, un turno
  Pick/Ban chiuso, un ricalcolo.

### E3 — Revisione dell'intera app, a schermo (9/10)

Metodo: app avviata in locale contro gli emulatori Firebase (Auth +
Firestore, regole vere del progetto) con una lega LoL finta di 6 membri,
rose, aste, calendario e Pick/Ban. Screenshot di tutte le pagine a 1440px
e 390px prima e dopo, più misura automatica dello sforamento orizzontale
su ogni pagina mobile. Per rifarlo: `NEXT_PUBLIC_FIREBASE_EMULATORS=true`
(nuovo, in `lib/firebase.ts`, nessun effetto in produzione).

**Verdetto sul design generale**: la base regge (palette scura con un solo
accento, componenti coerenti, spaziature ordinate). I problemi veri erano
di rigore, non di stile: oro usato ovunque, colori con un significato
sbagliato, azioni duplicate, mobile che sbordava, e nessuna identità.

| # | Priorità | Problema (visto a schermo) | Correzione | Dove |
| --- | --- | --- | --- | --- |
| 1 | P1 | **Login che rimandava al login**: `login()` va subito a `/dashboard` mentre il profilo si carica in modo asincrono, `isLoading` era già `false` e il layout vedeva `user=null` | `isLoading` torna `true` finché il profilo non è caricato; se il caricamento fallisce si torna non autenticati invece di uno spinner infinito | `contexts/AuthContext.tsx` |
| 2 | P1 | Mobile: Aste (445px) e Gestione (480px) sbordavano su schermi da 390px | Righe delle aste che vanno a capo sotto `sm`; tab di Gestione scorrevoli. Misurato dopo: 12 pagine su 12 a 390px | `auctions/page.tsx`, `admin/page.tsx` |
| 3 | P1 | Toast in alto a destra sopra selettore lega, notifiche e avatar, anche quello persistente "Asta partita" | Toast in basso a destra (centrati in basso su mobile) | `app/layout.tsx` |
| 4 | P1 | Pick/Ban: chi non aveva scelto poteva farlo a turno finito, cioè a risultati noti; "Chiudi Turno" disponibile su turni non ancora giocati; 5 form aperti insieme | Si sceglie solo nel turno in corso o nel prossimo; turni lontani in una riga compatta; stato "Da chiudere" e chiusura solo a turno finito. **Solo interfaccia**: le regole Firestore non conoscono le date dei turni | `championpick/page.tsx` |
| 5 | P2 | "Blocca Asta" (oro) e "Chiudi Asta" (rosso) chiamavano la stessa funzione; il rosso suggeriva un'azione distruttiva che non lo era | Un solo "Chiudi e assegna"; "Metti in pausa" al posto di "Salva Asta"; "Annulla asta" come unica azione rossa, con conferma | `auctions/page.tsx` |
| 6 | P2 | Countdown "3033s" | Formato `mm:ss` con cifre tabellari, rosso solo negli ultimi 10 secondi | `auctions/page.tsx` |
| 7 | P2 | Oro ovunque: badge di ruoli, stati, "Creatore", "Mercato chiuso" e punti tutti in oro pieno, in competizione col bottone principale | Badge di default in tinta oro tenue; nuova variante `success` per gli stati attivi; ruoli in contorno. Oro pieno solo sull'azione principale | `components/ui/badge.tsx` e pagine |
| 8 | P2 | Team: "Speso" in rosso come un errore, "Rimanente" in verde | Numeri neutri, rimanente in evidenza perché è quello che serve per decidere un'offerta | `team/page.tsx` |
| 9 | P3 | Testi: "4 giocatorei acquisiti", "Hai già 1 giocatori nel ruolo" | Plurali corretti, messaggio riscritto | `team/page.tsx`, `auctions/page.tsx` |
| 10 | P3 | Stesso posto con due nomi: "Le Mie Leghe" nel menu, "Tutte le Leghe" nella pagina | "Leghe" in entrambi | `dashboard/layout.tsx`, `dashboard/page.tsx` |
| 11 | P3 | "Crediti di tutti" tagliava una riga a metà | Altezza che mostra una lega intera (6-10 membri) | `auctions/page.tsx` |
| 12 | P3 | Titoli grandi in Inter con spaziatura piena sembrano larghi | Tracking -0.02em su `h1`/`h2` | `app/globals.css` |

#### Logo

Prima non c'era un logo: solo la scritta "Fanta Points App" e la favicon
di default di Next.js. Il nuovo marchio è una **F fatta di barre di
classifica** che si accorciano (1° posto la più lunga) **più un punto**:
si legge F· (Fanta Points) ed è una classifica stilizzata, cioè il cuore
dell'app. Tessera arrotondata oro, segni scuri, gli stessi due colori dei
token. Il nome diventa "Fanta Points" senza "App".

- `components/Logo.tsx`: marchio + nome, colori dai token CSS.
- Usato in header, menu mobile, landing, login, registrazione e join.
- `app/icon.svg` (favicon), `app/apple-icon.tsx` (icona iPhone),
  `app/opengraph-image.tsx` (anteprima nei link condivisi, prima con
  colori copiati a mano che non coincidevano con i token: ora convertiti
  dai valori oklch reali).
- Landing riscritta: marchio, una frase, due azioni, tre punti. Tolti
  l'etichetta "Fantasy management", l'elenco che ripeteva le card e i
  bianchi fissi.

#### Cosa non ho toccato, e perché

- **Tema chiaro**: resta la tua decisione (selettore o solo scuro).
- **Pagine Aste (1678 righe) e Classifica (1167)**: spezzarle è un
  refactor di codice; oggi a schermo sono coerenti.
- **Toast persistente "Asta partita"**: ora non copre più l'header, ma
  in basso può coprire un bottone finché non lo chiudi. È una scelta di
  NotificationCenter (avviso che deve restare), non un difetto di stile.
- **Il marchio è una proposta**: se non ti convince la direzione (barre di
  classifica + punto), la geometria sta in un solo posto
  (`LOGO_GEOMETRY`) più le tre versioni statiche.
