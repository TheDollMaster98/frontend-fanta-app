"use client";

import { useEffect, useState } from "react";
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
  const {
    fantas,
    currentFanta,
    setCurrentFanta,
    getTeamName,
    updateTeamName,
    getMemberCount,
  } = useFanta();
  const { user, setIsDeveloper, updateUserProfile, updateUserEmail, changePassword } =
    useAuth();
  // Una volta visto come developer in questa sessione, il controllo resta
  // visibile anche se lo disattivi: così puoi riattivarlo senza dover
  // passare da Firestore Console. Un reload rivaluta lo stato vero.
  const [canToggleDeveloper] = useState(() => !!user?.isDeveloper);

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileMessage, setProfileMessage] = useState("");

  const [teamName, setTeamName] = useState(
    user ? getTeamName(user.id) : "",
  );
  const [teamMessage, setTeamMessage] = useState("");

  const [notificationPrefs, setNotificationPrefs] = useState({
    newAuctions: true,
    auctionsWon: true,
    settingsChanges: true,
  });
  const [notificationMessage, setNotificationMessage] = useState("");

  // Nessun sistema di notifiche esiste ancora in quest'app (niente push,
  // email o centro notifiche in-app): questi checkbox prima non salvavano
  // nulla ed erano sempre spuntati al refresh. Ora almeno la scelta viene
  // ricordata nel browser, ma resta una preferenza senza nulla che la
  // legga davvero finché non esiste un meccanismo di invio.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("fanta-notification-prefs");
      if (stored) setNotificationPrefs(JSON.parse(stored));
    } catch {
      // localStorage non disponibile o dati corrotti: restano i default
    }
  }, []);

  const handleNotificationPrefsUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem(
        "fanta-notification-prefs",
        JSON.stringify(notificationPrefs),
      );
      setNotificationMessage("Preferenze salvate su questo dispositivo");
    } catch {
      setNotificationMessage("Impossibile salvare le preferenze");
    }
  };

  // Il nome team è per-lega: va ricaricato sia al primo arrivo dei dati da
  // Firestore sia quando l'utente cambia "Lega Attiva" qui sotto, altrimenti
  // il campo resterebbe fermo sul nome della lega precedente.
  useEffect(() => {
    if (user) setTeamName(getTeamName(user.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentFanta?.id]);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage("");

    if (newPassword && newPassword !== confirmPassword) {
      setProfileMessage("Le password non corrispondono");
      return;
    }

    try {
      if (name && name !== user?.name) {
        await updateUserProfile(name);
      }
      if (email && email !== user?.email) {
        await updateUserEmail(email);
      }
      if (newPassword) {
        await changePassword(newPassword);
        setNewPassword("");
        setConfirmPassword("");
      }
      setProfileMessage("Modifiche salvate");
    } catch (error) {
      setProfileMessage(
        error instanceof Error ? error.message : "Errore durante il salvataggio",
      );
    }
  };

  const handleTeamUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (user && teamName.trim()) {
      updateTeamName(user.id, teamName.trim());
      setTeamMessage("Nome team salvato");
    }
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
                {profileMessage && (
                  <div className="rounded-md border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-300">
                    {profileMessage}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <p className="text-sm text-slate-500">
                    Usala anche per accedere: se la cambi qui, dal prossimo
                    login dovrai usare quella nuova
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="password">Nuova Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Lascia vuoto per non modificare"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Conferma Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
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
                {teamMessage && (
                  <div className="rounded-md border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-300">
                    {teamMessage}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="teamName">Nome Team</Label>
                  <Input
                    id="teamName"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Es: I Campioni"
                  />
                  <p className="text-sm text-slate-500">
                    {currentFanta?.settings.draftMode === "snake"
                      ? "Il nome che identificherà la tua squadra nel draft"
                      : "Il nome che identificherà la tua squadra nelle aste"}
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
                    Cambia la lega attiva per vedere aste/draft relativi
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
                            {fanta.sportType} • {getMemberCount(fanta.id)} membri
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
                Scegli quando ricevere notifiche. Nota: l&apos;app non invia
                ancora notifiche vere (push o email) — questa scelta viene
                solo ricordata su questo dispositivo per quando ci saranno.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleNotificationPrefsUpdate}>
              <CardContent className="space-y-4">
                {notificationMessage && (
                  <div className="rounded-md border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-300">
                    {notificationMessage}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Nuove Aste</p>
                    <p className="text-sm text-slate-400">
                      Ricevi notifiche quando inizia una nuova asta
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={notificationPrefs.newAuctions}
                    onChange={(e) =>
                      setNotificationPrefs({
                        ...notificationPrefs,
                        newAuctions: e.target.checked,
                      })
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Aste Vinte</p>
                    <p className="text-sm text-slate-400">
                      Notifica quando vinci un&apos;asta
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={notificationPrefs.auctionsWon}
                    onChange={(e) =>
                      setNotificationPrefs({
                        ...notificationPrefs,
                        auctionsWon: e.target.checked,
                      })
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Modifiche Impostazioni</p>
                    <p className="text-sm text-slate-400">
                      Notifica quando l&apos;admin modifica le impostazioni
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={notificationPrefs.settingsChanges}
                    onChange={(e) =>
                      setNotificationPrefs({
                        ...notificationPrefs,
                        settingsChanges: e.target.checked,
                      })
                    }
                  />
                </div>

                <Button type="submit" className="mt-4">
                  Salva Preferenze
                </Button>
              </CardContent>
            </form>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
