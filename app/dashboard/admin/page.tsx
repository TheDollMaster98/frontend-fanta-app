"use client";

import { useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useFanta } from "@/contexts/FantaContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Copy,
  UserPlus,
  UserMinus,
  Crown,
  Shield,
  Users as UsersIcon,
} from "lucide-react";

export default function AdminPage() {
  const router = useRouter();
  const { currentFanta, updateFanta } = useFanta();
  const { user } = useAuth();

  // Redirect se non è il creatore
  if (!currentFanta || !user || currentFanta.adminId !== user.id) {
    router.push("/dashboard");
    return null;
  }

  const [settings, setSettings] = useState(currentFanta.settings);
  const [inviteCode] = useState(currentFanta.id.slice(0, 8).toUpperCase());
  const [copiedCode, setCopiedCode] = useState(false);
  const [newViceEmail, setNewViceEmail] = useState("");

  // Mock users - TODO: caricare da Firebase
  const mockUsers = [
    {
      id: "user-1",
      name: "Mario Rossi",
      email: "mario@test.it",
      role: "player",
    },
    {
      id: "user-2",
      name: "Luigi Verdi",
      email: "luigi@test.it",
      role: "player",
    },
  ];

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

  const addViceAdmin = () => {
    if (!newViceEmail) return;

    // TODO: Cercare user per email e aggiungere il suo ID
    const newViceAdminIds = [...currentFanta.viceAdminIds, "user-id-found"];
    updateFanta({ ...currentFanta, viceAdminIds: newViceAdminIds });
    setNewViceEmail("");
  };

  const removeViceAdmin = (userId: string) => {
    const newViceAdminIds = currentFanta.viceAdminIds.filter(
      (id) => id !== userId
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
      (id) => id !== userId
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
          <TabsTrigger value="vice-admins">Vice-Admin</TabsTrigger>
          <TabsTrigger value="users">Membri</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
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
                  💡 <strong>Link diretto:</strong> Condividi questo link:{" "}
                  <br />
                  <code className="text-sm bg-slate-950 px-2 py-1 rounded mt-2 inline-block">
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

        <TabsContent value="vice-admins">
          <Card>
            <CardHeader>
              <CardTitle>Gestione Vice Admin</CardTitle>
              <CardDescription>
                Aggiungi utenti che possono aiutarti a gestire le aste
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Email dell'utente"
                  value={newViceEmail}
                  onChange={(e) => setNewViceEmail(e.target.value)}
                />
                <Button onClick={addViceAdmin}>Aggiungi</Button>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Vice Admin Attuali:</Label>
                {currentFanta.viceAdminIds.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Nessun vice admin configurato
                  </p>
                ) : (
                  <div className="space-y-2">
                    {currentFanta.viceAdminIds.map((viceId) => (
                      <div
                        key={viceId}
                        className="flex items-center justify-between p-3 bg-slate-800 border border-slate-700 rounded-lg"
                      >
                        <span className="text-slate-100">
                          Vice Admin ID: {viceId}
                        </span>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => removeViceAdmin(viceId)}
                        >
                          Rimuovi
                        </Button>
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
              {/* TODO: Implementare lista utenti con dati da Firebase */}
              <div className="space-y-2">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Mario Rossi</p>
                    <p className="text-sm text-slate-600">mario@example.com</p>
                  </div>
                  <Badge>User</Badge>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Luigi Verdi</p>
                    <p className="text-sm text-slate-600">luigi@example.com</p>
                  </div>
                  <Badge variant="secondary">Vice Admin</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
