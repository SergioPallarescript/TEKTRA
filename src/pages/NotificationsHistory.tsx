import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Bell, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppLayout from "@/components/AppLayout";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  project_id: string | null;
  acknowledged_at: string | null;
}

const NotificationsHistory = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");

  useEffect(() => {
    const fetchAll = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (data) setNotifications(data);
    };
    fetchAll();
  }, []);

  const filtered = notifications.filter((n) => {
    if (filter === "unread") return !n.is_read;
    if (filter === "read") return n.is_read;
    return true;
  });

  const getNotificationRoute = (notif: NotificationItem): string | null => {
    if (!notif.project_id) return null;
    const t = notif.title.toLowerCase();
    if (t.includes("orden")) return `/project/${notif.project_id}/orders`;
    if (t.includes("plano") || t.includes("versión") || t.includes("version")) return `/project/${notif.project_id}/plans`;
    if (t.includes("incidencia")) return `/project/${notif.project_id}/incidents`;
    if (t.includes("gantt") || t.includes("hito")) return `/project/${notif.project_id}/gantt`;
    if (t.includes("rol") || t.includes("agente") || t.includes("eliminado del proyecto")) return `/project/${notif.project_id}/admin`;
    if (t.includes("cfo") || t.includes("reclamación") || t.includes("documento")) return `/project/${notif.project_id}/cfo`;
    if (t.includes("certificaci") || t.includes("presupuesto") || t.includes("pago")) return `/project/${notif.project_id}/costs`;
    if (t.includes("firma")) return `/project/${notif.project_id}/signatures`;
    return `/project/${notif.project_id}`;
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Bell className="h-5 w-5" />
          <h1 className="font-display text-lg font-bold uppercase tracking-wider">
            Historial de Notificaciones
          </h1>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4">
          {(["all", "unread", "read"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-display uppercase tracking-wider rounded-md transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "Todas" : f === "unread" ? "Pendientes" : "Leídas"}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hay notificaciones
            </p>
          ) : (
            filtered.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  const route = getNotificationRoute(n);
                  if (route) navigate(route);
                }}
                className={`w-full text-left p-4 border border-border rounded-lg transition-colors hover:bg-secondary/50 ${
                  !n.is_read ? "bg-secondary/20 border-l-4 border-l-destructive" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  {n.is_read ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-success flex-shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 mt-0.5 text-destructive flex-shrink-0 fill-destructive" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(n.created_at).toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      {n.acknowledged_at && (
                        <span className="text-[10px] text-success">
                          ✓ Leída {new Date(n.acknowledged_at).toLocaleDateString("es-ES", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default NotificationsHistory;
