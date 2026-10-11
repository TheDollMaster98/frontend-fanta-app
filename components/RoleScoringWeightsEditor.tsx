"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { RoleScoringWeights, ScoringWeights, TeamScoringWeights } from "@/types";

const EMPTY_WEIGHTS: ScoringWeights = {
  kills: 0,
  deaths: 0,
  assists: 0,
  win: 0,
  csPer50: 0,
  visionPer10: 0,
  pentakill: 0,
};
const TEAM_TAB = "__team__";

// Tutti i pesi sono applicati dal ricalcolo (lib/scoring.ts), obiettivi
// di squadra compresi (10/10).
const PLAYER_FIELDS: {
  key: keyof ScoringWeights;
  label: string;
}[] = [
  { key: "kills", label: "Kill" },
  { key: "deaths", label: "Morte" },
  { key: "assists", label: "Assist" },
  { key: "win", label: "Vittoria (bonus se la squadra vince)" },
  { key: "csPer50", label: "Ogni 50 CS" },
  { key: "visionPer10", label: "Ogni 10 Vision Score" },
  { key: "pentakill", label: "Pentakill" },
];

const TEAM_FIELDS: {
  key: keyof TeamScoringWeights;
  label: string;
}[] = [
  { key: "tower", label: "Torre" },
  { key: "dragon", label: "Drago (elementale)" },
  { key: "voidGrub", label: "Void Grub" },
  { key: "riftHerald", label: "Rift Herald" },
  { key: "inhibitor", label: "Inibitore" },
  { key: "atakhan", label: "Atakhan" },
  { key: "baron", label: "Barone" },
  { key: "kill", label: "Kill fatte" },
  { key: "death", label: "Kill subite" },
  { key: "assist", label: "Assist" },
  { key: "csPer100", label: "Ogni 100 CS" },
  { key: "win", label: "Vittoria" },
  { key: "goldPer10k", label: "Ogni 10k oro" },
];

interface RoleScoringWeightsEditorProps {
  roles: string[];
  weights: RoleScoringWeights;
  teamWeights: TeamScoringWeights;
  onChangeRoleWeights: (weights: RoleScoringWeights) => void;
  onChangeTeamWeights: (weights: TeamScoringWeights) => void;
}

// Editor dei pesi punteggio, uno per ruolo (kill/morti/assist/vittoria/CS/
// vision non valgono uguale per Top e Support) più un set separato per le
// pick "Squadra"/"Coach" (obiettivi di partita, non statistiche
// individuali). Usato sia in CreateFantaDialog (creazione lega) sia in
// Gestione Lega (modifica), stesso componente per non disallinearli.
export function RoleScoringWeightsEditor({
  roles,
  weights,
  teamWeights,
  onChangeRoleWeights,
  onChangeTeamWeights,
}: RoleScoringWeightsEditorProps) {
  const [activeTab, setActiveTab] = useState<string>(roles[0] || TEAM_TAB);
  const isTeamTab = activeTab === TEAM_TAB;
  const activeWeights: ScoringWeights = weights[activeTab] || EMPTY_WEIGHTS;

  const updateRoleField = (field: keyof ScoringWeights, value: number) => {
    onChangeRoleWeights({
      ...weights,
      [activeTab]: { ...activeWeights, [field]: value },
    });
  };

  const updateTeamField = (field: keyof TeamScoringWeights, value: number) => {
    onChangeTeamWeights({ ...teamWeights, [field]: value });
  };

  return (
    <div className="space-y-3">
      <Label>Pesi Punteggio *</Label>
      <p className="text-xs text-muted-foreground">
        Quanti punti valgono le statistiche reali, un set per ruolo (kill/
        morti/assist non valgono uguale ovunque) più uno per le pick
        Squadra/Coach. Modificabile dopo, ma bloccato a partite iniziate. Tutti
        calcolati in automatico da Leaguepedia, obiettivi di squadra
        compresi.
      </p>
      <div className="flex flex-wrap gap-1">
        {roles.map((role) => (
          <Button
            key={role}
            type="button"
            size="sm"
            variant={activeTab === role ? "default" : "outline"}
            onClick={() => setActiveTab(role)}
          >
            {role}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={isTeamTab ? "default" : "outline"}
          onClick={() => setActiveTab(TEAM_TAB)}
        >
          Squadra/Coach
        </Button>
      </div>

      {isTeamTab ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {TEAM_FIELDS.map(({ key, label }) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`wTeam-${key}`} className="text-xs font-normal">
                {label}
              </Label>
              <Input
                id={`wTeam-${key}`}
                type="number"
                step="0.5"
                value={teamWeights[key]}
                onChange={(e) => updateTeamField(key, Number(e.target.value))}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {PLAYER_FIELDS.map(({ key, label }) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`w-${key}`} className="text-xs font-normal">
                {label}
              </Label>
              <Input
                id={`w-${key}`}
                type="number"
                step="0.5"
                value={activeWeights[key]}
                onChange={(e) => updateRoleField(key, Number(e.target.value))}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
