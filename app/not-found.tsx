import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="auth-shell text-center">
      <div>
        <p className="text-6xl font-bold text-primary mb-2">404</p>
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          Pagina non trovata
        </h1>
        <p className="text-muted-foreground mb-6">
          Questa pagina non esiste o è stata spostata.
        </p>
        <Button asChild>
          <Link href="/dashboard">Torna alla dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
