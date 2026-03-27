import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, Circle, Upload, ClipboardCheck, FileText,
} from "lucide-react";

const DEFAULT_CFO_ITEMS = [
  { category: "Ensayos", items: [
    "Ensayo de hormigón - Probetas",
    "Ensayo de acero - Certificado de calidad",
    "Ensayo de soldaduras",
    "Ensayo de estanqueidad cubierta",
    "Ensayo de compactación terreno",
  ]},
  { category: "Certificados de Materiales", items: [
    "Certificado CE hormigón",
    "Certificado CE acero",
    "Certificado CE carpintería exterior",
    "Certificado CE aislamiento térmico",
    "Certificado CE instalaciones eléctricas",
    "Certificado CE fontanería",
  ]},
  { category: "Actas", items: [
    "Acta de replanteo",
    "Acta de recepción de obra",
    "Acta de cimentación",
    "Acta de estructura",
    "Acta de instalaciones",
  ]},
  { category: "Documentación Final", items: [
    "Libro del Edificio",
    "Manual de uso y mantenimiento",
    "Certificado de Eficiencia Energética",
    "Licencia de primera ocupación",
    "Seguro decenal",
    "Declaración de obra nueva",
  ]},
  { category: "Seguridad y Salud", items: [
    "Plan de Seguridad y Salud aprobado",
    "Acta de aprobación del PSS",
    "Libro de incidencias cerrado",
    "Certificado de formación trabajadores",
  ]},
];

const CFOModule = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("cfo_items")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true });

    if (data && data.length > 0) {
      setItems(data);
    } else {
      // Initialize default checklist
      await initializeChecklist();
    }
    setLoading(false);
  }, [projectId]);

  const initializeChecklist = async () => {
    if (!projectId) return;
    const inserts: any[] = [];
    let sortOrder = 0;
    DEFAULT_CFO_ITEMS.forEach((cat) => {
      cat.items.forEach((title) => {
        inserts.push({
          project_id: projectId,
          category: cat.category,
          title,
          sort_order: sortOrder++,
        });
      });
    });

    const { data } = await supabase.from("cfo_items").insert(inserts).select();
    if (data) setItems(data);
  };

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleFileUpload = async (itemId: string, file: File) => {
    if (!projectId || !user) return;
    setUploadingId(itemId);

    const path = `cfo/${projectId}/${itemId}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from("plans").upload(path, file);
    if (uploadError) { toast.error("Error al subir archivo"); setUploadingId(null); return; }

    await supabase.from("cfo_items").update({
      is_completed: true,
      completed_at: new Date().toISOString(),
      completed_by: user.id,
      file_url: path,
      file_name: file.name,
    }).eq("id", itemId);

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      project_id: projectId,
      action: "cfo_item_completed",
      details: { item_id: itemId, file_name: file.name },
    });

    toast.success("Documento subido y marcado como completado");
    setUploadingId(null);
    fetchItems();
  };

  const toggleComplete = async (itemId: string, currentState: boolean) => {
    if (!user || !projectId) return;
    if (!currentState) {
      // Need file upload to complete — trigger file picker handled by UI
      return;
    }
    // Unmark
    await supabase.from("cfo_items").update({
      is_completed: false,
      completed_at: null,
      completed_by: null,
      file_url: null,
      file_name: null,
    }).eq("id", itemId);
    fetchItems();
  };

  const categories = [...new Set(items.map((i) => i.category))];
  const totalItems = items.length;
  const completedItems = items.filter((i) => i.is_completed).length;
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">
            Documentación Final (CFO)
          </p>
        </div>

        <div className="flex items-end justify-between mb-6">
          <h1 className="font-display text-3xl font-bold tracking-tighter">Checklist CFO</h1>
          <div className="text-right">
            <p className="font-display text-2xl font-bold tracking-tighter text-success">{progress}%</p>
            <p className="text-xs text-muted-foreground">{completedItems}/{totalItems} completados</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-secondary rounded-full mb-8 overflow-hidden">
          <div
            className="h-full bg-success rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-card border border-border rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {categories.map((cat) => {
              const catItems = items.filter((i) => i.category === cat);
              const catCompleted = catItems.filter((i) => i.is_completed).length;
              return (
                <div key={cat} className="bg-card border border-border rounded-lg p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-display text-sm font-semibold uppercase tracking-wider">{cat}</h2>
                    <span className={`px-2 py-0.5 text-[10px] font-display uppercase tracking-widest rounded ${
                      catCompleted === catItems.length
                        ? "bg-success/10 text-success"
                        : "bg-secondary text-muted-foreground"
                    }`}>
                      {catCompleted}/{catItems.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {catItems.map((item) => (
                      <div key={item.id} className={`flex items-center justify-between p-3 rounded border transition-all ${
                        item.is_completed
                          ? "border-success/30 bg-success/5"
                          : "border-border hover:border-foreground/10"
                      }`}>
                        <div className="flex items-center gap-3">
                          {item.is_completed ? (
                            <button onClick={() => toggleComplete(item.id, true)}>
                              <CheckCircle2 className="h-5 w-5 text-success" />
                            </button>
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground/30" />
                          )}
                          <div>
                            <p className={`text-sm ${item.is_completed ? "text-success" : ""}`}>
                              {item.title}
                            </p>
                            {item.file_name && (
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                                <FileText className="h-3 w-3" /> {item.file_name}
                              </span>
                            )}
                          </div>
                        </div>
                        {!item.is_completed && (
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              className="hidden"
                              accept=".pdf,.doc,.docx,.jpg,.png"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleFileUpload(item.id, f);
                              }}
                            />
                            <span className={`flex items-center gap-1 px-2 py-1 text-[10px] font-display uppercase tracking-widest rounded border border-border hover:border-foreground/20 transition-colors ${
                              uploadingId === item.id ? "opacity-50" : ""
                            }`}>
                              <Upload className="h-3 w-3" />
                              {uploadingId === item.id ? "Subiendo..." : "Subir"}
                            </span>
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default CFOModule;
