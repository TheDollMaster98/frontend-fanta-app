"use client";

import { useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { collection, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useFanta } from "@/contexts/FantaContext";
import { useAuth } from "@/contexts/AuthContext";
import { RoleScoringWeightsEditor } from "@/components/RoleScoringWeightsEditor";
import {
  DEFAULT_FANTA_SETTINGS,
  CIRCUIT_TYPES,
  LOL_ROLES,
  DEFAULT_ROLE_SCORING_WEIGHTS,
  DEFAULT_TEAM_SCORING_WEIGHTS,
  MIN_COUNTDOWN_SECONDS,
  MAX_COUNTDOWN_SECONDS,
} from "@/lib/constants";
import { generateInviteCode } from "@/lib/utils";
import type { DraftMode, SportType } from "@/types";
import { Plus } from "lucide-react";

const INITIAL_FORM = {
  name: "",
  description: "",
  sportType: "lol" as SportType,
  circuitType: "LCK",
  maxJolly: 0,
  scoringWeights: { ...DEFAULT_ROLE_SCORING_WEIGHTS },
  teamScoringWeights: { ...DEFAULT_TEAM_SCORING_WEIGHTS },
  draftMode: "auction" as DraftMode,
  draftPickSeconds: MIN_COUNTDOWN_SECONDS,
  defaultCountdown: MIN_COUNTDOWN_SECONDS,
};

export function CreateFantaDialog() {
  const { addFanta } = useFanta();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const isLol = formData.sportType === "lol";

  const handleCreate = () => {
    if (!user || !formData.name) return;

    const newFantaId = doc(collection(db, "fantas")).id;
    addFanta({
      id: newFantaId,
      name: formData.name,
      description: formData.description,
      sportType: formData.sportType,
      settings: {
        ...DEFAULT_FANTA_SETTINGS,
        draftMode: formData.draftMode,
        draftPickSeconds: formData.draftPickSeconds,
        defaultCountdown: formData.defaultCountdown,
        ...(isLol
          ? {
              circuitType: formData.circuitType,
              maxJolly: formData.maxJolly,
              scoringWeights: formData.scoringWeights,
              teamScoringWeights: formData.teamScoringWeights,
            }
          : {}),
      },
      inviteCode: generateInviteCode(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    setFormData(INITIAL_FORM);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Crea Nuovo Fanta
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crea Nuova Lega</DialogTitle>
          <DialogDescription>
            Configura la tua nuova lega fantasy e invita i tuoi amici
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome Lega *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="Es: Lega Amici 2026"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sportType">Tipo di Sport/Gioco *</Label>
            <Select
              value={formData.sportType}
              onValueChange={(value: SportType) =>
                setFormData({ ...formData, sportType: value })
              }
            >
              <SelectTrigger id="sportType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lol">League of Legends</SelectItem>
                <SelectItem value="calcio">Calcio</SelectItem>
                <SelectItem value="basket">Basket</SelectItem>
                <SelectItem value="custom">Personalizzato</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              I ruoli disponibili cambieranno in base al tipo selezionato
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="draftMode">Modalità *</Label>
            <Select
              value={formData.draftMode}
              onValueChange={(value: DraftMode) =>
                setFormData({ ...formData, draftMode: value })
              }
            >
              <SelectTrigger id="draftMode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auction">Asta live</SelectItem>
                <SelectItem value="snake">Draft a turni (snake)</SelectItem>
              </SelectContent>
            </Select>
            <div className="space-y-1.5 rounded-md border border-slate-700 bg-slate-800/50 p-3 text-xs">
              <p className={formData.draftMode === "auction" ? "text-slate-200" : "text-slate-500"}>
                <span className="font-medium">Asta live</span> — un membro
                alla volta (admin/vice) mette all&apos;asta un giocatore/
                squadra/coach, tutti rilanciano in tempo reale con un budget
                condiviso, vince chi offre di più.
              </p>
              <p className={formData.draftMode === "snake" ? "text-slate-200" : "text-slate-500"}>
                <span className="font-medium">Draft a turni (snake)</span> —
                niente asta né budget: si sceglie a turno in un ordine
                casuale che si inverte a ogni giro (1→N, N→1, 1→N...), un
                ruolo fisso per giro (es. tutti scelgono il Top Laner, poi
                tutti il Jungler...).
              </p>
            </div>
          </div>

          {formData.draftMode === "snake" ? (
            <div className="space-y-2">
              <Label htmlFor="draftPickSeconds">
                Tempo per scelta (secondi)
              </Label>
              <Input
                id="draftPickSeconds"
                type="number"
                min={MIN_COUNTDOWN_SECONDS}
                max={MAX_COUNTDOWN_SECONDS}
                value={formData.draftPickSeconds}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    draftPickSeconds: Number(e.target.value),
                  })
                }
              />
              <p className="text-xs text-slate-500">
                Tra {MIN_COUNTDOWN_SECONDS}s e {MAX_COUNTDOWN_SECONDS}s. Se
                scade, il turno viene saltato e va assegnato a mano
                dall&apos;admin.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="defaultCountdown">
                Countdown Asta Default (secondi)
              </Label>
              <Input
                id="defaultCountdown"
                type="number"
                min={MIN_COUNTDOWN_SECONDS}
                max={MAX_COUNTDOWN_SECONDS}
                value={formData.defaultCountdown}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    defaultCountdown: Number(e.target.value),
                  })
                }
              />
              <p className="text-xs text-slate-500">
                Tra {MIN_COUNTDOWN_SECONDS}s e {MAX_COUNTDOWN_SECONDS}s.
                Cambiabile in seguito da Gestione Lega.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">Descrizione (opzionale)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Breve descrizione della lega..."
              rows={3}
            />
          </div>

          {isLol && (
            <>
              <div className="space-y-2">
                <Label htmlFor="circuitType">Circuito *</Label>
                <Select
                  value={formData.circuitType}
                  onValueChange={(value) =>
                    setFormData({ ...formData, circuitType: value })
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
                <p className="text-xs text-slate-500">
                  Worlds e MSI sono a eliminazione: più avanti attiveranno la
                  doppia fase gironi/finale
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxJolly">Giocatori Jolly Max</Label>
                <Input
                  id="maxJolly"
                  type="number"
                  min={0}
                  value={formData.maxJolly}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      maxJolly: Number(e.target.value),
                    })
                  }
                />
                <p className="text-xs text-slate-500">
                  Slot extra in rosa senza vincolo di ruolo. 0 = nessuno
                </p>
              </div>

              <RoleScoringWeightsEditor
                roles={LOL_ROLES}
                weights={formData.scoringWeights}
                teamWeights={formData.teamScoringWeights}
                onChangeRoleWeights={(scoringWeights) =>
                  setFormData({ ...formData, scoringWeights })
                }
                onChangeTeamWeights={(teamScoringWeights) =>
                  setFormData({ ...formData, teamScoringWeights })
                }
              />
            </>
          )}
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annulla
          </Button>
          <Button onClick={handleCreate} disabled={!formData.name}>
            Crea Lega
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
