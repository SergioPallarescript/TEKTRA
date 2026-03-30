import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
    // Also check hash for type=recovery
    if (window.location.hash.includes("type=recovery")) {
      setReady(true);
    }
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    if (password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message || "Error al cambiar la contraseña");
    } else {
      toast.success("Contraseña actualizada correctamente");
      navigate("/");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative" style={{ backgroundColor: '#1a1a1a' }}>
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: 'url(/login-bg.jpg)', opacity: 0.15 }} />
      <div className="relative z-10 w-full max-w-md px-6">
        <div className="mb-12 text-center">
          <img src="/tectra-logo.png" alt="TEKTRA" className="h-12 mx-auto brightness-0 invert" />
          <p className="mt-3 text-sm text-white/50 uppercase tracking-[0.2em]">
            Nueva Contraseña
          </p>
        </div>

        <div className="bg-card border border-border p-8 rounded-lg shadow-sm">
          {!ready ? (
            <div className="text-center py-8">
              <div className="h-6 w-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">Verificando enlace de recuperación...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="password" className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                  Nueva Contraseña
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="bg-background border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm" className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                  Confirmar Contraseña
                </Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="bg-background border-border"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full font-display uppercase tracking-wider">
                {loading ? "Guardando..." : "Cambiar Contraseña"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
