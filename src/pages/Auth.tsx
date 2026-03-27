import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Sesión iniciada correctamente");
        navigate("/");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Cuenta creada correctamente");
          navigate("/");
        } else {
          toast.success("Cuenta creada. Revisa tu correo para confirmar.");
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Error de autenticación");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center concrete-bg bg-background relative">
      <div className="relative z-10 w-full max-w-md px-6">
        <div className="mb-12 text-center">
          <h1 className="font-display text-4xl font-bold tracking-tighter text-foreground">
            GESCON
          </h1>
          <p className="mt-2 text-sm text-muted-foreground font-display uppercase tracking-[0.2em]">
            Gestión de Construcción
          </p>
        </div>

        <div className="bg-card border border-border p-8 rounded-lg shadow-sm">
          <div className="flex mb-8 border-b border-border">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 pb-3 text-sm font-display uppercase tracking-wider transition-colors ${
                isLogin
                  ? "text-foreground border-b-2 border-foreground"
                  : "text-muted-foreground"
              }`}
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 pb-3 text-sm font-display uppercase tracking-wider transition-colors ${
                !isLogin
                  ? "text-foreground border-b-2 border-foreground"
                  : "text-muted-foreground"
              }`}
            >
              Registrarse
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-5">
            {!isLogin && (
              <div className="space-y-2 animate-fade-in">
                <Label htmlFor="fullName" className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                  Nombre Completo
                </Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Arq. María García"
                  required
                  className="bg-background border-border"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                Correo Electrónico
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@estudio.com"
                required
                className="bg-background border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                Contraseña
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

            <Button
              type="submit"
              disabled={loading}
              className="w-full font-display uppercase tracking-wider"
            >
              {loading
                ? "Procesando..."
                : isLogin
                ? "Acceder"
                : "Crear Cuenta"}
            </Button>
          </form>
        </div>

        <p className="legal-footer mt-8">
          Su actividad y conformidad están siendo legalmente registradas
        </p>
      </div>
    </div>
  );
};

export default Auth;
