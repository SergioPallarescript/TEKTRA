import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjectRole } from "@/hooks/useProjectRole";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { notifyUser } from "@/lib/notifications";
import { sanitizeFileName, uploadFileWithFallback } from "@/lib/storage";
import {
  ArrowLeft, CheckCircle2, Circle, Upload, FileText,
  Shield, Bell, Download, RefreshCw, Trash2, ChevronDown, ChevronUp, XCircle, Loader2,
  Plus, FolderOpen, Package,
} from "lucide-react";
import DocumentPreview from "@/components/DocumentPreview";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";

type AppRole = "DO" | "DEM" | "CON" | "PRO" | "CSS";

/* ── 5 LOE Folders ────────────────────────────────────────── */

interface FolderDef {
  index: number;
  title: string;
  icon: string;
}

const FOLDERS: FolderDef[] = [
  { index: 1, title: "Gestión Administrativa y Agentes", icon: "📋" },
  { index: 2, title: "Seguimiento de la Dirección (Diario Legal)", icon: "📖" },
  { index: 3, title: "Control de Calidad (Ensayos y Materiales)", icon: "🔬" },
  { index: 4, title: "Instalaciones y Eficiencia", icon: "⚡" },
  { index: 5, title: "Proyecto As-Built y Mantenimiento", icon: "🏗️" },
];

interface SlotDef {
  title: string;
  folderIndex: number;
  sortOrder: number;
  allowedRoles: AppRole[];
  agentLabel: string;
}

