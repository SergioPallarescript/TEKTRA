import { useEffect, useRef, useState } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const STORAGE_KEY = "tektra:push-prompt-dismissed-at";
const SESSION_SHOWN_KEY = "tektra:push-prompt-shown-session";
// Si el usuario pulsa "Ahora no", esperamos 24h antes de volver a preguntar
// dentro de la misma sesión/navegador. En cada nuevo login se vuelve a mostrar
// (los usuarios que ya tenían la app instalada verán el modal sin reinstalar).
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Solicita el permiso de notificaciones tras CADA login con la estética
 * arquitectónica de Tektra. Solo se muestra cuando:
 *  - el navegador soporta push,
 *  - el permiso aún está en "default",
 *  - el usuario aún no se ha suscrito,
 *  - no ha pulsado "Ahora no" en las últimas 24h.
 *
 * Importante: NO requiere reinstalar la PWA. El service worker se actualiza
 * automáticamente y este modal aparece a cualquier usuario existente que aún
 * no haya concedido el permiso, en su próximo inicio de sesión.
 */
const PushPermissionModal = () => {
  const { user } = useAuth();
  const { isSupported, isSubscribed, permission, subscribe } = usePushSubscription();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !isSupported) return;
    if (isSubscribed) return;
    if (permission !== "default") return;

    // Detecta un cambio de usuario (nuevo login) → resetea el dismiss para
    // garantizar que se muestre el modal a ese usuario.
    if (lastUserId.current !== user.id) {
      lastUserId.current = user.id;
      sessionStorage.removeItem(SESSION_SHOWN_KEY);
    }

    // Evita re-abrir el modal si ya se mostró en esta sesión de pestaña
    if (sessionStorage.getItem(SESSION_SHOWN_KEY) === user.id) return;

    const dismissedAt = Number(localStorage.getItem(STORAGE_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) return;

    // Pequeño delay para que aparezca tras la transición del splash
    const t = setTimeout(() => {
      setOpen(true);
      sessionStorage.setItem(SESSION_SHOWN_KEY, user.id);
    }, 1200);
    return () => clearTimeout(t);
  }, [user, isSupported, isSubscribed, permission]);

  const handleEnable = async () => {
    setBusy(true);
    try {
      const ok = await subscribe();
      if (ok) {
        toast.success("Notificaciones de obra activadas");
        localStorage.removeItem(STORAGE_KEY);
        setOpen(false);
      } else if (Notification.permission === "denied") {
        toast.error("Permiso denegado en el navegador. Actívalo desde los ajustes del sistema.");
        setOpen(false);
      } else {
        toast.error("No se pudieron activar las notificaciones");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleLater = () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setOpen(false);
  };

  if (!isSupported) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleLater(); }}>
      <DialogContent
        className="max-w-md [&>button]:hidden border border-border bg-card"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center border border-border">
              <BellRing className="h-6 w-6 text-foreground" />
            </div>
          </div>
          <DialogTitle className="font-display text-xl tracking-tight text-center">
            Notificaciones de Obra
          </DialogTitle>
        </DialogHeader>

        <p className="font-body text-sm text-muted-foreground leading-relaxed text-center">
          Recibe alertas en tiempo real sobre cambios en la dirección, incidencias
          de seguridad y actualizaciones del constructor. Mantén el control de la
          ejecución sin necesidad de abrir la app.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Button
            onClick={handleEnable}
            disabled={busy}
            className="w-full font-display text-xs uppercase tracking-wider"
          >
            Activar notificaciones
          </Button>
          <Button
            variant="ghost"
            onClick={handleLater}
            disabled={busy}
            className="w-full font-display text-xs uppercase tracking-wider text-muted-foreground"
          >
            Ahora no
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PushPermissionModal;