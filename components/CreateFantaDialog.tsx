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
import {
  DEFAULT_FANTA_SETTINGS,
  CIRCUIT_TYPES,
  DEFAULT_SCORING_WEIGHTS,
} from "@/lib/constants";
import { generateInviteCode } from "@/lib/utils";
import type { SportType } from "@/types";
import { Plus } from "lucide-react";

const INITIAL_FORM = {
  name: "",
  description: "",
  sportType: "calcio" as SportType,
  circuitType: "LCK",
  maxJolly: 0,
  scoringWeights: { ...DEFAULT_SCORING_WEIGHTS },
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
        ...(isLol
          ? {
              circuitType: formData.circuitType,
              maxJolly: formData.maxJolly,
              scoringWeights: formData.scoringWeights,
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
                <SelectItem value="calcio">Calcio</SelectItem>
                <SelectItem value="lol">League of Legends</SelectItem>
                <SelectItem value="basket">Basket</SelectItem>
                <SelectItem value="custom">Personalizzato</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              I ruoli disponibili cambieranno in base al tipo selezionato
            </p>
          </div>

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

              <div className="space-y-2">
                <Label>Pesi Punteggio *</Label>
                <p className="text-xs text-slate-500">
                  Quanti punti valgono le statistiche reali dei giocatori.
                  Modificabile dopo, ma bloccato a partite iniziate.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="wKills" className="text-xs font-normal">
                      Kill
                    </Label>
                    <Input
                      id="wKills"
                      type="number"
                      step="0.5"
                      value={formData.scoringWeights.kills}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          scoringWeights: {
                            ...formData.scoringWeights,
                            kills: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="wDeaths" className="text-xs font-normal">
                      Morte
                    </Label>
                    <Input
                      id="wDeaths"
                      type="number"
                      step="0.5"
                      value={formData.scoringWeights.deaths}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          scoringWeights: {
                            ...formData.scoringWeights,
                            deaths: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="wAssists" className="text-xs font-normal">
                      Assist
                    </Label>
                    <Input
                      id="wAssists"
                      type="number"
                      step="0.5"
                      value={formData.scoringWeights.assists}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          scoringWeights: {
                            ...formData.scoringWeights,
                            assists: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="wWin" className="text-xs font-normal">
                      Vittoria squadra
                    </Label>
                    <Input
                      id="wWin"
                      type="number"
                      step="0.5"
                      value={formData.scoringWeights.win}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          scoringWeights: {
                            ...formData.scoringWeights,
                            win: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
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
