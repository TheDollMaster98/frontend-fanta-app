"use client";

interface GuideSection {
  title: string;
  body: React.ReactNode;
}

const SECTIONS: GuideSection[] = [
  {
    title: "Tipi di lega: League of Legends vs Personalizzato",
    body: (
      <>
        <p>
          <strong>League of Legends</strong>: il punteggio dei giocatori/
          squadre si calcola in automatico da dati reali (Leaguepedia/
          lolesports) — kill, morti, assist, vittorie, CS, Vision Score.
          I ruoli sono quelli fissi del gioco (Top, Jungle, Mid, ADC,
          Support).
        </p>
        <p>
          <strong>Personalizzato</strong>: nessuna fonte automatica.
          L&apos;admin definisce i ruoli liberamente in creazione, e il
          punteggio di ogni pick va inserito a mano da admin/vice in
          Classifica.
        </p>
      </>
    ),
  },
  {
    title: "Modalità: Asta live vs Draft a turni",
    body: (
      <>
        <p>
          <strong>Asta live</strong>: un membro alla volta (chiunque, non
          solo admin/vice) mette all&apos;asta un giocatore/squadra/coach,
          tutti rilanciano in tempo reale con un budget condiviso (il
          &quot;Budget Generale&quot; scelto in creazione lega), vince chi
          offre di più entro il countdown.
        </p>
        <p>
          <strong>Draft a turni (snake)</strong>: niente asta né budget.
          Si sceglie a turno in un ordine casuale generato all&apos;avvio,
          che si inverte a ogni giro (1→N, N→1, 1→N...). Ogni giro è un
          ruolo fisso, uguale per tutti i membri. Se un turno scade senza
          scelta, admin/vice lo assegna a mano dopo.
        </p>
        <p className="text-sm text-muted-foreground">
          La modalità si sceglie alla creazione della lega e non è più
          cambiabile dopo.
        </p>
      </>
    ),
  },
  {
    title: "Circuiti LoL: campionato normale vs Worlds/MSI",
    body: (
      <>
        <p>
          <strong>Campionato normale</strong> (LCK, LPL, LEC, LCS, Altro):
          fase unica, calendario a girone all&apos;italiana tra i membri
          della lega (Classifica → Genera Calendario). Ogni turno ha una
          finestra di date reali: il punteggio di quel turno è la somma
          dei punti fantasy ottenuti dai roster SOLO nelle partite pro
          giocate in quella finestra.
        </p>
        <p>
          <strong>Worlds / MSI</strong>: circuiti a eliminazione. Prima
          una fase a gironi (Classifica → Genera Gironi, dopo aver
          Avviato la Stagione), poi un tabellone a eliminazione diretta
          generato dai qualificati di ogni girone (Genera Bracket).
          &quot;Ricalcola Punteggi&quot; fa avanzare il tabellone di un
          turno alla volta quando tutti i match di un turno sono decisi.
        </p>
      </>
    ),
  },
  {
    title: "Calendario, Classifica e Ricalcola Punteggi",
    body: (
      <p>
        &quot;Ricalcola Punteggi&quot; (in Classifica, admin/vice) non
        girA da solo: va premuto a mano quando si vogliono punti
        aggiornati — non c&apos;è un cron/automazione in quest&apos;app.
        Calcola sia il totale cumulativo di ogni pick sia, se esiste un
        calendario, il punteggio di ogni singolo turno (il confronto
        diretto tra i due membri di una fixture).
      </p>
    ),
  },
  {
    title: "Pick'em (solo Worlds/MSI)",
    body: (
      <>
        <p>
          Pronostico sul bracket <strong>vero</strong> del torneo
          (squadre pro, non i membri della lega). L&apos;admin crea il
          bracket (round + scontri + punti per round), ogni membro
          pronostica il vincitore di ogni scontro. I pronostici si
          bloccano tutti insieme quando l&apos;admin preme &quot;Blocca
          Pronostici&quot; — prima di allora si possono ancora modificare,
          dopo no. L&apos;admin inserisce il vincitore reale di ogni
          match dopo che è stato giocato (a mano, nessuna fonte
          automatica): punti crescenti per round, decisi dall&apos;admin.
        </p>
      </>
    ),
  },
  {
    title: "Pick/Ban Campione settimanale (leghe senza eliminazione)",
    body: (
      <>
        <p>
          Ogni membro scommette UN campione per il turno calendario
          corrente: 2 punti se quel campione viene pickato in almeno una
          partita pro reale di quella settimana (anche se in un&apos;altra
          partita della stessa settimana è stato bannato altrove), 0
          punti se non viene mai scelto da nessuna squadra.
        </p>
        <p>
          La scelta si blocca al salvataggio ed è nascosta agli altri
          membri finché admin/vice non preme &quot;Chiudi Turno e Calcola
          Punti&quot; — scommessa alla cieca vera, non solo un filtro
          visivo.
        </p>
      </>
    ),
  },
  {
    title: "Centro notifiche (campanella in alto)",
    body: (
      <p>
        Richieste di ingresso da approvare (admin/vice), esito delle tue
        richieste, aste che partono (con un avviso rapido per
        partecipare), partite finite delle squadre in rosa nella tua
        lega. Funziona solo mentre hai la dashboard aperta: non è una
        notifica push vera, quest&apos;app non ha un server che avvisa chi
        ha chiuso il browser.
      </p>
    ),
  },
  {
    title: "Ruoli: chi può fare cosa",
    body: (
      <>
        <p>
          <strong>Membro</strong>: partecipa ad aste/draft, fa pick/ban
          campione, pronostica nel Pick&apos;em, vede la classifica.
        </p>
        <p>
          <strong>Vice-admin</strong>: in più, gestisce aste già avviate
          (chiudi/annulla/assegna manualmente), genera calendario/gironi/
          bracket, modifica impostazioni lega, chiude turni Pick/Ban,
          gestisce il bracket Pick&apos;em.
        </p>
        <p>
          <strong>Admin (creatore)</strong>: in più, promuove/rimuove
          vice-admin, caccia membri, elimina la lega.
        </p>
        <p>
          <strong>Developer</strong>: accesso universale a tutte le
          leghe, senza bisogno di farne parte o di avere un ruolo —
          usato per gestire l&apos;app, non per giocare normalmente.
        </p>
      </>
    ),
  },
  {
    title: "Gestione Lega (sidebar, solo admin/vice)",
    body: (
      <p>
        Impostazioni generali (budget, countdown, puntate, limiti rosa),
        avvia/riapri la stagione, membri e vice-admin, richieste di
        ingresso, link di invito alla lega, elimina la lega. Dalla
        pagina Impostazioni, ogni lega dove hai un ruolo di gestione ha
        anche un accesso rapido (&quot;Gestisci&quot;) che ti porta qui
        senza dover prima cambiare &quot;Lega Attiva&quot; a mano.
      </p>
    ),
  },
  {
    title: "Inviti e registrazione",
    body: (
      <p>
        La registrazione di un nuovo utente richiede un link d&apos;invito
        a uso singolo (lo genera un developer, in Impostazioni). Entrare
        in una lega già esistente invece non serve un invito app-wide:
        basta il link diretto della lega (Gestione Lega → Invita Membri)
        o una richiesta d&apos;ingresso approvata dall&apos;admin.
      </p>
    ),
  },
];

export default function GuidePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Guida</h1>
        <p className="text-muted-foreground mt-2">
          Come funziona l&apos;app, sezione per sezione.
        </p>
      </div>

      <div className="space-y-3">
        {SECTIONS.map((section) => (
          <details
            key={section.title}
            className="group rounded-lg border border-border bg-card"
          >
            <summary className="cursor-pointer list-none p-4 font-semibold text-foreground">
              <span className="mr-2 inline-block transition-transform group-open:rotate-90">
                ›
              </span>
              {section.title}
            </summary>
            <div className="space-y-2 border-t border-border px-4 pb-4 pt-3 text-sm text-muted-foreground">
              {section.body}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
