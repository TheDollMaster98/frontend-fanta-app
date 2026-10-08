# REVIEW — Revisione design Fanta Points App

Branch: `chore/design-review` (da `master` @ `c932ef0`).
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

1. **Parziale.** Rimossi i 5 SVG del template da `public/` (verificato
   prima che nessun file li usasse). Favicon e logo restano aperti: serve
   un marchio deciso da te, non si inventa in un commit.
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
