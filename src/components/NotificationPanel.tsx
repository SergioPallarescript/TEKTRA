import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  project_id: string | null;
}

const NotificationPanel = ({ onClose }: { onClose: () => void }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);
  const [showAckDialog, setShowAckDialog] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setNotifications(data);
    };
    fetch();
  }, []);

  const handleNotificationClick = (notif: Notification) => {
    if (!notif.is_read) {
      setSelectedNotif(notif);
      setShowAckDialog(true);
    }
  };

  const handleAcknowledge = async () => {
    if (!selectedNotif || !user) return;

    let geoString = "unavailable";
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
      );
      geoString = `${pos.coords.latitude},${pos.coords.longitude}`;
    } catch {
      // Geo unavailable
    }

    const now = new Date().toISOString();

    await supabase
      .from("notifications")
      .update({ is_read: true, acknowledged_at: now, ack_geo: geoString })
      .eq("id", selectedNotif.id);

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      project_id: selectedNotif.project_id || null,
      action: "notification_acknowledged",
      details: { notification_id: selectedNotif.id, title: selectedNotif.title },
      geo_location: geoString,
    } as any);

    setNotifications((prev) =>
      prev.map((n) => (n.id === selectedNotif.id ? { ...n, is_read: true } : n))
    );
    setShowAckDialog(false);
    setSelectedNotif(null);
    toast.success("Lectura registrada legalmente");
  };

  return (
    <>
      <div className="absolute right-0 top-12 w-80 bg-card border border-border rounded-lg shadow-lg z-50 animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
            Notificaciones
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">
              Sin notificaciones
            </p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`w-full text-left p-4 border-b border-border last:border-0 transition-colors hover:bg-secondary/50 ${
                  !n.is_read ? "bg-secondary/30" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  {!n.is_read && (
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-destructive flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-stone mt-1">
                      {new Date(n.created_at).toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <AlertDialog open={showAckDialog} onOpenChange={setShowAckDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Aviso Legal
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Al abrir esta alerta se registrará legalmente su lectura con marca
              de tiempo y ubicación geográfica. ¿Desea continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-display text-xs uppercase tracking-wider">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAcknowledge}
              className="font-display text-xs uppercase tracking-wider"
            >
              Acepto y Procedo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default NotificationPanel;
