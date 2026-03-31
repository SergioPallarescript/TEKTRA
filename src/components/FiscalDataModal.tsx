import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface FiscalDataModalProps {
  open: boolean;
  onComplete: (data: { full_name: string; dni_cif: string; fiscal_address: string }) => void;
  onCancel: () => void;
}

const FiscalDataModal = ({ open, onComplete, onCancel }: FiscalDataModalProps) => {
  const { user, profile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [dniCif, setDniCif] = useState("");
  const [fiscalAddress, setFiscalAddress] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!fullName.trim() || !dniCif.trim() || !fiscalAddress.trim()) {
      toast.error("Todos los campos son obligatorios");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        dni_cif: dniCif.trim(),
        fiscal_address: fiscalAddress.trim(),
      } as any)
      .eq("user_id", user.id);

    if (error) {
      toast.error("Error al guardar los datos fiscales");
      setSaving(false);
      return;
    }
    toast.success("Datos fiscales guardados");
    setSaving(false);
    onComplete({
      full_name: fullName.trim(),
      dni_cif: dniCif.trim(),
      fiscal_address: fiscalAddress.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Datos de Firma</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Para garantizar la validez legal de tu firma, necesitamos los siguientes datos. 
            Solo se solicitan una vez y quedarán guardados en tu perfil.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
              Nombre Completo
            </Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Juan García López"
              required
            />
          </div>
          <div className="space-y-2">
            <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
              DNI / CIF
            </Label>
            <Input
              value={dniCif}
              onChange={(e) => setDniCif(e.target.value)}
              placeholder="12345678A o B12345678"
              required
            />
          </div>
          <div className="space-y-2">
            <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
              Dirección Fiscal
            </Label>
            <Input
              value={fiscalAddress}
              onChange={(e) => setFiscalAddress(e.target.value)}
              placeholder="Calle Mayor 1, 28001 Madrid"
              required
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving} className="flex-1 font-display text-xs uppercase tracking-wider">
              {saving ? "Guardando..." : "Guardar y Firmar"}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel} className="font-display text-xs uppercase tracking-wider">
              Cancelar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default FiscalDataModal;
