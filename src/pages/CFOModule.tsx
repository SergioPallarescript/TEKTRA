import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjectRole } from "@/hooks/useProjectRole";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { notifyUser } from "@/lib/notifications";
import { sanitizeFileName, uploadFileWithFallback } from "@/lib/storage";
import {
  ArrowLeft, CheckCircle2, Circle, Upload, FileText,
  Shield, Bell, Download, RefreshCw, Trash2, ChevronDown, ChevronUp, XCircle, Loader2, ScanLine,
} from "lucide-react";
import DocumentPreview from "@/components/DocumentPreview";
import DocumentScanner from "@/components/DocumentScanner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";

type AppRole = "DO" | "DEM" | "CON" | "PRO" | "CSS";

const CFO_16_POINTS: { num: number; title: string; category: string; allowedRoles: AppRole[]; agentLabel: string }[] = [
  { num: 1, title: "Identificación de subcontratas y trabajadores", category: "Gestión de Obra", allowedRoles: ["CON"], agentLabel: "Constructor" },
  { num: 2, title: "Certificado Final de Obra firmado por DO y DEM", category: "Certificaciones Técnicas", allowedRoles: ["DO", "DEM"], agentLabel: "Arquitecto / Arq. Técnico" },
  { num: 3, title: "Certificaciones de obra ejecutada", category: "Gestión de Obra", allowedRoles: ["CON"], agentLabel: "Constructor" },
  { num: 4, title: "Acta de recepción de obra", category: "Actas", allowedRoles: ["DO", "DEM", "CSS"], agentLabel: "Arquitecto / Arq. Técnico / Seguridad" },
  { num: 5, title: "Certificado de instalación eléctrica (Endesa)", category: "Certificaciones Instalaciones", allowedRoles: ["CON"], agentLabel: "Constructor" },
  { num: 6, title: "Certificado de instalación de agua (Aqualia)", category: "Certificaciones Instalaciones", allowedRoles: ["CON"], agentLabel: "Constructor" },
  { num: 7, title: "Certificado de telecomunicaciones", category: "Certificaciones Instalaciones", allowedRoles: ["CON"], agentLabel: "Constructor" },
  { num: 8, title: "Certificado de instalación de gas", category: "Certificaciones Instalaciones", allowedRoles: ["CON"], agentLabel: "Constructor" },
  { num: 9, title: "Certificado de eficiencia energética", category: "Certificaciones Técnicas", allowedRoles: ["CON"], agentLabel: "Constructor" },
  { num: 10, title: "Ensayos de hormigón y acero", category: "Ensayos", allowedRoles: ["CON"], agentLabel: "Constructor" },
  { num: 11, title: "Certificados CE de materiales", category: "Certificaciones Materiales", allowedRoles: ["CON"], agentLabel: "Constructor" },
  { num: 12, title: "Libro de órdenes cerrado", category: "Documentación Legal", allowedRoles: ["CON"], agentLabel: "Constructor" },
  { num: 13, title: "Libro de incidencias cerrado", category: "Documentación Legal", allowedRoles: ["CON"], agentLabel: "Constructor" },
  { num: 14, title: "Plan de Seguridad y Salud aprobado", category: "Seguridad y Salud", allowedRoles: ["CON"], agentLabel: "Constructor" },
  { num: 15, title: "Seguro decenal / garantías", category: "Garantías", allowedRoles: ["CON"], agentLabel: "Constructor" },
  { num: 16, title: "Licencia de primera ocupación", category: "Documentación Legal", allowedRoles: ["CON"], agentLabel: "Constructor" },
];

const roleLabels: Record<string, string> = {
  DO: "Arquitecto", DEM: "Arq. Técnico", CON: "Constructor", PRO: "Promotor", CSS: "Seguridad",
};

