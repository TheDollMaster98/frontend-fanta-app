"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { useFanta } from "@/contexts/FantaContext";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import type { Fanta, SportType } from "@/types";
import { RoleScoringWeightsEditor } from "@/components/RoleScoringWeightsEditor";
import {
  MIN_COUNTDOWN_SECONDS,
  MAX_COUNTDOWN_SECONDS,
  getFantaRoles,
  CIRCUIT_TYPES,
  LOL_ROLES,
  DEFAULT_ROLE_SCORING_WEIGHTS,
  DEFAULT_TEAM_SCORING_WEIGHTS,
} from "@/lib/constants";
import { Copy, UserPlus } from "lucide-react";
import { toast } from "sonner";

export default function AdminPage() {
  const router = useRouter();
  const {
    currentFanta,
    updateFanta,
    isFantaViceOrAdmin,
    isLoading: fantaLoading,
  } = useFanta();
  const { user, isLoading: authLoading } = useAuth();

  const loading = authLoading || fantaLoading;
  // Creatore, vice-admin o developer possono entrare in Gestione Lega: chi
  // no viene rimandato alla dashboard.
  const isAuthorized = !!currentFanta && !!user && isFantaViceOrAdmin;

  // Redirect se non è il creatore né un developer (solo dopo che i dati sono stati caricati)
  useEffect(() => {
    if (!loading && !isAuthorized) {
      router.push("/dashboard");
    }
  }, [loading, isAuthorized, router]);

  if (loading || !currentFanta || !user || !isAuthorized) {
    return null;
  }

  return (
    <AdminPageContent currentFanta={currentFanta} updateFanta={updateFanta} />
  );
}

