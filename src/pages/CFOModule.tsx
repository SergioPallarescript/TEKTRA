import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, Circle, Upload, FileText, AlertTriangle,
  Shield, Bell, Download, Loader2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type AppRole = "DO" | "DEO" | "CON" | "PRO" | "CSS";

const CFO_16_POINTS: { num: number; title: string; category: string; allowedRoles: AppRole[] }[] = [
  { num: 1, title: "Identificación de subcontratas y trabajadores", category: "Gestión de Obra", allowedRoles: ["CON"] },
  { num: 2, title: "Certificado Final de Obra firmado por DO y DEO", category: "Certificaciones Técnicas", allowedRoles: ["DO", "DEO"] },
  { num: 3, title: "Certificaciones de obra ejecutada", category: "Gestión de Obra", allowedRoles: ["CON"] },
  { num: 4, title: "Acta de recepción de obra", category: "Actas", allowedRoles: ["DO", "DEO", "CSS"] },
  { num: 5, title: "Certificado de instalación eléctrica (Endesa)", category: "Certificaciones Instalaciones", allowedRoles: ["CON"] },
  { num: 6, title: "Certificado de instalación de agua (Aqualia)", category: "Certificaciones Instalaciones", allowedRoles: ["CON"] },
  { num: 7, title: "Certificado de telecomunicaciones", category: "Certificaciones Instalaciones", allowedRoles: ["CON"] },
  { num: 8, title: "Certificado de instalación de gas", category: "Certificaciones Instalaciones", allowedRoles: ["CON"] },
  { num: 9, title: "Certificado de eficiencia energética", category: "Certificaciones Técnicas", allowedRoles: ["CON"] },
  { num: 10, title: "Ensayos de hormigón y acero", category: "Ensayos", allowedRoles: ["CON"] },
  { num: 11, title: "Certificados CE de materiales", category: "Certificaciones Materiales", allowedRoles: ["CON"] },
  { num: 12, title: "Libro de órdenes cerrado", category: "Documentación Legal", allowedRoles: ["CON"] },
  { num: 13, title: "Libro de incidencias cerrado", category: "Documentación Legal", allowedRoles: ["CON"] },
  { num: 14, title: "Plan de Seguridad y Salud aprobado", category: "Seguridad y Salud", allowedRoles: ["CON"] },
  { num: 15, title: "Seguro decenal / garantías", category: "Garantías", allowedRoles: ["CON"] },
  { num: 16, title: "Licencia de primera ocupación", category: "Documentación Legal", allowedRoles: ["CON"] },
];

const roleLabels: Record<string, string> = {
  DO: "Arquitecto", DEO: "Aparejador", CON: "Constructor", PRO: "Promotor", CSS: "Seguridad",
};

