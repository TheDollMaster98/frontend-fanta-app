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
  SPORT_TEMPLATES,
  MIN_COUNTDOWN_SECONDS,
} from "@/lib/constants";
import {
  getPlayersByLeague,
  getPlayerImage,
  getPlayerStats,
  type LeaguepediaPlayer,
  type LeaguepediaPlayerStats,
} from "@/lib/leaguepediaApi";
import type { Auction } from "@/types";
import { Flame, Save, Ban, Lock } from "lucide-react";
import { useFanta } from "@/contexts/FantaContext";
import { useAuth } from "@/contexts/AuthContext";

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
    assignAuctionManually,
    getPlayersByUser,
    getUserBudget,
    fantaMembers,
    getMemberName,
  } = useFanta();
  const { user } = useAuth();
  const [detailAuction, setDetailAuction] = useState<Auction | null>(null);
  const [manualAssignTo, setManualAssignTo] = useState("");

  // Aste condivise via Firestore (contexts/FantaContext.tsx): questa pagina
  // legge/scrive tramite le funzioni del context, non tiene più uno stato
  // locale separato per asta attiva/prezzo/offerente.
  const activeAuction = useMemo(
    () => auctions.find((a) => a.status === "active") ?? null,
    [auctions],
  );

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
  const myRoster =
    user && currentFanta ? getPlayersByUser(user.id, currentFanta.id) : [];
  const maxPlayersTotal = currentFanta?.settings.maxPlayersTotal || 0;
  const isRosterFull =
    maxPlayersTotal > 0 && myRoster.length >= maxPlayersTotal;
  const roleLimit = activeAuction?.playerRole
    ? currentFanta?.settings.maxPlayersPerRole?.[activeAuction.playerRole]
    : undefined;
  const isRoleFull =
    !!roleLimit &&
    myRoster.filter((p) => p.role === activeAuction?.playerRole).length >=
      roleLimit;
  const myBudget = user ? getUserBudget(user.id) : 0;
  const openSlots = maxPlayersTotal > 0 ? maxPlayersTotal - myRoster.length : 0;
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

  const isAdmin =
    !!user &&
    !!currentFanta &&
    (currentFanta.adminId === user.id ||
      currentFanta.viceAdminIds.includes(user.id) ||
      !!user.isDeveloper);

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

  const [newAuction, setNewAuction] = useState({
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

  // Ruoli disponibili in base al tipo di sport della lega corrente
  const availableRoles = currentFanta
    ? SPORT_TEMPLATES[currentFanta.sportType]?.roles || []
    : [];

  const selectedAuctionLeague =
    newAuction.auctionFormat === "free" ? "TUTTI I PRO PLAYER" : newAuction.league;
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
    getPlayersByLeague(selectedAuctionLeague).then((players) => {
      if (!cancelled) {
        setAuctionPlayers(players);
        setAuctionPlayersLeague(selectedAuctionLeague);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentFanta?.sportType, selectedAuctionLeague]);

  // Da qui in giù le azioni scrivono su Firestore tramite il context: sono
  // condivise in tempo reale con chiunque altro abbia la pagina aperta,
  // inclusa l'assegnazione del giocatore al vincitore alla chiusura (vedi
  // finalizeAuction in contexts/FantaContext.tsx).
  const createAuction = () => {
    if (!currentFanta || !user || !newAuction.playerName) return;

    createAuctionInFirestore({
      playerName: newAuction.playerName,
      playerRole: newAuction.playerRole,
      playerTeam: newAuction.playerTeam,
      auctionFormat:
        newAuction.auctionFormat === "free"
          ? "Formato libero"
          : newAuction.league,
      description: newAuction.description,
      basePrice: newAuction.basePrice,
      countdownSeconds: newAuction.countdownSeconds,
    });

    setSelectedAuctionPlayer(null);
    setSelectedAuctionPlayerImage(null);
    setSelectedAuctionPlayerStats([]);
    setAuctionPlayerSearch("");
    setNewAuction({
      auctionFormat: "free",
      league: "LCK",
      playerName: "",
      playerRole: "",
      playerTeam: "",
      description: "",
      basePrice: 1,
      countdownSeconds: currentFanta.settings.defaultCountdown,
    });
  };

  const startAuction = (auction: Auction) => {
    startAuctionInFirestore(auction.id, auction.countdownSeconds);
  };

  const placeBid = (amount: number) => {
    if (!activeAuction) return;
    placeBidInFirestore(activeAuction.id, amount);
  };

  const closeAuction = () => {
    if (activeAuction) closeAuctionInFirestore(activeAuction.id);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Aste</h1>
          <p className="text-slate-400 mt-2">
            {currentFanta?.name} - Partecipa alle aste e acquista i tuoi
            giocatori
          </p>
        </div>

        {isAdmin && (
          <Dialog>
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
                  <div className="space-y-3 rounded-md border border-slate-700 p-4">
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
                        </div>
                      </>
                    )}

                    {newAuction.auctionFormat === "free" && (
                      <div className="text-sm text-slate-400">
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
                              <div className="px-2 py-4 text-sm text-slate-500">
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
                      <div className="space-y-3 rounded-md border border-slate-700 bg-slate-800/50 p-3">
                        <div className="flex items-center gap-4">
                          {selectedAuctionPlayerImage ? (
                            <img
                              src={selectedAuctionPlayerImage}
                              alt={selectedAuctionPlayer.player}
                              className="h-14 w-14 rounded-md object-cover"
                            />
                          ) : (
                            <div className="h-14 w-14 rounded-md bg-slate-800" />
                          )}
                          <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1 text-sm md:grid-cols-3">
                            <div>
                              <span className="text-slate-400">Nickname</span>
                              <p>{selectedAuctionPlayer.player || "N/D"}</p>
                            </div>
                            <div>
                              <span className="text-slate-400">Nome reale</span>
                              <p>{selectedAuctionPlayer.name || "N/D"}</p>
                            </div>
                            <div>
                              <span className="text-slate-400">Ruolo</span>
                              <p>{selectedAuctionPlayer.role || "N/D"}</p>
                            </div>
                            <div>
                              <span className="text-slate-400">Team</span>
                              <p>{selectedAuctionPlayer.team || "N/D"}</p>
                            </div>
                            <div>
                              <span className="text-slate-400">Lega</span>
                              <p>{selectedAuctionPlayer.league || "N/D"}</p>
                            </div>
                            <div>
                              <span className="text-slate-400">Paese</span>
                              <p>{selectedAuctionPlayer.country || "N/D"}</p>
                            </div>
                            <div>
                              <span className="text-slate-400">Residenza</span>
                              <p>{selectedAuctionPlayer.residency || "N/D"}</p>
                            </div>
                            <div>
                              <span className="text-slate-400">Nascita</span>
                              <p>{selectedAuctionPlayer.birthdate || "N/D"}</p>
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-slate-700 pt-3">
                          {isLoadingAuctionPlayerStats ? (
                            <p className="text-sm text-slate-400">
                              Caricamento statistiche...
                            </p>
                          ) : selectedAuctionPlayerStats.length > 0 ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                                <div>
                                  <span className="text-slate-400">Partite</span>
                                  <p>
                                    {selectedAuctionPlayerStats.reduce(
                                      (t, s) => t + s.gamesPlayed,
                                      0,
                                    )}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-slate-400">K/D/A</span>
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
                                    <span className="text-slate-400 text-sm">
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
                              <div className="max-h-40 overflow-y-auto rounded-md border border-slate-700">
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
                            <p className="text-sm text-slate-500">
                              Nessuna statistica disponibile
                            </p>
                          )}
                        </div>
                      </div>
                    )}
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

                  <div className="space-y-2">
                    <Label htmlFor="playerRole">Ruolo</Label>
                    {currentFanta?.sportType === "lol" ? (
                      <Input
                        id="playerRole"
                        value={newAuction.playerRole}
                        disabled
                        placeholder="Seleziona un player Leaguepedia sopra"
                      />
                    ) : availableRoles.length > 0 ? (
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
                    <p className="text-sm text-slate-500">
                      {currentFanta?.sportType === "lol"
                        ? "Popolato automaticamente da Leaguepedia"
                        : availableRoles.length > 0
                          ? `Ruoli disponibili per ${currentFanta?.sportType}`
                          : "Inserisci un ruolo personalizzato"}
                    </p>
                  </div>
                </div>

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
                    />
                    <p className="text-sm text-slate-500">
                      Minimo {MIN_COUNTDOWN_SECONDS}s
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
        <Card className="border-2 border-blue-500">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl flex items-center gap-2">
                <Flame className="w-6 h-6 text-orange-500" />
                Asta in Corso
              </CardTitle>
              <div className="text-4xl font-bold text-blue-400">
                {countdown}s
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-2xl font-bold">
                  {activeAuction.playerName}
                </h3>
                {activeAuction.playerRole && (
                  <Badge className="mt-2">{activeAuction.playerRole}</Badge>
                )}
                {activeAuction.playerTeam && (
                  <p className="text-slate-400 mt-1">
                    {activeAuction.playerTeam}
                  </p>
                )}
                {activeAuction.description && (
                  <p className="text-sm text-slate-500 mt-2">
                    {activeAuction.description}
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <div className="bg-slate-800 border border-slate-700 p-4 rounded-lg">
                  <p className="text-sm text-slate-400">Prezzo Attuale</p>
                  <p className="text-3xl font-bold text-green-400">
                    {activeAuction.currentPrice}€
                  </p>
                  {activeAuction.highestBidderId && (
                    <p className="text-sm text-slate-400 mt-1">
                      Offerente:{" "}
                      {getMemberName(
                        activeAuction.highestBidderId,
                        activeAuction.highestBidderName,
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Pulsanti Offerta */}
            <div className="space-y-3">
              <Label>Fai la tua offerta:</Label>
              {isRosterFull ? (
                <p className="text-sm text-slate-500">
                  Hai già {maxPlayersTotal} giocatori: rosa al completo, non
                  puoi fare altre offerte.
                </p>
              ) : isRoleFull ? (
                <p className="text-sm text-slate-500">
                  Hai già {roleLimit} giocatori nel ruolo &quot;
                  {activeAuction.playerRole}&quot;: limite raggiunto per
                  questo ruolo.
                </p>
              ) : maxBid !== undefined && activeAuction.currentPrice >= maxBid ? (
                <p className="text-sm text-slate-500">
                  Puntata massima della lega raggiunta ({maxBid}€): l&apos;asta
                  può solo essere chiusa o annullata.
                </p>
              ) : maxAffordableBid <= activeAuction.currentPrice ? (
                <p className="text-sm text-slate-500">
                  {openSlots > 0
                    ? `Con ${openSlots} posti rosa ancora da riempire devi tenere almeno ${openSlots} crediti da parte: non puoi rilanciare oltre.`
                    : "Budget insufficiente per rilanciare."}
                </p>
              ) : (
                <>
                  {openSlots > 0 && (
                    <p className="text-xs text-slate-500">
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
                        min={1}
                        max={maxAffordableBid - activeAuction.currentPrice}
                      />
                      <Button
                        onClick={() => {
                          if (customBid) {
                            placeBid(Number(customBid));
                            setCustomBid("");
                          }
                        }}
                      >
                        Offri
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>

            {isAdmin && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="default"
                    onClick={blockAuctionWithCurrentBid}
                    className="w-full"
                  >
                    <Lock className="mr-2 h-4 w-4" />
                    Blocca Asta
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="w-full">
                        <Ban className="mr-2 h-4 w-4" />
                        Annulla
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
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={saveCurrentAuction}
                    className="w-full"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Salva Asta
                  </Button>

                  <Button
                    variant="destructive"
                    onClick={closeAuction}
                    className="w-full"
                  >
                    Chiudi Asta
                  </Button>
                </div>

                {/* Assegnazione manuale: utile quando due persone si sono
                    già accordate fuori dall'asta su chi se lo prende, a
                    prescindere da chi risulta offerente più alto. */}
                <div className="flex gap-2 pt-2 border-t border-slate-700">
                  <Select
                    value={manualAssignTo}
                    onValueChange={setManualAssignTo}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Assegna manualmente a..." />
                    </SelectTrigger>
                    <SelectContent>
                      {fantaMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
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
                        (m) => m.id === manualAssignTo,
                      );
                      if (!member) return;
                      assignAuctionManually(
                        activeAuction.id,
                        member.id,
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
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100">Tutte le Aste</CardTitle>
          <CardDescription className="text-slate-400">
            Storico completo delle aste
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {auctions.length === 0 ? (
              <p className="text-center text-slate-500 py-8">
                Nessuna asta disponibile. Crea la prima!
              </p>
            ) : (
              auctions.map((auction) => (
                <div
                  key={auction.id}
                  className={`flex items-center justify-between p-4 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors ${
                    auction.status === "closed" ? "cursor-pointer" : ""
                  }`}
                  onClick={() => {
                    if (auction.status === "closed") setDetailAuction(auction);
                  }}
                >
                  <div>
                    <h3 className="font-semibold text-slate-100">
                      {auction.playerName}
                    </h3>
                    <p className="text-sm text-slate-400">
                      Prezzo: {auction.currentPrice}€
                      {auction.highestBidderId &&
                        ` - ${getMemberName(auction.highestBidderId, auction.highestBidderName)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        auction.status === "active"
                          ? "default"
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
                      <Button onClick={() => startAuction(auction)} size="sm">
                        Avvia
                      </Button>
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
                    <Badge>{detailAuction.playerRole}</Badge>
                  )}
                  {detailAuction.playerTeam && (
                    <span className="text-sm text-slate-400">
                      {detailAuction.playerTeam}
                    </span>
                  )}
                </div>
                {detailAuction.description && (
                  <p className="text-sm text-slate-400">
                    {detailAuction.description}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-md border border-slate-700 bg-slate-800/50 p-4 text-sm">
                <div>
                  <span className="text-slate-400">Prezzo Base</span>
                  <p>{detailAuction.basePrice}€</p>
                </div>
                <div>
                  <span className="text-slate-400">Prezzo Finale</span>
                  <p>{detailAuction.currentPrice}€</p>
                </div>
                <div>
                  <span className="text-slate-400">Vinta da</span>
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
                  <span className="text-slate-400">Durata</span>
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
                  <span className="text-slate-400">Chiusa il</span>
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