function AdminPageContent({
  currentFanta,
  updateFanta,
}: {
  currentFanta: Fanta;
  updateFanta: (fanta: Fanta) => void;
}) {
  const router = useRouter();
  const {
    pendingJoinRequests,
    approveJoinRequest,
    rejectJoinRequest,
    fantaMembers,
    isFantaAdmin,
    addViceAdmin,
    removeViceAdmin,
    removeMember,
    startSeason,
    setSeasonStarted,
    deleteFanta,
  } = useFanta();
  // I vice-admin possono entrare in Gestione Lega e toccare le
  // impostazioni (budget, circuito, pesi punteggio, ecc.), ma non gestire
  // chi fa parte della lega: aggiungere/togliere vice-admin o cacciare
  // membri resta una decisione del creatore (o di un dev).
  const canManageMembers = isFantaAdmin;
  const [settings, setSettings] = useState({
    ...currentFanta.settings,
    maxPlayersTotal: currentFanta.settings.maxPlayersTotal || 0,
    maxPlayersPerRole: currentFanta.settings.maxPlayersPerRole || {},
    circuitType: currentFanta.settings.circuitType || CIRCUIT_TYPES[0],
    maxJolly: currentFanta.settings.maxJolly || 0,
    draftPickSeconds:
      currentFanta.settings.draftPickSeconds || MIN_COUNTDOWN_SECONDS,
    scoringWeights: {
      ...DEFAULT_ROLE_SCORING_WEIGHTS,
      ...currentFanta.settings.scoringWeights,
    },
    teamScoringWeights: {
      ...DEFAULT_TEAM_SCORING_WEIGHTS,
      ...currentFanta.settings.teamScoringWeights,
    },
  });
  const availableRoles = getFantaRoles(currentFanta);
  const [generalInfo, setGeneralInfo] = useState({
    name: currentFanta.name,
    description: currentFanta.description || "",
    sportType: currentFanta.sportType,
  });
  const [copiedCode, setCopiedCode] = useState(false);
  const [newViceEmail, setNewViceEmail] = useState("");
  const [isAddingVice, setIsAddingVice] = useState(false);
  const [isStartingSeason, setIsStartingSeason] = useState(false);
  const [isDeletingFanta, setIsDeletingFanta] = useState(false);
  const members = fantaMembers;
  const inviteCode = currentFanta.inviteCode;
  const seasonStarted = !!currentFanta.settings.seasonStarted;

  const handleStartSeason = async () => {
    setIsStartingSeason(true);
    try {
      await startSeason();
      toast.success("Stagione avviata: mercato chiuso, calendario generato");
    } finally {
      setIsStartingSeason(false);
    }
  };

  const handleReopenMarket = () => {
    setSeasonStarted(false);
    toast.success("Mercato riaperto");
  };

  // Cancellazione a cascata (membri, aste, draft, storico, calendario,
  // gironi, tabellone, richieste) vive in FantaContext.deleteFanta: qui solo
  // l'azione e il redirect via, non c'è più nessuna lega corrente da
  // mostrare in Gestione dopo il successo.
  const handleDeleteFanta = async () => {
    setIsDeletingFanta(true);
    try {
      await deleteFanta(currentFanta.id);
      toast.success("Lega eliminata");
      router.push("/dashboard");
    } catch (error) {
      console.error("Errore nell'eliminazione della lega:", error);
      toast.error("Errore nell'eliminazione della lega, riprova");
      setIsDeletingFanta(false);
    }
  };

  const handleGeneralInfoUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    updateFanta({ ...currentFanta, ...generalInfo });
    toast.success("Informazioni lega aggiornate");
  };

  const handleSettingsUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    updateFanta({
      ...currentFanta,
      settings: {
        ...settings,
        defaultCountdown: Math.min(
          MAX_COUNTDOWN_SECONDS,
          Math.max(MIN_COUNTDOWN_SECONDS, settings.defaultCountdown),
        ),
        draftPickSeconds: Math.min(
          MAX_COUNTDOWN_SECONDS,
          Math.max(
            MIN_COUNTDOWN_SECONDS,
            settings.draftPickSeconds ?? MIN_COUNTDOWN_SECONDS,
          ),
        ),
      },
    });
    toast.success("Impostazioni aggiornate");
  };

  const copyInviteCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const [copiedLink, setCopiedLink] = useState(false);
  const copyInviteLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/join/${inviteCode}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleAddViceAdmin = async () => {
    const email = newViceEmail.trim();
    if (!email) return;

    setIsAddingVice(true);
    try {
      const usersQuery = query(
        collection(db, "users"),
        where("email", "==", email),
      );
      const snapshot = await getDocs(usersQuery);

      if (snapshot.empty) {
        toast.error("Nessun utente registrato con questa email");
        return;
      }

      const foundId = snapshot.docs[0].id;
      const foundMember = members.find((m) => m.userId === foundId);

      if (!foundMember) {
        toast.error(
          "Questo utente deve prima entrare nella lega (invito o richiesta)",
        );
        return;
      }
      if (foundMember.role === "vice") {
        toast.error("È già vice-admin");
        return;
      }
      if (foundMember.role === "admin") {
        toast.error("È già il creatore della lega");
        return;
      }

      addViceAdmin(foundId);
      setNewViceEmail("");
      toast.success("Vice-admin aggiunto");
    } finally {
      setIsAddingVice(false);
    }
  };

  // Il bottone "Rimuovi" qui sotto non compare nemmeno per il creatore
  // (vedi {!isCreator && canManageMembers && ...} nel render): questo
  // handler non riceve mai un userId di ruolo admin da UI normale, il
  // controllo serve solo come rete di sicurezza silenziosa.
  const handleRemoveMember = (userId: string) => {
    const member = members.find((m) => m.userId === userId);
    if (member?.role === "admin") return;
    removeMember(userId);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Gestione Lega</h1>
        <p className="text-muted-foreground mt-2">
          Configura {currentFanta.name} - Solo tu come creatore puoi gestire
          questa lega
        </p>
      </div>

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings">Impostazioni</TabsTrigger>
          <TabsTrigger value="invite">Invita Membri</TabsTrigger>
          <TabsTrigger value="requests" className="gap-1.5">
            Richieste
            {pendingJoinRequests.length > 0 && (
              <Badge className="px-1.5">{pendingJoinRequests.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="vice-admins">Vice-Admin</TabsTrigger>
          <TabsTrigger value="users">Membri</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-foreground">Stagione</CardTitle>
                <Badge variant={seasonStarted ? "default" : "secondary"}>
                  {seasonStarted ? "Mercato chiuso" : "Mercato aperto"}
                </Badge>
              </div>
              <CardDescription className="text-muted-foreground">
                {seasonStarted
                  ? "I membri non possono più creare/avviare aste, fare offerte, fare pick di draft o togliersi giocatori dalla rosa. Admin/vice/dev restano operativi per sistemare eventuali code rimaste aperte."
                  : "Chiude il mercato per i membri (aste, draft, rimozione pick) e genera il calendario a girone, in un'unica azione."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {seasonStarted ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline">Riapri Mercato</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Riaprire il mercato?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Il mercato torna aperto per tutti i membri. Il
                        calendario già generato NON viene toccato.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Indietro</AlertDialogCancel>
                      <AlertDialogAction onClick={handleReopenMarket}>
                        Riapri Mercato
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button disabled={isStartingSeason}>
                      {isStartingSeason ? "Avvio..." : "Avvia Stagione"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Avviare la stagione?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Il mercato si chiude: i membri non potranno più
                        creare/avviare aste, fare offerte, fare pick di
                        draft o togliersi giocatori dalla rosa. Genera
                        anche il calendario.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Indietro</AlertDialogCancel>
                      <AlertDialogAction onClick={handleStartSeason}>
                        Avvia Stagione
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </CardContent>
          </Card>

          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive">Zona Pericolosa</CardTitle>
              <CardDescription className="text-muted-foreground">
                Elimina la lega e tutto il suo contenuto: membri, aste,
                draft, storico, calendario, gironi/tabellone, richieste
                d&apos;ingresso. Non si può annullare.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DeleteFantaDialog
                fantaName={currentFanta.name}
                isDeleting={isDeletingFanta}
                onConfirm={handleDeleteFanta}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">
                Informazioni Lega
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Nome, sport e descrizione della lega
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleGeneralInfoUpdate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fantaName">Nome Lega</Label>
                  <Input
                    id="fantaName"
                    value={generalInfo.name}
                    onChange={(e) =>
                      setGeneralInfo({ ...generalInfo, name: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fantaSportType">Tipo di Sport/Gioco</Label>
                  <Select
                    value={generalInfo.sportType}
                    onValueChange={(value: SportType) =>
                      setGeneralInfo({ ...generalInfo, sportType: value })
                    }
                  >
                    <SelectTrigger id="fantaSportType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lol">League of Legends</SelectItem>
                      <SelectItem value="custom">Personalizzato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fantaDescription">Descrizione</Label>
                  <Textarea
                    id="fantaDescription"
                    value={generalInfo.description}
                    onChange={(e) =>
                      setGeneralInfo({
                        ...generalInfo,
                        description: e.target.value,
                      })
                    }
                    rows={3}
                    placeholder="Breve descrizione della lega..."
                  />
                </div>

                <Button type="submit">Salva Informazioni</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">
                Impostazioni Generali
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {settings.draftMode === "snake"
                  ? "Configura il timer per scelta e i limiti rosa del draft"
                  : "Configura budget, puntate e countdown per le aste"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSettingsUpdate} className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Modalità: {settings.draftMode === "snake" ? "Draft a turni (snake)" : "Asta live"}
                  {" "}— decisa alla creazione della lega, non cambiabile da qui.
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  {settings.draftMode === "snake" ? (
                    <div className="space-y-2">
                      <Label htmlFor="draftPickSeconds">
                        Tempo per scelta nel Draft (secondi)
                      </Label>
                      <Input
                        id="draftPickSeconds"
                        type="number"
                        value={settings.draftPickSeconds ?? MIN_COUNTDOWN_SECONDS}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            draftPickSeconds: Number(e.target.value),
                          })
                        }
                        min={MIN_COUNTDOWN_SECONDS}
                        max={MAX_COUNTDOWN_SECONDS}
                      />
                      <p className="text-xs text-muted-foreground">
                        Tra {MIN_COUNTDOWN_SECONDS}s e {MAX_COUNTDOWN_SECONDS}s.
                        Se scade, il turno viene saltato e va assegnato a mano.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="generalBudget">Budget Generale (€)</Label>
                        <Input
                          id="generalBudget"
                          type="number"
                          value={settings.generalBudget}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              generalBudget: Number(e.target.value),
                            })
                          }
                          min={0}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="defaultCountdown">
                          Countdown Default (secondi)
                        </Label>
                        <Input
                          id="defaultCountdown"
                          type="number"
                          value={settings.defaultCountdown}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              defaultCountdown: Number(e.target.value),
                            })
                          }
                          min={MIN_COUNTDOWN_SECONDS}
                          max={MAX_COUNTDOWN_SECONDS}
                        />
                        <p className="text-xs text-muted-foreground">
                          Tra {MIN_COUNTDOWN_SECONDS}s e {MAX_COUNTDOWN_SECONDS}s
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="minBid">Puntata Minima (€)</Label>
                        <Input
                          id="minBid"
                          type="number"
                          value={settings.minBid}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              minBid: Number(e.target.value),
                            })
                          }
                          min={1}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="maxBid">Puntata Massima (€)</Label>
                        <Input
                          id="maxBid"
                          type="number"
                          value={settings.maxBid}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              maxBid: Number(e.target.value),
                            })
                          }
                          min={settings.minBid}
                        />
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="maxPlayersTotal">
                      Max Giocatori in Rosa
                    </Label>
                    <Input
                      id="maxPlayersTotal"
                      type="number"
                      value={settings.maxPlayersTotal}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          maxPlayersTotal: Number(e.target.value),
                        })
                      }
                      min={0}
                    />
                    <p className="text-xs text-muted-foreground">0 = nessun limite</p>
                  </div>
                </div>

                {currentFanta.sportType === "lol" && (
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="circuitType">Circuito</Label>
                      <Select
                        value={settings.circuitType}
                        onValueChange={(value) =>
                          setSettings({ ...settings, circuitType: value })
                        }
                      >
                        <SelectTrigger id="circuitType">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CIRCUIT_TYPES.map((circuit) => (
                            <SelectItem key={circuit} value={circuit}>
                              {circuit}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="maxJolly">Giocatori Jolly Max</Label>
                      <Input
                        id="maxJolly"
                        type="number"
                        min={0}
                        value={settings.maxJolly}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            maxJolly: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                )}

                {currentFanta.sportType === "lol" && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Da bloccare (solo admin/dev) quando inizieranno le partite
                      — per ora modificabile anche dai vice-admin
                    </p>
                    <RoleScoringWeightsEditor
                      roles={LOL_ROLES}
                      weights={settings.scoringWeights}
                      teamWeights={settings.teamScoringWeights}
                      onChangeRoleWeights={(scoringWeights) =>
                        setSettings({ ...settings, scoringWeights })
                      }
                      onChangeTeamWeights={(teamScoringWeights) =>
                        setSettings({ ...settings, teamScoringWeights })
                      }
                    />
                  </div>
                )}

                {availableRoles.length > 0 && (
                  <div className="space-y-2">
                    <Label>Max Giocatori per Ruolo</Label>
                    <p className="text-xs text-muted-foreground">
                      Vuoto = nessun limite per quel ruolo
                    </p>
                    <div className="grid md:grid-cols-2 gap-4">
                      {availableRoles.map((role) => (
                        <div key={role} className="space-y-2">
                          <Label
                            htmlFor={`roleLimit-${role}`}
                            className="text-muted-foreground font-normal"
                          >
                            {role}
                          </Label>
                          <Input
                            id={`roleLimit-${role}`}
                            type="number"
                            min={0}
                            placeholder="Nessun limite"
                            value={settings.maxPlayersPerRole[role] ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              const nextPerRole = {
                                ...settings.maxPlayersPerRole,
                              };
                              if (value === "") {
                                delete nextPerRole[role];
                              } else {
                                nextPerRole[role] = Number(value);
                              }
                              setSettings({
                                ...settings,
                                maxPlayersPerRole: nextPerRole,
                              });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="allowCustomBids"
                    checked={settings.allowCustomBids}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        allowCustomBids: checked === true,
                      })
                    }
                  />
                  <Label htmlFor="allowCustomBids" className="cursor-pointer">
                    Permetti puntate personalizzate
                  </Label>
                </div>
                <Button type="submit">Salva Impostazioni</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* INVITE TAB */}
        <TabsContent value="invite">
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Invita Nuovi Membri
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Condividi il codice invito con i tuoi amici
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="text-foreground">Codice Invito</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    value={inviteCode}
                    readOnly
                    className="font-mono text-lg"
                  />
                  <Button
                    onClick={copyInviteCode}
                    variant={copiedCode ? "default" : "outline"}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    {copiedCode ? "Copiato!" : "Copia"}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Solo per chi ha già un account: entra in questa lega
                  aprendo &quot;Altre leghe disponibili&quot; nella dashboard
                  e inserendo questo codice, oppure con il link diretto qui
                  sotto. Per registrare un account nuovo serve invece un
                  invito separato, da Impostazioni.
                </p>
              </div>

              <Alert>
                <AlertDescription className="text-foreground">
                  <strong>Link diretto:</strong> chi lo apre entra
                  automaticamente in questa lega (deve avere già un account,
                  altrimenti gli viene chiesto di accedere prima).
                  <div className="mt-2 flex items-center gap-2">
                    <code className="inline-block flex-1 truncate rounded bg-background px-2 py-1 text-sm">
                      {typeof window !== "undefined"
                        ? window.location.origin
                        : ""}
                      /join/{inviteCode}
                    </code>
                    <Button
                      size="sm"
                      variant={copiedLink ? "default" : "outline"}
                      onClick={copyInviteLink}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      {copiedLink ? "Copiato!" : "Copia"}
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests">
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">
                Richieste di Ingresso
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Persone che vogliono entrare in questa lega
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingJoinRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nessuna richiesta in sospeso
                </p>
              ) : (
                <div className="space-y-2">
                  {pendingJoinRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between p-3 bg-raised border border-border rounded-lg"
                    >
                      <div>
                        <p className="text-foreground font-medium">
                          {request.userName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {request.userEmail}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => approveJoinRequest(request)}
                        >
                          Approva
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => rejectJoinRequest(request.id)}
                        >
                          Rifiuta
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vice-admins">
          <Card>
            <CardHeader>
              <CardTitle>Gestione Vice Admin</CardTitle>
              <CardDescription>
                Aggiungi utenti che possono aiutarti a gestire{" "}
                {settings.draftMode === "snake" ? "il draft" : "le aste"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {canManageMembers ? (
                <>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Email dell'utente (già membro della lega)"
                      value={newViceEmail}
                      onChange={(e) => setNewViceEmail(e.target.value)}
                      disabled={isAddingVice}
                    />
                    <Button onClick={handleAddViceAdmin} disabled={isAddingVice}>
                      {isAddingVice ? "..." : "Aggiungi"}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Solo il creatore della lega (o un dev) può aggiungere o
                  togliere vice-admin.
                </p>
              )}

              <div className="space-y-2">
                <Label className="text-foreground">Vice Admin Attuali:</Label>
                {members.filter((m) => m.role === "vice").length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nessun vice admin configurato
                  </p>
                ) : (
                  <div className="space-y-2">
                    {members
                      .filter((m) => m.role === "vice")
                      .map((member) => (
                        <div
                          key={member.userId}
                          className="flex items-center justify-between p-3 bg-raised border border-border rounded-lg"
                        >
                          <div>
                            <p className="text-foreground">{member.name}</p>
                            {member.email && (
                              <p className="text-sm text-muted-foreground">
                                {member.email}
                              </p>
                            )}
                          </div>
                          {canManageMembers && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => removeViceAdmin(member.userId)}
                            >
                              Rimuovi
                            </Button>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Gestione Utenti</CardTitle>
              <CardDescription>
                Visualizza e gestisci tutti gli utenti del Fanta
              </CardDescription>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun membro</p>
              ) : (
                <div className="space-y-2">
                  {members.map((member) => {
                    const isCreator = member.role === "admin";
                    const isVice = member.role === "vice";
                    return (
                      <div
                        key={member.userId}
                        className="flex items-center justify-between p-4 border border-border rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-foreground">
                            {member.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {member.email}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              isCreator
                                ? "default"
                                : isVice
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {isCreator
                              ? "Creatore"
                              : isVice
                                ? "Vice Admin"
                                : "Membro"}
                          </Badge>
                          {!isCreator && canManageMembers && (
                            <>
                              {isVice ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => removeViceAdmin(member.userId)}
                                >
                                  Togli da Vice
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => addViceAdmin(member.userId)}
                                >
                                  Rendi Vice
                                </Button>
                              )}
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleRemoveMember(member.userId)}
                              >
                                Rimuovi
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Conferma testuale (nome esatto della lega) invece di un semplice "sei
// sicuro?": è un'azione irreversibile che cancella anche i dati di tutti
// gli altri membri, non solo i propri.
function DeleteFantaDialog({
  fantaName,
  isDeleting,
  onConfirm,
}: {
  fantaName: string;
  isDeleting: boolean;
  onConfirm: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const canConfirm = confirmText === fantaName && !isDeleting;

  return (
    <AlertDialog onOpenChange={(open) => !open && setConfirmText("")}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Elimina Lega</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare &quot;{fantaName}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            Cancella la lega e tutto il suo contenuto per tutti i membri:
            membri, aste, draft, storico, calendario, gironi/tabellone,
            richieste d&apos;ingresso. Non si può annullare. Scrivi{" "}
            <strong>{fantaName}</strong> per confermare.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={fantaName}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Indietro</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm}
            onClick={onConfirm}
            className={buttonVariants({ variant: "destructive" })}
          >
            {isDeleting ? "Eliminazione..." : "Elimina Definitivamente"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
