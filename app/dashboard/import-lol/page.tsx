"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Download, TrendingUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  searchPlayers,
  getPlayersByLeague,
  getTeamRosterHistory,
  getPlayerStats,
  getPlayerImage,
  getAvailableLeagues,
  type LeaguepediaPlayer,
  type LeaguepediaPlayerStats,
} from "@/lib/leaguepediaApi";
import { useFanta } from "@/contexts/FantaContext";
import { useRouter } from "next/navigation";

const KNOWN_LEAGUES = ["LCK", "LPL", "LCS", "LEC", "LCP", "PCS", "MSI", "WORLDS"];

function detectLeagueFromTournament(tournament: string): string {
  const upper = tournament.toUpperCase();
  return KNOWN_LEAGUES.find((league) => upper.includes(league)) || "Altro";
}

function detectYearFromTournament(tournament: string): string | null {
  const match = tournament.match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : null;
}

export default function ImportLoLPlayersPage() {
  const { currentFanta } = useFanta();
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLeague, setSelectedLeague] = useState("TUTTI I PRO PLAYER");
  const [availableLeagues, setAvailableLeagues] = useState<string[]>([]);
  const [players, setPlayers] = useState<LeaguepediaPlayer[]>([]);
  const [selectedPlayer, setSelectedPlayer] =
    useState<LeaguepediaPlayer | null>(null);
  const [playerStats, setPlayerStats] = useState<LeaguepediaPlayerStats[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [selectedPlayerImage, setSelectedPlayerImage] = useState<string | null>(
    null,
  );
  const [teamSearch, setTeamSearch] = useState("");
  const [teamSearchYear, setTeamSearchYear] = useState("");
  const [teamSearchWorldsOnly, setTeamSearchWorldsOnly] = useState(false);
  const [statsLeagueFilter, setStatsLeagueFilter] = useState("TUTTE");
  const [statsYearFilter, setStatsYearFilter] = useState("TUTTI");
  const [statsTeamFilter, setStatsTeamFilter] = useState("TUTTI");
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const topScroll = topScrollRef.current;
    const tableContainer = tableWrapperRef.current?.querySelector<HTMLElement>(
      '[data-slot="table-container"]',
    );
    if (!topScroll || !tableContainer) return;

    const syncFromTop = () => {
      tableContainer.scrollLeft = topScroll.scrollLeft;
    };
    const syncFromTable = () => {
      topScroll.scrollLeft = tableContainer.scrollLeft;
    };

    topScroll.addEventListener("scroll", syncFromTop);
    tableContainer.addEventListener("scroll", syncFromTable);
    return () => {
      topScroll.removeEventListener("scroll", syncFromTop);
      tableContainer.removeEventListener("scroll", syncFromTable);
    };
  }, [players.length]);

  // Carica le leghe disponibili
  useEffect(() => {
    const loadLeagues = async () => {
      const leagues = await getAvailableLeagues();
      setAvailableLeagues(Array.from(new Set(leagues)));
    };
    loadLeagues();
  }, []);

  // Verifica che siamo in una lega LoL
  useEffect(() => {
    if (currentFanta?.sportType !== "lol") {
      router.push("/dashboard/auctions");
    }
  }, [currentFanta, router]);

  // Cerca giocatori per nome
  const handleSearch = async () => {
    if (!searchTerm.trim()) return;

    setIsLoading(true);
    setApiError(false);
    try {
      const results = await searchPlayers(searchTerm);
      setPlayers(results);
      setApiError(results.length === 0);
    } catch (error) {
      console.error("Errore nella ricerca:", error);
      setApiError(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Carica giocatori per lega
  const handleLoadLeague = async () => {
    if (!selectedLeague) return;

    setIsLoading(true);
    setApiError(false);
    try {
      const results = await getPlayersByLeague(selectedLeague);
      setPlayers(results);
      setApiError(results.length === 0);
    } catch (error) {
      console.error("Errore nel caricamento lega:", error);
      setApiError(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Roster storico: chi ha giocato per una squadra, in un anno e/o ai
  // Mondiali. A differenza degli altri due box, la squadra qui riportata
  // è quella del torneo trovato, non quella attuale del giocatore — la
  // tabella dei risultati mostra il confronto tra le due.
  const canSearchByTeam = Boolean(
    teamSearch.trim() || teamSearchYear.trim() || teamSearchWorldsOnly,
  );

  const handleTeamSearch = async () => {
    if (!canSearchByTeam) return;

    setIsLoading(true);
    setApiError(false);
    try {
      const results = await getTeamRosterHistory({
        team: teamSearch,
        year: teamSearchYear,
        worldsOnly: teamSearchWorldsOnly,
      });
      setPlayers(results);
      setApiError(results.length === 0);
    } catch (error) {
      console.error("Errore nella ricerca per squadra:", error);
      setApiError(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Visualizza statistiche di un giocatore
  const handleViewStats = async (player: LeaguepediaPlayer) => {
    setSelectedPlayer(player);
    setSelectedPlayerImage(null);
    setStatsLeagueFilter("TUTTE");
    setStatsYearFilter("TUTTI");
    setStatsTeamFilter("TUTTI");
    setIsLoadingStats(true);

    try {
      const [stats, image] = await Promise.all([
        getPlayerStats(player.player),
        getPlayerImage(player.player),
      ]);
      setPlayerStats(stats);
      setSelectedPlayerImage(image);
    } catch (error) {
      console.error("Errore nel caricamento statistiche:", error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  // Importa giocatore nell'asta
  const handleImportPlayer = (player: LeaguepediaPlayer) => {
    // Salva dati giocatore in localStorage per precompilare il form asta
    const playerData = {
      playerName: player.player,
      playerRole: player.role,
      playerTeam: player.team || "",
      description: `${player.name} (${player.country}) - ${player.residency}`,
    };

    localStorage.setItem("prefilledAuctionData", JSON.stringify(playerData));
    router.push("/dashboard/auctions");
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role.toLowerCase()) {
      case "top":
      case "top laner":
        return "bg-info";
      case "jungle":
      case "jungler":
        return "bg-success";
      case "mid":
      case "mid laner":
        return "bg-warning";
      case "adc":
      case "bot":
        return "bg-destructive";
      case "support":
        return "bg-violet-600";
      default:
        return "bg-muted";
    }
  };

  // I risultati della ricerca per squadra/anno/Mondiali portano
  // historicalTeam: solo in quel caso ha senso la colonna di confronto.
  const showHistoryColumn = players.some((player) => player.historicalTeam);

  const statsLeagueOptions = useMemo(() => {
    const leagues = new Set(
      playerStats.map((stat) => detectLeagueFromTournament(stat.tournament)),
    );
    return Array.from(leagues).sort();
  }, [playerStats]);

  const statsYearOptions = useMemo(() => {
    const years = new Set(
      playerStats
        .map((stat) => detectYearFromTournament(stat.tournament))
        .filter((year): year is string => Boolean(year)),
    );
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [playerStats]);

  const statsTeamOptions = useMemo(() => {
    const teams = new Set(
      playerStats.map((stat) => stat.team).filter(Boolean),
    );
    return Array.from(teams).sort();
  }, [playerStats]);

  const filteredPlayerStats = useMemo(() => {
    return playerStats.filter((stat) => {
      const leagueMatch =
        statsLeagueFilter === "TUTTE" ||
        detectLeagueFromTournament(stat.tournament) === statsLeagueFilter;
      const yearMatch =
        statsYearFilter === "TUTTI" ||
        detectYearFromTournament(stat.tournament) === statsYearFilter;
      const teamMatch =
        statsTeamFilter === "TUTTI" || stat.team === statsTeamFilter;
      return leagueMatch && yearMatch && teamMatch;
    });
  }, [playerStats, statsLeagueFilter, statsYearFilter, statsTeamFilter]);

  if (!currentFanta) {
    return <div>Caricamento...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Importa Pro Players LoL
          </CardTitle>
          <CardDescription>
            Cerca e importa solo pro player professionistici da Leaguepedia per
            creare aste reali.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Ricerca per nome */}
          <div className="space-y-2">
            <Label>Cerca per Nome</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Es: Faker, Caps, Chovy, Jankos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <Button onClick={handleSearch} disabled={isLoading}>
                <Search className="h-4 w-4 mr-2" />
                Cerca
              </Button>
            </div>
          </div>

          {/* Carica per lega */}
          <div className="space-y-2">
            <Label>Oppure Carica Tutti i Giocatori di una Lega</Label>
            <div className="flex gap-2">
              <Select value={selectedLeague} onValueChange={setSelectedLeague}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableLeagues.map((league) => (
                    <SelectItem key={league} value={league}>
                      {league}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleLoadLeague} disabled={isLoading}>
                Carica Lega
              </Button>
            </div>
          </div>

          {/* Cerca per squadra/anno/Mondiali */}
          <div className="space-y-2">
            <Label>
              Oppure Cerca il Roster di una Squadra (per anno o Mondiali)
            </Label>
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
              <Input
                placeholder="Squadra, es: T1, G2 Esports..."
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTeamSearch()}
              />
              <Input
                type="number"
                placeholder="Anno (es: 2026)"
                value={teamSearchYear}
                onChange={(e) => setTeamSearchYear(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTeamSearch()}
              />
              <Button
                onClick={handleTeamSearch}
                disabled={isLoading || !canSearchByTeam}
              >
                <Search className="h-4 w-4 mr-2" />
                Cerca
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="worldsOnly"
                checked={teamSearchWorldsOnly}
                onCheckedChange={(checked) => setTeamSearchWorldsOnly(checked === true)}
              />
              <Label htmlFor="worldsOnly" className="cursor-pointer">
                Solo roster Mondiali (con o senza squadra/anno)
              </Label>
            </div>
            <p className="text-sm text-muted-foreground">
              Squadra e anno sono entrambi facoltativi: puoi cercare solo la
              squadra (roster di sempre), solo l&apos;anno con Mondiali
              spuntato (tutti i partecipanti ai Mondiali di quell&apos;anno),
              o combinarli. Il risultato mostra la squadra di allora vs quella
              attuale del giocatore.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tabella risultati */}
      {players.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Risultati ({players.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              ref={topScrollRef}
              className="w-full overflow-x-auto mb-2"
              aria-label="Scorrimento tabella"
            >
              <div className="h-px min-w-[760px]" />
            </div>
            <div ref={tableWrapperRef} className="w-full">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-card">
                    <TableHead>Nick</TableHead>
                    <TableHead>Ruolo</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Lega</TableHead>
                    {showHistoryColumn && <TableHead>Storico</TableHead>}
                    <TableHead>Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {players.map((player, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-semibold">
                        {player.player}
                      </TableCell>
                      <TableCell>
                        <Badge className={getRoleBadgeColor(player.role)}>
                          {player.role}
                        </Badge>
                      </TableCell>
                      <TableCell>{player.team}</TableCell>
                      <TableCell>{player.league || "N/D"}</TableCell>
                      {showHistoryColumn && (
                        <TableCell>
                          {player.historicalTeam ? (
                            player.historicalTeam === player.team ? (
                              <Badge className="bg-success">
                                Ancora in squadra
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-warning text-warning"
                              >
                                {player.tournamentYear
                                  ? `Nel ${player.tournamentYear}: `
                                  : ""}
                                {player.historicalTeam}
                              </Badge>
                            )
                          ) : (
                            "N/D"
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewStats(player)}
                          >
                            <TrendingUp className="h-4 w-4 mr-1" />
                            Stats
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleImportPlayer(player)}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Importa
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={Boolean(selectedPlayer)}
        onOpenChange={(open) => !open && setSelectedPlayer(null)}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-400 sm:max-w-400 max-h-[92vh] overflow-y-auto">
          {selectedPlayer && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-4">
                  {selectedPlayerImage ? (
                    <img
                      src={selectedPlayerImage}
                      alt={selectedPlayer.player}
                      className="h-16 w-16 rounded-md object-cover"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-md bg-raised" />
                  )}
                  <span>{selectedPlayer.player}</span>
                </DialogTitle>
                <DialogDescription>
                  Informazioni e statistiche globali da Leaguepedia
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-raised/50 p-4 text-sm md:grid-cols-4">
                <div>
                  <span className="text-muted-foreground">Nome</span>
                  <p>{selectedPlayer.name || "N/D"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Ruolo</span>
                  <p>{selectedPlayer.role || "N/D"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Team</span>
                  <p>{selectedPlayer.team || "N/D"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Lega</span>
                  <p>{selectedPlayer.league || "N/D"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Paese</span>
                  <p>{selectedPlayer.country || "N/D"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Residenza</span>
                  <p>{selectedPlayer.residency || "N/D"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Nascita</span>
                  <p>{selectedPlayer.birthdate || "N/D"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Partite</span>
                  <p>
                    {filteredPlayerStats.reduce(
                      (total, stat) => total + stat.gamesPlayed,
                      0,
                    )}
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                {isLoadingStats ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Caricamento statistiche...
                  </div>
                ) : playerStats.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-3">
                      <div className="space-y-1">
                        <Label className="text-muted-foreground text-xs">Lega</Label>
                        <Select
                          value={statsLeagueFilter}
                          onValueChange={setStatsLeagueFilter}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="TUTTE">Tutte le leghe</SelectItem>
                            {statsLeagueOptions.map((league) => (
                              <SelectItem key={league} value={league}>
                                {league}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-muted-foreground text-xs">Anno</Label>
                        <Select
                          value={statsYearFilter}
                          onValueChange={setStatsYearFilter}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="TUTTI">Tutti gli anni</SelectItem>
                            {statsYearOptions.map((year) => (
                              <SelectItem key={year} value={year}>
                                {year}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-muted-foreground text-xs">Team</Label>
                        <Select
                          value={statsTeamFilter}
                          onValueChange={setStatsTeamFilter}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="TUTTI">Tutti i team</SelectItem>
                            {statsTeamOptions.map((team) => (
                              <SelectItem key={team} value={team}>
                                {team}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-4 text-sm md:grid-cols-4">
                      <div>
                        <span className="text-muted-foreground">Uccisioni</span>
                        <p>
                          {filteredPlayerStats.reduce(
                            (total, stat) => total + stat.kills,
                            0,
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Morti</span>
                        <p>
                          {filteredPlayerStats.reduce(
                            (total, stat) => total + stat.deaths,
                            0,
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Assist</span>
                        <p>
                          {filteredPlayerStats.reduce(
                            (total, stat) => total + stat.assists,
                            0,
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">KDA globale</span>
                        <p>
                          {(() => {
                            const kills = filteredPlayerStats.reduce(
                              (total, stat) => total + stat.kills,
                              0,
                            );
                            const deaths = filteredPlayerStats.reduce(
                              (total, stat) => total + stat.deaths,
                              0,
                            );
                            const assists = filteredPlayerStats.reduce(
                              (total, stat) => total + stat.assists,
                              0,
                            );
                            return deaths === 0
                              ? kills + assists
                              : ((kills + assists) / deaths).toFixed(2);
                          })()}
                        </p>
                      </div>
                    </div>
                    {filteredPlayerStats.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        Nessuna statistica per i filtri selezionati
                      </div>
                    ) : (
                    <div className="overflow-x-auto rounded-md border border-border">
                      <Table className="min-w-[900px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Torneo</TableHead>
                            <TableHead>Team</TableHead>
                            <TableHead>Partite</TableHead>
                            <TableHead>K/D/A</TableHead>
                            <TableHead>KDA Ratio</TableHead>
                            <TableHead>Champion Giocati</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredPlayerStats.map((stat, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">
                                {stat.tournament}
                              </TableCell>
                              <TableCell>{stat.team}</TableCell>
                              <TableCell>{stat.gamesPlayed}</TableCell>
                              <TableCell>
                                {stat.kills} / {stat.deaths} / {stat.assists}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={
                                    stat.kda >= 3
                                      ? "bg-success"
                                      : stat.kda >= 2
                                        ? "bg-info"
                                        : "bg-muted"
                                  }
                                >
                                  {stat.kda}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex min-w-[260px] flex-wrap gap-1">
                                  {stat.champion
                                    .split(", ")
                                    .filter(Boolean)
                                    .map((champion) => (
                                      <Badge
                                        key={champion}
                                        variant="outline"
                                        className="border-border bg-raised text-xs font-normal"
                                      >
                                        {champion}
                                      </Badge>
                                    ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Nessuna statistica disponibile per questo giocatore
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {isLoading && players.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Caricamento giocatori...
          </CardContent>
        </Card>
      )}

      {!isLoading && players.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {apiError
              ? "Leaguepedia non ha restituito giocatori. Controlla le Bot Password nel file .env.local."
              : "Cerca un giocatore o carica una lega per iniziare"}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