const CFOModule = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [claimDialog, setClaimDialog] = useState<{ open: boolean; item: any | null }>({ open: false, item: null });
  const [auditing, setAuditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; item: any | null }>({ open: false, item: null });
  const [rejectReason, setRejectReason] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanTargetItemId, setScanTargetItemId] = useState<string | null>(null);

  const { isDEM, projectRole } = useProjectRole(projectId);
  const userRole = projectRole as AppRole | undefined;

  useEffect(() => { if (profile !== undefined) setProfileLoading(false); }, [profile]);

  const fetchItems = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase.from("cfo_items").select("*").eq("project_id", projectId).order("item_number", { ascending: true });
    if (data && data.length > 0) { setItems(data); setLoading(false); }
    else { await initializeChecklist(); setLoading(false); }
  }, [projectId]);

  const initializeChecklist = async () => {
    if (!projectId) return;
    const inserts = CFO_16_POINTS.map((pt) => ({
      project_id: projectId, category: pt.category, title: pt.title,
      sort_order: pt.num, item_number: pt.num, allowed_roles: pt.allowedRoles,
    }));
    const { data, error } = await supabase.from("cfo_items").insert(inserts).select();
    if (error) {
      const { data: retryData } = await supabase.from("cfo_items").select("*").eq("project_id", projectId).order("item_number", { ascending: true });
      if (retryData) setItems(retryData);
    } else if (data) { setItems(data); }
  };

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const canUploadItem = (item: any): boolean => {
    if (!userRole) return false;
    return (item.allowed_roles || []).includes(userRole);
  };

  const canManageUploadedItem = (item: any): boolean => {
    if (!user) return false;
    return Boolean(item.is_completed && item.completed_by === user.id && !item.validated_by_deo);
  };

  const togglePreview = async (item: any) => {
    if (expandedItem === item.id) { setExpandedItem(null); return; }
    setExpandedItem(item.id);
    if (!previewUrls[item.id] && item.file_url) {
      const { data } = await supabase.storage.from("plans").download(item.file_url);
      if (data) {
        const url = URL.createObjectURL(data);
        setPreviewUrls(prev => ({ ...prev, [item.id]: url }));
      }
    }
  };

  const handleDownloadItem = async (item: any) => {
    const { data } = await supabase.storage.from("plans").download(item.file_url);
    if (!data) return;
    const url = URL.createObjectURL(data);
    const a = document.createElement("a"); a.href = url; a.download = item.file_name; a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (itemId: string, file: File) => {
    if (!projectId || !user) return;
    setUploadingId(itemId);
    const path = `cfo/${projectId}/${itemId}_${sanitizeFileName(file.name)}`;
    const { error: uploadError } = await uploadFileWithFallback({ path, file });
    if (uploadError) { toast.error(uploadError.message || "Error al subir archivo"); setUploadingId(null); return; }
    const { error: updateError } = await supabase.from("cfo_items").update({
      is_completed: true, completed_at: new Date().toISOString(), completed_by: user.id,
      file_url: path, file_name: file.name,
      rejection_reason: null, rejected_by: null, rejected_at: null,
    }).eq("id", itemId);
    if (updateError) { toast.error("Error al actualizar el documento"); setUploadingId(null); return; }
    await supabase.from("audit_logs").insert({ user_id: user.id, project_id: projectId, action: "cfo_item_completed", details: { item_id: itemId, file_name: file.name } });
    toast.success("Documento subido y marcado como completado");
    setUploadingId(null); fetchItems();
  };

  const handleReplaceFile = async (item: any, file: File) => {
    if (!projectId || !user || !canManageUploadedItem(item)) return;
    setUploadingId(item.id);
    try {
      const previousPath = item.file_url;
      const nextPath = `cfo/${projectId}/${item.id}_${Date.now()}_${sanitizeFileName(file.name)}`;
      const { error: uploadError } = await uploadFileWithFallback({ path: nextPath, file });
      if (uploadError) throw uploadError;
      const { error: updateError } = await supabase.from("cfo_items").update({
        file_url: nextPath, file_name: file.name,
        completed_at: new Date().toISOString(), completed_by: user.id,
        validated_by_deo: null, validated_at: null,
        rejection_reason: null, rejected_by: null, rejected_at: null,
      }).eq("id", item.id).eq("completed_by", user.id);
      if (updateError) throw updateError;
      if (previousPath && previousPath !== nextPath) await supabase.storage.from("plans").remove([previousPath]);
      // Clear cached preview
      if (previewUrls[item.id]) { URL.revokeObjectURL(previewUrls[item.id]); setPreviewUrls(prev => { const n = { ...prev }; delete n[item.id]; return n; }); }
      toast.success("Documento sustituido"); await fetchItems();
    } catch (error: any) { toast.error(error?.message || "Error al sustituir el documento"); }
    finally { setUploadingId(null); }
  };

  const handleDeleteFile = async (item: any) => {
    if (!projectId || !user || !canManageUploadedItem(item)) return;
    const confirmed = window.confirm("¿Quieres eliminar este documento para poder subir una versión corregida?");
    if (!confirmed) return;
    setUploadingId(item.id);
    try {
      if (item.file_url) await supabase.storage.from("plans").remove([item.file_url]);
      await supabase.from("cfo_items").update({
        is_completed: false, completed_at: null, completed_by: null,
        file_url: null, file_name: null, validated_by_deo: null, validated_at: null,
      }).eq("id", item.id).eq("completed_by", user.id);
      if (previewUrls[item.id]) { URL.revokeObjectURL(previewUrls[item.id]); setPreviewUrls(prev => { const n = { ...prev }; delete n[item.id]; return n; }); }
      setExpandedItem(null);
      toast.success("Documento eliminado"); await fetchItems();
    } catch (error: any) { toast.error(error?.message || "Error al eliminar el documento"); }
    finally { setUploadingId(null); }
  };

  const handleAudit = async () => {
    setAuditing(true); await fetchItems();
    setTimeout(() => {
      const pending = items.filter((i) => !i.is_completed);
      if (pending.length === 0) toast.success("✅ Todos los documentos están completos");
      else toast.warning(`⚠️ ${pending.length} documentos pendientes`);
      setAuditing(false);
    }, 500);
    if (user && projectId) {
      await supabase.from("audit_logs").insert({ user_id: user.id, project_id: projectId, action: "cfo_audit_scan", details: { pending_count: items.filter((i) => !i.is_completed).length } });
    }
  };

  const handleClaim = async (item: any) => {
    if (!user || !projectId) return;
    const allowedRoles: string[] = item.allowed_roles || ["CON"];
    const { data: members } = await supabase.from("project_members").select("user_id, role").eq("project_id", projectId).eq("status", "accepted");
    const targets = (members || []).filter((m: any) => allowedRoles.includes(m.role) && m.user_id);
    for (const target of targets) {
      await notifyUser({
        userId: target.user_id, projectId: projectId!,
        title: "⚠️ Reclamación de Documento CFO",
        message: `Atención: El DEM solicita la subida inmediata del documento pendiente: "${item.title}" (Punto ${item.item_number}).`,
        type: "cfo_claim",
      });
    }
    await supabase.from("cfo_items").update({ claimed_at: new Date().toISOString(), claimed_by: user.id }).eq("id", item.id);
    toast.success(`Reclamación enviada a ${allowedRoles.map((r: string) => roleLabels[r] || r).join(", ")}`);
    setClaimDialog({ open: false, item: null }); fetchItems();
  };

  const handleValidate = async (itemId: string) => {
    if (!user) return;
    await supabase.from("cfo_items").update({ validated_by_deo: true, validated_at: new Date().toISOString() }).eq("id", itemId);
    toast.success("Documento validado por DEM"); fetchItems();
  };

  const handleReject = async () => {
    if (!rejectDialog.item || !user) return;
    await supabase.from("cfo_items").update({
      validated_by_deo: false, validated_at: null,
      rejection_reason: rejectReason || "Sin motivo especificado",
      rejected_by: user.id, rejected_at: new Date().toISOString(),
    }).eq("id", rejectDialog.item.id);
    // Notify uploader
    if (rejectDialog.item.completed_by && projectId) {
      await notifyUser({
        userId: rejectDialog.item.completed_by, projectId,
        title: "❌ Documento CFO Rechazado",
        message: `El documento "${rejectDialog.item.title}" ha sido rechazado. Motivo: ${rejectReason || "Sin motivo especificado"}`,
        type: "cfo_rejection",
      });
    }
    toast.success("Documento rechazado");
    setRejectDialog({ open: false, item: null }); setRejectReason(""); fetchItems();
  };

  const handleExport = async () => {
    setExporting(true);
    const completedDocs = items.filter((i) => i.is_completed && i.file_url);
    for (const item of completedDocs) {
      const { data } = await supabase.storage.from("plans").download(item.file_url);
      if (data) {
        const url = URL.createObjectURL(data);
        const a = document.createElement("a"); a.href = url;
        a.download = `${String(item.item_number).padStart(2, "0")}_${item.file_name}`;
        a.click(); URL.revokeObjectURL(url);
      }
    }
    if (user && projectId) {
      await supabase.from("audit_logs").insert({ user_id: user.id, project_id: projectId, action: "cfo_export", details: { files_count: completedDocs.length } });
    }
    toast.success(`Descargados ${completedDocs.length} documentos del expediente CFO`); setExporting(false);
  };

  const categories = [...new Set(CFO_16_POINTS.map((p) => p.category))];
  const totalItems = items.length;
  const completedItems = items.filter((i) => i.is_completed).length;
  const validatedItems = items.filter((i) => i.validated_by_deo).length;
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const allValidated = totalItems > 0 && validatedItems === totalItems;

  if (profileLoading || loading) {
    return (
      <AppLayout>
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}><ArrowLeft className="h-4 w-4" /></Button>
            <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">Gestión de Cierre — CFO</p>
          </div>
          <div className="space-y-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-card border border-border rounded-lg animate-pulse" />)}</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}><ArrowLeft className="h-4 w-4" /></Button>
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">Gestión de Cierre — CFO</p>
        </div>
        <div className="flex items-end justify-between mb-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tighter">Documentos Finales</h1>
            <p className="text-xs text-muted-foreground mt-1">Tu rol: <span className="font-semibold">{roleLabels[userRole || ""] || userRole || "—"}</span></p>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-bold tracking-tighter text-success">{progress}%</p>
            <p className="text-xs text-muted-foreground">{completedItems}/{totalItems} · {validatedItems} validados</p>
          </div>
        </div>

        <div className="w-full h-2 bg-secondary rounded-full mb-4 overflow-hidden">
          <div className="h-full bg-success rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {isDEM && (
            <Button data-tour="cfo-audit" onClick={handleAudit} variant="outline" className="font-display text-xs uppercase tracking-wider gap-2" disabled={auditing}>
              <Shield className="h-4 w-4" /> {auditing ? "Escaneando..." : "Auditoría de Archivo"}
            </Button>
          )}
          {allValidated && (
            <Button onClick={handleExport} className="font-display text-xs uppercase tracking-wider gap-2" disabled={exporting}>
              <Download className="h-4 w-4" /> {exporting ? "Exportando..." : "Generar Expediente CFO"}
            </Button>
          )}
        </div>

        <div className="space-y-6">
          {categories.map((cat) => {
            const catPoints = CFO_16_POINTS.filter((p) => p.category === cat);
            const catItems = catPoints.map((p) => items.find((i) => i.item_number === p.num)).filter(Boolean);
            const catCompleted = catItems.filter((i: any) => i.is_completed).length;
            const catAgents = [...new Set(catPoints.map((p) => p.agentLabel))];
            return (
              <div key={cat} className="bg-card border border-border rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-sm font-semibold uppercase tracking-wider">{cat}</h2>
                  <span className={`px-2 py-0.5 text-[10px] font-display uppercase tracking-widest rounded ${catCompleted === catItems.length ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"}`}>
                    {catCompleted}/{catItems.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {catPoints.map((pt) => {
                    const item = items.find((i) => i.item_number === pt.num);
                    if (!item) return null;
                    const isCompleted = item.is_completed;
                    const isValidated = item.validated_by_deo;
                    const isRejected = !!item.rejection_reason && !isValidated;
                    const canUpload_ = canUploadItem(item);
                    const isPending = !isCompleted;
                    const canManageUploaded = canManageUploadedItem(item);
                    const isExpanded = expandedItem === item.id;

                    return (
                      <div key={item.id}>
                        <div
                          className={`flex items-center justify-between p-3 rounded border transition-all cursor-pointer ${
                            isRejected ? "border-destructive/50 bg-destructive/5" :
                            isValidated ? "border-success/50 bg-success/10" :
                            isCompleted ? "border-success/30 bg-success/5" :
                            item.claimed_at ? "border-destructive/30 bg-destructive/5" : "border-border hover:border-foreground/10 hover:shadow-md"
                          }`}
                          onClick={() => isCompleted && item.file_url && togglePreview(item)}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {isRejected ? <XCircle className="h-5 w-5 text-destructive shrink-0" /> :
                             isValidated ? <CheckCircle2 className="h-5 w-5 text-success shrink-0" /> :
                             isCompleted ? <CheckCircle2 className="h-5 w-5 text-success/60 shrink-0" /> :
                             <Circle className="h-5 w-5 text-muted-foreground/30 shrink-0" />}
                            <div className="min-w-0">
                              <p className={`text-sm ${isRejected ? "text-destructive" : isCompleted ? "text-success" : ""}`}>
                                <span className="font-display font-bold mr-2">{pt.num}.</span>{pt.title}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {item.file_name && <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><FileText className="h-3 w-3" /> {item.file_name}</span>}
                                {item.claimed_at && !isCompleted && <span className="text-[10px] text-destructive font-display uppercase tracking-wider">Reclamado</span>}
                                {isValidated && <span className="text-[10px] text-success font-display uppercase tracking-wider">✓ Validado DEM</span>}
                                {isRejected && <span className="text-[10px] text-destructive font-display uppercase tracking-wider">✗ Rechazado</span>}
                              </div>
                              {isRejected && item.rejection_reason && (
                                <p className="text-[10px] text-destructive mt-0.5">Motivo: {item.rejection_reason}</p>
                              )}
                              <p className="text-[10px] text-muted-foreground/50 mt-0.5">Responsable: {pt.agentLabel}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                            {isPending && canUpload_ && (
                              <label className="cursor-pointer">
                                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileUpload(item.id, f); e.currentTarget.value = ""; }} />
                                <span className={`flex items-center gap-1 px-2 py-1 text-[10px] font-display uppercase tracking-widest rounded border border-border hover:border-foreground/20 transition-colors cursor-pointer ${uploadingId === item.id ? "opacity-50" : ""}`}>
                                  <Upload className="h-3 w-3" /> {uploadingId === item.id ? "Subiendo..." : "Subir"}
                                </span>
                              </label>
                            )}
                            {isDEM && isCompleted && !isValidated && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => handleValidate(item.id)} className="text-[10px] font-display uppercase tracking-widest gap-1 h-7">
                                  <Shield className="h-3 w-3" /> Validar
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => { setRejectDialog({ open: true, item }); setRejectReason(""); }} className="text-[10px] font-display uppercase tracking-widest gap-1 h-7 text-destructive hover:text-destructive">
                                  <XCircle className="h-3 w-3" /> Rechazar
                                </Button>
                              </>
                            )}
                            {isDEM && isPending && (
                              <Button data-tour="cfo-reclaim" size="sm" variant="ghost" onClick={() => setClaimDialog({ open: true, item })} className="text-[10px] font-display uppercase tracking-widest gap-1 h-7 text-destructive hover:text-destructive">
                                <Bell className="h-3 w-3" /> Reclamar
                              </Button>
                            )}
                            {isCompleted && item.file_url && (
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Accordion preview */}
                        {isExpanded && isCompleted && item.file_url && (
                          <div className="border border-t-0 border-border rounded-b-lg p-4 bg-background animate-in slide-in-from-top-2 duration-200">
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                              <Button size="sm" variant="outline" onClick={() => handleDownloadItem(item)} className="text-[10px] font-display uppercase tracking-widest gap-1 h-7">
                                <Download className="h-3 w-3" /> Descargar
                              </Button>
                              {canManageUploaded && (
                                <>
                                  <label className="cursor-pointer">
                                    <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleReplaceFile(item, f); e.currentTarget.value = ""; }} />
                                    <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-display uppercase tracking-widest rounded border border-border hover:border-foreground/20 transition-colors cursor-pointer">
                                      <RefreshCw className="h-3 w-3" /> Sustituir
                                    </span>
                                  </label>
                                  <Button size="sm" variant="ghost" onClick={() => void handleDeleteFile(item)} className="text-[10px] font-display uppercase tracking-widest gap-1 h-7 text-destructive hover:text-destructive">
                                    <Trash2 className="h-3 w-3" /> Eliminar
                                  </Button>
                                </>
                              )}
                            </div>
                            {/* Preview area */}
                            {previewUrls[item.id] ? (
                              <DocumentPreview url={previewUrls[item.id]} fileName={item.file_name || ""} />
                            ) : (
                              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando previsualización...
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground/40 mt-3 pl-8">Agente encargado: {catAgents.join(" / ")}</p>
              </div>
            );
          })}
        </div>

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
            <AlertDialogAction onClick={() => claimDialog.item && handleClaim(claimDialog.item)} className="font-display text-xs uppercase tracking-wider bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Confirmar Reclamación
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject dialog */}
      <AlertDialog open={rejectDialog.open} onOpenChange={(o) => { if (!o) { setRejectDialog({ open: false, item: null }); setRejectReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">❌ Rechazar Documento</AlertDialogTitle>
            <AlertDialogDescription>
              Indica el motivo del rechazo. El agente responsable recibirá una notificación y deberá subir una versión corregida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Motivo de rechazo *</Label>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Indique el motivo del rechazo..." rows={3} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} disabled={!rejectReason.trim()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Rechazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default CFOModule;
