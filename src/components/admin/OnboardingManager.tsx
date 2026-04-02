import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, BookOpen, Plus, Trash2 } from "lucide-react";

type AppRole = "DO" | "DEM" | "CON" | "PRO" | "CSS";

const roleLabels: Record<AppRole, string> = {
  DO: "Director de Obra",
  DEM: "Dir. Ejecución Material",
  CON: "Contratista",
  PRO: "Promotor",
  CSS: "Coord. Seguridad y Salud",
};

const pageLabels: Record<string, string> = {
  "/": "Dashboard",
  "/project/:id": "Detalle Proyecto",
  "/project/:id/orders": "Libro de Órdenes",
  "/project/:id/incidents": "Libro de Incidencias",
  "/project/:id/costs": "Economía de Obra",
  "/project/:id/cfo": "Control de Calidad",
  "/project/:id/plans": "Gestión de Planos",
  "/project/:id/gantt": "Planificación (Gantt)",
  "/project/:id/docs": "Documentación",
  "/project/:id/brain": "Asistente IA",
  "/project/:id/signatures": "Firma Digital",
};

interface OnboardingStep {
  id: string;
  role: string;
  page_route: string;
  step_order: number;
  target_element: string | null;
  title: string;
  content: string;
  is_active: boolean;
}

const OnboardingManager = () => {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterPage, setFilterPage] = useState<string>("all");
  const [editedIds, setEditedIds] = useState<Set<string>>(new Set());

  const fetchSteps = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("onboarding_steps")
      .select("*")
      .order("role")
      .order("page_route")
      .order("step_order");

    if (filterRole !== "all") query = query.eq("role", filterRole);
    if (filterPage !== "all") query = query.eq("page_route", filterPage);

    const { data } = await query;
    setSteps((data as OnboardingStep[]) || []);
    setEditedIds(new Set());
    setLoading(false);
  }, [filterRole, filterPage]);

  useEffect(() => { fetchSteps(); }, [fetchSteps]);

  const updateLocal = (id: string, field: keyof OnboardingStep, value: any) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
    setEditedIds(prev => new Set(prev).add(id));
  };

  const saveStep = async (step: OnboardingStep) => {
    const { error } = await supabase
      .from("onboarding_steps")
      .update({
        title: step.title,
        content: step.content,
        target_element: step.target_element,
        step_order: step.step_order,
        is_active: step.is_active,
      })
      .eq("id", step.id);
    if (error) { toast.error("Error al guardar"); return; }
    toast.success("Paso actualizado");
    setEditedIds(prev => { const n = new Set(prev); n.delete(step.id); return n; });
  };

  const addStep = async () => {
    const role = filterRole !== "all" ? filterRole : "DO";
    const page = filterPage !== "all" ? filterPage : "/";
    const maxOrder = steps.filter(s => s.role === role && s.page_route === page)
      .reduce((max, s) => Math.max(max, s.step_order), 0);

    const { error } = await supabase.from("onboarding_steps").insert({
      role,
      page_route: page,
      step_order: maxOrder + 1,
      title: "Nuevo paso",
      content: "Descripción del paso",
      target_element: null,
      is_active: true,
    });
    if (error) { toast.error("Error al crear"); return; }
    toast.success("Paso creado");
    fetchSteps();
  };

  const deleteStep = async (id: string) => {
    const { error } = await supabase.from("onboarding_steps").delete().eq("id", id);
    if (error) { toast.error("Error al eliminar"); return; }
    toast.success("Paso eliminado");
    fetchSteps();
  };

  const uniquePages = [...new Set(steps.map(s => s.page_route))];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <BookOpen className="h-6 w-6 text-accent" />
        <h2 className="font-display text-xl font-bold tracking-tight">Gestión de Tutoriales</h2>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-48 h-9 text-sm">
            <SelectValue placeholder="Filtrar por rol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los roles</SelectItem>
            {(Object.keys(roleLabels) as AppRole[]).map(r => (
              <SelectItem key={r} value={r}>{roleLabels[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterPage} onValueChange={setFilterPage}>
          <SelectTrigger className="w-56 h-9 text-sm">
            <SelectValue placeholder="Filtrar por página" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las páginas</SelectItem>
            {Object.entries(pageLabels).map(([route, label]) => (
              <SelectItem key={route} value={route}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" className="gap-1 ml-auto" onClick={addStep}>
          <Plus className="h-3 w-3" /> Añadir Paso
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-display text-xs uppercase tracking-wider w-16">Orden</TableHead>
              <TableHead className="font-display text-xs uppercase tracking-wider">Rol</TableHead>
              <TableHead className="font-display text-xs uppercase tracking-wider">Página</TableHead>
              <TableHead className="font-display text-xs uppercase tracking-wider">Título</TableHead>
              <TableHead className="font-display text-xs uppercase tracking-wider">Contenido</TableHead>
              <TableHead className="font-display text-xs uppercase tracking-wider w-20">Activo</TableHead>
              <TableHead className="font-display text-xs uppercase tracking-wider w-24 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <div className="h-6 w-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : steps.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No hay pasos configurados
                </TableCell>
              </TableRow>
            ) : (
              steps.map(step => (
                <TableRow key={step.id}>
                  <TableCell>
                    <Input
                      type="number"
                      value={step.step_order}
                      onChange={e => updateLocal(step.id, "step_order", parseInt(e.target.value) || 0)}
                      className="w-14 h-8 text-xs text-center"
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {roleLabels[step.role as AppRole] || step.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {pageLabels[step.page_route] || step.page_route}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={step.title}
                      onChange={e => updateLocal(step.id, "title", e.target.value)}
                      className="h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Textarea
                      value={step.content}
                      onChange={e => updateLocal(step.id, "content", e.target.value)}
                      className="text-xs min-h-[60px] resize-y"
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={step.is_active}
                      onCheckedChange={v => updateLocal(step.id, "is_active", v)}
                    />
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {editedIds.has(step.id) && (
                      <Button variant="default" size="sm" className="text-[10px] h-7 gap-1" onClick={() => saveStep(step)}>
                        <Save className="h-3 w-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-[10px] h-7 text-destructive" onClick={() => deleteStep(step.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default OnboardingManager;