const DEFAULT_SLOTS: SlotDef[] = [
  // Folder 1 – Gestión Administrativa
  { title: "Acta de Recepción de la Obra", folderIndex: 1, sortOrder: 1, allowedRoles: ["DO", "DEM"], agentLabel: "Arquitecto / Arq. Técnico" },
  { title: "Certificado Final de Obra (CFO)", folderIndex: 1, sortOrder: 2, allowedRoles: ["DO", "DEM"], agentLabel: "Arquitecto / Arq. Técnico" },
  { title: "Relación de Agentes Intervinientes", folderIndex: 1, sortOrder: 3, allowedRoles: ["DO", "DEM"], agentLabel: "Arquitecto / Arq. Técnico" },
  { title: "Certificado de Gestión de Residuos", folderIndex: 1, sortOrder: 4, allowedRoles: ["CON"], agentLabel: "Constructor" },
  { title: "Licencia de Obra y Acta de Replanteo", folderIndex: 1, sortOrder: 5, allowedRoles: ["PRO"], agentLabel: "Promotor" },
  // Folder 2 – Seguimiento de la Dirección
  { title: "Libro de Órdenes (DEM)", folderIndex: 2, sortOrder: 1, allowedRoles: ["DEM"], agentLabel: "Arq. Técnico" },
  { title: "Libro de Órdenes (DO)", folderIndex: 2, sortOrder: 2, allowedRoles: ["DO"], agentLabel: "Arquitecto" },
  { title: "Libro de Incidencias (Cerrado y Firmado)", folderIndex: 2, sortOrder: 3, allowedRoles: ["CSS"], agentLabel: "Seguridad" },
  { title: "Certificado de Finalización de Coordinación de Seguridad", folderIndex: 2, sortOrder: 4, allowedRoles: ["CSS"], agentLabel: "Seguridad" },
  // Folder 3 – Control de Calidad
  { title: "Plan de Control de Calidad", folderIndex: 3, sortOrder: 1, allowedRoles: ["DEM"], agentLabel: "Arq. Técnico" },
  { title: "Ensayos de Laboratorio (Hormigón, Acero, Estanqueidad)", folderIndex: 3, sortOrder: 2, allowedRoles: ["CON"], agentLabel: "Constructor" },
  { title: "Fichas Técnicas y Marcado CE", folderIndex: 3, sortOrder: 3, allowedRoles: ["CON"], agentLabel: "Constructor" },
  { title: "Dossier de Carpintería y Vidrio", folderIndex: 3, sortOrder: 4, allowedRoles: ["CON"], agentLabel: "Constructor" },
  // Folder 4 – Instalaciones
  { title: "Certificados de Instalaciones (CIE, Fontanería, Gas)", folderIndex: 4, sortOrder: 1, allowedRoles: ["CON"], agentLabel: "Constructor" },
  { title: "Certificado de Eficiencia Energética (CEE) Final", folderIndex: 4, sortOrder: 2, allowedRoles: ["CON"], agentLabel: "Constructor" },
  { title: "Certificado de Telecomunicaciones (ICT)", folderIndex: 4, sortOrder: 3, allowedRoles: ["CON"], agentLabel: "Constructor" },
  { title: "Certificado de Climatización/RITE", folderIndex: 4, sortOrder: 4, allowedRoles: ["CON"], agentLabel: "Constructor" },
  // Folder 5 – As-Built
  { title: "Planos Finales \"As-Built\"", folderIndex: 5, sortOrder: 1, allowedRoles: ["DO", "DEM"], agentLabel: "Arquitecto / Arq. Técnico" },
  { title: "Manual de Uso y Mantenimiento", folderIndex: 5, sortOrder: 2, allowedRoles: ["DO", "DEM"], agentLabel: "Arquitecto / Arq. Técnico" },
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
  const [openFolders, setOpenFolders] = useState<Record<number, boolean>>({ 1: true, 2: true, 3: true, 4: true, 5: true });

  // New slot dialog
  const [newSlotOpen, setNewSlotOpen] = useState(false);
  const [newSlotTitle, setNewSlotTitle] = useState("");
  const [newSlotFolder, setNewSlotFolder] = useState("1");
  const [newSlotRole, setNewSlotRole] = useState<AppRole>("CON");

  const { isDEM, isDO, isAdmin, projectRole } = useProjectRole(projectId);
  const userRole = projectRole as AppRole | undefined;

  useEffect(() => { if (profile !== undefined) setProfileLoading(false); }, [profile]);

  const fetchItems = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase.from("cfo_items").select("*").eq("project_id", projectId).order("folder_index", { ascending: true }).order("sort_order", { ascending: true });
    if (data && data.length > 0) { setItems(data); setLoading(false); }
    else { await initializeChecklist(); setLoading(false); }
  }, [projectId]);

  const initializeChecklist = async () => {
    if (!projectId) return;
    const inserts = DEFAULT_SLOTS.map((slot, idx) => ({
      project_id: projectId,
      category: FOLDERS.find(f => f.index === slot.folderIndex)?.title || "",
      title: slot.title,
      sort_order: slot.sortOrder,
      item_number: idx + 1,
      allowed_roles: slot.allowedRoles,
      folder_index: slot.folderIndex,
      is_custom: false,
    }));
    const { data, error } = await supabase.from("cfo_items").insert(inserts).select();
    if (error) {
      const { data: retryData } = await supabase.from("cfo_items").select("*").eq("project_id", projectId).order("folder_index", { ascending: true }).order("sort_order", { ascending: true });
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

  const handleDeleteSlot = async (item: any) => {
    if (!projectId || !user || !isAdmin) return;
    const confirmed = window.confirm(`¿Eliminar el requerimiento "${item.title}"? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    try {
      if (item.file_url) await supabase.storage.from("plans").remove([item.file_url]);
      await supabase.from("cfo_items").delete().eq("id", item.id);
      toast.success("Requerimiento eliminado");
      fetchItems();
    } catch (e: any) { toast.error(e?.message || "Error al eliminar"); }
  };

  const handleAudit = async () => {
    setAuditing(true); await fetchItems();
    setTimeout(async () => {
      const pending = items.filter((i) => !i.is_completed);
      if (pending.length === 0) { toast.success("✅ Todos los documentos están completos"); }
      else {
        toast.warning(`⚠️ ${pending.length} documentos pendientes`);
        // Send claims per pending item
        if (user && projectId) {
          for (const pItem of pending) {
            const allowedRoles: string[] = pItem.allowed_roles || ["CON"];
            const { data: members } = await supabase.from("project_members").select("user_id, role").eq("project_id", projectId).eq("status", "accepted");
            const targets = (members || []).filter((m: any) => allowedRoles.includes(m.role) && m.user_id);
            for (const target of targets) {
              await notifyUser({
                userId: target.user_id, projectId,
                title: "⚠️ Auditoría CFO: Documento Pendiente",
                message: `El documento "${pItem.title}" sigue pendiente de entrega.`,
                type: "cfo_claim",
              });
            }
          }
        }
      }
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
        message: `Atención: Se solicita la subida inmediata del documento pendiente: "${item.title}".`,
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
        const folderName = FOLDERS.find(f => f.index === (item.folder_index || 1))?.title || "General";
        const url = URL.createObjectURL(data);
        const a = document.createElement("a"); a.href = url;
        a.download = `${folderName} - ${item.file_name}`;
        a.click(); URL.revokeObjectURL(url);
      }
    }
    if (user && projectId) {
      await supabase.from("audit_logs").insert({ user_id: user.id, project_id: projectId, action: "cfo_export_pack", details: { files_count: completedDocs.length } });
    }
    toast.success(`Descargados ${completedDocs.length} documentos del Pack CFO`); setExporting(false);
  };

  const handleCreateSlot = async () => {
    if (!projectId || !user || !newSlotTitle.trim()) return;
    const folderIdx = parseInt(newSlotFolder);
    const folderItems = items.filter(i => (i.folder_index || 1) === folderIdx);
    const maxSort = folderItems.reduce((max, i) => Math.max(max, i.sort_order || 0), 0);
    const maxItemNum = items.reduce((max, i) => Math.max(max, i.item_number || 0), 0);

    const { error } = await supabase.from("cfo_items").insert({
      project_id: projectId,
      category: FOLDERS.find(f => f.index === folderIdx)?.title || "",
      title: newSlotTitle.trim(),
      sort_order: maxSort + 1,
      item_number: maxItemNum + 1,
      allowed_roles: [newSlotRole],
      folder_index: folderIdx,
      is_custom: true,
      created_by_user: user.id,
    });
    if (error) { toast.error("Error al crear requerimiento"); return; }
    toast.success("Nuevo requerimiento creado");
    setNewSlotOpen(false); setNewSlotTitle(""); setNewSlotFolder("1"); setNewSlotRole("CON");
    fetchItems();
  };

  const toggleFolder = (idx: number) => {
    setOpenFolders(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

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
          {isAdmin && (
            <Button onClick={() => setNewSlotOpen(true)} variant="outline" className="font-display text-xs uppercase tracking-wider gap-2">
              <Plus className="h-4 w-4" /> Nuevo Requerimiento
            </Button>
          )}
          {isDEM && (
            <Button data-tour="cfo-audit" onClick={handleAudit} variant="outline" className="font-display text-xs uppercase tracking-wider gap-2" disabled={auditing}>
              <Shield className="h-4 w-4" /> {auditing ? "Escaneando..." : "Auditoría"}
            </Button>
          )}
          <Button onClick={handleExport} variant={allValidated ? "default" : "outline"} className="font-display text-xs uppercase tracking-wider gap-2" disabled={exporting || completedItems === 0}>
            <Package className="h-4 w-4" /> {exporting ? "Exportando..." : "Generar Pack Final"}
          </Button>
        </div>

        {/* ── 5 LOE Folders ───────────────────────────────── */}
        <div className="space-y-4">
          {FOLDERS.map((folder) => {
            const folderItems = items.filter(i => (i.folder_index || 1) === folder.index);
            const folderCompleted = folderItems.filter(i => i.is_completed).length;
            const folderValidated = folderItems.filter(i => i.validated_by_deo).length;
            const isOpen = openFolders[folder.index] ?? true;

            return (
              <Collapsible key={folder.index} open={isOpen} onOpenChange={() => toggleFolder(folder.index)}>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-4 bg-card border border-border rounded-lg cursor-pointer hover:border-foreground/10 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{folder.icon}</span>
                      <div>
                        <h2 className="font-display text-sm font-semibold uppercase tracking-wider">{folder.title}</h2>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{folderItems.length} documentos</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 text-[10px] font-display uppercase tracking-widest rounded ${folderCompleted === folderItems.length && folderItems.length > 0 ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"}`}>
                        {folderCompleted}/{folderItems.length}
                        {folderValidated > 0 && ` · ${folderValidated}✓`}
                      </span>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border border-t-0 border-border rounded-b-lg bg-card/50 p-3 space-y-2">
                    {folderItems.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">Sin documentos en esta carpeta</p>
                    )}
                    {folderItems.map((item) => {
                      const isCompleted = item.is_completed;
                      const isValidated = item.validated_by_deo;
                      const isRejected = !!item.rejection_reason && !isValidated;
                      const canUpload_ = canUploadItem(item);
                      const isPending = !isCompleted;
                      const canManageUploaded = canManageUploadedItem(item);
                      const isExpanded = expandedItem === item.id;
                      const isCustom = item.is_custom;

                      return (
                        <div key={item.id}>
                          <div
                            className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded border transition-all cursor-pointer gap-2 ${
                              isRejected ? "border-destructive/50 bg-destructive/5" :
                              isValidated ? "border-success/50 bg-success/10" :
                              isCompleted ? "border-success/30 bg-success/5" :
                              item.claimed_at ? "border-destructive/30 bg-destructive/5" : "border-border hover:border-foreground/10 hover:shadow-md"
                            }`}
                            onClick={() => isCompleted && item.file_url && togglePreview(item)}
                          >
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              {isRejected ? <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" /> :
                               isValidated ? <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" /> :
                               isCompleted ? <CheckCircle2 className="h-5 w-5 text-success/60 shrink-0 mt-0.5" /> :
                               <Circle className="h-5 w-5 text-muted-foreground/30 shrink-0 mt-0.5" />}
                              <div className="min-w-0">
                                <p className={`text-sm ${isRejected ? "text-destructive" : isCompleted ? "text-success" : ""}`}>
                                  {item.title}
                                  {isCustom && <span className="ml-2 text-[9px] bg-accent/50 text-accent-foreground px-1.5 py-0.5 rounded font-display uppercase tracking-wider">Personalizado</span>}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  {item.file_name && <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><FileText className="h-3 w-3" /> {item.file_name}</span>}
                                  {item.claimed_at && !isCompleted && <span className="text-[10px] text-destructive font-display uppercase tracking-wider">Reclamado</span>}
                                  {isValidated && <span className="text-[10px] text-success font-display uppercase tracking-wider">✓ Validado</span>}
                                  {isRejected && <span className="text-[10px] text-destructive font-display uppercase tracking-wider">✗ Rechazado</span>}
                                </div>
                                {isRejected && item.rejection_reason && (
                                  <p className="text-[10px] text-destructive mt-0.5">Motivo: {item.rejection_reason}</p>
                                )}
                                <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                                  Responsable: {(item.allowed_roles || []).map((r: string) => roleLabels[r] || r).join(" / ")}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 flex-wrap pl-8 sm:pl-0" onClick={e => e.stopPropagation()}>
                              {isPending && canUpload_ && (
                                <label className="cursor-pointer">
                                  <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileUpload(item.id, f); e.currentTarget.value = ""; }} />
                                  <span className={`flex items-center gap-1 px-2 py-1 text-[10px] font-display uppercase tracking-widest rounded border border-border hover:border-foreground/20 transition-colors cursor-pointer ${uploadingId === item.id ? "opacity-50" : ""}`}>
                                    <Upload className="h-3 w-3" /> {uploadingId === item.id ? "..." : "Subir"}
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
                              {isAdmin && isPending && (
                                <Button data-tour="cfo-reclaim" size="sm" variant="ghost" onClick={() => setClaimDialog({ open: true, item })} className="text-[10px] font-display uppercase tracking-widest gap-1 h-7 text-destructive hover:text-destructive">
                                  <Bell className="h-3 w-3" /> Reclamar
                                </Button>
                              )}
                              {isAdmin && isCustom && isPending && (
                                <Button size="sm" variant="ghost" onClick={() => handleDeleteSlot(item)} className="text-[10px] font-display uppercase tracking-widest gap-1 h-7 text-muted-foreground hover:text-destructive">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                              {isCompleted && item.file_url && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                </Button>
                              )}
                            </div>
                          </div>

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
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>

        <p className="text-[10px] text-muted-foreground/50 text-center mt-8 font-display uppercase tracking-wider">
          Su actividad y conformidad están siendo registradas legalmente
        </p>
      </div>

      {/* New Slot Dialog */}
      <Dialog open={newSlotOpen} onOpenChange={setNewSlotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Nuevo Requerimiento</DialogTitle>
            <DialogDescription>Crea un slot personalizado para un documento adicional.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Nombre del documento *</Label>
              <Input value={newSlotTitle} onChange={e => setNewSlotTitle(e.target.value)} placeholder="Ej: Certificado de puesta a tierra" />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Carpeta de destino</Label>
              <Select value={newSlotFolder} onValueChange={setNewSlotFolder}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FOLDERS.map(f => (
                    <SelectItem key={f.index} value={String(f.index)}>{f.icon} {f.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Rol responsable</Label>
              <Select value={newSlotRole} onValueChange={v => setNewSlotRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["DO", "DEM", "CON", "PRO", "CSS"] as AppRole[]).map(r => (
                    <SelectItem key={r} value={r}>{roleLabels[r]} ({r})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSlotOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateSlot} disabled={!newSlotTitle.trim()}>Crear Requerimiento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
