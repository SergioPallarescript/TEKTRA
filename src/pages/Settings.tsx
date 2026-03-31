import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User, Shield } from "lucide-react";

const roleLabels: Record<string, string> = {
  DO: "Director de Obra (Arquitecto)",
  DEM: "Dir. Ejecución Material (Arq. Técnico)",
  CON: "Contratista",
  PRO: "Promotor",
  CSS: "Coord. Seguridad y Salud",
};

const Settings = () => {
  const { user, profile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [dniCif, setDniCif] = useState("");
  const [fiscalAddress, setFiscalAddress] = useState("");
  const [saving, setSaving] = useState(false);

  // Load fiscal data
  useState(() => {
    if (!user) return;
    supabase.from("profiles").select("dni_cif, fiscal_address").eq("user_id", user.id).single().then(({ data }) => {
      if (data) {
        setDniCif((data as any).dni_cif || "");
        setFiscalAddress((data as any).fiscal_address || "");
      }
    });
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        dni_cif: dniCif || null,
        fiscal_address: fiscalAddress || null,
      } as any)
      .eq("user_id", user.id);
    if (error) { toast.error("Error al guardar"); } else { toast.success("Perfil actualizado"); }
    setSaving(false);
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="font-display text-3xl font-bold tracking-tighter mb-8">Configuración</h1>
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <h2 className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4 flex items-center gap-2">
            <User className="h-3.5 w-3.5" /> Perfil
          </h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Nombre Completo</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Tu nombre" />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Correo Electrónico</Label>
              <Input value={profile?.email || user?.email || ""} disabled className="opacity-60" />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">DNI / CIF</Label>
              <Input value={dniCif} onChange={(e) => setDniCif(e.target.value)} placeholder="12345678A o B12345678" />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Dirección Fiscal</Label>
              <Input value={fiscalAddress} onChange={(e) => setFiscalAddress(e.target.value)} placeholder="Calle Mayor 1, 28001 Madrid" />
            </div>
            <Button type="submit" disabled={saving} className="font-display text-xs uppercase tracking-wider">
              {saving ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </form>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4 flex items-center gap-2">
            <Shield className="h-3.5 w-3.5" /> Rol Profesional
          </h2>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1.5 text-xs font-display uppercase tracking-widest bg-secondary text-secondary-foreground rounded font-bold">
              {profile?.role || "—"}
            </span>
            <span className="text-sm text-muted-foreground">
              {profile?.role ? roleLabels[profile.role] || profile.role : "Sin rol asignado"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            El rol profesional se asigna durante el registro y no puede modificarse.
          </p>
        </div>
      </div>
    </AppLayout>
  );
};

export default Settings;
