import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Settings, CheckCircle2, Shield } from "lucide-react";

interface Director {
  nombre: string;
  colegiado: string;
}

interface BookCover {
  id?: string;
  project_id: string;
  book_type: string;
  colegio_oficial: string;
  propietario_promotor: string;
  directores_obra: Director[];
  director_ejecucion_nombre: string;
  director_ejecucion_colegiado: string;
  libro_numero: string;
  fecha_comienzo: string;
}

interface BookCoverFormProps {
  projectId: string;
  bookType: "orders" | "incidents";
  project: { name: string; address: string | null; referencia_catastral?: string | null };
  onConfigured?: (cover: BookCover) => void;
}

const emptyDirector = (): Director => ({ nombre: "", colegiado: "" });

const BookCoverForm = ({ projectId, bookType, project, onConfigured }: BookCoverFormProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cover, setCover] = useState<BookCover>({
    project_id: projectId,
    book_type: bookType,
    colegio_oficial: "",
    propietario_promotor: "",
    directores_obra: [emptyDirector()],
    director_ejecucion_nombre: "",
    director_ejecucion_colegiado: "",
    libro_numero: "",
    fecha_comienzo: "",
  });
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    const fetchCover = async () => {
      const { data } = await supabase
        .from("book_covers" as any)
        .select("*")
        .eq("project_id", projectId)
        .eq("book_type", bookType)
        .maybeSingle();
      if (data) {
        const d = data as any;
        setCover({
          id: d.id,
          project_id: d.project_id,
          book_type: d.book_type,
          colegio_oficial: d.colegio_oficial || "",
          propietario_promotor: d.propietario_promotor || "",
          directores_obra: (d.directores_obra as Director[]) || [emptyDirector()],
          director_ejecucion_nombre: d.director_ejecucion_nombre || "",
          director_ejecucion_colegiado: d.director_ejecucion_colegiado || "",
          libro_numero: d.libro_numero || "",
          fecha_comienzo: d.fecha_comienzo || "",
        });
        setIsConfigured(!!d.libro_numero);
        onConfigured?.(d as any);
      }
      setLoading(false);
    };
    fetchCover();
  }, [projectId, bookType]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cover.libro_numero.trim()) {
      toast.error("El número de libro es obligatorio");
      return;
    }
    setSaving(true);
    const payload = {
      project_id: projectId,
      book_type: bookType,
      colegio_oficial: cover.colegio_oficial || null,
      propietario_promotor: cover.propietario_promotor || null,
      directores_obra: cover.directores_obra.filter(d => d.nombre.trim()),
      director_ejecucion_nombre: cover.director_ejecucion_nombre || null,
      director_ejecucion_colegiado: cover.director_ejecucion_colegiado || null,
      libro_numero: cover.libro_numero.trim(),
      fecha_comienzo: cover.fecha_comienzo || null,
    };

    // Only allow insert, not update (cover is immutable once saved)
    if (cover.id) {
      toast.error("La portada ya está sellada y no puede modificarse");
      setSaving(false);
      return;
    }

    const { error } = await (supabase.from("book_covers" as any) as any).insert(payload);

    if (error) {
      toast.error("Error al guardar la portada");
    } else {
      toast.success("Portada del libro sellada. No podrá modificarse.");
      setIsConfigured(true);
      onConfigured?.({ ...cover, ...payload } as any);
      setOpen(false);
    }
    setSaving(false);
  };

  const addDirector = () => {
    setCover(prev => ({ ...prev, directores_obra: [...prev.directores_obra, emptyDirector()] }));
  };

  const removeDirector = (index: number) => {
    setCover(prev => ({ ...prev, directores_obra: prev.directores_obra.filter((_, i) => i !== index) }));
  };

  const updateDirector = (index: number, field: keyof Director, value: string) => {
    setCover(prev => ({
      ...prev,
      directores_obra: prev.directores_obra.map((d, i) => i === index ? { ...d, [field]: value } : d),
    }));
  };

  if (loading) return null;

  return (
    <>
      <Button
        variant={isConfigured ? "outline" : "default"}
        size="sm"
        onClick={() => setOpen(true)}
        data-tour="book-cover"
        className="font-display text-xs uppercase tracking-wider gap-2"
      >
        {isConfigured ? <><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Portada Sellada</> : <><Settings className="h-3.5 w-3.5" /> Configurar Portada</>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">
              {isConfigured ? "Portada del " : "Configurar Portada del "}
              {bookType === "orders" ? "Libro de Órdenes" : "Libro de Incidencias"}
            </DialogTitle>
          </DialogHeader>

          {isConfigured ? (
            /* READ-ONLY view when cover is already sealed */
            <div className="space-y-3 mt-2">
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-lg p-3">
                <p className="text-xs text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  Portada sellada — No modificable por integridad legal
                </p>
              </div>

              <div className="bg-secondary/50 rounded-lg p-3 space-y-1">
                <p className="text-xs text-muted-foreground font-display uppercase tracking-wider">Datos del Proyecto</p>
                <p className="text-sm font-semibold">{project.name}</p>
                {project.address && <p className="text-xs text-muted-foreground">{project.address}</p>}
                {project.referencia_catastral && <p className="text-xs text-muted-foreground">Ref. Catastral: {project.referencia_catastral}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Libro Nº</p><p className="font-semibold">{cover.libro_numero}</p></div>
                {cover.colegio_oficial && <div><p className="text-xs text-muted-foreground">Colegio Oficial</p><p>{cover.colegio_oficial}</p></div>}
                {cover.propietario_promotor && <div><p className="text-xs text-muted-foreground">Promotor</p><p>{cover.propietario_promotor}</p></div>}
                {cover.fecha_comienzo && <div><p className="text-xs text-muted-foreground">Fecha Comienzo</p><p>{new Date(cover.fecha_comienzo).toLocaleDateString("es-ES")}</p></div>}
              </div>

              {cover.directores_obra.filter(d => d.nombre.trim()).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Director/es de Obra</p>
                  {cover.directores_obra.filter(d => d.nombre.trim()).map((d, i) => (
                    <p key={i} className="text-sm">{d.nombre}{d.colegiado ? ` — Col. ${d.colegiado}` : ""}</p>
                  ))}
                </div>
              )}

              {cover.director_ejecucion_nombre && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Dir. Ejecución Material</p>
                  <p className="text-sm">{cover.director_ejecucion_nombre}{cover.director_ejecucion_colegiado ? ` — Col. ${cover.director_ejecucion_colegiado}` : ""}</p>
                </div>
              )}
            </div>
          ) : (
            /* EDITABLE form when cover is not yet saved */
            <form onSubmit={handleSave} className="space-y-4 mt-2">
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-lg p-3">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  ⚠️ <strong>Atención:</strong> Una vez guardada, la portada quedará sellada y no podrá modificarse para garantizar la integridad legal del libro.
                </p>
              </div>

              <div className="bg-secondary/50 rounded-lg p-3 space-y-1">
                <p className="text-xs text-muted-foreground font-display uppercase tracking-wider">Datos del Proyecto</p>
                <p className="text-sm font-semibold">{project.name}</p>
                {project.address && <p className="text-xs text-muted-foreground">{project.address}</p>}
                {project.referencia_catastral && <p className="text-xs text-muted-foreground">Ref. Catastral: {project.referencia_catastral}</p>}
              </div>

              <div className="space-y-2">
                <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Libro Adscrito Nº *</Label>
                <Input value={cover.libro_numero} onChange={e => setCover(prev => ({ ...prev, libro_numero: e.target.value }))} placeholder="Ej: 2024/001" required />
              </div>

              <div className="space-y-2">
                <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Colegio Oficial</Label>
                <Input value={cover.colegio_oficial} onChange={e => setCover(prev => ({ ...prev, colegio_oficial: e.target.value }))} placeholder="Ej: COACM, COAAT Madrid" />
              </div>

              <div className="space-y-2">
                <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Propietario / Promotor</Label>
                <Input value={cover.propietario_promotor} onChange={e => setCover(prev => ({ ...prev, propietario_promotor: e.target.value }))} placeholder="Nombre del promotor o propietario" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Director/es de Obra (DO)</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={addDirector} className="gap-1 text-xs"><Plus className="h-3 w-3" /> Añadir</Button>
                </div>
                {cover.directores_obra.map((d, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-1">
                      <Input value={d.nombre} onChange={e => updateDirector(i, "nombre", e.target.value)} placeholder="Nombre y apellidos" />
                      <Input value={d.colegiado} onChange={e => updateDirector(i, "colegiado", e.target.value)} placeholder="Nº Colegiado" />
                    </div>
                    {cover.directores_obra.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeDirector(i)} className="shrink-0 text-destructive h-8 w-8">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Director de Ejecución Material (DEM)</Label>
                <Input value={cover.director_ejecucion_nombre} onChange={e => setCover(prev => ({ ...prev, director_ejecucion_nombre: e.target.value }))} placeholder="Nombre y apellidos" />
                <Input value={cover.director_ejecucion_colegiado} onChange={e => setCover(prev => ({ ...prev, director_ejecucion_colegiado: e.target.value }))} placeholder="Nº Colegiado" />
              </div>

              <div className="space-y-2">
                <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Fecha de Comienzo</Label>
                <Input type="date" value={cover.fecha_comienzo} onChange={e => setCover(prev => ({ ...prev, fecha_comienzo: e.target.value }))} />
              </div>

              <Button type="submit" disabled={saving} className="w-full font-display text-xs uppercase tracking-wider">
                {saving ? "Sellando..." : "Sellar Portada (Irreversible)"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BookCoverForm;
