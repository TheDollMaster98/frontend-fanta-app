"use client";

import { useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useFanta } from "@/contexts/FantaContext";
import { useAuth } from "@/contexts/AuthContext";
import { CreateFantaDialog } from "@/components/CreateFantaDialog";

export default function SettingsPage() {
  const { fantas, currentFanta, setCurrentFanta } = useFanta();
  const { user, setIsDeveloper } = useAuth();
  // Una volta visto come developer in questa sessione, il controllo resta
  // visibile anche se lo disattivi: così puoi riattivarlo senza dover
  // passare da Firestore Console. Un reload rivaluta lo stato vero.
  const [canToggleDeveloper] = useState(() => !!user?.isDeveloper);

  const [profile, setProfile] = useState({
    name: "Mario Rossi",
    email: "mario@example.com",
    fantaId: "fanta-1",
  });

  const [teamSettings, setTeamSettings] = useState({
    teamName: "I Campioni",
    fantaName: "Lega Serie A 2026",
  });

  const handleProfileUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Aggiornare Firebase
    console.log("Update profile:", profile);
  };

  const handleTeamUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Aggiornare Firebase
    console.log("Update team:", teamSettings);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-100">Impostazioni</h1>
        <p className="text-slate-400 mt-2">
          Gestisci il tuo profilo e le preferenze
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">Profilo</TabsTrigger>
          <TabsTrigger value="team">Team e Fanta</TabsTrigger>
          <TabsTrigger value="notifications">Notifiche</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100">
                Informazioni Profilo
              </CardTitle>
              <CardDescription className="text-slate-400">
                Aggiorna i tuoi dati personali
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileUpdate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    value={profile.name}
                    onChange={(e) =>
                      setProfile({ ...profile, name: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profile.email}
                    onChange={(e) =>
                      setProfile({ ...profile, email: e.target.value })
                    }
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="password">Nuova Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Lascia vuoto per non modificare"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Conferma Password</Label>
                  <Input id="confirmPassword" type="password" />
                </div>

                <Button type="submit">Salva Modifiche</Button>
              </form>
              <Separator className="my-6" />
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Gestione Leghe</h3>
                <p className="text-sm text-slate-500">
                  Crea una nuova lega per un diverso sport o competizione
                </p>
                <CreateFantaDialog />
              </div>

              {canToggleDeveloper && (
                <>
                  <Separator className="my-6" />
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold">
                      Modalità Developer
                    </h3>
                    <p className="text-sm text-slate-500">
                      Accesso universale a tutte le leghe, senza bisogno di
                      farne parte o di essere admin. Puoi attivarla e
                      disattivarla liberamente
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isDeveloper"
                        className="w-4 h-4"
                        checked={!!user?.isDeveloper}
                        onChange={(e) => setIsDeveloper(e.target.checked)}
                      />
                      <Label htmlFor="isDeveloper" className="cursor-pointer">
                        Modalità developer attiva
                      </Label>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team">
          <Card>
            <CardHeader>
              <CardTitle>Team e Fanta</CardTitle>
              <CardDescription>
                Personalizza il nome del tuo team e gestisci il fanta
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleTeamUpdate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="teamName">Nome Team</Label>
                  <Input
                    id="teamName"
                    value={teamSettings.teamName}
                    onChange={(e) =>
                      setTeamSettings({
                        ...teamSettings,
                        teamName: e.target.value,
                      })
                    }
                    placeholder="Es: I Campioni"
                  />
                  <p className="text-sm text-slate-500">
                    Il nome che identificherà la tua squadra nelle aste
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="selectFanta">Lega Attiva</Label>
                  <Select
                    value={currentFanta?.id}
                    onValueChange={(id) => {
                      const fanta = fantas.find((f) => f.id === id);
                      if (fanta) setCurrentFanta(fanta);
                    }}
                  >
                    <SelectTrigger id="selectFanta">
                      <SelectValue placeholder="Seleziona una lega" />
                    </SelectTrigger>
                    <SelectContent>
                      {fantas.map((fanta) => (
                        <SelectItem key={fanta.id} value={fanta.id}>
                          {fanta.name} ({fanta.sportType})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-slate-500">
                    Cambia la lega attiva per vedere le aste relative
                  </p>
                </div>

                <Button type="submit">Salva Modifiche</Button>
              </form>

              <Separator className="my-6" />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Gestione Leghe</h3>
                    <p className="text-sm text-slate-500">
                      Crea una nuova lega per un diverso sport o competizione
                    </p>
                  </div>
                  <CreateFantaDialog />
                </div>

                <div className="border border-slate-700 rounded-lg p-4 space-y-2">
                  <h4 className="font-medium text-slate-100">
                    Leghe Disponibili
                  </h4>
                  <div className="space-y-2">
                    {fantas.map((fanta) => (
                      <div
                        key={fanta.id}
                        className="flex items-center justify-between p-3 border border-slate-700 rounded hover:bg-slate-800 transition-colors"
                      >
                        <div>
                          <p className="font-medium text-slate-100">
                            {fanta.name}
                          </p>
                          <p className="text-sm text-slate-400">
                            {fanta.sportType} • {fanta.memberIds.length} membri
                          </p>
                        </div>
                        {currentFanta?.id === fanta.id && <Badge>Attiva</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Preferenze Notifiche</CardTitle>
              <CardDescription>
                Scegli quando ricevere notifiche
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Nuove Aste</p>
                  <p className="text-sm text-slate-600">
                    Ricevi notifiche quando inizia una nuova asta
                  </p>
                </div>
                <input type="checkbox" className="w-4 h-4" defaultChecked />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Aste Vinte</p>
                  <p className="text-sm text-slate-600">
                    Notifica quando vinci un&apos;asta
                  </p>
                </div>
                <input type="checkbox" className="w-4 h-4" defaultChecked />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Modifiche Impostazioni</p>
                  <p className="text-sm text-slate-600">
                    Notifica quando l&apos;admin modifica le impostazioni
                  </p>
                </div>
                <input type="checkbox" className="w-4 h-4" defaultChecked />
              </div>

              <Button className="mt-4">Salva Preferenze</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
