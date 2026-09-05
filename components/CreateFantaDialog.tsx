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
import { DEFAULT_FANTA_SETTINGS } from "@/lib/constants";
import { generateInviteCode } from "@/lib/utils";
import type { SportType } from "@/types";
import { Plus } from "lucide-react";

export function CreateFantaDialog() {
  const { addFanta } = useFanta();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    sportType: "calcio" as SportType,
  });

  const handleCreate = () => {
    if (!user || !formData.name) return;

    const newFantaId = doc(collection(db, "fantas")).id;
    addFanta({
      id: newFantaId,
      name: formData.name,
      description: formData.description,
      sportType: formData.sportType,
      adminId: user.id,
      viceAdminIds: [],
      settings: DEFAULT_FANTA_SETTINGS,
      memberIds: [user.id],
      inviteCode: generateInviteCode(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    setFormData({ name: "", description: "", sportType: "calcio" });
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
      <DialogContent>
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
