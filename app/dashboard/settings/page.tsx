"use client";

import { useEffect, useState } from "react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Bell } from "lucide-react";
import { useFanta } from "@/contexts/FantaContext";
import { useAuth } from "@/contexts/AuthContext";
import { CreateFantaDialog } from "@/components/CreateFantaDialog";
import { DeleteFantaDialog } from "@/components/DeleteFantaDialog";
import { toast } from "sonner";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Invite } from "@/types";
import { Copy } from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();
  const {
    fantas,
    currentFanta,
    setCurrentFanta,
    getTeamName,
    updateTeamName,
    getMemberCount,
    getMyRoleFor,
    deleteFanta,
  } = useFanta();
  const [deletingFantaId, setDeletingFantaId] = useState<string | null>(null);
  const {
    user,
    isPreviewingAsNonDeveloper,
    setPreviewAsNonDeveloper,
    updateUserProfile,
    updateUserEmail,
    updateUserPhoto,
    changePassword,
  } = useAuth();
  // Il controllo compare solo per chi è REALMENTE developer (Firestore,
  // immutabile dal client): l'anteprima sotto non tocca mai quel flag,
  // quindi restare visibile per tutta la sessione è sicuro.
  const canToggleDeveloper = !!user?.isDeveloper;

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const [teamName, setTeamName] = useState(
    user ? getTeamName(user.id) : "",
  );

  // Il nome team è per-lega: va ricaricato sia al primo arrivo dei dati da
  // Firestore sia quando l'utente cambia "Lega Attiva" qui sotto, altrimenti
  // il campo resterebbe fermo sul nome della lega precedente.
  useEffect(() => {
    if (user) setTeamName(getTeamName(user.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentFanta?.id]);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword && newPassword !== confirmPassword) {
      toast.error("Le password non corrispondono");
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
      toast.success("Modifiche salvate");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Errore durante il salvataggio",
      );
    }
  };

  // Upload immediato alla scelta del file, non legato al form "Salva
  // Modifiche" sotto: è un'azione a sé, coerente con come funzionano i
  // selettori file nativi (scegli = fatto), senza un secondo click.
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setIsUploadingPhoto(true);
    try {
      await updateUserPhoto(file);
      toast.success("Foto profilo aggiornata");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Errore durante il caricamento",
      );
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleTeamUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (user && teamName.trim()) {
      updateTeamName(user.id, teamName.trim());
      toast.success("Nome team salvato");
    }
  };

  // "Leghe Disponibili" era un elenco di sola lettura, senza nessuna
  // azione di gestione (segnalato, 2/10): "Gestisci" porta dritto in
  // Gestione Lega per QUELLA lega (prima bisognava cambiare "Lega
  // Attiva" dal selettore e poi cercare la voce "Gestione" in sidebar),
  // "Elimina" usa la stessa conferma testuale di Gestione Lega — niente
  // di meno sicuro solo perché è un accesso rapido.
  const handleManageFanta = (fantaId: string) => {
    const fanta = fantas.find((f) => f.id === fantaId);
    if (fanta) setCurrentFanta(fanta);
    router.push("/dashboard/admin");
  };

  const handleDeleteFanta = async (fantaId: string) => {
    setDeletingFantaId(fantaId);
    try {
      await deleteFanta(fantaId);
      toast.success("Lega eliminata");
    } catch (error) {
      console.error("Errore nell'eliminazione della lega:", error);
      toast.error("Errore nell'eliminazione, riprova");
    } finally {
      setDeletingFantaId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Impostazioni</h1>
        <p className="text-muted-foreground mt-2">
          Gestisci il tuo profilo e le preferenze
        </p>
        <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1.5">
          <Bell className="w-4 h-4" />
          Le notifiche (richieste di ingresso, aste in partenza, ecc.) sono
          ora nella campanella in alto nella barra di navigazione.
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">Profilo</TabsTrigger>
          <TabsTrigger value="team">Team e Fanta</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">
                Informazioni Profilo
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Aggiorna i tuoi dati personali
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 pb-4">
                <Avatar className="h-16 w-16">
                  {user?.photoURL && (
                    <AvatarImage src={user.photoURL} alt={user.name} />
                  )}
                  <AvatarFallback className="text-xl">
                    {user?.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <Label htmlFor="photo" className="cursor-pointer">
                    <span className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-raised">
                      {isUploadingPhoto ? "Caricamento..." : "Cambia foto"}
                    </span>
                  </Label>
                  <input
                    id="photo"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={isUploadingPhoto}
                    onChange={handlePhotoChange}
                  />
                </div>
              </div>
              <Separator className="mb-4" />
              <form onSubmit={handleProfileUpdate} className="space-y-4">
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
                  <p className="text-sm text-muted-foreground">
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
                <p className="text-sm text-muted-foreground">
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
                    <p className="text-sm text-muted-foreground">
                      Hai accesso universale a tutte le leghe. L&apos;anteprima
                      qui sotto nasconde quell&apos;accesso solo in questo
                      browser (per vedere l&apos;app come la vedrebbe un
                      utente normale) senza toglierti davvero i permessi:
                      spegnila per tornare subito developer a tutti gli
                      effetti.
                    </p>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="previewAsNonDeveloper"
                        checked={isPreviewingAsNonDeveloper}
                        onCheckedChange={(checked) => setPreviewAsNonDeveloper(checked === true)}
                      />
                      <Label htmlFor="previewAsNonDeveloper" className="cursor-pointer">
                        Anteprima come utente normale
                      </Label>
                    </div>
                  </div>

                  <Separator className="my-6" />
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold">Inviti</h3>
                    <p className="text-sm text-muted-foreground">
                      La registrazione richiede un link d&apos;invito a uso
                      singolo. Generane uno e mandalo a chi vuoi far entrare.
                    </p>
                    <InviteManager />
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
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Es: I Campioni"
                  />
                  <p className="text-sm text-muted-foreground">
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
                  <p className="text-sm text-muted-foreground">
                    Cambia la lega attiva per vedere aste/draft relativi
                  </p>
                </div>

                <Button type="submit">Salva Modifiche</Button>
              </form>

              <Separator className="my-6" />

              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Gestione Leghe</h3>
                    <p className="text-sm text-muted-foreground">
                      Crea una nuova lega per un diverso sport o competizione
                    </p>
                  </div>
                  <CreateFantaDialog />
                </div>

                <div className="border border-border rounded-lg p-4 space-y-2">
                  <h4 className="font-medium text-foreground">
                    Leghe Disponibili
                  </h4>
                  <div className="space-y-2">
                    {fantas.map((fanta) => {
                      const role = getMyRoleFor(fanta.id);
                      const canManage = role === "admin" || role === "vice";
                      return (
                        <div
                          key={fanta.id}
                          className="flex flex-wrap items-center justify-between gap-2 p-3 border border-border rounded hover:bg-raised transition-colors"
                        >
                          <div>
                            <p className="font-medium text-foreground">
                              {fanta.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {fanta.sportType} • {getMemberCount(fanta.id)} membri
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {currentFanta?.id === fanta.id && (
                              <Badge variant="success">Attiva</Badge>
                            )}
                            {canManage && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleManageFanta(fanta.id)}
                                >
                                  Gestisci
                                </Button>
                                <DeleteFantaDialog
                                  fantaName={fanta.name}
                                  isDeleting={deletingFantaId === fanta.id}
                                  onConfirm={() => handleDeleteFanta(fanta.id)}
                                  size="sm"
                                />
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}

function InviteManager() {
  const { generateInvite } = useAuth();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const invitesQuery = query(
      collection(db, "invites"),
      orderBy("createdAt", "desc"),
    );
    return onSnapshot(invitesQuery, (snapshot) => {
      setInvites(
        snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            code: docSnap.id,
            createdBy: data.createdBy,
            createdAt: data.createdAt?.toDate?.() ?? new Date(),
            usedBy: data.usedBy ?? null,
            usedAt: data.usedAt?.toDate?.() ?? null,
          };
        }),
      );
    });
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const code = generateInvite ? await generateInvite() : "";
      const url = `${window.location.origin}/auth/register?invite=${code}`;
      await navigator.clipboard.writeText(url);
      toast.success("Link invito copiato negli appunti");
    } catch (error) {
      console.error("Errore nella generazione dell'invito:", error);
      toast.error("Errore nella generazione dell'invito");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyInviteLink = async (code: string) => {
    const url = `${window.location.origin}/auth/register?invite=${code}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link copiato negli appunti");
  };

  return (
    <div className="space-y-3">
      <Button type="button" onClick={handleGenerate} disabled={isGenerating}>
        {isGenerating ? "Generazione..." : "Genera Link Invito"}
      </Button>

      {invites.length > 0 && (
        <div className="space-y-2">
          {invites.map((invite) => (
            <div
              key={invite.code}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-raised px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-mono">{invite.code}</p>
                <p className="text-xs text-muted-foreground">
                  {invite.usedBy ? `Usato` : "Libero"} ·{" "}
                  {invite.createdAt.toLocaleDateString("it-IT")}
                </p>
              </div>
              {!invite.usedBy && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => copyInviteLink(invite.code)}
                  aria-label="Copia link"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
