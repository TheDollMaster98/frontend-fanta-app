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

// Campi non ancora collegati a un calcolo reale: il peso si salva e si
// mostra, ma FantaContext.recalculateScores non li applica finché non ho
// nomi di campo Leaguepedia confermati per CS/Vision Score/Pentakills
// (ScoreboardPlayers) e obiettivi di squadra (ScoreboardGames). Vedi
// types/index.ts e TODO.md.
const PLAYER_FIELDS: {
  key: keyof ScoringWeights;
  label: string;
  pending?: boolean;
}[] = [
  { key: "kills", label: "Kill" },
  { key: "deaths", label: "Morte" },
  { key: "assists", label: "Assist" },
  { key: "win", label: "Vittoria (bonus se la squadra vince)" },
  { key: "csPer50", label: "Ogni 50 CS", pending: true },
  { key: "visionPer10", label: "Ogni 10 Vision Score", pending: true },
  { key: "pentakill", label: "Pentakill", pending: true },
];

const TEAM_FIELDS: {
  key: keyof TeamScoringWeights;
  label: string;
  pending?: boolean;
}[] = [
  { key: "tower", label: "Torre", pending: true },
  { key: "dragon", label: "Drago (elementale)", pending: true },
  { key: "voidGrub", label: "Void Grub", pending: true },
  { key: "riftHerald", label: "Rift Herald", pending: true },
  { key: "inhibitor", label: "Inibitore", pending: true },
  { key: "atakhan", label: "Atakhan", pending: true },
  { key: "baron", label: "Barone", pending: true },
  { key: "kill", label: "Kill" },
  { key: "death", label: "Morte" },
  { key: "assist", label: "Assist" },
  { key: "csPer100", label: "Ogni 100 CS", pending: true },
  { key: "win", label: "Vittoria" },
  { key: "goldPer10k", label: "Ogni 10k oro", pending: true },
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
        Squadra/Coach. Modificabile dopo, ma bloccato a partite iniziate. I
        campi con <span className="text-warning">●</span> non sono ancora
        calcolati in automatico da Leaguepedia (nomi campo non confermati):
        contano solo se inseriti a mano su un pick, in Classifica → dettaglio
        membro → dettaglio pick.
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
          {TEAM_FIELDS.map(({ key, label, pending }) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`wTeam-${key}`} className="text-xs font-normal">
                {label}
                {pending && <span className="text-warning"> ●</span>}
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
          {PLAYER_FIELDS.map(({ key, label, pending }) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`w-${key}`} className="text-xs font-normal">
                {label}
                {pending && <span className="text-warning"> ●</span>}
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
