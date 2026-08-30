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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useFanta } from "@/contexts/FantaContext";
import { DEFAULT_FANTA_SETTINGS } from "@/lib/constants";
import type { Fanta } from "@/types";

export default function NewFantaPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { addFanta } = useFanta();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    generalBudget: DEFAULT_FANTA_SETTINGS.generalBudget,
    minBid: DEFAULT_FANTA_SETTINGS.minBid,
    maxBid: DEFAULT_FANTA_SETTINGS.maxBid,
    defaultCountdown: DEFAULT_FANTA_SETTINGS.defaultCountdown,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;

    const newFanta: Fanta = {
      id: `fanta-${Date.now()}`,
      name: formData.name,
      sportType: "calcio",
      description: formData.description,
      adminId: user.id,
      viceAdminIds: [],
      settings: {
        generalBudget: formData.generalBudget,
        minBid: formData.minBid,
        maxBid: formData.maxBid,
        defaultCountdown: formData.defaultCountdown,
        allowCustomBids: true,
      },
      memberIds: [user.id],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    addFanta(newFanta);
    router.push("/dashboard");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-100">Crea Nuova Lega</h1>
        <p className="text-slate-400 mt-2">
          Configura una nuova lega fantasy per te e i tuoi amici
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informazioni Lega</CardTitle>
          <CardDescription>Personalizza la tua lega fantasy</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome Lega *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Es: Serie A 2026, LoL Champions, NBA Fantasy..."
                required
              />
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

            <div className="border-t pt-4 mt-6">
              <h3 className="font-semibold mb-4">Impostazioni Aste</h3>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="generalBudget">Budget Generale (€)</Label>
                  <Input
                    id="generalBudget"
                    type="number"
                    value={formData.generalBudget}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
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
                    value={formData.defaultCountdown}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
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
                    value={formData.minBid}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
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
                    value={formData.maxBid}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxBid: Number(e.target.value),
                      })
                    }
                    min={formData.minBid}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit">Crea Lega</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard")}
              >
                Annulla
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
