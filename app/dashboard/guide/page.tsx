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
          squadre si calcola in automatico da Leaguepedia: per i giocatori
          kill, morti, assist, vittorie, CS, Vision Score e pentakill; per
          squadre e coach vittorie e obiettivi (torri, draghi, void grub,
          araldi, inibitori, Atakhan, baroni, kill, oro).
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
          offre di più entro il countdown. Allo scadere l&apos;asta si
          chiude e si assegna da sola, entro un minuto, anche se nessuno
          ha la pagina aperta.
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
          <strong>Worlds / MSI: come si vince.</strong> Tre passi.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <strong>Gironi</strong>: sei in un gruppo e ogni turno sfidi un
            altro del gruppo. Vince chi fa più punti fantasy nei giorni del
            turno. Nel girone conta prima il numero di vittorie, poi i
            punti fatti.
          </li>
          <li>
            <strong>Tabellone</strong>: passano i primi di ogni gruppo
            (quanti lo decide l&apos;admin quando genera i gironi). Da qui
            si va a eliminazione diretta, stessa sfida a punti: chi perde
            è fuori. Pareggio: passa chi ha più punti in stagione.
          </li>
          <li>
            <strong>Finale</strong>: chi la vince vince la lega.
          </li>
        </ol>
        <p>
          In Classifica la scheda &quot;Come si vince&quot; dice a che
          punto è il torneo e qual è la tua situazione. Pick&apos;em e
          Pick/Ban hanno classifiche a parte e non cambiano chi vince la
          lega. Per l&apos;admin: Classifica → Genera Gironi (dopo Avvia
          Stagione, scegliendo anche quanti passano per gruppo). Il
          tabellone si genera da solo a gironi finiti e avanza da solo;
          &quot;Genera Fase Eliminazione&quot; serve solo per farlo prima o
          rifarlo. Il pannello Percorso Mondiali in Classifica dice cosa
          manca e quando si sono aggiornati i punti.
        </p>
      </>
    ),
  },
  {
    title: "Calendario, Classifica e Ricalcola Punteggi",
    body: (
      <p>
        I punteggi si ricalcolano da soli due volte al giorno (alle 6 e
        alle 18): il totale di ogni pick e, se esiste un calendario, il
        punteggio di ogni turno (il confronto diretto tra i due membri di
        una fixture). &quot;Ricalcola Punteggi&quot; (in Classifica,
        admin/vice) serve solo se si vogliono i punti aggiornati subito.
      </p>
    ),
  },
  {
    title: "Pick'em (solo Worlds/MSI)",
    body: (
      <>
        <p>
          Pronostico sulla fase a eliminazione <strong>vera</strong> del
          torneo (squadre pro, non i membri della lega). Scegli chi vince
          ogni quarto; le semifinali si formano coi tuoi vincenti, e così
          la finale. Ogni pronostico giusto vale i punti del suo turno
          (di base 1 i quarti, 2 le semifinali, 3 la finale).
        </p>
        <p>
          Admin: &quot;Struttura Mondiali&quot; crea quarti, semifinali e
          finale; si scrivono solo le 8 squadre dei quarti. Poi si blocca
          prima del primo match e si inseriscono i vincitori veri man mano
          (solo a pronostici bloccati, così nessuno pronostica conoscendo
          i risultati).
        </p>
      </>
    ),
  },
  {
    title: "Pick/Ban Campione (tutte le leghe LoL)",
    body: (
      <>
        <p>
          Ogni membro scommette UN campione per il turno corrente che
          pensa verrà pickato in una partita pro reale nei giorni del
          turno. Vale anche ai Mondiali e all&apos;MSI: un turno per ogni
          turno dei gironi e uno per ogni turno del tabellone. Se succede, i punti dipendono da quanti membri
          hanno scelto lo stesso campione: 4 se sei l&apos;unico, 2 se
          siete in due, 1 se siete in tre o più; +1 se è stato giocato da
          una squadra che ha vinto.
        </p>
        <p>
          Facoltativo: un campione che pensi verrà bannato dalla squadra
          pro che hai in rosa (+2 se indovini). Se non hai una squadra in
          rosa, o se la tua non gioca quella settimana, vale il circuito
          intero (+1).
        </p>
        <p>
          La scelta si blocca al salvataggio, si può fare solo prima della
          fine del turno ed è nascosta agli altri membri finché il turno
          non viene chiuso — scommessa alla cieca vera, non solo un filtro
          visivo. Il turno si chiude da solo qualche ora dopo la fine, coi
          punti calcolati; admin/vice possono anche chiuderlo a mano.
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
