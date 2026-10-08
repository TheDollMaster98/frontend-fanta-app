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

_(da compilare durante la revisione)_
