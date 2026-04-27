import { useState } from "react";
import { Bell, BellOff, BellRing, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { toast } from "sonner";

/**
 * Visual indicator + control for the browser/OS notification permission.
 * Shows the current state ("Activas" / "Bloqueadas" / "No solicitadas") and
 * offers the right action depending on it.
 */
const NotificationStatusPanel = () => {
  const { isSupported, isSubscribed, permission, subscribe, unsubscribe } =
    usePushSubscription();
  const [busy, setBusy] = useState(false);

  if (!isSupported) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4 flex items-center gap-2">
          <Bell className="h-3.5 w-3.5" /> Notificaciones
        </h2>
        <p className="text-sm text-muted-foreground">
          Este dispositivo o navegador no admite notificaciones push.
        </p>
      </div>
    );
  }

  // Resolve display state
  let label = "No solicitadas";
  let tone: "ok" | "warn" | "muted" = "muted";
  let Icon = Bell;
  let description =
    "Aún no has decidido si quieres recibir alertas en tiempo real.";

  if (permission === "granted" && isSubscribed) {
    label = "Activas";
    tone = "ok";
    Icon = BellRing;
    description =
      "Recibirás alertas en este dispositivo sobre incidencias, firmas y cambios en obra.";
  } else if (permission === "granted" && !isSubscribed) {
    label = "Pendientes de activar";
    tone = "warn";
    Icon = Bell;
    description =
      "El permiso está concedido, pero aún no se ha registrado este dispositivo.";
  } else if (permission === "denied") {
    label = "Bloqueadas";
    tone = "warn";
    Icon = BellOff;
    description =
      "El navegador o sistema operativo está bloqueando las notificaciones de Tektra.";
  }

  const badgeClasses =
    tone === "ok"
      ? "bg-foreground text-background"
      : tone === "warn"
      ? "bg-destructive/10 text-destructive border border-destructive/30"
      : "bg-secondary text-secondary-foreground";

  const handleEnable = async () => {
    setBusy(true);
    try {
      const ok = await subscribe();
      if (ok) toast.success("Notificaciones activadas");
      else if (Notification.permission === "denied")
        toast.error("Permiso denegado. Actívalo desde los ajustes del sistema.");
      else toast.error("No se pudieron activar las notificaciones");
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    try {
      await unsubscribe();
      toast.success("Notificaciones desactivadas en este dispositivo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h2 className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4 flex items-center gap-2">
        <Bell className="h-3.5 w-3.5" /> Notificaciones
      </h2>

      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center border border-border">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
        <div className="flex-1">
          <span
            className={`px-2.5 py-1 text-[10px] font-display uppercase tracking-widest rounded font-bold ${badgeClasses}`}
          >
            {label}
          </span>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
      </div>

      {permission === "default" && (
        <Button
          onClick={handleEnable}
          disabled={busy}
          className="font-display text-xs uppercase tracking-wider"
        >
          Activar notificaciones
        </Button>
      )}

      {permission === "granted" && !isSubscribed && (
        <Button
          onClick={handleEnable}
          disabled={busy}
          className="font-display text-xs uppercase tracking-wider"
        >
          Registrar este dispositivo
        </Button>
      )}

      {permission === "granted" && isSubscribed && (
        <Button
          onClick={handleDisable}
          disabled={busy}
          variant="outline"
          className="font-display text-xs uppercase tracking-wider"
        >
          Desactivar en este dispositivo
        </Button>
      )}

      {permission === "denied" && (
        <div className="mt-2 rounded border border-border bg-secondary/40 p-3">
          <div className="flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">
                Cómo reactivarlas manualmente
              </p>
              <p>
                <span className="font-medium">Móvil (Android/iOS):</span> Ajustes
                del sistema → Aplicaciones → Navegador / Tektra → Notificaciones
                → permitir.
              </p>
              <p>
                <span className="font-medium">Escritorio:</span> pulsa el icono
                de candado junto a la URL → Permisos del sitio → Notificaciones
                → Permitir, y recarga la página.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationStatusPanel;