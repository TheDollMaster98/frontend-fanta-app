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
import {
  collection,
  query,
  where,
  documentId,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import type { Fanta, SportType } from "@/types";
import { Copy, UserPlus } from "lucide-react";

export default function AdminPage() {
  const router = useRouter();
  const { currentFanta, updateFanta, isLoading: fantaLoading } = useFanta();
  const { user, isLoading: authLoading } = useAuth();

  const loading = authLoading || fantaLoading;
  const isAuthorized =
    !!currentFanta &&
    !!user &&
    (currentFanta.adminId === user.id || !!user.isDeveloper);

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
  const { pendingJoinRequests, approveJoinRequest, rejectJoinRequest } =
    useFanta();
  const [settings, setSettings] = useState(currentFanta.settings);
  const [generalInfo, setGeneralInfo] = useState({
    name: currentFanta.name,
    description: currentFanta.description || "",
    sportType: currentFanta.sportType,
  });
  const [copiedCode, setCopiedCode] = useState(false);
  const [newViceEmail, setNewViceEmail] = useState("");
  const [isAddingVice, setIsAddingVice] = useState(false);
  const [members, setMembers] = useState<
    { id: string; name: string; email: string }[]
  >([]);
  const inviteCode = currentFanta.inviteCode;

  // Ascolta in tempo reale i profili dei membri di questo fanta
  useEffect(() => {
    if (currentFanta.memberIds.length === 0) return;

    const membersQuery = query(
      collection(db, "users"),
      where(documentId(), "in", currentFanta.memberIds.slice(0, 30)),
    );

    const unsubscribe = onSnapshot(membersQuery, (snapshot) => {
      setMembers(
        snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          name: docSnap.data().name || "Utente",
          email: docSnap.data().email || "",
        })),
      );
    });

    return unsubscribe;
  }, [currentFanta.memberIds]);

  const handleGeneralInfoUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    updateFanta({ ...currentFanta, ...generalInfo });
    alert("Informazioni lega aggiornate!");
  };

  const handleSettingsUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    updateFanta({ ...currentFanta, settings });
    alert("Impostazioni aggiornate!");
  };

  const copyInviteCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const addViceAdmin = async () => {
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

      if (!currentFanta.memberIds.includes(foundId)) {
        alert("Questo utente deve prima entrare nella lega (invito o richiesta)");
        return;
      }
      if (currentFanta.viceAdminIds.includes(foundId)) {
        alert("È già vice-admin");
        return;
      }

      updateFanta({
        ...currentFanta,
        viceAdminIds: [...currentFanta.viceAdminIds, foundId],
      });
      setNewViceEmail("");
    } finally {
      setIsAddingVice(false);
    }
  };

  const removeViceAdmin = (userId: string) => {
    const newViceAdminIds = currentFanta.viceAdminIds.filter(
      (id) => id !== userId,
    );
    updateFanta({ ...currentFanta, viceAdminIds: newViceAdminIds });
  };

  const removeMember = (userId: string) => {
    if (userId === currentFanta.adminId) {
      alert("Non puoi rimuovere il creatore!");
      return;
    }
    const newMemberIds = currentFanta.memberIds.filter((id) => id !== userId);
    const newViceAdminIds = currentFanta.viceAdminIds.filter(
      (id) => id !== userId,
    );
    updateFanta({
      ...currentFanta,
      memberIds: newMemberIds,
      viceAdminIds: newViceAdminIds,
    });
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
                      min={1}
                    />
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
                </div>
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
              <div className="flex gap-2">
                <Input
                  placeholder="Email dell'utente (già membro della lega)"
                  value={newViceEmail}
                  onChange={(e) => setNewViceEmail(e.target.value)}
                  disabled={isAddingVice}
                />
                <Button onClick={addViceAdmin} disabled={isAddingVice}>
                  {isAddingVice ? "..." : "Aggiungi"}
                </Button>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Vice Admin Attuali:</Label>
                {currentFanta.viceAdminIds.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Nessun vice admin configurato
                  </p>
                ) : (
                  <div className="space-y-2">
                    {currentFanta.viceAdminIds.map((viceId) => {
                      const member = members.find((m) => m.id === viceId);
                      return (
                        <div
                          key={viceId}
                          className="flex items-center justify-between p-3 bg-slate-800 border border-slate-700 rounded-lg"
                        >
                          <div>
                            <p className="text-slate-100">
                              {member?.name || "Utente"}
                            </p>
                            {member?.email && (
                              <p className="text-sm text-slate-400">
                                {member.email}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => removeViceAdmin(viceId)}
                          >
                            Rimuovi
                          </Button>
                        </div>
                      );
                    })}
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
                    const isCreator = member.id === currentFanta.adminId;
                    const isVice = currentFanta.viceAdminIds.includes(
                      member.id,
                    );
                    return (
                      <div
                        key={member.id}
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
                          {!isCreator && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => removeMember(member.id)}
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
