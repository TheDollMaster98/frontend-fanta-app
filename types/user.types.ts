// Il ruolo (admin/vice-admin/membro) e tutto ciò che è per-lega (budget,
// rosa, nome team) vive nella sottocollezione fantas/{id}/members — non più
// sparso su Fanta.adminId/viceAdminIds/memberIds. L'unico attributo globale
// sull'account è isDeveloper, un flag per chi sviluppa/testa l'app (accesso
// universale, zero blocchi).
export interface User {
  id: string;
  email: string;
  name: string;
  photoURL?: string;
  isDeveloper?: boolean;
  // Codice invito consumato in fase di registrazione (vedi Invite qui
  // sotto) — assente sugli account creati prima di questa funzione.
  inviteCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Link invito per la registrazione (30/9): la app è per un gruppo chiuso
// di amici ma la registrazione via Firebase Auth non può essere ristretta
// dalle regole Firestore (non le governa) — questo gate il profilo
// users/{uid}, senza il quale l'app è inutilizzabile. Un solo uso a testa,
// generati solo da un developer nella sezione "Inviti" di Impostazioni.
export interface Invite {
  code: string;
  createdBy: string;
  createdAt: Date;
  usedBy: string | null;
  usedAt: Date | null;
}
