"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DEFAULT_BID_PRESETS,
  getFantaRoles,
  MIN_COUNTDOWN_SECONDS,
  MAX_COUNTDOWN_SECONDS,
  PLAYOFF_CIRCUIT_TOURNAMENT_QUERY,
  toLolRole,
} from "@/lib/constants";
import {
  getPlayersByLeague,
  getPlayerImage,
  getPlayerStats,
  searchTeams,
  type LeaguepediaPlayer,
  type LeaguepediaPlayerStats,
  type LeaguepediaTeam,
} from "@/lib/leaguepediaApi";
import type { Auction, Bid, TeamPickType } from "@/types";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Flame, Ban, Lock, Pause } from "lucide-react";
import { toast } from "sonner";
import { useFanta } from "@/contexts/FantaContext";
import { useAuth } from "@/contexts/AuthContext";
import { DraftPanel } from "@/components/DraftPanel";

const PICK_TYPE_LABELS: Record<TeamPickType, string> = {
  player: "Giocatore",
  jolly: "Jolly",
  team: "Squadra",
  coach: "Coach",
};

// 3033 -> "50:33", 45 -> "0:45": i secondi nudi oltre il minuto non si
// leggono a colpo d'occhio.
function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function AuctionsPage() {
  const {
    currentFanta,
    auctions,
    createAuction: createAuctionInFirestore,
    startAuction: startAuctionInFirestore,
    pauseAuction,
    placeBid: placeBidInFirestore,
    closeAuction: closeAuctionInFirestore,
    cancelAuction: cancelAuctionInFirestore,
    reopenAuction,
    deleteAuction,
    updatePendingAuction,
    assignAuctionManually,
    getPlayersByUser,
    getUserBudget,
    fantaMembers,
    getMemberName,
    isFantaViceOrAdmin,
    currentMember,
  } = useFanta();
  const { user } = useAuth();
  const [detailAuction, setDetailAuction] = useState<Auction | null>(null);
  const [manualAssignTo, setManualAssignTo] = useState("");
  const [bidHistory, setBidHistory] = useState<Bid[]>([]);
  const [editAuction, setEditAuction] = useState<Auction | null>(null);
  const [editForm, setEditForm] = useState({
    basePrice: 0,
    countdownSeconds: 0,
    description: "",
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Aste condivise via Firestore (contexts/FantaContext.tsx): questa pagina
  // legge/scrive tramite le funzioni del context, non tiene più uno stato
  // locale separato per asta attiva/prezzo/offerente.
  const activeAuction = useMemo(
    () => auctions.find((a) => a.status === "active") ?? null,
    [auctions],
  );

  // Storico delle offerte dell'asta attiva: chi ha rilanciato, quando e di
  // quanto, non solo l'ultima. Lettura diretta da Firestore, come già fa
  // admin/page.tsx per i membri: è un dato utile solo qui, non serve
  // portarlo nel FantaContext condiviso.
  useEffect(() => {
    // Niente da fare senza un'asta attiva: uno storico rimasto in stato da
    // un'asta precedente non si vede comunque, dato che questa sezione è
    // renderizzata solo dentro la card "Asta Attiva".
    if (!activeAuction) return;

    const bidsQuery = query(
      collection(
        db,
        "fantas",
        activeAuction.fantaId,
        "auctions",
        activeAuction.id,
        "bids",
      ),
      orderBy("createdAt", "desc"),
      limit(15),
    );

    const unsubscribe = onSnapshot(bidsQuery, (snapshot) => {
      setBidHistory(
        snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            auctionId: data.auctionId,
            userId: data.userId,
            userName: data.userName,
            amount: data.amount,
            createdAt: data.createdAt?.toDate?.() || new Date(),
          } as Bid;
        }),
      );
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAuction?.id]);

  // Il countdown va ricalcolato ogni secondo a partire da countdownEndsAt
  // (valore condiviso su Firestore), non da un contatore locale che
  // desincronizzerebbe ogni client.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!activeAuction) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [activeAuction]);
  const countdown = activeAuction?.countdownEndsAt
    ? Math.max(
        0,
        Math.ceil((activeAuction.countdownEndsAt.getTime() - now) / 1000),
      )
    : 0;

  const maxBid = currentFanta?.settings.maxBid;

  // Rosa e budget dell'utente corrente, per sapere se può ancora fare
  // offerte su questa asta: limite rosa totale, limite per ruolo, e budget
  // minimo da lasciare per gli slot ancora liberi (1 credito ciascuno,
  // altrimenti si rischia di finire i soldi prima di completare la rosa).
  // Stessa logica, stessi numeri, di FantaContext.placeBid — qui serve solo
  // a spiegare in UI perché un'offerta è disabilitata.
  const myRoster = user && currentFanta ? getPlayersByUser(user.id) : [];
  const maxPlayersTotal = currentFanta?.settings.maxPlayersTotal || 0;
  const isRosterFull =
    maxPlayersTotal > 0 && myRoster.length >= maxPlayersTotal;
  const activePickType: TeamPickType = activeAuction?.pickType || "player";
  const roleLimit =
    activePickType === "player" && activeAuction?.playerRole
      ? currentFanta?.settings.maxPlayersPerRole?.[toLolRole(activeAuction.playerRole) || ""]
      : undefined;
  const isRoleFull =
    !!roleLimit &&
    myRoster.filter(
      (p) =>
        p.pickType === "player" &&
        toLolRole(p.playerRole) === toLolRole(activeAuction?.playerRole),
    ).length >= roleLimit;
  const maxJolly = currentFanta?.settings.maxJolly || 0;
  const isTeamPickTaken =
    activePickType === "team" && myRoster.some((p) => p.pickType === "team");
  const isCoachPickTaken =
    activePickType === "coach" && myRoster.some((p) => p.pickType === "coach");
  const isJollyFull =
    activePickType === "jolly" &&
    myRoster.filter((p) => p.pickType === "jolly").length >= maxJolly;
  const myBudget = user ? getUserBudget(user.id) : 0;
  // Posti rosa da riempire DOPO quello in asta: serve 1 credito a testa
  // per completare la squadra. Lo slot in asta non va riservato, lo si sta
  // pagando adesso (prima veniva contato due volte: all'ultimo posto non si
  // poteva spendere tutto il budget).
  const openSlots =
    maxPlayersTotal > 0 ? Math.max(maxPlayersTotal - myRoster.length - 1, 0) : 0;
  const maxAffordableBid =
    maxBid !== undefined
      ? Math.min(maxBid, myBudget - openSlots)
      : myBudget - openSlots;

  const [customBid, setCustomBid] = useState("");
  const [auctionPlayers, setAuctionPlayers] = useState<LeaguepediaPlayer[]>([]);
  const [auctionPlayerSearch, setAuctionPlayerSearch] = useState("");
  const [selectedAuctionPlayer, setSelectedAuctionPlayer] =
    useState<LeaguepediaPlayer | null>(null);
  const [selectedAuctionPlayerImage, setSelectedAuctionPlayerImage] = useState<
    string | null
  >(null);
  const [selectedAuctionPlayerStats, setSelectedAuctionPlayerStats] = useState<
    LeaguepediaPlayerStats[]
  >([]);
  const [isLoadingAuctionPlayerStats, setIsLoadingAuctionPlayerStats] =
    useState(false);
  const [auctionPlayersLeague, setAuctionPlayersLeague] = useState<string | null>(
    null,
  );

  // Ricerca squadre Leaguepedia per il pick "Squadra" del draft composto
  // (step 4): stesso pattern della ricerca giocatori, ma su Teams invece
  // che su Players/TournamentPlayers.
  const [auctionTeams, setAuctionTeams] = useState<LeaguepediaTeam[]>([]);
  const [auctionTeamSearch, setAuctionTeamSearch] = useState("");
  const [isLoadingAuctionTeams, setIsLoadingAuctionTeams] = useState(false);

  const isAdmin = !!user && !!currentFanta && isFantaViceOrAdmin;
  // Creare un'asta è aperto a qualsiasi membro della lega, non solo
  // admin/vice (decisione prodotto, non un residuo del vecchio bug):
  // gestire un'asta già avviata (start/pausa/chiusura/annullamento/
  // assegnazione manuale) resta invece riservata ad admin/vice tramite
  // `isAdmin`, invariato.
  const canCreateAuction = !!user && !!currentFanta && !!currentMember;
  const seasonStarted = !!currentFanta?.settings.seasonStarted;

  // Carica dati precompilati da localStorage (da pagina import), una sola volta al mount
  const [prefilledAuction] = useState(() => {
    if (typeof window === "undefined") return null;
    const prefilledData = localStorage.getItem("prefilledAuctionData");
    if (!prefilledData) return null;
    try {
      localStorage.removeItem("prefilledAuctionData");
      return JSON.parse(prefilledData);
    } catch (error) {
      console.error("Errore nel parsing dati precompilati:", error);
      return null;
    }
  });

  const [isCreateAuctionOpen, setIsCreateAuctionOpen] = useState(false);

  const [newAuction, setNewAuction] = useState({
    pickType: "player" as TeamPickType,
    auctionFormat: "free",
    league: "LCK",
    playerName: "",
    playerRole: "",
    playerTeam: "",
    description: "",
    basePrice: 1,
    countdownSeconds:
      currentFanta?.settings.defaultCountdown || MIN_COUNTDOWN_SECONDS,
    ...prefilledAuction,
  });
  const maxJollySetting = currentFanta?.settings.maxJolly || 0;

  // Ruoli disponibili in base al tipo di sport della lega corrente (per
  // "custom" arrivano da settings.customRoles, scelti dall'admin)
  const availableRoles = currentFanta ? getFantaRoles(currentFanta) : [];

  // Con un circuito a eliminazione (Mondiali/MSI, vedi PLAYOFF_CIRCUITS) non
  // ha senso chiedere "quale torneo": ce n'è uno solo, quello della lega
  // stessa — prima si chiedeva comunque di scegliere tra le leghe
  // regionali, sbagliando torneo (bug segnalato in produzione, 30/9).
  const playoffTournamentQuery = currentFanta
    ? PLAYOFF_CIRCUIT_TOURNAMENT_QUERY[currentFanta.settings.circuitType || ""]
    : undefined;
  const selectedAuctionLeague =
    newAuction.auctionFormat === "free"
      ? "TUTTI I PRO PLAYER"
      : playoffTournamentQuery || newAuction.league;
  const isLoadingAuctionPlayers =
    currentFanta?.sportType === "lol" &&
    auctionPlayersLeague !== selectedAuctionLeague;

  const filteredAuctionPlayers = auctionPlayerSearch.trim()
    ? auctionPlayers.filter((player) =>
        `${player.player} ${player.team || ""}`
          .toLowerCase()
          .includes(auctionPlayerSearch.trim().toLowerCase()),
      )
    : auctionPlayers;

  useEffect(() => {
    if (currentFanta?.sportType !== "lol") {
      return;
    }

    let cancelled = false;
    // Con un circuito a eliminazione (Worlds/MSI) il torneo è scelto in auto
    // da PLAYOFF_CIRCUIT_TOURNAMENT_QUERY con un valore esatto verificato:
    // match esatto su Tournaments.League, non LIKE, altrimenti arrivano
    // anche tornei non-LoL con "World Championship" nel nome (es. IeSF).
    getPlayersByLeague(selectedAuctionLeague, !!playoffTournamentQuery).then(
      (players) => {
        if (!cancelled) {
          setAuctionPlayers(players);
          setAuctionPlayersLeague(selectedAuctionLeague);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [currentFanta?.sportType, selectedAuctionLeague, playoffTournamentQuery]);

  // Ricerca squadre con debounce: solo quando si sta creando un'asta di
  // tipo "Squadra", altrimenti niente chiamate inutili all'API.
  useEffect(() => {
    if (currentFanta?.sportType !== "lol" || newAuction.pickType !== "team") {
      return;
    }

    let cancelled = false;
    setIsLoadingAuctionTeams(true);
    const timeout = setTimeout(() => {
      searchTeams(auctionTeamSearch).then((teams) => {
        if (!cancelled) {
          setAuctionTeams(teams);
          setIsLoadingAuctionTeams(false);
        }
      });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [currentFanta?.sportType, newAuction.pickType, auctionTeamSearch]);

  // Da qui in giù le azioni scrivono su Firestore tramite il context: sono
  // condivise in tempo reale con chiunque altro abbia la pagina aperta,
  // inclusa l'assegnazione del giocatore al vincitore alla chiusura (vedi
  // finalizeAuction in contexts/FantaContext.tsx).
  const createAuction = () => {
    if (!currentFanta || !user || !newAuction.playerName) return;

    const error = createAuctionInFirestore({
      pickType: newAuction.pickType,
      playerName: newAuction.playerName,
      playerRole: newAuction.pickType === "coach" ? undefined : newAuction.playerRole,
      playerTeam: newAuction.playerTeam,
      auctionFormat:
        newAuction.auctionFormat === "free"
          ? "Formato libero"
          : playoffTournamentQuery
            ? currentFanta.settings.circuitType || newAuction.league
            : newAuction.league,
      description: newAuction.description,
      basePrice: newAuction.basePrice,
      countdownSeconds: newAuction.countdownSeconds,
    });
    // Già in una rosa o già all'asta: il form resta com'è.
    if (error) {
      toast.error(error);
      return;
    }

    setSelectedAuctionPlayer(null);
    setSelectedAuctionPlayerImage(null);
    setSelectedAuctionPlayerStats([]);
    setAuctionPlayerSearch("");
    setAuctionTeamSearch("");
    setNewAuction({
      pickType: "player",
      auctionFormat: "free",
      league: "LCK",
      playerName: "",
      playerRole: "",
      playerTeam: "",
      description: "",
      basePrice: 1,
      countdownSeconds: currentFanta.settings.defaultCountdown,
    });
    // Chiude il dialog dopo la creazione: l'asta appena creata resta
    // "pending" in lista, così si sceglie da lì se avviarla subito o dopo,
    // invece di ritrovarsi ancora nel form.
    setIsCreateAuctionOpen(false);
  };

  const startAuction = (auction: Auction) => {
    startAuctionInFirestore(auction.id, auction.countdownSeconds);
  };

  const openEditAuction = (auction: Auction) => {
    setEditAuction(auction);
    setEditForm({
      basePrice: auction.basePrice,
      countdownSeconds: auction.countdownSeconds,
      description: auction.description || "",
    });
  };

  const saveEditAuction = async () => {
    if (!editAuction) return;
    setIsSavingEdit(true);
    try {
      await updatePendingAuction(editAuction.id, editForm);
      toast.success("Asta modificata");
      setEditAuction(null);
    } catch (error) {
      console.error("Errore nella modifica dell'asta:", error);
      toast.error("Errore nella modifica, riprova");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteAuction = async (auctionId: string) => {
    try {
      await deleteAuction(auctionId);
      toast.success("Asta eliminata");
    } catch (error) {
      console.error("Errore nell'eliminazione dell'asta:", error);
      toast.error("Errore nell'eliminazione, riprova");
    }
  };

  const placeBid = (amount: number) => {
    if (!activeAuction) return;
    placeBidInFirestore(activeAuction.id, amount);
  };

  const submitCustomBid = () => {
    if (!customBid) return;
    placeBid(Number(customBid));
    setCustomBid("");
  };

  const cancelAuction = () => {
    if (activeAuction) cancelAuctionInFirestore(activeAuction.id);
  };

  // "Blocca Asta" chiude subito assegnando l'offerente corrente, invece di
  // aspettare lo scadere del countdown: stessa logica di chiusura.
  const blockAuctionWithCurrentBid = () => {
    if (activeAuction) closeAuctionInFirestore(activeAuction.id);
  };

  // Mette l'asta in pausa (torna "pending", mantiene prezzo e offerente): si
  // riprende con "Avvia" dalla lista aste qui sotto, niente stato separato.
  const saveCurrentAuction = () => {
    if (activeAuction) pauseAuction(activeAuction.id);
  };

  // Modalità "snake": nessuna asta, l'intera pagina è il draft a turni —
  // vedi components/DraftPanel.tsx per la logica (ordine, turno, timer,
  // scelta player/team/coach).
  if (currentFanta?.settings.draftMode === "snake") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Draft</h1>
          <p className="text-muted-foreground mt-2">
            {currentFanta?.name} - Scegli a turno il tuo team
          </p>
        </div>
        <DraftPanel />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Aste</h1>
          <p className="text-muted-foreground mt-2">
            {currentFanta?.name} -{" "}
            {seasonStarted
              ? "Mercato chiuso, la stagione è iniziata"
              : "Partecipa alle aste e acquista i tuoi giocatori"}
          </p>
        </div>

        {canCreateAuction && !seasonStarted && (
          <Dialog open={isCreateAuctionOpen} onOpenChange={setIsCreateAuctionOpen}>
            <DialogTrigger asChild>
              <Button>Crea Nuova Asta</Button>
            </DialogTrigger>
            <DialogContent className="w-[calc(100%-2rem)] max-w-3xl sm:max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Crea Nuova Asta</DialogTitle>
                <DialogDescription>
                  Inserisci i dettagli del giocatore e il prezzo base
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {currentFanta?.sportType === "lol" && (
                  <div className="space-y-2">
                    <Label>Tipo di oggetto</Label>
                    <Select
                      value={newAuction.pickType}
                      onValueChange={(value: TeamPickType) => {
                        setSelectedAuctionPlayer(null);
                        setSelectedAuctionPlayerImage(null);
                        setSelectedAuctionPlayerStats([]);
                        setAuctionPlayerSearch("");
                        setAuctionTeamSearch("");
                        setNewAuction({
                          ...newAuction,
                          pickType: value,
                          playerName: "",
                          playerRole: "",
                          playerTeam: "",
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="player">Giocatore (ruolo)</SelectItem>
                        <SelectItem value="jolly" disabled={maxJollySetting <= 0}>
                          Jolly (nessun vincolo di ruolo)
                          {maxJollySetting <= 0 ? " — disattivato dalla lega" : ""}
                        </SelectItem>
                        <SelectItem value="team">Squadra</SelectItem>
                        <SelectItem value="coach">Coach</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Il draft composto è squadra + coach + 5 giocatori di
                      ruolo{maxJollySetting > 0 ? ` + fino a ${maxJollySetting} jolly` : ""}
                      : ogni pezzo si compra con un&apos;asta separata.
                    </p>
                  </div>
                )}

                {currentFanta?.sportType === "lol" &&
                  (newAuction.pickType === "player" ||
                    newAuction.pickType === "jolly") && (
                  <div className="space-y-3 rounded-md border border-border p-4">
                    <div className="space-y-2">
                      <Label>Formato asta</Label>
                      <Select
                        value={newAuction.auctionFormat}
                        onValueChange={(value) => {
                          setSelectedAuctionPlayer(null);
                          setSelectedAuctionPlayerImage(null);
                          setSelectedAuctionPlayerStats([]);
                          setAuctionPlayerSearch("");
                          setNewAuction({
                            ...newAuction,
                            auctionFormat: value,
                            playerName: "",
                            playerRole: "",
                            playerTeam: "",
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">Formato libero</SelectItem>
                          <SelectItem value="league">Per torneo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {newAuction.auctionFormat === "league" && (
                      <>
                        <div className="space-y-2">
                          <Label>Torneo</Label>
                          {playoffTournamentQuery ? (
                            <p className="text-sm text-muted-foreground">
                              {currentFanta?.settings.circuitType} — i player
                              vengono presi automaticamente da questo torneo,
                              non serve scegliere una lega regionale.
                            </p>
                          ) : (
                          <Select
                            value={newAuction.league}
                            onValueChange={(value) => {
                              setSelectedAuctionPlayer(null);
                              setSelectedAuctionPlayerImage(null);
                              setSelectedAuctionPlayerStats([]);
                              setAuctionPlayerSearch("");
                              setNewAuction({
                                ...newAuction,
                                league: value,
                                playerName: "",
                                playerRole: "",
                                playerTeam: "",
                              });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="LCK">LCK</SelectItem>
                              <SelectItem value="LPL">LPL</SelectItem>
                              <SelectItem value="LCS">LCS</SelectItem>
                              <SelectItem value="LEC">LEC</SelectItem>
                              <SelectItem value="LCP">LCP</SelectItem>
                              <SelectItem value="PCS">PCS</SelectItem>
                            </SelectContent>
                          </Select>
                          )}
                        </div>
                      </>
                    )}

                    {newAuction.auctionFormat === "free" && (
                      <div className="text-sm text-muted-foreground">
                        Sono disponibili tutti i player presenti in Leaguepedia.
                      </div>
                    )}

                    {currentFanta?.sportType === "lol" && (
                      <div className="space-y-2">
                        <Label>Player Leaguepedia</Label>
                        <Input
                          value={auctionPlayerSearch}
                          onChange={(e) =>
                            setAuctionPlayerSearch(e.target.value)
                          }
                          placeholder="Cerca per nome o team..."
                          className="mb-2"
                        />
                        <Select
                          value={newAuction.playerName}
                          onValueChange={(value) => {
                            const player = auctionPlayers.find(
                              (item) => item.player === value,
                            );
                            if (!player) return;
                            setSelectedAuctionPlayer(player);
                            setSelectedAuctionPlayerImage(null);
                            setSelectedAuctionPlayerStats([]);
                            getPlayerImage(player.player).then(
                              setSelectedAuctionPlayerImage,
                            );
                            setIsLoadingAuctionPlayerStats(true);
                            getPlayerStats(player.player)
                              .then(setSelectedAuctionPlayerStats)
                              .finally(() =>
                                setIsLoadingAuctionPlayerStats(false),
                              );
                            setNewAuction({
                              ...newAuction,
                              playerName: player.player,
                              playerRole: player.role,
                              playerTeam: player.team || "",
                              description: `${player.name || "Nome non disponibile"} (${player.country || "Paese non disponibile"}) - ${player.residency || "Residenza non disponibile"}`,
                            });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                isLoadingAuctionPlayers
                                  ? "Caricamento player..."
                                  : "Seleziona player"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent className="max-h-80">
                            {filteredAuctionPlayers.length === 0 ? (
                              <div className="px-2 py-4 text-sm text-muted-foreground">
                                Nessun player trovato
                              </div>
                            ) : (
                              filteredAuctionPlayers.map((player) => (
                                <SelectItem
                                  key={player.player}
                                  value={player.player}
                                >
                                  {player.player}{" "}
                                  {player.team ? `- ${player.team}` : ""}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {selectedAuctionPlayer && (
                      <div className="space-y-3 rounded-md border border-border bg-raised/50 p-3">
                        <div className="flex items-center gap-4">
                          {selectedAuctionPlayerImage ? (
                            <img
                              src={selectedAuctionPlayerImage}
                              alt={selectedAuctionPlayer.player}
                              className="h-14 w-14 rounded-md object-cover"
                            />
                          ) : (
                            <div className="h-14 w-14 rounded-md bg-raised" />
                          )}
                          <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1 text-sm md:grid-cols-3">
                            <div>
                              <span className="text-muted-foreground">Nickname</span>
                              <p>{selectedAuctionPlayer.player || "N/D"}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Nome reale</span>
                              <p>{selectedAuctionPlayer.name || "N/D"}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Ruolo</span>
                              <p>{selectedAuctionPlayer.role || "N/D"}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Team</span>
                              <p>{selectedAuctionPlayer.team || "N/D"}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Lega</span>
                              <p>{selectedAuctionPlayer.league || "N/D"}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Paese</span>
                              <p>{selectedAuctionPlayer.country || "N/D"}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Residenza</span>
                              <p>{selectedAuctionPlayer.residency || "N/D"}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Nascita</span>
                              <p>{selectedAuctionPlayer.birthdate || "N/D"}</p>
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-border pt-3">
                          {isLoadingAuctionPlayerStats ? (
                            <p className="text-sm text-muted-foreground">
                              Caricamento statistiche...
                            </p>
                          ) : selectedAuctionPlayerStats.length > 0 ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                                <div>
                                  <span className="text-muted-foreground">Partite</span>
                                  <p>
                                    {selectedAuctionPlayerStats.reduce(
                                      (t, s) => t + s.gamesPlayed,
                                      0,
                                    )}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">K/D/A</span>
                                  <p>
                                    {selectedAuctionPlayerStats.reduce(
                                      (t, s) => t + s.kills,
                                      0,
                                    )}{" "}
                                    /{" "}
                                    {selectedAuctionPlayerStats.reduce(
                                      (t, s) => t + s.deaths,
                                      0,
                                    )}{" "}
                                    /{" "}
                                    {selectedAuctionPlayerStats.reduce(
                                      (t, s) => t + s.assists,
                                      0,
                                    )}
                                  </p>
                                </div>
                              </div>
                              {(() => {
                                const champions = Array.from(
                                  new Set(
                                    selectedAuctionPlayerStats.flatMap((s) =>
                                      s.champion.split(", ").filter(Boolean),
                                    ),
                                  ),
                                );
                                return (
                                  <div>
                                    <span className="text-muted-foreground text-sm">
                                      Champion giocati ({champions.length})
                                    </span>
                                    <p className="mt-1 max-h-24 overflow-y-auto whitespace-normal wrap-break-word text-sm leading-relaxed">
                                      {champions.length > 0
                                        ? champions.join(", ")
                                        : "N/D"}
                                    </p>
                                  </div>
                                );
                              })()}
                              <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Torneo</TableHead>
                                      <TableHead>Team</TableHead>
                                      <TableHead>Partite</TableHead>
                                      <TableHead>KDA</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {selectedAuctionPlayerStats.map(
                                      (stat, idx) => (
                                        <TableRow key={idx}>
                                          <TableCell className="font-medium">
                                            {stat.tournament}
                                          </TableCell>
                                          <TableCell>{stat.team}</TableCell>
                                          <TableCell>
                                            {stat.gamesPlayed}
                                          </TableCell>
                                          <TableCell>{stat.kda}</TableCell>
                                        </TableRow>
                                      ),
                                    )}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              Nessuna statistica disponibile
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {currentFanta?.sportType === "lol" &&
                  newAuction.pickType === "team" && (
                  <div className="space-y-2 rounded-md border border-border p-4">
                    <Label>Squadra Leaguepedia</Label>
                    <Input
                      value={auctionTeamSearch}
                      onChange={(e) => setAuctionTeamSearch(e.target.value)}
                      placeholder="Cerca per nome o sigla..."
                      className="mb-2"
                    />
                    <Select
                      value={newAuction.playerName}
                      onValueChange={(value) => {
                        const team = auctionTeams.find((t) => t.name === value);
                        if (!team) return;
                        setNewAuction({
                          ...newAuction,
                          playerName: team.name,
                          playerTeam: team.region,
                          description: team.short
                            ? `Sigla: ${team.short} — Regione: ${team.region || "N/D"}`
                            : `Regione: ${team.region || "N/D"}`,
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            isLoadingAuctionTeams
                              ? "Caricamento squadre..."
                              : "Seleziona squadra"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-80">
                        {auctionTeams.length === 0 ? (
                          <div className="px-2 py-4 text-sm text-muted-foreground">
                            Nessuna squadra trovata
                          </div>
                        ) : (
                          auctionTeams.map((team) => (
                            <SelectItem key={team.name} value={team.name}>
                              {team.name}
                              {team.region ? ` - ${team.region}` : ""}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {currentFanta?.sportType === "lol" &&
                  newAuction.pickType === "coach" && (
                  <div className="space-y-3 rounded-md border border-border p-4">
                    <p className="text-xs text-muted-foreground">
                      Leaguepedia non ha una tabella coach utilizzabile: nome
                      e squadra allenata si inseriscono a mano.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="coachName">Nome Coach *</Label>
                      <Input
                        id="coachName"
                        value={newAuction.playerName}
                        onChange={(e) =>
                          setNewAuction({
                            ...newAuction,
                            playerName: e.target.value,
                          })
                        }
                        placeholder="Es: kkOma"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="coachTeam">Squadra Allenata</Label>
                      <Input
                        id="coachTeam"
                        value={newAuction.playerTeam}
                        onChange={(e) =>
                          setNewAuction({
                            ...newAuction,
                            playerTeam: e.target.value,
                          })
                        }
                        placeholder="Es: T1 — serve per calcolare i punti (vittorie della squadra)"
                      />
                    </div>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  {currentFanta?.sportType !== "lol" && (
                    <div className="space-y-2">
                      <Label htmlFor="playerName">
                        Nome Giocatore/Personaggio *
                      </Label>
                      <Input
                        id="playerName"
                        value={newAuction.playerName}
                        onChange={(e) =>
                          setNewAuction({
                            ...newAuction,
                            playerName: e.target.value,
                          })
                        }
                        placeholder="Es: Faker, Ronaldo, LeBron..."
                      />
                    </div>
                  )}

                  {currentFanta?.sportType === "lol" &&
                    (newAuction.pickType === "player" ||
                      newAuction.pickType === "jolly") && (
                    <div className="space-y-2">
                      <Label htmlFor="playerRole">Ruolo</Label>
                      <Input
                        id="playerRole"
                        value={newAuction.playerRole}
                        disabled
                        placeholder="Seleziona un player Leaguepedia sopra"
                      />
                    </div>
                  )}

                  {currentFanta?.sportType !== "lol" && (
                    <div className="space-y-2">
                      <Label htmlFor="playerRole">Ruolo</Label>
                      {availableRoles.length > 0 ? (
                        <Select
                          value={newAuction.playerRole}
                          onValueChange={(value) =>
                            setNewAuction({
                              ...newAuction,
                              playerRole: value,
                            })
                          }
                        >
                          <SelectTrigger id="playerRole">
                            <SelectValue placeholder="Seleziona ruolo" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableRoles.map((role) => (
                              <SelectItem key={role} value={role}>
                                {role}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id="playerRole"
                          value={newAuction.playerRole}
                          onChange={(e) =>
                            setNewAuction({
                              ...newAuction,
                              playerRole: e.target.value,
                            })
                          }
                          placeholder="Es: Mid Laner, Attaccante, Point Guard..."
                        />
                      )}
                      <p className="text-sm text-muted-foreground">
                        {availableRoles.length > 0
                          ? `Ruoli disponibili per ${currentFanta?.sportType}`
                          : "Inserisci un ruolo personalizzato"}
                      </p>
                    </div>
                  )}
                </div>

                {newAuction.pickType !== "coach" && (
                  <div className="space-y-2">
                    <Label htmlFor="playerTeam">Squadra/Team</Label>
                    <Input
                      id="playerTeam"
                      value={newAuction.playerTeam}
                      disabled={currentFanta?.sportType === "lol"}
                      onChange={(e) =>
                        setNewAuction({
                          ...newAuction,
                          playerTeam: e.target.value,
                        })
                      }
                      placeholder="Es: T1, Juventus, Lakers..."
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="description">Descrizione</Label>
                  <Textarea
                    id="description"
                    value={newAuction.description}
                    onChange={(e) =>
                      setNewAuction({
                        ...newAuction,
                        description: e.target.value,
                      })
                    }
                    placeholder="Note aggiuntive sul giocatore..."
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="basePrice">Prezzo Base (€)</Label>
                    <Input
                      id="basePrice"
                      type="number"
                      value={newAuction.basePrice}
                      onChange={(e) =>
                        setNewAuction({
                          ...newAuction,
                          basePrice: Number(e.target.value),
                        })
                      }
                      min={1}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="countdown">Countdown (secondi)</Label>
                    <Input
                      id="countdown"
                      type="number"
                      value={newAuction.countdownSeconds}
                      onChange={(e) =>
                        setNewAuction({
                          ...newAuction,
                          countdownSeconds: Number(e.target.value),
                        })
                      }
                      min={MIN_COUNTDOWN_SECONDS}
                      max={MAX_COUNTDOWN_SECONDS}
                    />
                    <p className="text-sm text-muted-foreground">
                      Tra {MIN_COUNTDOWN_SECONDS}s e {MAX_COUNTDOWN_SECONDS}s
                    </p>
                  </div>
                </div>

                <Button onClick={createAuction} className="w-full">
                  Crea Asta
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Asta Attiva */}
      {activeAuction && activeAuction.status === "active" && (
        <Card className="border-2 border-primary/40">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-2xl flex items-center gap-2">
                <Flame className="w-6 h-6 text-warning" />
                Asta in Corso
              </CardTitle>
              {/* mm:ss invece di "3033s" (illeggibile oltre il minuto);
                  rosso solo negli ultimi 10 secondi, quando conta davvero. */}
              <div
                className={`text-4xl font-bold tabular-nums tracking-tight ${
                  countdown <= 10 ? "text-destructive" : "text-foreground"
                }`}
                aria-label={`Tempo rimanente: ${countdown} secondi`}
              >
                {formatCountdown(countdown)}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-2xl font-bold">
                  {activeAuction.playerName}
                </h3>
                <Badge variant="secondary" className="mt-2 mr-2">
                  {PICK_TYPE_LABELS[activeAuction.pickType || "player"]}
                </Badge>
                {activeAuction.playerRole && (
                  <Badge variant="outline" className="mt-2">
                    {activeAuction.playerRole}
                  </Badge>
                )}
                {activeAuction.playerTeam && (
                  <p className="text-muted-foreground mt-1">
                    {activeAuction.playerTeam}
                  </p>
                )}
                {activeAuction.description && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {activeAuction.description}
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <div className="bg-raised border border-border p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground">Prezzo Attuale</p>
                  <p className="text-3xl font-bold text-success">
                    {activeAuction.currentPrice}€
                  </p>
                  {activeAuction.highestBidderId && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Offerente:{" "}
                      {getMemberName(
                        activeAuction.highestBidderId,
                        activeAuction.highestBidderName,
                      )}
                    </p>
                  )}
                </div>

                {/* Crediti di tutti i membri della lega, per farsi un'idea
                    di quanto possono ancora spingere gli avversari */}
                {fantaMembers.length > 0 && (
                  <div className="bg-raised border border-border p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">
                      Crediti di tutti
                    </p>
                    {/* max-h-60: una lega tra amici (6-10 membri) si vede
                        tutta; prima max-h-32 tagliava una riga a metà. */}
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {[...fantaMembers]
                        .sort(
                          (a, b) =>
                            getUserBudget(b.userId) - getUserBudget(a.userId),
                        )
                        .map((member) => (
                          <div
                            key={member.userId}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="text-foreground">
                              {member.name}
                            </span>
                            <span className="text-foreground font-medium">
                              {getUserBudget(member.userId)}€
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Storico offerte: chi ha rilanciato, quando e di quanto */}
                {bidHistory.length > 0 && (
                  <div className="bg-raised border border-border p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">
                      Storico Offerte
                    </p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {bidHistory.map((bid) => (
                        <div
                          key={bid.id}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-foreground">
                            {getMemberName(bid.userId, bid.userName)}
                          </span>
                          <span className="text-foreground font-medium">
                            +{bid.amount}€
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Pulsanti Offerta */}
            <div className="space-y-3">
              <Label>Fai la tua offerta:</Label>
              {seasonStarted && !isAdmin ? (
                <p className="text-sm text-muted-foreground">
                  Il mercato è chiuso: la stagione è iniziata, non puoi più
                  fare offerte.
                </p>
              ) : isRosterFull ? (
                <p className="text-sm text-muted-foreground">
                  Hai già {maxPlayersTotal} giocatori: rosa al completo, non
                  puoi fare altre offerte.
                </p>
              ) : isRoleFull ? (
                <p className="text-sm text-muted-foreground">
                  Limite raggiunto per il ruolo &quot;
                  {activeAuction.playerRole}&quot; ({roleLimit} in rosa): non
                  puoi fare offerte.
                </p>
              ) : isTeamPickTaken ? (
                <p className="text-sm text-muted-foreground">
                  Hai già una squadra in rosa: nel draft composto se ne può
                  avere una sola.
                </p>
              ) : isCoachPickTaken ? (
                <p className="text-sm text-muted-foreground">
                  Hai già un coach in rosa: nel draft composto se ne può
                  avere uno solo.
                </p>
              ) : isJollyFull ? (
                <p className="text-sm text-muted-foreground">
                  {maxJolly > 0
                    ? `Hai già ${maxJolly} jolly: limite raggiunto.`
                    : "I jolly sono disattivati in questa lega."}
                </p>
              ) : maxBid !== undefined && activeAuction.currentPrice >= maxBid ? (
                <p className="text-sm text-muted-foreground">
                  Puntata massima della lega raggiunta ({maxBid}€): l&apos;asta
                  può solo essere chiusa o annullata.
                </p>
              ) : maxAffordableBid <= activeAuction.currentPrice ? (
                <p className="text-sm text-muted-foreground">
                  {openSlots > 0
                    ? `Con ${openSlots} posti rosa da riempire dopo questo devi tenere almeno ${openSlots} crediti da parte: non puoi rilanciare oltre.`
                    : "Budget insufficiente per rilanciare."}
                </p>
              ) : (
                <>
                  {openSlots > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Puoi arrivare fino a {maxAffordableBid}€ (budget:{" "}
                      {myBudget}€, {openSlots} posti rosa ancora da riempire
                      dopo questo).
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {DEFAULT_BID_PRESETS.map((preset) => (
                      <Button
                        key={preset.label}
                        onClick={() => placeBid(preset.value)}
                        variant="outline"
                        disabled={
                          activeAuction.currentPrice + preset.value >
                          maxAffordableBid
                        }
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>

                  {currentFanta?.settings.allowCustomBids && (
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Importo custom"
                        value={customBid}
                        onChange={(e) => setCustomBid(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submitCustomBid()}
                        min={1}
                        max={maxAffordableBid - activeAuction.currentPrice}
                      />
                      <Button onClick={submitCustomBid}>Offri</Button>
                    </div>
                  )}
                </>
              )}
            </div>

            {isAdmin && (
              <div className="space-y-2">
                {/* "Blocca Asta" e "Chiudi Asta" facevano la stessa cosa
                    (closeAuctionInFirestore), uno in oro e uno in rosso come
                    se fosse distruttivo: ora un solo bottone che dice cosa
                    fa. Annulla è l'unica azione distruttiva, con conferma. */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="default"
                    onClick={blockAuctionWithCurrentBid}
                    className="w-full"
                  >
                    <Lock className="mr-2 h-4 w-4" />
                    Chiudi e assegna
                  </Button>

                  <Button
                    variant="outline"
                    onClick={saveCurrentAuction}
                    className="w-full"
                  >
                    <Pause className="mr-2 h-4 w-4" />
                    Metti in pausa
                  </Button>
                </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        className="w-full text-destructive hover:text-destructive"
                      >
                        <Ban className="mr-2 h-4 w-4" />
                        Annulla asta
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Annullare l&apos;asta?</AlertDialogTitle>
                        <AlertDialogDescription>
                          L&apos;asta verrà annullata senza assegnare il giocatore.
                          Questa azione non può essere annullata.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Indietro</AlertDialogCancel>
                        <AlertDialogAction onClick={cancelAuction}>
                          Conferma Annullamento
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                {/* Assegnazione manuale: utile quando due persone si sono
                    già accordate fuori dall'asta su chi se lo prende, a
                    prescindere da chi risulta offerente più alto. */}
                <div className="flex gap-2 pt-2 border-t border-border">
                  <Select
                    value={manualAssignTo}
                    onValueChange={setManualAssignTo}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Assegna manualmente a..." />
                    </SelectTrigger>
                    <SelectContent>
                      {fantaMembers.map((member) => (
                        <SelectItem key={member.userId} value={member.userId}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    disabled={!manualAssignTo}
                    onClick={() => {
                      const member = fantaMembers.find(
                        (m) => m.userId === manualAssignTo,
                      );
                      if (!member) return;
                      assignAuctionManually(
                        activeAuction.id,
                        member.userId,
                        member.name,
                      );
                      setManualAssignTo("");
                    }}
                  >
                    Assegna
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lista Aste */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Tutte le Aste</CardTitle>
          <CardDescription className="text-muted-foreground">
            Storico completo delle aste
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {auctions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nessuna asta disponibile. Crea la prima!
              </p>
            ) : (
              auctions.map((auction) => (
                <div
                  key={auction.id}
                  className={`flex flex-col gap-3 p-4 border border-border rounded-lg hover:bg-raised transition-colors sm:flex-row sm:items-center sm:justify-between ${
                    auction.status === "closed" ? "cursor-pointer" : ""
                  }`}
                  onClick={() => {
                    if (auction.status === "closed") setDetailAuction(auction);
                  }}
                >
                  <div>
                    <h3 className="font-semibold text-foreground">
                      {auction.playerName}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {PICK_TYPE_LABELS[auction.pickType || "player"]} - Prezzo:{" "}
                      {auction.currentPrice}€
                      {auction.highestBidderId &&
                        ` - ${getMemberName(auction.highestBidderId, auction.highestBidderName)}`}
                    </p>
                    {auction.auctionFormat && (
                      <p className="text-xs text-muted-foreground">
                        Formato: {auction.auctionFormat}
                        {auction.status === "pending" &&
                          ` · Base ${auction.basePrice}€ · Countdown ${auction.countdownSeconds}s`}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Badge
                      variant={
                        auction.status === "active"
                          ? "success"
                          : auction.status === "pending"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {auction.status === "active" && "Attiva"}
                      {auction.status === "pending" && "In attesa"}
                      {auction.status === "closed" && "Chiusa"}
                    </Badge>
                    {auction.status === "pending" && isAdmin && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditAuction(auction);
                          }}
                        >
                          Modifica
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAuction(auction.id);
                          }}
                        >
                          Elimina
                        </Button>
                        <Button onClick={() => startAuction(auction)} size="sm">
                          Avvia
                        </Button>
                      </>
                    )}
                    {auction.status === "closed" && isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          reopenAuction(auction.id);
                        }}
                      >
                        Riapri
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modifica asta in attesa: solo prezzo base/countdown/descrizione —
          pickType/player/formato restano fissi, cambiarli vorrebbe dire
          un'asta diversa (segnalato, 2/10: prima non c'era alcun modo di
          correggere un'asta pending creata con dati sbagliati). */}
      <Dialog
        open={Boolean(editAuction)}
        onOpenChange={(open) => !open && setEditAuction(null)}
      >
        <DialogContent>
          {editAuction && (
            <>
              <DialogHeader>
                <DialogTitle>Modifica Asta: {editAuction.playerName}</DialogTitle>
                <DialogDescription>
                  Formato: {editAuction.auctionFormat || "N/D"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="editBasePrice">Prezzo Base (€)</Label>
                  <Input
                    id="editBasePrice"
                    type="number"
                    min={1}
                    value={editForm.basePrice}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        basePrice: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editCountdown">Countdown (secondi)</Label>
                  <Input
                    id="editCountdown"
                    type="number"
                    min={MIN_COUNTDOWN_SECONDS}
                    max={MAX_COUNTDOWN_SECONDS}
                    value={editForm.countdownSeconds}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        countdownSeconds: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editDescription">Descrizione</Label>
                  <Textarea
                    id="editDescription"
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm({ ...editForm, description: e.target.value })
                    }
                  />
                </div>
                <Button
                  onClick={saveEditAuction}
                  disabled={isSavingEdit}
                  className="w-full"
                >
                  {isSavingEdit ? "Salvataggio..." : "Salva Modifiche"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dettaglio asta chiusa */}
      <Dialog
        open={Boolean(detailAuction)}
        onOpenChange={(open) => !open && setDetailAuction(null)}
      >
        <DialogContent>
          {detailAuction && (
            <>
              <DialogHeader>
                <DialogTitle>{detailAuction.playerName}</DialogTitle>
                <DialogDescription>
                  {detailAuction.auctionFormat || "Asta"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {detailAuction.playerRole && (
                    <Badge variant="outline">{detailAuction.playerRole}</Badge>
                  )}
                  {detailAuction.playerTeam && (
                    <span className="text-sm text-muted-foreground">
                      {detailAuction.playerTeam}
                    </span>
                  )}
                </div>
                {detailAuction.description && (
                  <p className="text-sm text-muted-foreground">
                    {detailAuction.description}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-raised/50 p-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Prezzo Base</span>
                  <p>{detailAuction.basePrice}€</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Prezzo Finale</span>
                  <p>{detailAuction.currentPrice}€</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Vinta da</span>
                  <p>
                    {detailAuction.highestBidderId
                      ? getMemberName(
                          detailAuction.highestBidderId,
                          detailAuction.highestBidderName,
                        )
                      : "Nessuna offerta"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Durata</span>
                  <p>
                    {detailAuction.startedAt && detailAuction.closedAt
                      ? `${Math.max(
                          0,
                          Math.round(
                            (detailAuction.closedAt.getTime() -
                              detailAuction.startedAt.getTime()) /
                              1000,
                          ),
                        )}s`
                      : "N/D"}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Chiusa il</span>
                  <p>
                    {detailAuction.closedAt
                      ? detailAuction.closedAt.toLocaleString("it-IT")
                      : "N/D"}
                  </p>
                </div>
              </div>
              {isAdmin && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    reopenAuction(detailAuction.id);
                    setDetailAuction(null);
                  }}
                >
                  Riapri Asta
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
