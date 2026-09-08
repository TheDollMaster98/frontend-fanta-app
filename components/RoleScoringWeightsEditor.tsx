"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { RoleScoringWeights, ScoringWeights } from "@/types";

const EMPTY_WEIGHTS: ScoringWeights = { kills: 0, deaths: 0, assists: 0, win: 0 };
const TEAM_TAB = "__team__";

interface RoleScoringWeightsEditorProps {
  roles: string[];
  weights: RoleScoringWeights;
  teamWeight: number;
  onChangeRoleWeights: (weights: RoleScoringWeights) => void;
  onChangeTeamWeight: (value: number) => void;
}

// Editor dei pesi punteggio, uno per ruolo (kill/morti/assist/vittoria non
// valgono uguale per Top e Support) più un set separato per le pick
// "Squadra"/"Coach" (solo vittoria, non hanno statistiche individuali).
// Usato sia in CreateFantaDialog (creazione lega) sia in Gestione Lega
// (modifica), stesso componente per non disallinearli.
export function RoleScoringWeightsEditor({
  roles,
  weights,
  teamWeight,
  onChangeRoleWeights,
  onChangeTeamWeight,
}: RoleScoringWeightsEditorProps) {
  const [activeTab, setActiveTab] = useState<string>(roles[0] || TEAM_TAB);
  const isTeamTab = activeTab === TEAM_TAB;
  const activeWeights: ScoringWeights = weights[activeTab] || EMPTY_WEIGHTS;

  const updateField = (field: keyof ScoringWeights, value: number) => {
    onChangeRoleWeights({
      ...weights,
      [activeTab]: { ...activeWeights, [field]: value },
    });
  };

  return (
    <div className="space-y-3">
      <Label>Pesi Punteggio *</Label>
      <p className="text-xs text-slate-500">
        Quanti punti valgono le statistiche reali, un set per ruolo (kill/
        morti/assist non valgono uguale ovunque) più uno per le pick
        Squadra/Coach. Modificabile dopo, ma bloccato a partite iniziate.
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
        <div className="space-y-1 max-w-xs">
          <Label htmlFor="wTeamWin" className="text-xs font-normal">
            Vittoria Squadra/Coach
          </Label>
          <Input
            id="wTeamWin"
            type="number"
            step="0.5"
            value={teamWeight}
            onChange={(e) => onChangeTeamWeight(Number(e.target.value))}
          />
          <p className="text-xs text-slate-500">
            Punti per ogni vittoria della squadra scelta (o della squadra
            allenata, per il coach).
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="wKills" className="text-xs font-normal">
              Kill
            </Label>
            <Input
              id="wKills"
              type="number"
              step="0.5"
              value={activeWeights.kills}
              onChange={(e) => updateField("kills", Number(e.target.value))}
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
              value={activeWeights.deaths}
              onChange={(e) => updateField("deaths", Number(e.target.value))}
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
              value={activeWeights.assists}
              onChange={(e) => updateField("assists", Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wWin" className="text-xs font-normal">
              Vittoria (bonus se la squadra vince)
            </Label>
            <Input
              id="wWin"
              type="number"
              step="0.5"
              value={activeWeights.win}
              onChange={(e) => updateField("win", Number(e.target.value))}
            />
          </div>
        </div>
      )}
    </div>
  );
}