const CFOModule = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [claimDialog, setClaimDialog] = useState<{ open: boolean; item: any | null }>({ open: false, item: null });
  const [auditing, setAuditing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const isDEO = profile?.role === "DEO";
  const userRole = profile?.role as AppRole | undefined;

  const fetchItems = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("cfo_items")
      .select("*")
      .eq("project_id", projectId)
      .order("item_number", { ascending: true });

    if (data && data.length > 0) {
      setItems(data);
    } else {
      await initializeChecklist();
    }
    setLoading(false);
  }, [projectId]);

  const initializeChecklist = async () => {
    if (!projectId) return;
    const inserts = CFO_16_POINTS.map((pt) => ({
      project_id: projectId,
      category: pt.category,
      title: pt.title,
      sort_order: pt.num,
      item_number: pt.num,
      allowed_roles: pt.allowedRoles,
    }));

    const { data } = await supabase.from("cfo_items").insert(inserts).select();
    if (data) setItems(data);
  };

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const canUploadItem = (item: any): boolean => {
    if (!userRole) return false;
    const roles: string[] = item.allowed_roles || [];
    return roles.includes(userRole);
  };

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
      user_id: user.id, project_id: projectId,
      action: "cfo_item_completed",
      details: { item_id: itemId, file_name: file.name },
    });

    toast.success("Documento subido y marcado como completado");
    setUploadingId(null);
    fetchItems();
  };

  // DEO Audit scan
  const handleAudit = async () => {
    setAuditing(true);
    await fetchItems();
    setAuditing(false);
    const pending = items.filter((i) => !i.is_completed);
    if (pending.length === 0) {
      toast.success("✅ Todos los documentos están completos");
    } else {
      toast.warning(`⚠️ ${pending.length} documentos pendientes`);
    }

    if (user && projectId) {
      await supabase.from("audit_logs").insert({
        user_id: user.id, project_id: projectId,
        action: "cfo_audit_scan",
        details: { pending_count: items.filter((i) => !i.is_completed).length },
      });
    }
  };

  // Claim notification
  const handleClaim = async (item: any) => {
    if (!user || !projectId) return;

    // Find the responsible agents
    const allowedRoles: string[] = item.allowed_roles || ["CON"];
    const { data: members } = await supabase
      .from("project_members")
      .select("user_id, role")
      .eq("project_id", projectId)
      .eq("status", "accepted");

    const targets = (members || []).filter((m: any) => allowedRoles.includes(m.role) && m.user_id);

    for (const target of targets) {
      await supabase.from("notifications").insert({
        user_id: target.user_id,
        project_id: projectId,
        type: "cfo_claim",
        title: "⚠️ Reclamación de Documento CFO",
        message: `Atención: El DEO solicita la subida inmediata del documento pendiente: "${item.title}" (Punto ${item.item_number}). Este documento es indispensable para el cierre del CFO y la devolución de fianzas.`,
      });
    }

    await supabase.from("cfo_items").update({
      claimed_at: new Date().toISOString(),
      claimed_by: user.id,
    }).eq("id", item.id);

    await supabase.from("audit_logs").insert({
      user_id: user.id, project_id: projectId,
      action: "cfo_claim_sent",
      details: { item_title: item.title, item_number: item.item_number, target_roles: allowedRoles },
    });

    toast.success(`Reclamación enviada a ${allowedRoles.map((r: string) => roleLabels[r] || r).join(", ")}`);
    setClaimDialog({ open: false, item: null });
    fetchItems();
  };

  // DEO Validation
  const handleValidate = async (itemId: string) => {
    if (!user) return;
    await supabase.from("cfo_items").update({
      validated_by_deo: true,
      validated_at: new Date().toISOString(),
    }).eq("id", itemId);

    await supabase.from("audit_logs").insert({
      user_id: user.id, project_id: projectId,
      action: "cfo_item_validated",
      details: { item_id: itemId },
    });

    toast.success("Documento validado por DEO");
    fetchItems();
  };

  // Export CFO
  const handleExport = async () => {
    setExporting(true);
    const completedDocs = items.filter((i) => i.is_completed && i.file_url);
    const urls: string[] = [];

    for (const item of completedDocs) {
      const { data } = await supabase.storage.from("plans").download(item.file_url);
      if (data) {
        const url = URL.createObjectURL(data);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${String(item.item_number).padStart(2, "0")}_${item.file_name}`;
        a.click();
        URL.revokeObjectURL(url);
        urls.push(item.file_name);
      }
    }

    if (user && projectId) {
      await supabase.from("audit_logs").insert({
        user_id: user.id, project_id: projectId,
        action: "cfo_export",
        details: { files_count: urls.length },
      });
    }

    toast.success(`Descargados ${urls.length} documentos del expediente CFO`);
    setExporting(false);
  };

  const categories = [...new Set(CFO_16_POINTS.map((p) => p.category))];
  const totalItems = items.length;
  const completedItems = items.filter((i) => i.is_completed).length;
  const validatedItems = items.filter((i) => i.validated_by_deo).length;
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const allValidated = totalItems > 0 && validatedItems === totalItems;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">
            Gestión de Cierre — CFO
          </p>
        </div>

        <div className="flex items-end justify-between mb-4">
          <h1 className="font-display text-3xl font-bold tracking-tighter">Documentos Finales</h1>
          <div className="text-right">
            <p className="font-display text-2xl font-bold tracking-tighter text-success">{progress}%</p>
            <p className="text-xs text-muted-foreground">{completedItems}/{totalItems} · {validatedItems} validados</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-secondary rounded-full mb-4 overflow-hidden">
          <div className="h-full bg-success rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {isDEO && (
            <Button onClick={handleAudit} variant="outline" className="font-display text-xs uppercase tracking-wider gap-2" disabled={auditing}>
              <Shield className="h-4 w-4" />
              {auditing ? "Escaneando..." : "Auditoría de Archivo"}
            </Button>
          )}
          {allValidated && (
            <Button onClick={handleExport} className="font-display text-xs uppercase tracking-wider gap-2" disabled={exporting}>
              <Download className="h-4 w-4" />
              {exporting ? "Exportando..." : "Generar Expediente CFO"}
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-card border border-border rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {categories.map((cat) => {
              const catPoints = CFO_16_POINTS.filter((p) => p.category === cat);
              const catItems = catPoints.map((p) => items.find((i) => i.item_number === p.num)).filter(Boolean);
              const catCompleted = catItems.filter((i: any) => i.is_completed).length;

              return (
                <div key={cat} className="bg-card border border-border rounded-lg p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-display text-sm font-semibold uppercase tracking-wider">{cat}</h2>
                    <span className={`px-2 py-0.5 text-[10px] font-display uppercase tracking-widest rounded ${
                      catCompleted === catItems.length ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"
                    }`}>
                      {catCompleted}/{catItems.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {catPoints.map((pt) => {
                      const item = items.find((i) => i.item_number === pt.num);
                      if (!item) return null;
                      const isCompleted = item.is_completed;
                      const isValidated = item.validated_by_deo;
                      const canUpload_ = canUploadItem(item);
                      const isPending = !isCompleted;

                      return (
                        <div key={item.id} className={`flex items-center justify-between p-3 rounded border transition-all ${
                          isValidated ? "border-success/50 bg-success/10" :
                          isCompleted ? "border-success/30 bg-success/5" :
                          item.claimed_at ? "border-destructive/30 bg-destructive/5" :
                          "border-border hover:border-foreground/10"
                        }`}>
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {isValidated ? (
                              <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                            ) : isCompleted ? (
                              <CheckCircle2 className="h-5 w-5 text-success/60 shrink-0" />
                            ) : (
                              <Circle className="h-5 w-5 text-muted-foreground/30 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className={`text-sm ${isCompleted ? "text-success" : ""}`}>
                                <span className="font-display font-bold mr-2">{pt.num}.</span>
                                {pt.title}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {item.file_name && (
                                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <FileText className="h-3 w-3" /> {item.file_name}
                                  </span>
                                )}
                                <span className="text-[10px] text-muted-foreground/60">
                                  Responsable: {pt.allowedRoles.map((r) => roleLabels[r] || r).join(", ")}
                                </span>
                                {item.claimed_at && !isCompleted && (
                                  <span className="text-[10px] text-destructive font-display uppercase tracking-wider">
                                    Reclamado
                                  </span>
                                )}
                                {isValidated && (
                                  <span className="text-[10px] text-success font-display uppercase tracking-wider">
                                    ✓ Validado DEO
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {/* Upload button - only if user has the right role */}
                            {isPending && canUpload_ && (
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

                            {/* DEO: Validate completed items */}
                            {isDEO && isCompleted && !isValidated && (
                              <Button size="sm" variant="outline" onClick={() => handleValidate(item.id)} className="text-[10px] font-display uppercase tracking-widest gap-1 h-7">
                                <Shield className="h-3 w-3" /> Validar
                              </Button>
                            )}

                            {/* DEO: Claim pending items */}
                            {isDEO && isPending && (
                              <Button
                                size="sm" variant="ghost"
                                onClick={() => setClaimDialog({ open: true, item })}
                                className="text-[10px] font-display uppercase tracking-widest gap-1 h-7 text-destructive hover:text-destructive"
                              >
                                <Bell className="h-3 w-3" /> Reclamar
                              </Button>
                            )}

                            {/* Pending alert in audit mode */}
                            {isPending && auditing && (
                              <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-display uppercase tracking-widest bg-destructive/10 text-destructive rounded">
                                <AlertTriangle className="h-3 w-3" /> Pendiente
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Legal footer */}
        <p className="text-[10px] text-muted-foreground/50 text-center mt-8 font-display uppercase tracking-wider">
          Su actividad y conformidad están siendo registradas legalmente
        </p>
      </div>

      {/* Claim dialog */}
      <AlertDialog open={claimDialog.open} onOpenChange={(o) => setClaimDialog({ open: o, item: claimDialog.item })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">⚠️ Enviar Reclamación Legal</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Al leer esta notificación se registrará su acuse de recibo legal. ¿Desea continuar?</p>
              {claimDialog.item && (
                <div className="bg-secondary/50 p-3 rounded text-sm">
                  <p><strong>Documento:</strong> {claimDialog.item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Se enviará una notificación al agente responsable ({(claimDialog.item.allowed_roles || []).map((r: string) => roleLabels[r] || r).join(", ")}).
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-display text-xs uppercase tracking-wider">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => claimDialog.item && handleClaim(claimDialog.item)}
              className="font-display text-xs uppercase tracking-wider bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirmar Reclamación
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default CFOModule;
