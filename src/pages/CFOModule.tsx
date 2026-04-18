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
  Plus, Edit2, BookOpen, Lock, AlertTriangle,
} from "lucide-react";
import DocumentPreview from "@/components/DocumentPreview";
import MultiFileSlotManager, { type CfoFile } from "@/components/MultiFileSlotManager";
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

/* ═══════════════════════════════════════════════════════════
   STRUCTURE: 2 Volumes – 8 Sections (folder_index 1-8)
   ═══════════════════════════════════════════════════════════ */

interface FolderDef {
  index: number;
  title: string;
  volume: 1 | 2;
  icon: string;
  sectionCode?: string;
}

const FOLDERS: FolderDef[] = [
  // Volume 1
  { index: 1, title: "Datos Identificativos y Registrales", volume: 1, icon: "I" },
  { index: 2, title: "Parte I — Características del Edificio", volume: 1, icon: "II" },
  { index: 3, title: "Parte II — Manual de Mantenimiento", volume: 1, icon: "III" },
  { index: 4, title: "Parte III — Plan de Emergencias", volume: 1, icon: "IV" },
  // Volume 2
  { index: 5, title: "A. Actas", volume: 2, icon: "A", sectionCode: "A" },
  { index: 6, title: "B. Licencias", volume: 2, icon: "B", sectionCode: "B" },
  { index: 7, title: "E. Documentos Técnicos Críticos", volume: 2, icon: "E", sectionCode: "E" },
  { index: 8, title: "F-G. Planos y Fichas Técnicas", volume: 2, icon: "FG", sectionCode: "FG" },
];

interface SlotDef {
  title: string;
  folderIndex: number;
  sortOrder: number;
  allowedRoles: AppRole[];
  agentLabel: string;
  slotType: "document" | "text" | "visual";
  isMandatory: boolean;
  volume: 1 | 2;
}

const DEFAULT_SLOTS: SlotDef[] = [
  /* ── Folder 1: Datos Identificativos (text slots) ───── */
  { title: "Municipio", folderIndex: 1, sortOrder: 1, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "text", isMandatory: true, volume: 1 },
  { title: "Emplazamiento", folderIndex: 1, sortOrder: 2, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "text", isMandatory: true, volume: 1 },
  { title: "Código Postal", folderIndex: 1, sortOrder: 3, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "text", isMandatory: true, volume: 1 },
  { title: "Referencia Catastral (NRC)", folderIndex: 1, sortOrder: 4, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "text", isMandatory: true, volume: 1 },
  { title: "Registro Nº", folderIndex: 1, sortOrder: 5, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "text", isMandatory: false, volume: 1 },
  { title: "Tomo", folderIndex: 1, sortOrder: 6, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "text", isMandatory: false, volume: 1 },
  { title: "Libro", folderIndex: 1, sortOrder: 7, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "text", isMandatory: false, volume: 1 },
  { title: "Folio", folderIndex: 1, sortOrder: 8, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "text", isMandatory: false, volume: 1 },
  { title: "Finca", folderIndex: 1, sortOrder: 9, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "text", isMandatory: false, volume: 1 },
  { title: "Póliza Decenal — Compañía", folderIndex: 1, sortOrder: 10, allowedRoles: ["PRO"], agentLabel: "Promotor", slotType: "text", isMandatory: false, volume: 1 },
  { title: "Póliza Decenal — Número", folderIndex: 1, sortOrder: 11, allowedRoles: ["PRO"], agentLabel: "Promotor", slotType: "text", isMandatory: false, volume: 1 },

  /* ── Folder 2: Parte I – Características ──────────── */
  { title: "Plano de Emplazamiento", folderIndex: 2, sortOrder: 1, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "visual", isMandatory: true, volume: 1 },
  { title: "Fotos de Fachada", folderIndex: 2, sortOrder: 2, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "visual", isMandatory: false, volume: 1 },
  { title: "Relación de Agentes Intervinientes", folderIndex: 2, sortOrder: 3, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "document", isMandatory: true, volume: 1 },
  { title: "Cuadro Cronológico de las Obras (Fechas y Licencias)", folderIndex: 2, sortOrder: 4, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "text", isMandatory: false, volume: 1 },
  { title: "Tabla de Superficies y Coeficientes", folderIndex: 2, sortOrder: 5, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "text", isMandatory: false, volume: 1 },
  { title: "Memoria Detallada de Materiales y Calidades", folderIndex: 2, sortOrder: 6, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "text", isMandatory: false, volume: 1 },

  /* ── Folder 3: Parte II – Mantenimiento ─────────── */
  { title: "Fichas de Mantenimiento — Limitaciones de Uso (L)", folderIndex: 3, sortOrder: 1, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "text", isMandatory: false, volume: 1 },
  { title: "Fichas de Mantenimiento — Instrucciones de Uso (I)", folderIndex: 3, sortOrder: 2, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "text", isMandatory: false, volume: 1 },
  { title: "Fichas de Mantenimiento — Prohibiciones (N)", folderIndex: 3, sortOrder: 3, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "text", isMandatory: false, volume: 1 },
  { title: "Fichas de Mantenimiento — Revisiones Periódicas (R)", folderIndex: 3, sortOrder: 4, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "text", isMandatory: false, volume: 1 },

  /* ── Folder 4: Parte III – Emergencias ──────────── */
  { title: "Protocolo de Actuación ante Incendio", folderIndex: 4, sortOrder: 1, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "text", isMandatory: false, volume: 1 },
  { title: "Protocolo de Actuación ante Inundación", folderIndex: 4, sortOrder: 2, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "text", isMandatory: false, volume: 1 },
  { title: "Protocolo de Actuación ante Sismo", folderIndex: 4, sortOrder: 3, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "text", isMandatory: false, volume: 1 },

  /* ── Folder 5: A. Actas ─────────────────────────── */
  { title: "Certificado Final de Obra (CFO)", folderIndex: 5, sortOrder: 1, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "document", isMandatory: true, volume: 2 },
  { title: "Acta de Replanteo", folderIndex: 5, sortOrder: 2, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "document", isMandatory: true, volume: 2 },
  { title: "Acta de Recepción (Terminada)", folderIndex: 5, sortOrder: 3, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "document", isMandatory: true, volume: 2 },

  /* ── Folder 6: B. Licencias ─────────────────────── */
  { title: "Declaración Responsable Urbanística", folderIndex: 6, sortOrder: 1, allowedRoles: ["PRO", "DO"], agentLabel: "Promotor / DO", slotType: "document", isMandatory: false, volume: 2 },
  { title: "Licencias Históricas", folderIndex: 6, sortOrder: 2, allowedRoles: ["PRO", "DO"], agentLabel: "Promotor / DO", slotType: "document", isMandatory: false, volume: 2 },

  /* ── Folder 7: E. Documentos Técnicos Críticos ──── */
  { title: "Certificado de Gestión de Residuos (RCD)", folderIndex: 7, sortOrder: 1, allowedRoles: ["CON"], agentLabel: "Constructor", slotType: "document", isMandatory: true, volume: 2 },
  { title: "Certificado de Eficiencia Energética (CEE) + Registro + Etiqueta", folderIndex: 7, sortOrder: 2, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "document", isMandatory: true, volume: 2 },
  { title: "Liquidación Final y Facturas de Obra", folderIndex: 7, sortOrder: 3, allowedRoles: ["CON"], agentLabel: "Constructor", slotType: "document", isMandatory: false, volume: 2 },
  { title: "Escrituras de Cambio de Uso y Modelo 900D (Catastro)", folderIndex: 7, sortOrder: 4, allowedRoles: ["PRO"], agentLabel: "Promotor", slotType: "document", isMandatory: false, volume: 2 },
  { title: "Certificados de Instalaciones (CIE, Fontanería, Gas)", folderIndex: 7, sortOrder: 5, allowedRoles: ["CON"], agentLabel: "Constructor", slotType: "document", isMandatory: false, volume: 2 },
  { title: "Certificado de Telecomunicaciones (ICT)", folderIndex: 7, sortOrder: 6, allowedRoles: ["CON"], agentLabel: "Constructor", slotType: "document", isMandatory: false, volume: 2 },
  { title: "Certificado de Climatización/RITE", folderIndex: 7, sortOrder: 7, allowedRoles: ["CON"], agentLabel: "Constructor", slotType: "document", isMandatory: false, volume: 2 },

  /* ── Folder 8: F-G. Planos y Fichas ─────────────── */
  { title: "Planos Finales As-Built", folderIndex: 8, sortOrder: 1, allowedRoles: ["DO", "DEM"], agentLabel: "DF", slotType: "document", isMandatory: true, volume: 2 },
  { title: "Fichas Técnicas de Materiales (Porcelánicos, Sanitarios, Aislantes, etc.)", folderIndex: 8, sortOrder: 2, allowedRoles: ["CON"], agentLabel: "Constructor", slotType: "document", isMandatory: false, volume: 2 },
  { title: "Marcado CE de Materiales", folderIndex: 8, sortOrder: 3, allowedRoles: ["CON"], agentLabel: "Constructor", slotType: "document", isMandatory: false, volume: 2 },
];

