import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const ROLES = [
  { value: "DO", label: "Director de Obra", desc: "Arquitecto — Administrador" },
  { value: "DEM", label: "Dir. Ejecución Material", desc: "Arquitecto Técnico — Administrador" },
  { value: "CON", label: "Contratista", desc: "Empresa constructora" },
  { value: "PRO", label: "Promotor", desc: "Desarrollador / Inversor" },
  { value: "CSS", label: "Coord. Seguridad y Salud", desc: "Coordinador CSS" },
] as const;

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLogin && !selectedRole) {
      toast.error("Selecciona tu rol profesional");
      return;
    }
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
            data: { full_name: fullName, role: selectedRole },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;

        if (data.user) {
          await supabase
            .from("profiles")
            .update({ role: selectedRole as any })
            .eq("user_id", data.user.id);
        }

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
    <div className="min-h-screen flex items-center justify-center relative" style={{ backgroundColor: '#1a1a1a' }}>
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: 'url(/login-bg.jpg)', opacity: 0.15 }} />
      <div className="relative z-10 w-full max-w-md px-6">
        <div className="mb-12 text-center">
          <img src="/tectra-logo.png" alt="TECTRA" className="h-12 mx-auto brightness-0 invert" />
          <p className="mt-3 text-sm text-white/50 uppercase tracking-[0.2em]">
            Gestión de Construcción
          </p>
        </div>

        <div className="bg-card border border-border p-8 rounded-lg shadow-sm">
          <div className="flex mb-8 border-b border-border">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 pb-3 text-sm font-display uppercase tracking-wider transition-colors ${
                isLogin ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground"
              }`}
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 pb-3 text-sm font-display uppercase tracking-wider transition-colors ${
                !isLogin ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground"
              }`}
            >
              Registrarse
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-5">
            {!isLogin && (
              <>
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

                <div className="space-y-2 animate-fade-in">
                  <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                    Rol Profesional
                  </Label>
                  <div className="grid grid-cols-1 gap-2">
                    {ROLES.map((role) => (
                      <button
                        key={role.value}
                        type="button"
                        onClick={() => setSelectedRole(role.value)}
                        className={`text-left px-4 py-3 rounded border transition-all ${
                          selectedRole === role.value
                            ? "border-foreground bg-foreground/5"
                            : "border-border bg-background hover:border-foreground/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-display text-xs font-bold tracking-wider">
                              {role.value}
                            </span>
                            <span className="text-sm ml-2">{role.label}</span>
                          </div>
                          {selectedRole === role.value && (
                            <div className="h-2 w-2 rounded-full bg-foreground" />
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{role.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </>
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
              {loading ? "Procesando..." : isLogin ? "Acceder" : "Crear Cuenta"}
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
