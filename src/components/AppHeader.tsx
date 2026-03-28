import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Bell, Menu, X, LogOut, FolderOpen, Settings, BellRing, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useNavigate, useLocation } from "react-router-dom";
import NotificationPanel from "./NotificationPanel";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { toast } from "sonner";

const AppHeader = () => {
  const { profile, signOut } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isSupported, isSubscribed, permission, subscribe, unsubscribe } = usePushSubscription();

  const handlePushToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
      toast.info("Notificaciones push desactivadas");
    } else {
      const ok = await subscribe();
      if (ok) toast.success("Notificaciones push activadas");
      else if (permission === "denied") toast.error("Permiso de notificaciones denegado en el navegador");
      else toast.error("No se pudo activar las notificaciones push");
    }
  };

  useEffect(() => {
    const fetchUnread = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("is_read", false);
      setUnreadCount(count || 0);
    };
    fetchUnread();

    const channel = supabase
      .channel("notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => {
        fetchUnread();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const navItems = [
    { label: "Proyectos", icon: FolderOpen, path: "/" },
    { label: "Configuración", icon: Settings, path: "/settings" },
  ];

  return (
    <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border">
      <div className="flex items-center justify-between px-4 h-14">
        {/* Left: Hamburger */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-foreground">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 bg-card p-0">
            <div className="p-6 border-b border-border">
              <h2 className="font-display text-xl font-bold tracking-tighter">GESCON</h2>
              <p className="text-xs text-muted-foreground font-display uppercase tracking-wider mt-1">
                {profile?.full_name || "Usuario"}
              </p>
              {profile?.role && (
                <span className="inline-block mt-2 px-2 py-0.5 text-[10px] font-display uppercase tracking-widest bg-secondary text-secondary-foreground rounded">
                  {profile.role}
                </span>
              )}
            </div>
            <nav className="p-4 space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded text-sm font-body transition-colors ${
                    location.pathname === item.path
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              ))}
            </nav>
            {isSupported && (
              <div className="px-4 mt-2">
                <Button
                  variant="outline"
                  onClick={handlePushToggle}
                  className="w-full justify-start gap-2 text-sm"
                >
                  {isSubscribed ? (
                    <><BellOff className="h-4 w-4" /> Desactivar Push</>
                  ) : (
                    <><BellRing className="h-4 w-4" /> Activar Push</>
                  )}
                </Button>
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
              <Button
                variant="ghost"
                onClick={signOut}
                className="w-full justify-start text-muted-foreground hover:text-destructive gap-2"
              >
                <LogOut className="h-4 w-4" />
                Cerrar Sesión
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Center: Logo */}
        <button onClick={() => navigate("/")} className="font-display text-lg font-bold tracking-tighter">
          GESCON
        </button>

        {/* Right: Notifications */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowNotifications(!showNotifications)}
            className="text-foreground relative"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold">
                {unreadCount}
              </span>
            )}
          </Button>
          {showNotifications && (
            <NotificationPanel onClose={() => setShowNotifications(false)} />
          )}
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
