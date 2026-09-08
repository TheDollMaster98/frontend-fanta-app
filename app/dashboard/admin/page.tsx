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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useFanta } from "@/contexts/FantaContext";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import type { Fanta, SportType } from "@/types";
import { RoleScoringWeightsEditor } from "@/components/RoleScoringWeightsEditor";
import {
  MIN_COUNTDOWN_SECONDS,
  MAX_COUNTDOWN_SECONDS,
  SPORT_TEMPLATES,
  CIRCUIT_TYPES,
  LOL_ROLES,
  DEFAULT_ROLE_SCORING_WEIGHTS,
  DEFAULT_TEAM_SCORING_WEIGHTS,
} from "@/lib/constants";
import { Copy, UserPlus } from "lucide-react";

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

  return <AdminPageContent currentFanta={currentFanta} updateFanta={updateFanta} />;
}

function AdminPageContent({
  currentFanta,
  updateFanta,
}: {
  currentFanta: Fanta;
  updateFanta: (fanta: Fanta) => void;
}) {
  const {
    pendingJoinRequests,
    approveJoinRequest,
    rejectJoinRequest,
    fantaMembers,
    isFantaAdmin,
    addViceAdmin,
    removeViceAdmin,
    removeMember,
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
    scoringWeights: {
      ...DEFAULT_ROLE_SCORING_WEIGHTS,
      ...currentFanta.settings.scoringWeights,
    },
    teamScoringWeights: {
      ...DEFAULT_TEAM_SCORING_WEIGHTS,
      ...currentFanta.settings.teamScoringWeights,
    },
  });
  const availableRoles = SPORT_TEMPLATES[currentFanta.sportType]?.roles || [];
  const [generalInfo, setGeneralInfo] = useState({
    name: currentFanta.name,
    description: currentFanta.description || "",
    sportType: currentFanta.sportType,
  });
  const [copiedCode, setCopiedCode] = useState(false);
  const [newViceEmail, setNewViceEmail] = useState("");
  const [isAddingVice, setIsAddingVice] = useState(false);
  const members = fantaMembers;
  const inviteCode = currentFanta.inviteCode;

  const handleGeneralInfoUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    updateFanta({ ...currentFanta, ...generalInfo });
    alert("Informazioni lega aggiornate!");
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
      },
    });
    alert("Impostazioni aggiornate!");
  };

  const copyInviteCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
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
        alert("Nessun utente registrato con questa email");
        return;
      }

      const foundId = snapshot.docs[0].id;
      const foundMember = members.find((m) => m.userId === foundId);

      if (!foundMember) {
        alert("Questo utente deve prima entrare nella lega (invito o richiesta)");
        return;
      }
      if (foundMember.role === "vice") {
        alert("È già vice-admin");
        return;
      }
      if (foundMember.role === "admin") {
        alert("È già il creatore della lega");
        return;
      }

      addViceAdmin(foundId);
      setNewViceEmail("");
    } finally {
      setIsAddingVice(false);
    }
  };

  const handleRemoveMember = (userId: string) => {
    const member = members.find((m) => m.userId === userId);
    if (member?.role === "admin") {
      alert("Non puoi rimuovere il creatore!");
      return;
    }
    removeMember(userId);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-100">Gestione Lega</h1>
        <p className="text-slate-400 mt-2">
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
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100">
                Informazioni Lega
              </CardTitle>
              <CardDescription className="text-slate-400">
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
                      <SelectItem value="calcio">Calcio</SelectItem>
                      <SelectItem value="lol">League of Legends</SelectItem>
                      <SelectItem value="basket">Basket</SelectItem>
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

          <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100">
                Impostazioni Generali
              </CardTitle>
              <CardDescription className="text-slate-400">
                Configura budget, puntate e countdown per le aste
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSettingsUpdate} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
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
                    <p className="text-xs text-slate-500">
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
                    <p className="text-xs text-slate-500">0 = nessun limite</p>
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
                    <p className="text-xs text-slate-500">
                      Da bloccare (solo admin/dev) quando inizieranno le
                      partite — per ora modificabile anche dai vice-admin
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
                    <p className="text-xs text-slate-500">
                      Vuoto = nessun limite per quel ruolo
                    </p>
                    <div className="grid md:grid-cols-2 gap-4">
                      {availableRoles.map((role) => (
                        <div key={role} className="space-y-2">
                          <Label
                            htmlFor={`roleLimit-${role}`}
                            className="text-slate-400 font-normal"
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
                              const nextPerRole = { ...settings.maxPlayersPerRole };
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
                  <input
                    type="checkbox"
                    id="allowCustomBids"
                    checked={settings.allowCustomBids}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        allowCustomBids: e.target.checked,
                      })
                    }
                    className="w-4 h-4"
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
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Invita Nuovi Membri
              </CardTitle>
              <CardDescription className="text-slate-400">
                Condividi il codice invito con i tuoi amici
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="text-slate-300">Codice Invito</Label>
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
                <p className="text-sm text-slate-500 mt-2">
                  Gli utenti possono inserire questo codice durante la
                  registrazione o dalle impostazioni
                </p>
              </div>

              <Alert className="bg-slate-800 border-slate-700">
                <AlertDescription className="text-slate-300">
                  <strong>Link diretto:</strong> Condividi questo link:
                  <br />
                  <code className="mt-2 inline-block rounded bg-slate-950 px-2 py-1 text-sm">
                    {typeof window !== "undefined"
                      ? window.location.origin
                      : ""}
                    /join/{inviteCode}
                  </code>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests">
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100">
                Richieste di Ingresso
              </CardTitle>
              <CardDescription className="text-slate-400">
                Persone che vogliono entrare in questa lega
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingJoinRequests.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nessuna richiesta in sospeso
                </p>
              ) : (
                <div className="space-y-2">
                  {pendingJoinRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between p-3 bg-slate-800 border border-slate-700 rounded-lg"
                    >
                      <div>
                        <p className="text-slate-100 font-medium">
                          {request.userName}
                        </p>
                        <p className="text-sm text-slate-400">
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
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle>Gestione Vice Admin</CardTitle>
              <CardDescription>
                Aggiungi utenti che possono aiutarti a gestire le aste
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {canManageMembers ? (
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
              ) : (
                <p className="text-sm text-slate-500">
                  Solo il creatore della lega (o un dev) può aggiungere o
                  togliere vice-admin.
                </p>
              )}

              <div className="space-y-2">
                <Label className="text-slate-300">Vice Admin Attuali:</Label>
                {members.filter((m) => m.role === "vice").length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Nessun vice admin configurato
                  </p>
                ) : (
                  <div className="space-y-2">
                    {members
                      .filter((m) => m.role === "vice")
                      .map((member) => (
                        <div
                          key={member.userId}
                          className="flex items-center justify-between p-3 bg-slate-800 border border-slate-700 rounded-lg"
                        >
                          <div>
                            <p className="text-slate-100">{member.name}</p>
                            {member.email && (
                              <p className="text-sm text-slate-400">
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
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle>Gestione Utenti</CardTitle>
              <CardDescription>
                Visualizza e gestisci tutti gli utenti del Fanta
              </CardDescription>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="text-sm text-slate-500">Nessun membro</p>
              ) : (
                <div className="space-y-2">
                  {members.map((member) => {
                    const isCreator = member.role === "admin";
                    const isVice = member.role === "vice";
                    return (
                      <div
                        key={member.userId}
                        className="flex items-center justify-between p-4 border border-slate-700 rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-slate-100">
                            {member.name}
                          </p>
                          <p className="text-sm text-slate-400">
                            {member.email}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={isCreator ? "default" : isVice ? "secondary" : "outline"}>
                            {isCreator
                              ? "Creatore"
                              : isVice
                                ? "Vice Admin"
                                : "Membro"}
                          </Badge>
                          {!isCreator && canManageMembers && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleRemoveMember(member.userId)}
                            >
                              Rimuovi
                            </Button>
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