const roleLabels: Record<string, string> = {
  DO: "Director de Obra", DEM: "Director de Ejecución", CON: "Constructor", PRO: "Promotor", CSS: "Coordinador de Seguridad",
};

/* ═══════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════ */

const CFOModule = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<any[]>([]);
  const [filesByItem, setFilesByItem] = useState<Record<string, CfoFile[]>>({});
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
  const [openFolders, setOpenFolders] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    FOLDERS.forEach(f => { initial[f.index] = true; });
    return initial;
  });

  // New slot dialog
  const [newSlotOpen, setNewSlotOpen] = useState(false);
  const [newSlotTitle, setNewSlotTitle] = useState("");
  const [newSlotFolder, setNewSlotFolder] = useState("5");
  const [newSlotRole, setNewSlotRole] = useState<AppRole>("CON");
  const [newSlotType, setNewSlotType] = useState<"document" | "text">("document");
  const [newSlotMandatory, setNewSlotMandatory] = useState(false);

  // Edit slot dialog
  const [editSlotOpen, setEditSlotOpen] = useState(false);
  const [editSlotItem, setEditSlotItem] = useState<any | null>(null);
  const [editSlotTitle, setEditSlotTitle] = useState("");

  // Project info for PDF
  const [projectInfo, setProjectInfo] = useState<any>(null);

  const { isDEM, isDO, isAdmin, projectRole } = useProjectRole(projectId);
  const userRole = projectRole as AppRole | undefined;

  useEffect(() => { if (profile !== undefined) setProfileLoading(false); }, [profile]);

  useEffect(() => {
    if (!projectId) return;
    supabase.from("projects").select("name, address, referencia_catastral").eq("id", projectId).single().then(({ data }) => {
      if (data) setProjectInfo(data);
    });
  }, [projectId]);

  /* ── Migration: detect old 5-folder or old structure → new 8-folder ── */
  const migrateOldStructure = useCallback(async (existingItems: any[]) => {
    if (!projectId) return null;

    // Detect: if any item has folder_index > 5 we already have new structure
    const hasNewStructure = existingItems.some(i => i.folder_index > 5);
    if (hasNewStructure) return null;

    // Check if it's the old 5-folder LOE structure (folder_index 1-5 but no volume field set)
    // or the even older 16-slot structure (all folder_index=1)
    const nonCustom = existingItems.filter(i => !i.is_custom);
    const maxFolder = Math.max(...nonCustom.map(i => i.folder_index || 1), 0);

    // Preserve items with uploaded files
    const withFiles = existingItems.filter(i => i.is_completed && i.file_url);
    const withoutFiles = existingItems.filter(i => !(i.is_completed && i.file_url));
    const customItems = existingItems.filter(i => i.is_custom);

    // Delete non-custom empty items
    const emptyNonCustom = withoutFiles.filter(i => !i.is_custom);
    if (emptyNonCustom.length > 0) {
      await supabase.from("cfo_items").delete().in("id", emptyNonCustom.map(i => i.id));
    }

    // Try to map old files to new structure by title similarity
    for (const item of withFiles) {
      const titleLower = (item.title || "").toLowerCase();
      const match = DEFAULT_SLOTS.find(s => {
        const sLower = s.title.toLowerCase();
        return titleLower.includes(sLower.slice(0, 20)) || sLower.includes(titleLower.slice(0, 20));
      });
      if (match) {
        const folder = FOLDERS.find(f => f.index === match.folderIndex)!;
        await supabase.from("cfo_items").update({
          folder_index: match.folderIndex,
          sort_order: match.sortOrder,
          allowed_roles: match.allowedRoles,
          category: folder.title,
          slot_type: match.slotType,
          is_mandatory: match.isMandatory,
          volume: match.volume,
        }).eq("id", item.id);
      } else {
        // Put unmapped files in folder 7 (technical docs)
        await supabase.from("cfo_items").update({
          folder_index: 7, sort_order: 99, volume: 2, slot_type: "document",
        }).eq("id", item.id);
      }
    }

    // Insert new default slots that don't conflict
    const preservedTitles = new Set(withFiles.map(i => (i.title || "").toLowerCase()));
    const newInserts = DEFAULT_SLOTS
      .filter(slot => !preservedTitles.has(slot.title.toLowerCase()))
      .map((slot, idx) => ({
        project_id: projectId,
        category: FOLDERS.find(f => f.index === slot.folderIndex)!.title,
        title: slot.title,
        sort_order: slot.sortOrder,
        item_number: idx + 1,
        allowed_roles: slot.allowedRoles,
        folder_index: slot.folderIndex,
        is_custom: false,
        slot_type: slot.slotType,
        is_mandatory: slot.isMandatory,
        volume: slot.volume,
      }));

    if (newInserts.length > 0) {
      await supabase.from("cfo_items").insert(newInserts);
    }

    const { data: fresh } = await supabase.from("cfo_items").select("*")
      .eq("project_id", projectId)
      .order("folder_index", { ascending: true })
      .order("sort_order", { ascending: true });
    return fresh;
  }, [projectId]);

  const fetchItems = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase.from("cfo_items").select("*")
      .eq("project_id", projectId)
      .order("folder_index", { ascending: true })
      .order("sort_order", { ascending: true });
    if (data && data.length > 0) {
      const migrated = await migrateOldStructure(data);
      const finalItems = migrated || data;
      setItems(finalItems);

      // Load multi-files for all items in parallel
      const { data: filesData } = await supabase
        .from("cfo_item_files")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      const map: Record<string, CfoFile[]> = {};
      ((filesData as CfoFile[]) || []).forEach((f) => {
        if (!map[f.cfo_item_id]) map[f.cfo_item_id] = [];
        map[f.cfo_item_id].push(f);
      });
      setFilesByItem(map);
    } else {
      await initializeChecklist();
    }
    setLoading(false);
  }, [projectId, migrateOldStructure]);

  const initializeChecklist = async () => {
    if (!projectId) return;
    const inserts = DEFAULT_SLOTS.map((slot, idx) => ({
      project_id: projectId,
      category: FOLDERS.find(f => f.index === slot.folderIndex)!.title,
      title: slot.title,
      sort_order: slot.sortOrder,
      item_number: idx + 1,
      allowed_roles: slot.allowedRoles,
      folder_index: slot.folderIndex,
      is_custom: false,
      slot_type: slot.slotType,
      is_mandatory: slot.isMandatory,
      volume: slot.volume,
    }));
    const { data, error } = await supabase.from("cfo_items").insert(inserts).select();
    if (error) {
      const { data: retryData } = await supabase.from("cfo_items").select("*")
        .eq("project_id", projectId)
        .order("folder_index", { ascending: true })
        .order("sort_order", { ascending: true });
      if (retryData) setItems(retryData);
    } else if (data) {
      setItems(data);
    }
  };

  useEffect(() => { fetchItems(); }, [fetchItems]);

  /* ── Permissions ──────────────────────────────────── */
  const canUploadItem = (item: any): boolean => {
    if (!userRole) return false;
    // DF (DO/DEM) can upload to ANY slot
    if (isAdmin) return true;
    return (item.allowed_roles || []).includes(userRole);
  };

  // DF can manage (replace/delete) ANY uploaded file
  const canManageUploadedItem = (item: any): boolean => {
    if (!user) return false;
    if (isAdmin) return true;
    return Boolean(item.is_completed && item.completed_by === user.id && !item.validated_by_deo);
  };

  const canEditTextSlot = (item: any): boolean => {
    if (!userRole) return false;
    if (isAdmin) return true;
    return (item.allowed_roles || []).includes(userRole);
  };

  /* ── Slot type helpers ───────────────────────────── */
  const isTextSlot = (item: any) => item.slot_type === "text";
  const isVisualSlot = (item: any) => item.slot_type === "visual";
  const isDocumentSlot = (item: any) => !item.slot_type || item.slot_type === "document";

  const isSlotFilled = useCallback((item: any): boolean => {
    if (isTextSlot(item)) return !!(item.text_content && item.text_content.trim());
    // Document/visual slot is filled when at least 1 file exists
    const files = filesByItem[item.id] || [];
    if (files.length > 0) return true;
    // Legacy fallback for items not yet migrated visually
    return item.is_completed && !!item.file_url;
  }, [filesByItem]);

  const refreshFilesForItem = useCallback(async (itemId: string) => {
    if (!projectId) return;
    const { data } = await supabase
      .from("cfo_item_files")
      .select("*")
      .eq("cfo_item_id", itemId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setFilesByItem((prev) => ({ ...prev, [itemId]: (data as CfoFile[]) || [] }));
  }, [projectId]);
  /* ── Handlers ─────────────────────────────────────── */
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
    const path = `cfo/${projectId}/${itemId}_${Date.now()}_${sanitizeFileName(file.name)}`;
    const { error: uploadError } = await uploadFileWithFallback({ path, file });
    if (uploadError) { toast.error(uploadError.message || "Error al subir archivo"); setUploadingId(null); return; }
    const { error: updateError } = await supabase.from("cfo_items").update({
      is_completed: true, completed_at: new Date().toISOString(), completed_by: user.id,
      file_url: path, file_name: file.name,
      rejection_reason: null, rejected_by: null, rejected_at: null,
    }).eq("id", itemId);
    if (updateError) { toast.error("Error al actualizar el documento"); setUploadingId(null); return; }
    await supabase.from("audit_logs").insert({ user_id: user.id, project_id: projectId, action: "cfo_item_completed", details: { item_id: itemId, file_name: file.name } });
    toast.success("Documento subido correctamente");
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
      }).eq("id", item.id);
      if (updateError) throw updateError;
      if (previousPath && previousPath !== nextPath) await supabase.storage.from("plans").remove([previousPath]);
      if (previewUrls[item.id]) { URL.revokeObjectURL(previewUrls[item.id]); setPreviewUrls(prev => { const n = { ...prev }; delete n[item.id]; return n; }); }
      toast.success("Documento sustituido"); await fetchItems();
    } catch (error: any) { toast.error(error?.message || "Error al sustituir"); }
    finally { setUploadingId(null); }
  };

  const handleDeleteFile = async (item: any) => {
    if (!projectId || !user || !canManageUploadedItem(item)) return;
    const confirmed = window.confirm("¿Quieres eliminar este documento?");
    if (!confirmed) return;
    setUploadingId(item.id);
    try {
      if (item.file_url) await supabase.storage.from("plans").remove([item.file_url]);
      await supabase.from("cfo_items").update({
        is_completed: false, completed_at: null, completed_by: null,
        file_url: null, file_name: null, validated_by_deo: null, validated_at: null,
      }).eq("id", item.id);
      if (previewUrls[item.id]) { URL.revokeObjectURL(previewUrls[item.id]); setPreviewUrls(prev => { const n = { ...prev }; delete n[item.id]; return n; }); }
      setExpandedItem(null);
      toast.success("Documento eliminado"); await fetchItems();
    } catch (error: any) { toast.error(error?.message || "Error al eliminar"); }
    finally { setUploadingId(null); }
  };

  const handleDeleteSlot = async (item: any) => {
    if (!projectId || !user || !isAdmin) return;
    const confirmed = window.confirm(`¿Eliminar "${item.title}"? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    try {
      if (item.file_url) await supabase.storage.from("plans").remove([item.file_url]);
      await supabase.from("cfo_items").delete().eq("id", item.id);
      toast.success("Requerimiento eliminado");
      fetchItems();
    } catch (e: any) { toast.error(e?.message || "Error al eliminar"); }
  };

  const handleEditSlot = async () => {
    if (!editSlotItem || !editSlotTitle.trim()) return;
    await supabase.from("cfo_items").update({ title: editSlotTitle.trim() }).eq("id", editSlotItem.id);
    toast.success("Nombre actualizado");
    setEditSlotOpen(false); setEditSlotItem(null); setEditSlotTitle("");
    fetchItems();
  };

  const handleSaveTextContent = async (itemId: string, textContent: string) => {
    if (!user || !projectId) return;
    await supabase.from("cfo_items").update({
      text_content: textContent,
      is_completed: !!textContent.trim(),
      completed_at: textContent.trim() ? new Date().toISOString() : null,
      completed_by: textContent.trim() ? user.id : null,
    }).eq("id", itemId);
    toast.success("Guardado");
    fetchItems();
  };

  const handleAudit = async () => {
    setAuditing(true); await fetchItems();
    setTimeout(async () => {
      const pending = items.filter((i) => !isSlotFilled(i));
      if (pending.length === 0) { toast.success("Todos los documentos están completos"); }
      else {
        const mandatoryPending = pending.filter(i => i.is_mandatory);
        toast.warning(`${pending.length} documentos pendientes (${mandatoryPending.length} obligatorios)`);
        if (user && projectId) {
          for (const pItem of pending) {
            const allowedRoles: string[] = pItem.allowed_roles || ["CON"];
            const { data: members } = await supabase.from("project_members").select("user_id, role").eq("project_id", projectId).eq("status", "accepted");
            const targets = (members || []).filter((m: any) => allowedRoles.includes(m.role) && m.user_id);
            for (const target of targets) {
              await notifyUser({
                userId: target.user_id, projectId,
                title: "Auditoría LdE: Documento Pendiente",
                message: `El documento "${pItem.title}" sigue pendiente de entrega.${pItem.is_mandatory ? " (OBLIGATORIO)" : ""}`,
                type: "cfo_claim",
              });
            }
          }
        }
      }
      setAuditing(false);
    }, 500);
    if (user && projectId) {
      await supabase.from("audit_logs").insert({ user_id: user.id, project_id: projectId, action: "cfo_audit_scan", details: { pending_count: items.filter((i) => !isSlotFilled(i)).length } });
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
        title: "Reclamación de Documento LdE",
        message: `Atención: Se solicita la subida inmediata del documento pendiente: "${item.title}".`,
        type: "cfo_claim",
      });
    }
    await supabase.from("cfo_items").update({ claimed_at: new Date().toISOString(), claimed_by: user.id }).eq("id", item.id);
    toast.success("Reclamación enviada");
    setClaimDialog({ open: false, item: null }); fetchItems();
  };

  const handleValidate = async (itemId: string) => {
    if (!user) return;
    await supabase.from("cfo_items").update({ validated_by_deo: true, validated_at: new Date().toISOString() }).eq("id", itemId);
    toast.success("Documento validado"); fetchItems();
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
        title: "Documento LdE Rechazado",
        message: `El documento "${rejectDialog.item.title}" ha sido rechazado. Motivo: ${rejectReason || "Sin motivo especificado"}`,
        type: "cfo_rejection",
      });
    }
    toast.success("Documento rechazado");
    setRejectDialog({ open: false, item: null }); setRejectReason(""); fetchItems();
  };

  /* ── Create Custom Slot ────────────────────────────── */
  const handleCreateSlot = async () => {
    if (!projectId || !user || !newSlotTitle.trim()) return;
    const folderIdx = parseInt(newSlotFolder);
    const folder = FOLDERS.find(f => f.index === folderIdx)!;
    const folderItems = items.filter(i => (i.folder_index || 1) === folderIdx);
    const maxSort = folderItems.reduce((max, i) => Math.max(max, i.sort_order || 0), 0);
    const maxItemNum = items.reduce((max, i) => Math.max(max, i.item_number || 0), 0);

    const { error } = await supabase.from("cfo_items").insert({
      project_id: projectId,
      category: folder.title,
      title: newSlotTitle.trim(),
      sort_order: maxSort + 1,
      item_number: maxItemNum + 1,
      allowed_roles: [newSlotRole],
      folder_index: folderIdx,
      is_custom: true,
      created_by_user: user.id,
      slot_type: newSlotType,
      is_mandatory: newSlotMandatory,
      volume: folder.volume,
    });
    if (error) { toast.error("Error al crear requerimiento"); return; }

    // Notify assigned agent
    const { data: members } = await supabase.from("project_members").select("user_id, role").eq("project_id", projectId).eq("status", "accepted");
    const targets = (members || []).filter((m: any) => m.role === newSlotRole && m.user_id && m.user_id !== user.id);
    for (const target of targets) {
      await notifyUser({
        userId: target.user_id, projectId,
        title: "Nueva Tarea Pendiente — LdE",
        message: `Se te ha asignado un nuevo requerimiento: "${newSlotTitle.trim()}"`,
        type: "cfo_claim",
      });
    }

    toast.success("Nuevo requerimiento creado");
    setNewSlotOpen(false); setNewSlotTitle(""); setNewSlotFolder("5"); setNewSlotRole("CON"); setNewSlotType("document"); setNewSlotMandatory(false);
    fetchItems();
  };

  /* ── Compilation Check ─────────────────────────────── */
  const mandatoryItems = items.filter(i => i.is_mandatory);
  const mandatoryFilled = mandatoryItems.filter(i => isSlotFilled(i));
  const canCompile = mandatoryItems.length > 0 && mandatoryFilled.length === mandatoryItems.length;
  const missingMandatory = mandatoryItems.filter(i => !isSlotFilled(i));

  /* ── PDF Export: Libro del Edificio (2 Volumes) ────── */
  const handleExportPDF = async () => {
    if (!canCompile) {
      toast.error(`No se puede compilar. Faltan ${missingMandatory.length} documentos obligatorios: ${missingMandatory.map(m => m.title).join(", ")}`);
      return;
    }
    setExporting(true);
    try {
      const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const projectName = projectInfo?.name || "Proyecto";
      const projectAddress = projectInfo?.address || "";
      const refCatastral = projectInfo?.referencia_catastral || "";
      const today = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });

      // Get registration data from text slots
      const getTextValue = (title: string) => {
        const item = items.find(i => i.title === title && isTextSlot(i));
        return item?.text_content?.trim() || "";
      };

      const registroData = {
        municipio: getTextValue("Municipio"),
        emplazamiento: getTextValue("Emplazamiento"),
        cp: getTextValue("Código Postal"),
        nrc: getTextValue("Referencia Catastral (NRC)") || refCatastral,
        registro: getTextValue("Registro Nº"),
        tomo: getTextValue("Tomo"),
        libro: getTextValue("Libro"),
        folio: getTextValue("Folio"),
        finca: getTextValue("Finca"),
        polizaCompania: getTextValue("Póliza Decenal — Compañía"),
        polizaNumero: getTextValue("Póliza Decenal — Número"),
      };

      const addFooter = (page: any, pageNum: number, totalPages: number) => {
        const { width } = page.getSize();
        page.drawText(projectName, { x: 50, y: 25, size: 7, font, color: rgb(0.5, 0.5, 0.5) });
        page.drawText(`Pagina ${pageNum} de ${totalPages}`, { x: width - 130, y: 25, size: 7, font, color: rgb(0.5, 0.5, 0.5) });
      };

      /* ── COVER: Volume 1 ── */
      const coverV1 = pdfDoc.addPage([595, 842]);
      const { height: ch } = coverV1.getSize();
      coverV1.drawText("LIBRO DEL EDIFICIO", { x: 50, y: ch - 180, size: 28, font: fontBold, color: rgb(0, 0, 0) });
      coverV1.drawText("VOLUMEN 1 — EL CUERPO DEL LIBRO", { x: 50, y: ch - 215, size: 14, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      coverV1.drawText("Partes I, II y III", { x: 50, y: ch - 240, size: 11, font, color: rgb(0.4, 0.4, 0.4) });
      coverV1.drawLine({ start: { x: 50, y: ch - 260 }, end: { x: 545, y: ch - 260 }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
      coverV1.drawText(projectName, { x: 50, y: ch - 300, size: 18, font: fontBold });
      if (projectAddress) coverV1.drawText(projectAddress, { x: 50, y: ch - 325, size: 11, font, color: rgb(0.3, 0.3, 0.3) });
      if (registroData.nrc) coverV1.drawText(`Ref. Catastral: ${registroData.nrc}`, { x: 50, y: ch - 350, size: 11, font, color: rgb(0.4, 0.4, 0.4) });
      if (registroData.municipio) coverV1.drawText(`Municipio: ${registroData.municipio}`, { x: 50, y: ch - 375, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
      if (registroData.registro) {
        coverV1.drawText(`Registro: ${registroData.registro} | Tomo: ${registroData.tomo} | Libro: ${registroData.libro} | Folio: ${registroData.folio} | Finca: ${registroData.finca}`, { x: 50, y: ch - 400, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      }
      coverV1.drawText(`Fecha de emision: ${today}`, { x: 50, y: ch - 450, size: 10, font, color: rgb(0.5, 0.5, 0.5) });

      // Collect all content pages for TOC calculation
      // TOC levels: 0 = volume header, 1 = folder/slot, 2 = nested file (custom_title)
      interface TocEntry { title: string; page: number; level: 0 | 1 | 2; volume: number; }
      const tocEntries: TocEntry[] = [];
      const vol1Folders = FOLDERS.filter(f => f.volume === 1);
      const vol2Folders = FOLDERS.filter(f => f.volume === 2);

      // Pre-load all multi-files per slot with page counts
      interface SlotFileBlob { file: CfoFile; blob: Blob; pageCount: number; }
      const slotFilesMap: Map<string, SlotFileBlob[]> = new Map();
      for (const item of items) {
        const itemFiles = filesByItem[item.id] || [];
        const blobs: SlotFileBlob[] = [];
        for (const file of itemFiles) {
          const { data } = await supabase.storage.from("plans").download(file.file_url);
          if (!data) continue;
          const ext = (file.file_name || "").toLowerCase();
          if (ext.endsWith(".pdf")) {
            try {
              const arrBuf = await data.arrayBuffer();
              const srcDoc = await PDFDocument.load(arrBuf);
              blobs.push({ file, blob: data, pageCount: srcDoc.getPageCount() });
            } catch { blobs.push({ file, blob: data, pageCount: 1 }); }
          } else {
            blobs.push({ file, blob: data, pageCount: 1 });
          }
        }
        slotFilesMap.set(item.id, blobs);
      }

      // Calculate TOC entry count
      let tocEntryCount = 2; // 2 volume headers
      for (const folder of FOLDERS) {
        tocEntryCount++; // folder
        const folderItems = items.filter(i => (i.folder_index || 1) === folder.index);
        const textItems = folderItems.filter(i => isTextSlot(i) && i.text_content?.trim());
        const docItems = folderItems.filter(i => !isTextSlot(i) && (slotFilesMap.get(i.id) || []).length > 0);
        if (textItems.length > 0) tocEntryCount++;
        for (const di of docItems) {
          tocEntryCount++;
          tocEntryCount += (slotFilesMap.get(di.id) || []).length;
        }
      }
      const tocLinesPerPage = Math.floor((842 - 120) / 16);
      const tocPageCount = Math.max(1, Math.ceil(tocEntryCount / tocLinesPerPage));

      // Page counting: Cover V1 (1) + TOC pages + content...
      let currentPage = 1 + tocPageCount + 1;

      // Volume 1 entries
      tocEntries.push({ title: "VOLUMEN 1 — CUERPO DEL LIBRO", page: currentPage, level: 0, volume: 1 });
      for (const folder of vol1Folders) {
        tocEntries.push({ title: folder.title, page: currentPage, level: 1, volume: 1 });
        currentPage++; // section separator
        const folderItems = items.filter(i => (i.folder_index || 1) === folder.index);
        const textItems = folderItems.filter(i => isTextSlot(i) && i.text_content?.trim());
        if (textItems.length > 0) {
          tocEntries.push({ title: "Datos de texto", page: currentPage, level: 2, volume: 1 });
          currentPage++;
        }
        const docItems = folderItems.filter(i => !isTextSlot(i) && (slotFilesMap.get(i.id) || []).length > 0);
        for (const di of docItems) {
          tocEntries.push({ title: di.title, page: currentPage, level: 1, volume: 1 });
          for (const sf of slotFilesMap.get(di.id) || []) {
            tocEntries.push({ title: sf.file.custom_title, page: currentPage, level: 2, volume: 1 });
            currentPage += sf.pageCount;
          }
        }
      }

      // Volume 2 cover
      tocEntries.push({ title: "VOLUMEN 2 — ARCHIVO VIVO (Parte IV)", page: currentPage, level: 0, volume: 2 });
      currentPage++;

      // Volume 2 entries
      for (const folder of vol2Folders) {
        tocEntries.push({ title: folder.title, page: currentPage, level: 1, volume: 2 });
        currentPage++;
        const folderItems = items.filter(i => (i.folder_index || 1) === folder.index);
        const docItems = folderItems.filter(i => !isTextSlot(i) && (slotFilesMap.get(i.id) || []).length > 0);
        for (const di of docItems) {
          tocEntries.push({ title: di.title, page: currentPage, level: 1, volume: 2 });
          for (const sf of slotFilesMap.get(di.id) || []) {
            tocEntries.push({ title: sf.file.custom_title, page: currentPage, level: 2, volume: 2 });
            currentPage += sf.pageCount;
          }
        }
      }

      const totalPages = currentPage - 1;

      /* ── TOC Pages (hierarchical: volume → folder/slot → custom file) ── */
      let tocY = 842 - 90;
      let currentTocPage = pdfDoc.addPage([595, 842]);
      currentTocPage.drawText("INDICE GENERAL", { x: 50, y: 842 - 55, size: 16, font: fontBold });

      const indents = { 0: 50, 1: 65, 2: 90 } as const;
      const sizes = { 0: 11, 1: 10, 2: 8 } as const;
      const spacing = { 0: 24, 1: 18, 2: 14 } as const;

      const embedDocument = async (
        title: string,
        fileName: string,
        blob: Blob,
      ) => {
        const ext = (fileName || "").toLowerCase();
        if (ext.endsWith(".pdf")) {
          try {
            const arrBuf = await blob.arrayBuffer();
            const srcDoc = await PDFDocument.load(arrBuf);
            const copiedPages = await pdfDoc.copyPages(srcDoc, srcDoc.getPageIndices());
            copiedPages.forEach((p) => pdfDoc.addPage(p));
          } catch {
            const errPage = pdfDoc.addPage([595, 842]);
            errPage.drawText(`Documento: ${title}`, { x: 50, y: 780, size: 12, font: fontBold });
            errPage.drawText(`Archivo: ${fileName} (no embebible)`, { x: 50, y: 760, size: 10, font, color: rgb(0.5, 0.5, 0.5) });
          }
        } else if (ext.endsWith(".jpg") || ext.endsWith(".jpeg") || ext.endsWith(".png")) {
          try {
            const arrBuf = await blob.arrayBuffer();
            const image = ext.endsWith(".png") ? await pdfDoc.embedPng(arrBuf) : await pdfDoc.embedJpg(arrBuf);
            const imgPage = pdfDoc.addPage([595, 842]);
            const imgDims = image.scaleToFit(495, 700);
            imgPage.drawImage(image, { x: (595 - imgDims.width) / 2, y: (842 - imgDims.height) / 2, width: imgDims.width, height: imgDims.height });
            imgPage.drawText(title, { x: 50, y: 820, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
          } catch {
            const errPage = pdfDoc.addPage([595, 842]);
            errPage.drawText(`Imagen: ${fileName} (error)`, { x: 50, y: 780, size: 10, font });
          }
        } else {
          const docPage = pdfDoc.addPage([595, 842]);
          docPage.drawText(`Documento: ${title}`, { x: 50, y: 780, size: 12, font: fontBold });
          docPage.drawText(`Archivo: ${fileName}`, { x: 50, y: 760, size: 10, font, color: rgb(0.5, 0.5, 0.5) });
        }
      };

      for (const entry of tocEntries) {
        if (tocY < 55) {
          currentTocPage = pdfDoc.addPage([595, 842]);
          tocY = 842 - 55;
        }
        const x = indents[entry.level];
        const size = sizes[entry.level];
        const useFont = entry.level === 0 ? fontBold : entry.level === 1 ? fontBold : font;
        const prefix = entry.level === 2 ? "→ " : "";
        const label = `${prefix}${entry.title}`;
        const pageLabel = `Pag. ${entry.page}`;
        const labelWidth = useFont.widthOfTextAtSize(label, size);
        const pageWidth = font.widthOfTextAtSize(pageLabel, 8);
        const dotsStart = x + labelWidth + 4;
        const dotsEnd = 545 - pageWidth - 4;
        const dotStr = ".".repeat(Math.max(0, Math.floor((dotsEnd - dotsStart) / 3)));
        currentTocPage.drawText(label, { x, y: tocY, size, font: useFont, color: rgb(0, 0, 0) });
        if (dotStr.length > 0) currentTocPage.drawText(dotStr, { x: dotsStart, y: tocY, size: 7, font, color: rgb(0.7, 0.7, 0.7) });
        currentTocPage.drawText(pageLabel, { x: 545 - pageWidth, y: tocY, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
        tocY -= spacing[entry.level];
      }

      /* ── Volume 1 Content ── */
      for (const folder of vol1Folders) {
        // Separator page
        const sepPage = pdfDoc.addPage([595, 842]);
        const { width: sw, height: sh } = sepPage.getSize();
        sepPage.drawText(folder.icon, { x: sw / 2 - 20, y: sh / 2 + 40, size: 28, font: fontBold, color: rgb(0.8, 0.8, 0.8) });
        sepPage.drawText(folder.title.toUpperCase(), { x: 50, y: sh / 2 - 10, size: 14, font: fontBold });
        sepPage.drawText("Volumen 1", { x: 50, y: sh / 2 - 35, size: 10, font, color: rgb(0.5, 0.5, 0.5) });

        const folderItems = items.filter((i) => (i.folder_index || 1) === folder.index);

        // Text content page
        const textItems = folderItems.filter((i) => isTextSlot(i) && i.text_content?.trim());
        if (textItems.length > 0) {
          const textPage = pdfDoc.addPage([595, 842]);
          let ty = 842 - 60;
          textPage.drawText(folder.title, { x: 50, y: ty, size: 12, font: fontBold });
          ty -= 30;
          for (const ti of textItems) {
            if (ty < 80) { ty = 842 - 60; }
            textPage.drawText(`${ti.title}:`, { x: 50, y: ty, size: 9, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
            ty -= 14;
            const lines = (ti.text_content || "").split("\n");
            for (const line of lines) {
              if (ty < 50) break;
              textPage.drawText(line.slice(0, 90), { x: 60, y: ty, size: 9, font, color: rgb(0, 0, 0) });
              ty -= 13;
            }
            ty -= 8;
          }
        }

        // Multi-files per slot
        const docItems = folderItems.filter((i) => !isTextSlot(i) && (slotFilesMap.get(i.id) || []).length > 0);
        for (const di of docItems) {
          for (const sf of slotFilesMap.get(di.id) || []) {
            await embedDocument(sf.file.custom_title, sf.file.file_name, sf.blob);
          }
        }
      }

      /* ── COVER: Volume 2 ── */
      const coverV2 = pdfDoc.addPage([595, 842]);
      coverV2.drawText("LIBRO DEL EDIFICIO", { x: 50, y: ch - 180, size: 28, font: fontBold });
      coverV2.drawText("VOLUMEN 2 — ARCHIVO VIVO", { x: 50, y: ch - 215, size: 14, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      coverV2.drawText("Parte IV — Registro Documental", { x: 50, y: ch - 240, size: 11, font, color: rgb(0.4, 0.4, 0.4) });
      coverV2.drawLine({ start: { x: 50, y: ch - 260 }, end: { x: 545, y: ch - 260 }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
      coverV2.drawText(projectName, { x: 50, y: ch - 300, size: 18, font: fontBold });
      if (projectAddress) coverV2.drawText(projectAddress, { x: 50, y: ch - 325, size: 11, font, color: rgb(0.3, 0.3, 0.3) });
      if (registroData.nrc) coverV2.drawText(`Ref. Catastral: ${registroData.nrc}`, { x: 50, y: ch - 350, size: 11, font, color: rgb(0.4, 0.4, 0.4) });
      coverV2.drawText(`Fecha de emision: ${today}`, { x: 50, y: ch - 400, size: 10, font, color: rgb(0.5, 0.5, 0.5) });

      /* ── Volume 2 Content ── */
      for (const folder of vol2Folders) {
        const sepPage = pdfDoc.addPage([595, 842]);
        const { width: sw, height: sh } = sepPage.getSize();
        sepPage.drawText(folder.sectionCode || folder.icon, { x: sw / 2 - 20, y: sh / 2 + 40, size: 32, font: fontBold, color: rgb(0.8, 0.8, 0.8) });
        sepPage.drawText(folder.title.toUpperCase(), { x: 50, y: sh / 2 - 10, size: 14, font: fontBold });
        sepPage.drawText("Volumen 2 — Archivo Vivo", { x: 50, y: sh / 2 - 35, size: 10, font, color: rgb(0.5, 0.5, 0.5) });

        const folderItems = items.filter((i) => (i.folder_index || 1) === folder.index);
        const docItems = folderItems.filter((i) => !isTextSlot(i) && (slotFilesMap.get(i.id) || []).length > 0);
        for (const di of docItems) {
          for (const sf of slotFilesMap.get(di.id) || []) {
            await embedDocument(sf.file.custom_title, sf.file.file_name, sf.blob);
          }
        }
      }

      // Add footers
      const allPages = pdfDoc.getPages();
      const total = allPages.length;
      allPages.forEach((page, idx) => addFooter(page, idx + 1, total));

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Libro_del_Edificio_${projectName.replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      if (user && projectId) {
        await supabase.from("audit_logs").insert({ user_id: user.id, project_id: projectId, action: "cfo_export_libro", details: { total_pages: total } });
      }
      toast.success("Libro del Edificio generado correctamente");
    } catch (err: any) {
      console.error("Error generating PDF:", err);
      toast.error("Error al generar el PDF");
    }
    setExporting(false);
  };

  const toggleFolder = (idx: number) => {
    setOpenFolders(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  /* ── Stats ─────────────────────────────────────────── */
  const totalItems = items.length;
  const filledItems = items.filter(i => isSlotFilled(i)).length;
  const validatedItems = items.filter(i => i.validated_by_deo).length;
  const progress = totalItems > 0 ? Math.round((filledItems / totalItems) * 100) : 0;

  if (profileLoading || loading) {
    return (
      <AppLayout>
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}><ArrowLeft className="h-4 w-4" /></Button>
            <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">CFO y Libro del Edificio</p>
          </div>
          <div className="space-y-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-card border border-border rounded-lg animate-pulse" />)}</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}><ArrowLeft className="h-4 w-4" /></Button>
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">CFO y Libro del Edificio</p>
        </div>
        <div className="flex items-end justify-between mb-4">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tighter">Libro del Edificio</h1>
            <p className="text-xs text-muted-foreground mt-1">Tu rol: <span className="font-semibold">{roleLabels[userRole || ""] || userRole || "—"}</span></p>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-bold tracking-tighter text-success">{progress}%</p>
            <p className="text-xs text-muted-foreground">{filledItems}/{totalItems} · {validatedItems} validados</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-secondary rounded-full mb-4 overflow-hidden">
          <div className="h-full bg-success rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        {/* Mandatory warning */}
        {missingMandatory.length > 0 && (
          <div className="flex items-start gap-2 p-3 mb-4 bg-destructive/5 border border-destructive/20 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-display uppercase tracking-wider text-destructive font-semibold">
                {missingMandatory.length} documento(s) obligatorio(s) pendiente(s)
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {missingMandatory.map(m => m.title).join(" · ")}
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {isAdmin && (
            <Button onClick={() => setNewSlotOpen(true)} variant="outline" className="font-display text-xs uppercase tracking-wider gap-2">
              <Plus className="h-4 w-4" /> Nuevo Slot
            </Button>
          )}
          {isAdmin && (
            <Button onClick={handleAudit} variant="outline" className="font-display text-xs uppercase tracking-wider gap-2" disabled={auditing}>
              <Shield className="h-4 w-4" /> {auditing ? "Escaneando..." : "Auditoría"}
            </Button>
          )}
          <Button
            onClick={handleExportPDF}
            variant={canCompile ? "default" : "outline"}
            className="font-display text-xs uppercase tracking-wider gap-2"
            disabled={exporting || !canCompile}
          >
            {!canCompile && <Lock className="h-3.5 w-3.5" />}
            <BookOpen className="h-4 w-4" />
            {exporting ? "Compilando..." : "Compilar Libro del Edificio"}
          </Button>
        </div>

        {/* ── VOLUMES ────────────────────────────────── */}
        {[1, 2].map(vol => {
          const volFolders = FOLDERS.filter(f => f.volume === vol);
          const volItems = items.filter(i => (i.volume || 1) === vol);
          const volFilled = volItems.filter(i => isSlotFilled(i)).length;
          return (
            <div key={vol} className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-border" />
                <h2 className="font-display text-xs uppercase tracking-[0.25em] text-muted-foreground">
                  Volumen {vol} — {vol === 1 ? "Cuerpo del Libro" : "Archivo Vivo"}
                </h2>
                <span className="text-[10px] text-muted-foreground">{volFilled}/{volItems.length}</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="space-y-3">
                {volFolders.map((folder) => {
                  const folderItems = items.filter(i => (i.folder_index || 1) === folder.index);
                  const folderFilled = folderItems.filter(i => isSlotFilled(i)).length;
                  const folderValidated = folderItems.filter(i => i.validated_by_deo).length;
                  const isOpen = openFolders[folder.index] ?? true;
                  const hasMandatoryPending = folderItems.some(i => i.is_mandatory && !isSlotFilled(i));

                  return (
                    <Collapsible key={folder.index} open={isOpen} onOpenChange={() => toggleFolder(folder.index)}>
                      <CollapsibleTrigger asChild>
                        <div className={`flex items-center justify-between p-3 bg-card border rounded-lg cursor-pointer hover:border-foreground/10 transition-colors ${hasMandatoryPending ? "border-destructive/30" : "border-border"}`}>
                          <div className="flex items-center gap-3">
                            <span className="font-display text-xs font-bold text-muted-foreground w-6 text-center">{folder.icon}</span>
                            <div>
                              <h3 className="font-display text-xs font-semibold uppercase tracking-wider">{folder.title}</h3>
                              <p className="text-[10px] text-muted-foreground">{folderItems.length} elementos</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {hasMandatoryPending && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                            <span className={`px-2 py-0.5 text-[10px] font-display uppercase tracking-widest rounded ${folderFilled === folderItems.length && folderItems.length > 0 ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"}`}>
                              {folderFilled}/{folderItems.length}
                              {folderValidated > 0 && ` · ${folderValidated}✓`}
                            </span>
                            {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border border-t-0 border-border rounded-b-lg bg-card/50 p-3 space-y-2">
                          {folderItems.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-4">Sin elementos</p>
                          )}
                          {folderItems.map((item) => (
                            <SlotRow
                              key={item.id}
                              item={item}
                              projectId={projectId!}
                              filesCount={(filesByItem[item.id] || []).length}
                              isAdmin={isAdmin}
                              userRole={userRole}
                              user={user}
                              expandedItem={expandedItem}
                              previewUrls={previewUrls}
                              uploadingId={uploadingId}
                              isSlotFilled={isSlotFilled}
                              isTextSlot={isTextSlot}
                              isVisualSlot={isVisualSlot}
                              canUploadItem={canUploadItem}
                              canManageUploadedItem={canManageUploadedItem}
                              canEditTextSlot={canEditTextSlot}
                              togglePreview={togglePreview}
                              handleFileUpload={handleFileUpload}
                              handleDownloadItem={handleDownloadItem}
                              handleReplaceFile={handleReplaceFile}
                              handleDeleteFile={handleDeleteFile}
                              handleDeleteSlot={handleDeleteSlot}
                              handleValidate={handleValidate}
                              handleSaveTextContent={handleSaveTextContent}
                              setRejectDialog={setRejectDialog}
                              setRejectReason={setRejectReason}
                              setClaimDialog={setClaimDialog}
                              setEditSlotItem={setEditSlotItem}
                              setEditSlotTitle={setEditSlotTitle}
                              setEditSlotOpen={setEditSlotOpen}
                            />
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            </div>
          );
        })}

        <p className="text-[10px] text-muted-foreground/50 text-center mt-8 font-display uppercase tracking-wider">
          Su actividad y conformidad están siendo registradas legalmente
        </p>
      </div>

      {/* New Slot Dialog */}
      <Dialog open={newSlotOpen} onOpenChange={setNewSlotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Nuevo Requerimiento</DialogTitle>
            <DialogDescription>Crea un slot personalizado para el Libro del Edificio.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Nombre *</Label>
              <Input value={newSlotTitle} onChange={e => setNewSlotTitle(e.target.value)} placeholder="Ej: Certificado de Desinsectación" />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Sección de destino</Label>
              <Select value={newSlotFolder} onValueChange={setNewSlotFolder}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FOLDERS.map(f => (
                    <SelectItem key={f.index} value={String(f.index)}>
                      Vol.{f.volume} — {f.icon}. {f.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Tipo de slot</Label>
              <Select value={newSlotType} onValueChange={v => setNewSlotType(v as "document" | "text")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="document">Documento (carga de archivo)</SelectItem>
                  <SelectItem value="text">Texto (campo de texto editable)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Responsable</Label>
              <Select value={newSlotRole} onValueChange={v => setNewSlotRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["CON", "PRO", "CSS", "DO", "DEM"] as AppRole[]).map(r => (
                    <SelectItem key={r} value={r}>{roleLabels[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={newSlotMandatory} onChange={e => setNewSlotMandatory(e.target.checked)} id="mandatory-check" className="rounded" />
              <Label htmlFor="mandatory-check" className="font-display text-xs uppercase tracking-wider text-muted-foreground cursor-pointer">
                Obligatorio para compilación
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSlotOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateSlot} disabled={!newSlotTitle.trim()}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Slot Dialog */}
      <Dialog open={editSlotOpen} onOpenChange={o => { if (!o) { setEditSlotOpen(false); setEditSlotItem(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Editar Nombre</DialogTitle>
            <DialogDescription>Modifica el nombre del requerimiento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Nombre</Label>
            <Input value={editSlotTitle} onChange={e => setEditSlotTitle(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSlotOpen(false)}>Cancelar</Button>
            <Button onClick={handleEditSlot} disabled={!editSlotTitle.trim()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Claim dialog */}
      <AlertDialog open={claimDialog.open} onOpenChange={(o) => setClaimDialog({ open: o, item: claimDialog.item })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Enviar Reclamación</AlertDialogTitle>
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
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject dialog */}
      <AlertDialog open={rejectDialog.open} onOpenChange={(o) => { if (!o) { setRejectDialog({ open: false, item: null }); setRejectReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Rechazar Documento</AlertDialogTitle>
            <AlertDialogDescription>Indica el motivo del rechazo.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Motivo *</Label>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Motivo del rechazo..." rows={3} />
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

/* ═══════════════════════════════════════════════════════════
   SLOT ROW COMPONENT
   ═══════════════════════════════════════════════════════════ */
interface SlotRowProps {
  item: any;
  projectId: string;
  filesCount: number;
  isAdmin: boolean;
  userRole: AppRole | undefined;
  user: any;
  expandedItem: string | null;
  previewUrls: Record<string, string>;
  uploadingId: string | null;
  isSlotFilled: (item: any) => boolean;
  isTextSlot: (item: any) => boolean;
  isVisualSlot: (item: any) => boolean;
  canUploadItem: (item: any) => boolean;
  canManageUploadedItem: (item: any) => boolean;
  canEditTextSlot: (item: any) => boolean;
  togglePreview: (item: any) => void;
  handleFileUpload: (itemId: string, file: File) => void;
  handleDownloadItem: (item: any) => void;
  handleReplaceFile: (item: any, file: File) => void;
  handleDeleteFile: (item: any) => void;
  handleDeleteSlot: (item: any) => void;
  handleValidate: (itemId: string) => void;
  handleSaveTextContent: (itemId: string, text: string) => void;
  setRejectDialog: (v: { open: boolean; item: any | null }) => void;
  setRejectReason: (v: string) => void;
  setClaimDialog: (v: { open: boolean; item: any | null }) => void;
  setEditSlotItem: (v: any) => void;
  setEditSlotTitle: (v: string) => void;
  setEditSlotOpen: (v: boolean) => void;
}

const SlotRow = ({
  item, projectId, filesCount, isAdmin, userRole, user, expandedItem, previewUrls, uploadingId,
  isSlotFilled: checkFilled, isTextSlot: checkText, isVisualSlot: checkVisual,
  canUploadItem: canUpload, canManageUploadedItem: canManage, canEditTextSlot: canEditText,
  togglePreview, handleFileUpload, handleDownloadItem, handleReplaceFile, handleDeleteFile,
  handleDeleteSlot, handleValidate, handleSaveTextContent,
  setRejectDialog, setRejectReason, setClaimDialog, setEditSlotItem, setEditSlotTitle, setEditSlotOpen,
}: SlotRowProps) => {
  const [localText, setLocalText] = useState(item.text_content || "");
  const [textDirty, setTextDirty] = useState(false);

  useEffect(() => { setLocalText(item.text_content || ""); setTextDirty(false); }, [item.text_content]);

  const filled = checkFilled(item);
  const isText = checkText(item);
  const isVisual = checkVisual(item);
  const isDoc = !isText && !isVisual;
  const isCompleted = filled;
  const isValidated = item.validated_by_deo;
  const isRejected = !!item.rejection_reason && !isValidated;
  const isPending = !filled;
  const canUp = canUpload(item);
  const canMan = canManage(item);
  const isMandatory = item.is_mandatory;

  return (
    <div>
      <div
        className={`flex flex-col sm:flex-row sm:items-start justify-between p-3 rounded border transition-all gap-2 ${
          isRejected ? "border-destructive/50 bg-destructive/5" :
          isValidated ? "border-success/50 bg-success/10" :
          filled ? "border-success/30 bg-success/5" :
          item.claimed_at ? "border-destructive/30 bg-destructive/5" : "border-border hover:border-foreground/10"
        }`}
      >

  return (
    <div>
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded border transition-all gap-2 ${
          isRejected ? "border-destructive/50 bg-destructive/5" :
          isValidated ? "border-success/50 bg-success/10" :
          filled ? "border-success/30 bg-success/5" :
          item.claimed_at ? "border-destructive/30 bg-destructive/5" : "border-border hover:border-foreground/10"
        } ${(isDoc || isVisual) && isCompleted && item.file_url ? "cursor-pointer" : ""}`}
        onClick={() => {
          if ((isDoc || isVisual) && isCompleted && item.file_url) togglePreview(item);
        }}
      >
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {isRejected ? <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" /> :
           filled ? <CheckCircle2 className={`h-5 w-5 ${isValidated ? "text-success" : "text-success/60"} shrink-0 mt-0.5`} /> :
           <Circle className="h-5 w-5 text-muted-foreground/30 shrink-0 mt-0.5" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-sm ${isRejected ? "text-destructive" : filled ? "text-success" : ""}`}>
                {item.title}
              </p>
              {isMandatory && <span className="text-[9px] px-1.5 py-0.5 bg-destructive/10 text-destructive rounded font-display uppercase tracking-wider">Obligatorio</span>}
              {isText && <span className="text-[9px] px-1.5 py-0.5 bg-primary/10 text-primary rounded font-display uppercase tracking-wider">Texto</span>}
              {isVisual && <span className="text-[9px] px-1.5 py-0.5 bg-primary/10 text-primary rounded font-display uppercase tracking-wider">Visual</span>}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {item.file_name && <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><FileText className="h-3 w-3" />{item.file_name}</span>}
              {item.claimed_at && !filled && <span className="text-[10px] text-destructive font-display uppercase tracking-wider">Reclamado</span>}
              {isValidated && <span className="text-[10px] text-success font-display uppercase tracking-wider">Validado</span>}
              {isRejected && <span className="text-[10px] text-destructive font-display uppercase tracking-wider">Rechazado</span>}
            </div>
            {isRejected && item.rejection_reason && (
              <p className="text-[10px] text-destructive mt-0.5">Motivo: {item.rejection_reason}</p>
            )}
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">
              Resp: {(item.allowed_roles || []).map((r: string) => roleLabels[r] || r).join(" / ")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 flex-wrap pl-8 sm:pl-0" onClick={e => e.stopPropagation()}>
          {/* Text slot inline editing */}
          {isText && canEditText(item) && (
            <div className="w-full sm:w-auto flex gap-1">
              {textDirty && (
                <Button size="sm" variant="outline" onClick={() => { handleSaveTextContent(item.id, localText); setTextDirty(false); }} className="text-[10px] font-display uppercase tracking-widest gap-1 h-7">
                  Guardar
                </Button>
              )}
            </div>
          )}

          {/* Document/Visual upload */}
          {(isDoc || isVisual) && isPending && canUp && (
            <label className="cursor-pointer">
              <input type="file" className="hidden" accept={isVisual ? ".jpg,.jpeg,.png,.pdf" : ".pdf,.doc,.docx,.jpg,.jpeg,.png"} onChange={(e) => {
                const files = e.target.files;
                if (files) Array.from(files).forEach(f => void handleFileUpload(item.id, f));
                e.currentTarget.value = "";
              }} />
              <span className={`flex items-center gap-1 px-2 py-1 text-[10px] font-display uppercase tracking-widest rounded border border-border hover:border-foreground/20 transition-colors cursor-pointer ${uploadingId === item.id ? "opacity-50" : ""}`}>
                <Upload className="h-3 w-3" /> {uploadingId === item.id ? "..." : "Subir"}
              </span>
            </label>
          )}

          {/* Admin validation */}
          {isAdmin && (isDoc || isVisual) && isCompleted && !isValidated && (
            <>
              <Button size="sm" variant="outline" onClick={() => handleValidate(item.id)} className="text-[10px] font-display uppercase tracking-widest gap-1 h-7">
                <Shield className="h-3 w-3" /> Validar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setRejectDialog({ open: true, item }); setRejectReason(""); }} className="text-[10px] font-display uppercase tracking-widest gap-1 h-7 text-destructive hover:text-destructive">
                <XCircle className="h-3 w-3" />
              </Button>
            </>
          )}

          {/* Claim */}
          {isAdmin && isPending && !isText && (
            <Button size="sm" variant="ghost" onClick={() => setClaimDialog({ open: true, item })} className="text-[10px] font-display uppercase tracking-widest gap-1 h-7 text-destructive hover:text-destructive">
              <Bell className="h-3 w-3" />
            </Button>
          )}

          {/* Admin edit/delete */}
          {isAdmin && (
            <>
              <Button size="sm" variant="ghost" onClick={() => { setEditSlotItem(item); setEditSlotTitle(item.title); setEditSlotOpen(true); }} className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                <Edit2 className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleDeleteSlot(item)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}

          {/* Expand */}
          {(isDoc || isVisual) && isCompleted && item.file_url && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>

      {/* Text slot inline editor */}
      {isText && canEditText(item) && (
        <div className="border border-t-0 border-border rounded-b-lg p-3 bg-background">
          <Textarea
            value={localText}
            onChange={e => { setLocalText(e.target.value); setTextDirty(true); }}
            placeholder={`Introduce ${item.title}...`}
            rows={item.title.includes("Ficha") || item.title.includes("Protocolo") || item.title.includes("Memoria") ? 6 : 2}
            className="bg-secondary/30 text-sm"
          />
          {textDirty && (
            <div className="flex justify-end mt-2">
              <Button size="sm" onClick={() => { handleSaveTextContent(item.id, localText); setTextDirty(false); }} className="text-[10px] font-display uppercase tracking-widest">
                Guardar
              </Button>
            </div>
          )}
        </div>
      )}

      {/* File preview */}
      {isExpanded && (isDoc || isVisual) && isCompleted && item.file_url && (
        <div className="border border-t-0 border-border rounded-b-lg p-4 bg-background animate-in slide-in-from-top-2 duration-200">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Button size="sm" variant="outline" onClick={() => handleDownloadItem(item)} className="text-[10px] font-display uppercase tracking-widest gap-1 h-7">
              <Download className="h-3 w-3" /> Descargar
            </Button>
            {canMan && (
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
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando...
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CFOModule;
