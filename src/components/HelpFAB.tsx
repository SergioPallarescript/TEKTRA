import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { HelpCircle, BookOpen, MessageSquare, X, Loader2 } from "lucide-react";

const HelpFAB = () => {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const startGuide = () => {
    setOpen(false);
    window.dispatchEvent(new Event("start-onboarding-guide"));
  };

  const sendSupport = async () => {
    if (!message.trim()) { toast.error("Escribe tu consulta"); return; }
    setSending(true);

    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          to: "info@tektra.es",
          subject: `Consulta de soporte — ${profile?.full_name || user?.email}`,
          template: "support-query",
          data: {
            userName: profile?.full_name || "Usuario",
            userEmail: user?.email || "",
            userRole: profile?.role || "Sin rol",
            message: message.trim(),
          },
        },
      });

      if (error) throw error;
      toast.success("Consulta enviada a soporte");
      setMessage("");
      setShowSupport(false);
      setOpen(false);
    } catch {
      toast.error("Error al enviar la consulta");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full bg-accent text-accent-foreground shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
        aria-label="Ayuda"
      >
        {open ? <X className="h-5 w-5" /> : <HelpCircle className="h-5 w-5" />}
      </button>

      {/* Menu popover */}
      {open && !showSupport && (
        <div className="fixed bottom-20 right-6 z-50 bg-card border border-border rounded-lg shadow-xl p-2 w-56 animate-in slide-in-from-bottom-2">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-sm h-10"
            onClick={startGuide}
          >
            <BookOpen className="h-4 w-4 text-accent" />
            Iniciar Guía
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-sm h-10"
            onClick={() => setShowSupport(true)}
          >
            <MessageSquare className="h-4 w-4 text-accent" />
            Enviar duda a soporte
          </Button>
        </div>
      )}

      {/* Support dialog */}
      <Dialog open={showSupport} onOpenChange={(o) => { setShowSupport(o); if (!o) setOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Contactar con Soporte</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              Describe tu duda y nuestro equipo te responderá a <strong>{user?.email}</strong>.
            </p>
            <Textarea
              placeholder="¿En qué podemos ayudarte?"
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="min-h-[120px]"
            />
            <Button className="w-full gap-2" onClick={sendSupport} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
              Enviar Consulta
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default HelpFAB;
