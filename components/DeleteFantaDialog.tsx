"use client";

import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Condiviso tra Gestione Lega (Zona Pericolosa) e Impostazioni (Leghe
// Disponibili, 2/10): stessa azione irreversibile, stessa sicurezza
// ovunque compaia — scrivere il nome esatto della lega per confermare,
// non un semplice "sei sicuro?".
export function DeleteFantaDialog({
  fantaName,
  isDeleting,
  onConfirm,
  size = "default",
}: {
  fantaName: string;
  isDeleting: boolean;
  onConfirm: () => void;
  size?: "default" | "sm";
}) {
  const [confirmText, setConfirmText] = useState("");
  const canConfirm = confirmText === fantaName && !isDeleting;

  return (
    <AlertDialog onOpenChange={(open) => !open && setConfirmText("")}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size={size}>
          Elimina Lega
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare &quot;{fantaName}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            Cancella la lega e tutto il suo contenuto per tutti i membri:
            membri, aste, draft, storico, calendario, gironi/tabellone,
            richieste d&apos;ingresso. Non si può annullare. Scrivi{" "}
            <strong>{fantaName}</strong> per confermare.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={fantaName}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Indietro</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm}
            onClick={onConfirm}
            className={buttonVariants({ variant: "destructive" })}
          >
            {isDeleting ? "Eliminazione..." : "Elimina Definitivamente"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
