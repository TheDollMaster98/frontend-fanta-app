"use client";

import { useState, useEffect } from "react";
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
  searchPlayers,
  getPlayersByLeague,
  getPlayerStats,
  getPlayerImage,
  getAvailableLeagues,
  type LeaguepediaPlayer,
  type LeaguepediaPlayerStats,
} from "@/lib/leaguepediaApi";
import { useFanta } from "@/contexts/FantaContext";
import { useRouter } from "next/navigation";

export default function ImportLoLPlayersPage() {
  const { currentFanta } = useFanta();
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLeague, setSelectedLeague] = useState("LEC");
  const [availableLeagues, setAvailableLeagues] = useState<string[]>([]);
  const [players, setPlayers] = useState<LeaguepediaPlayer[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<LeaguepediaPlayer | null>(
    null
  );
  const [playerStats, setPlayerStats] = useState<LeaguepediaPlayerStats[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Carica le leghe disponibili
  useEffect(() => {
    const loadLeagues = async () => {
      const leagues = await getAvailableLeagues();
      setAvailableLeagues(leagues);
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
    try {
      const results = await searchPlayers(searchTerm);
      setPlayers(results);
    } catch (error) {
      console.error("Errore nella ricerca:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Carica giocatori per lega
  const handleLoadLeague = async () => {
    if (!selectedLeague) return;

    setIsLoading(true);
    try {
      const results = await getPlayersByLeague(selectedLeague);
      setPlayers(results);
    } catch (error) {
      console.error("Errore nel caricamento lega:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Visualizza statistiche di un giocatore
  const handleViewStats = async (player: LeaguepediaPlayer) => {
    setSelectedPlayer(player);
    setIsLoadingStats(true);

    try {
      const stats = await getPlayerStats(player.player);
      setPlayerStats(stats);
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
        return "bg-blue-600";
      case "jungle":
      case "jungler":
        return "bg-green-600";
      case "mid":
      case "mid laner":
        return "bg-yellow-600";
      case "adc":
      case "bot":
        return "bg-red-600";
      case "support":
        return "bg-purple-600";
      default:
        return "bg-slate-600";
    }
  };

  if (!currentFanta) {
    return <div>Caricamento...</div>;
  }

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Importa Giocatori LoL Reali
          </CardTitle>
          <CardDescription>
            Cerca e importa giocatori da Leaguepedia per creare aste con dati reali
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Ricerca per nome */}
          <div className="space-y-2">
            <Label>Cerca per Nome</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Es: Faker, Caps, Jankos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="bg-slate-800 border-slate-600"
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
                <SelectTrigger className="bg-slate-800 border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableLeagues.map((league) => (
                    <SelectItem key={league} value={league}>
                      {league}
                    </SelectItem>
                  ))}
                  <SelectItem value="LEC">LEC (Europa)</SelectItem>
                  <SelectItem value="LCS">LCS (Nord America)</SelectItem>
                  <SelectItem value="LCK">LCK (Corea)</SelectItem>
                  <SelectItem value="LPL">LPL (Cina)</SelectItem>
                  <SelectItem value="PCS">PCS (Taiwan/SEA)</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleLoadLeague} disabled={isLoading}>
                Carica Lega
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabella risultati */}
      {players.length > 0 && (
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader>
            <CardTitle>Risultati ({players.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Giocatore</TableHead>
                  <TableHead>Nome Reale</TableHead>
                  <TableHead>Ruolo</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Paese</TableHead>
                  <TableHead>Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.map((player, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-semibold">
                      {player.player}
                    </TableCell>
                    <TableCell>{player.name}</TableCell>
                    <TableCell>
                      <Badge className={getRoleBadgeColor(player.role)}>
                        {player.role}
                      </Badge>
                    </TableCell>
                    <TableCell>{player.team}</TableCell>
                    <TableCell>{player.country}</TableCell>
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
          </CardContent>
        </Card>
      )}

      {/* Statistiche giocatore selezionato */}
      {selectedPlayer && (
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader>
            <CardTitle>
              Statistiche: {selectedPlayer.player} ({selectedPlayer.name})
            </CardTitle>
            <CardDescription>
              {selectedPlayer.team} - {selectedPlayer.role}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <div className="text-center py-8 text-slate-400">
                Caricamento statistiche...
              </div>
            ) : playerStats.length > 0 ? (
              <Table>
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
                  {playerStats.map((stat, idx) => (
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
                              ? "bg-green-600"
                              : stat.kda >= 2
                              ? "bg-blue-600"
                              : "bg-slate-600"
                          }
                        >
                          {stat.kda}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {stat.champion}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-slate-400">
                Nessuna statistica disponibile per questo giocatore
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading && players.length === 0 && (
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="py-12 text-center text-slate-400">
            Caricamento giocatori...
          </CardContent>
        </Card>
      )}

      {!isLoading && players.length === 0 && (
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="py-12 text-center text-slate-400">
            Cerca un giocatore o carica una lega per iniziare
          </CardContent>
        </Card>
      )}
    </div>
  );
}
