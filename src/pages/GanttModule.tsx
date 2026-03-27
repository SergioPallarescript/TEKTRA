import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, GripVertical, BarChart3, Loader2, RotateCcw } from "lucide-react";

interface GanttItem {
  id: string;
  title: string;
  start: string;
  end: string;
  order: number;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(262, 83%, 58%)",
  "hsl(0, 84%, 60%)",
];

const GanttModule = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<GanttItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [forcedLandscape, setForcedLandscape] = useState(false);

  const canEdit = profile?.role === "DEM" || profile?.role === "DO" || profile?.role === "CON";

  // Load from localStorage per project
  const storageKey = `gantt_${projectId}`;

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try { setItems(JSON.parse(saved)); } catch { /* ignore */ }
    }
    setLoading(false);
  }, [storageKey]);

  const saveItems = useCallback((newItems: GanttItem[]) => {
    setItems(newItems);
    localStorage.setItem(storageKey, JSON.stringify(newItems));
  }, [storageKey]);

  // Auto-generate from project documents
  const generateFromDocs = async () => {
    if (!projectId) return;
    setGenerating(true);

    try {
      const { data: docs } = await supabase
        .from("project_documents")
        .select("file_name, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      const { data: plans } = await supabase
        .from("plans")
        .select("name, category, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      const { data: orders } = await supabase
        .from("orders")
        .select("content, created_at, order_number")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      const milestones: GanttItem[] = [];
      let order = 0;

      // Default construction phases
      const defaultPhases = [
        "Demoliciones y movimiento de tierras",
        "Cimentación",
        "Estructura",
        "Cerramientos y fachada",
        "Instalaciones (fontanería, electricidad, clima)",
        "Particiones y albañilería interior",
        "Revestimientos y acabados",
        "Carpintería y cerrajería",
        "Urbanización exterior",
        "Limpieza final y recepción",
      ];

      const today = new Date();
      defaultPhases.forEach((phase, i) => {
        const start = new Date(today);
        start.setDate(start.getDate() + i * 30);
        const end = new Date(start);
        end.setDate(end.getDate() + 25);
        milestones.push({
          id: crypto.randomUUID(),
          title: phase,
          start: start.toISOString().split("T")[0],
          end: end.toISOString().split("T")[0],
          order: order++,
        });
      });

      // Documents and plans are used to inform the timeline but NOT shown as milestones

      saveItems(milestones);
      toast.success(`Diagrama generado con ${milestones.length} hitos`);
    } catch {
      toast.error("Error al generar el diagrama");
    } finally {
      setGenerating(false);
    }
  };

  const addItem = () => {
    const today = new Date().toISOString().split("T")[0];
    const next = new Date();
    next.setDate(next.getDate() + 14);
    const newItem: GanttItem = {
      id: crypto.randomUUID(),
      title: "Nuevo hito",
      start: today,
      end: next.toISOString().split("T")[0],
      order: items.length,
    };
    saveItems([...items, newItem]);
    setEditingId(newItem.id);
  };

  const updateItem = (id: string, updates: Partial<GanttItem>) => {
    saveItems(items.map((i) => (i.id === id ? { ...i, ...updates } : i)));
  };

  const deleteItem = (id: string) => {
    saveItems(items.filter((i) => i.id !== id));
  };

  const moveItem = (id: string, direction: -1 | 1) => {
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= items.length) return;
    const newItems = [...items];
    [newItems[idx], newItems[newIdx]] = [newItems[newIdx], newItems[idx]];
    newItems.forEach((item, i) => (item.order = i));
    saveItems(newItems);
  };

  // Calculate Gantt chart dimensions
  const sortedItems = [...items].sort((a, b) => a.order - b.order);
  const allDates = items.flatMap((i) => [new Date(i.start), new Date(i.end)]);
  const minDate = allDates.length > 0 ? new Date(Math.min(...allDates.map((d) => d.getTime()))) : new Date();
  const maxDate = allDates.length > 0 ? new Date(Math.max(...allDates.map((d) => d.getTime()))) : new Date();
  const totalDays = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  const getBarStyle = (item: GanttItem) => {
    const startD = new Date(item.start);
    const endD = new Date(item.end);
    const startOffset = Math.ceil((startD.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
    const duration = Math.max(1, Math.ceil((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    return {
      left: `${(startOffset / totalDays) * 100}%`,
      width: `${(duration / totalDays) * 100}%`,
    };
  };

  // Month markers
  const months: { label: string; left: string }[] = [];
  const cursor = new Date(minDate);
  cursor.setDate(1);
  while (cursor <= maxDate) {
    const offset = Math.max(0, (cursor.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
    months.push({
      label: cursor.toLocaleDateString("es-ES", { month: "short", year: "2-digit" }),
      left: `${(offset / totalDays) * 100}%`,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const isMobilePortrait = typeof window !== 'undefined' && window.innerWidth < 768 && window.innerHeight > window.innerWidth;

  if (forcedLandscape) {
    return (
      <div
        className="fixed inset-0 z-[9999] bg-background overflow-auto"
        style={{
          transform: "rotate(90deg)",
          transformOrigin: "top left",
          width: `${window.innerHeight}px`,
          height: `${window.innerWidth}px`,
          top: 0,
          left: `${window.innerWidth}px`,
        }}
      >
        <div className="p-4 pb-16">
          <div className="flex items-center gap-3 mb-2">
            <Button variant="outline" size="sm" onClick={() => setForcedLandscape(false)} className="gap-2 font-display text-xs uppercase tracking-wider">
              <RotateCcw className="h-4 w-4" /> Volver a vertical
            </Button>
            <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">
              Diagrama Gantt — Cronología de obra
            </p>
          </div>

          <div className="flex items-end justify-between mb-4">
            <h1 className="font-display text-2xl font-bold tracking-tighter">Diagrama Gantt</h1>
            <div className="flex gap-2">
              {items.length === 0 && (
                <Button onClick={generateFromDocs} disabled={generating} className="font-display text-xs uppercase tracking-wider gap-2">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                  {generating ? "Generando..." : "Generar"}
                </Button>
              )}
              {canEdit && (
                <Button onClick={addItem} variant="outline" className="font-display text-xs uppercase tracking-wider gap-2">
                  <Plus className="h-4 w-4" /> Añadir
                </Button>
              )}
            </div>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-10">
              <BarChart3 className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="font-display text-muted-foreground text-sm">No hay hitos definidos</p>
            </div>
          ) : (
            <>
              <div className="bg-card border border-border rounded-lg overflow-hidden mb-4">
                <div className="relative h-7 border-b border-border bg-secondary/30 overflow-hidden">
                  {months.map((m, i) => (
                    <span key={i} className="absolute top-1 text-[9px] font-display uppercase tracking-wider text-muted-foreground" style={{ left: m.left }}>
                      {m.label}
                    </span>
                  ))}
                </div>
                <div className="divide-y divide-border">
                  {sortedItems.map((item, idx) => (
                    <div key={item.id} className="flex items-center h-9">
                      <div className="w-40 shrink-0 px-2 flex items-center border-r border-border">
                        <span className="text-[10px] truncate">{item.title}</span>
                      </div>
                      <div className="flex-1 relative h-full px-1">
                        <div
                          className="absolute top-1.5 h-5 rounded"
                          style={{
                            ...getBarStyle(item),
                            backgroundColor: COLORS[idx % COLORS.length],
                            opacity: 0.8,
                            minWidth: "4px",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {canEdit && (
                <>
                  <h2 className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Editar hitos</h2>
                  <div className="space-y-2">
                    {sortedItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 bg-card border border-border rounded-lg p-2">
                        <GripVertical className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                        <Input
                          value={item.title}
                          onChange={(e) => updateItem(item.id, { title: e.target.value })}
                          className="flex-1 h-7 text-xs text-foreground"
                        />
                        <Input
                          type="date"
                          value={item.start}
                          onChange={(e) => updateItem(item.id, { start: e.target.value })}
                          className="w-32 h-7 text-xs text-foreground"
                        />
                        <span className="text-xs text-muted-foreground">→</span>
                        <Input
                          type="date"
                          value={item.end}
                          onChange={(e) => updateItem(item.id, { end: e.target.value })}
                          className="w-32 h-7 text-xs text-foreground"
                        />
                        <Button variant="ghost" size="icon" onClick={() => deleteItem(item.id)} className="text-destructive/60 hover:text-destructive shrink-0 h-7 w-7">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <AppLayout>
      {/* Forced landscape wrapper */}
      {forcedLandscape ? (
        <div
          className="fixed inset-0 z-[200] bg-background overflow-auto"
          style={{
            transform: "rotate(90deg)",
            transformOrigin: "top left",
            width: `${window.innerHeight}px`,
            height: `${window.innerWidth}px`,
            top: 0,
            left: `${window.innerWidth}px`,
          }}
        >
          <div className="p-4 pb-16">
            <div className="flex items-center gap-3 mb-2">
              <Button variant="outline" size="sm" onClick={() => setForcedLandscape(false)} className="gap-2 font-display text-xs uppercase tracking-wider">
                <RotateCcw className="h-4 w-4" /> Volver a vertical
              </Button>
              <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">
                Diagrama Gantt — Cronología de obra
              </p>
            </div>

            <div className="flex items-end justify-between mb-4">
              <h1 className="font-display text-2xl font-bold tracking-tighter">Diagrama Gantt</h1>
              <div className="flex gap-2">
                {items.length === 0 && (
                  <Button onClick={generateFromDocs} disabled={generating} className="font-display text-xs uppercase tracking-wider gap-2">
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                    {generating ? "Generando..." : "Generar"}
                  </Button>
                )}
                {canEdit && (
                  <Button onClick={addItem} variant="outline" className="font-display text-xs uppercase tracking-wider gap-2">
                    <Plus className="h-4 w-4" /> Añadir
                  </Button>
                )}
              </div>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-10">
                <BarChart3 className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                <p className="font-display text-muted-foreground text-sm">No hay hitos definidos</p>
              </div>
            ) : (
              <>
                <div className="bg-card border border-border rounded-lg overflow-hidden mb-4">
                  <div className="relative h-7 border-b border-border bg-secondary/30 overflow-hidden">
                    {months.map((m, i) => (
                      <span key={i} className="absolute top-1 text-[9px] font-display uppercase tracking-wider text-muted-foreground" style={{ left: m.left }}>
                        {m.label}
                      </span>
                    ))}
                  </div>
                  <div className="divide-y divide-border">
                    {sortedItems.map((item, idx) => (
                      <div key={item.id} className="flex items-center h-9">
                        <div className="w-40 shrink-0 px-2 flex items-center border-r border-border">
                          <span className="text-[10px] truncate">{item.title}</span>
                        </div>
                        <div className="flex-1 relative h-full px-1">
                          <div
                            className="absolute top-1.5 h-5 rounded"
                            style={{
                              ...getBarStyle(item),
                              backgroundColor: COLORS[idx % COLORS.length],
                              opacity: 0.8,
                              minWidth: "4px",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {canEdit && (
                  <>
                    <h2 className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Editar hitos</h2>
                    <div className="space-y-2">
                      {sortedItems.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 bg-card border border-border rounded-lg p-2">
                          <GripVertical className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                          <Input
                            value={item.title}
                            onChange={(e) => updateItem(item.id, { title: e.target.value })}
                            className="flex-1 h-7 text-xs text-foreground"
                          />
                          <Input
                            type="date"
                            value={item.start}
                            onChange={(e) => updateItem(item.id, { start: e.target.value })}
                            className="w-32 h-7 text-xs text-foreground"
                          />
                          <span className="text-xs text-muted-foreground">→</span>
                          <Input
                            type="date"
                            value={item.end}
                            onChange={(e) => updateItem(item.id, { end: e.target.value })}
                            className="w-32 h-7 text-xs text-foreground"
                          />
                          <Button variant="ghost" size="icon" onClick={() => deleteItem(item.id)} className="text-destructive/60 hover:text-destructive shrink-0 h-7 w-7">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="max-w-full mx-auto px-4 py-8">
          <div className="flex items-center gap-3 mb-2">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">
              Diagrama Gantt — Cronología de obra
            </p>
          </div>

          <div className="flex items-end justify-between mb-6 flex-wrap gap-2">
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tighter">Diagrama Gantt</h1>
              <p className="text-sm text-muted-foreground mt-1">Cronología de obra personalizable</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {isMobilePortrait && (
                <Button onClick={() => setForcedLandscape(true)} variant="outline" className="font-display text-xs uppercase tracking-wider gap-2">
                  <RotateCcw className="h-4 w-4" /> Girar pantalla
                </Button>
              )}
              {items.length === 0 && (
                <Button onClick={generateFromDocs} disabled={generating} className="font-display text-xs uppercase tracking-wider gap-2">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                  {generating ? "Generando..." : "Generar desde documentos"}
                </Button>
              )}
              {canEdit && (
                <Button onClick={addItem} variant="outline" className="font-display text-xs uppercase tracking-wider gap-2">
                  <Plus className="h-4 w-4" /> Añadir Hito
                </Button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-card border border-border rounded-lg animate-pulse" />)}</div>
          ) : items.length === 0 ? (
            <div className="text-center py-20">
              <BarChart3 className="h-16 w-16 text-muted-foreground/20 mx-auto mb-4" />
              <p className="font-display text-muted-foreground">No hay hitos definidos</p>
              <p className="text-xs text-muted-foreground mt-2">Genera automáticamente desde los documentos del proyecto o añade hitos manualmente.</p>
            </div>
          ) : (
            <>
              <div className="bg-card border border-border rounded-lg overflow-hidden mb-6">
                <div className="relative h-8 border-b border-border bg-secondary/30 overflow-hidden">
                  {months.map((m, i) => (
                    <span key={i} className="absolute top-1.5 text-[10px] font-display uppercase tracking-wider text-muted-foreground" style={{ left: m.left }}>
                      {m.label}
                    </span>
                  ))}
                </div>
                <div className="divide-y divide-border">
                  {sortedItems.map((item, idx) => (
                    <div key={item.id} className="flex items-center h-10 group">
                      <div className="w-48 md:w-64 shrink-0 px-3 flex items-center gap-1 border-r border-border">
                        {canEdit && (
                          <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => moveItem(item.id, -1)} className="text-muted-foreground hover:text-foreground text-[8px] leading-none">▲</button>
                            <button onClick={() => moveItem(item.id, 1)} className="text-muted-foreground hover:text-foreground text-[8px] leading-none">▼</button>
                          </div>
                        )}
                        {editingId === item.id ? (
                          <Input
                            value={item.title}
                            onChange={(e) => updateItem(item.id, { title: e.target.value })}
                            onBlur={() => setEditingId(null)}
                            onKeyDown={(e) => e.key === "Enter" && setEditingId(null)}
                            className="h-7 text-xs"
                            autoFocus
                          />
                        ) : (
                          <button
                            onClick={() => canEdit && setEditingId(item.id)}
                            className="text-xs truncate text-left flex-1 hover:text-foreground transition-colors"
                          >
                            {item.title}
                          </button>
                        )}
                      </div>
                      <div className="flex-1 relative h-full px-1">
                        <div
                          className="absolute top-2 h-6 rounded"
                          style={{
                            ...getBarStyle(item),
                            backgroundColor: COLORS[idx % COLORS.length],
                            opacity: 0.8,
                            minWidth: "4px",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {canEdit && (
                <>
                  <h2 className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Editar hitos</h2>
                  <div className="space-y-2">
                    {sortedItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 bg-card border border-border rounded-lg p-3">
                        <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                        <Input
                          value={item.title}
                          onChange={(e) => updateItem(item.id, { title: e.target.value })}
                          className="flex-1 h-8 text-xs text-foreground"
                        />
                        <Input
                          type="date"
                          value={item.start}
                          onChange={(e) => updateItem(item.id, { start: e.target.value })}
                          className="w-40 h-8 text-xs text-foreground"
                        />
                        <span className="text-xs text-muted-foreground">→</span>
                        <Input
                          type="date"
                          value={item.end}
                          onChange={(e) => updateItem(item.id, { end: e.target.value })}
                          className="w-40 h-8 text-xs text-foreground"
                        />
                        <Button variant="ghost" size="icon" onClick={() => deleteItem(item.id)} className="text-destructive/60 hover:text-destructive shrink-0 h-8 w-8">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </AppLayout>
  );
};

export default GanttModule;
