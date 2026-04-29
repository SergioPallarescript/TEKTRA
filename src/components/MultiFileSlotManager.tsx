import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { downloadFile } from "@/lib/nativeMedia";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Upload, FileText, Download, Trash2, Edit2, Loader2, ChevronUp, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { sanitizeFileName, uploadFileWithFallback } from "@/lib/storage";
import DocumentPreview from "@/components/DocumentPreview";

export interface CfoFile {
  id: string;
  cfo_item_id: string;
  project_id: string;
  custom_title: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  sort_order: number;
  uploaded_by: string;
  created_at: string;
}

interface MultiFileSlotManagerProps {
  itemId: string;
  projectId: string;
  canManage: boolean;
  acceptVisualOnly?: boolean;
  onChange?: (files: CfoFile[]) => void;
}

const MultiFileSlotManager = ({
  itemId,
  projectId,
  canManage,
  acceptVisualOnly = false,
  onChange,
}: MultiFileSlotManagerProps) => {
  const { user } = useAuth();
  const [files, setFiles] = useState<CfoFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  // Title dialog state
  const [titleDialogOpen, setTitleDialogOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [customTitle, setCustomTitle] = useState("");

  // Edit title dialog
  const [editFile, setEditFile] = useState<CfoFile | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const fetchFiles = useCallback(async () => {
    const { data } = await supabase
      .from("cfo_item_files")
      .select("*")
      .eq("cfo_item_id", itemId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    const list = (data as CfoFile[]) || [];
    setFiles(list);
    onChange?.(list);
    setLoading(false);
  }, [itemId, onChange]);

  useEffect(() => {
    void fetchFiles();
    // Cleanup preview blobs on unmount
    return () => {
      Object.values(previewUrls).forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const onFilePicked = (file: File | null | undefined) => {
    if (!file) return;
    setPendingFile(file);
    // Default suggested title = file name without extension
    const dot = file.name.lastIndexOf(".");
    setCustomTitle(dot > 0 ? file.name.slice(0, dot) : file.name);
    setTitleDialogOpen(true);
  };

  const handleConfirmUpload = async () => {
    if (!pendingFile || !customTitle.trim() || !user) return;
    setUploading(true);
    try {
      const path = `cfo/${projectId}/${itemId}_${Date.now()}_${sanitizeFileName(pendingFile.name)}`;
      const { error: upErr } = await uploadFileWithFallback({ path, file: pendingFile });
      if (upErr) throw upErr;

      const nextOrder = files.length > 0 ? Math.max(...files.map((f) => f.sort_order)) + 1 : 0;

      const { error: insErr } = await supabase.from("cfo_item_files").insert({
        cfo_item_id: itemId,
        project_id: projectId,
        custom_title: customTitle.trim(),
        file_name: pendingFile.name,
        file_url: path,
        file_size: pendingFile.size,
        mime_type: pendingFile.type || null,
        sort_order: nextOrder,
        uploaded_by: user.id,
      });
      if (insErr) throw insErr;

      // Mark parent slot as completed
      await supabase.from("cfo_items").update({
        is_completed: true,
        completed_at: new Date().toISOString(),
        completed_by: user.id,
        rejection_reason: null,
        rejected_by: null,
        rejected_at: null,
      }).eq("id", itemId);

      toast.success("Archivo añadido");
      setTitleDialogOpen(false);
      setPendingFile(null);
      setCustomTitle("");
      await fetchFiles();
    } catch (err: any) {
      toast.error(err?.message || "Error al subir el archivo");
    } finally {
      setUploading(false);
    }
  };

  const togglePreview = async (file: CfoFile) => {
    if (expandedFileId === file.id) {
      setExpandedFileId(null);
      return;
    }
    setExpandedFileId(file.id);
    if (!previewUrls[file.id]) {
      const { data } = await supabase.storage.from("plans").download(file.file_url);
      if (data) {
        const url = URL.createObjectURL(data);
        setPreviewUrls((prev) => ({ ...prev, [file.id]: url }));
      }
    }
  };

  const handleDownload = async (file: CfoFile) => {
    const { data } = await supabase.storage.from("plans").download(file.file_url);
    if (!data) return;
    await downloadFile(data, file.file_name);
  };

  const handleDelete = async (file: CfoFile) => {
    if (!canManage) return;
    if (!window.confirm(`¿Eliminar "${file.custom_title}"?`)) return;
    try {
      await supabase.storage.from("plans").remove([file.file_url]);
      await supabase.from("cfo_item_files").delete().eq("id", file.id);

      // If no files left, mark slot as not completed
      const remaining = files.filter((f) => f.id !== file.id);
      if (remaining.length === 0) {
        await supabase.from("cfo_items").update({
          is_completed: false,
          completed_at: null,
          completed_by: null,
          validated_by_deo: null,
          validated_at: null,
        }).eq("id", itemId);
      }

      if (previewUrls[file.id]) {
        URL.revokeObjectURL(previewUrls[file.id]);
        setPreviewUrls((prev) => {
          const n = { ...prev };
          delete n[file.id];
          return n;
        });
      }

      toast.success("Archivo eliminado");
      await fetchFiles();
    } catch (err: any) {
      toast.error(err?.message || "Error al eliminar");
    }
  };

  const handleEditTitle = async () => {
    if (!editFile || !editTitle.trim()) return;
    await supabase.from("cfo_item_files")
      .update({ custom_title: editTitle.trim() })
      .eq("id", editFile.id);
    toast.success("Título actualizado");
    setEditFile(null);
    setEditTitle("");
    await fetchFiles();
  };

  const acceptStr = acceptVisualOnly ? ".jpg,.jpeg,.png,.pdf" : ".pdf,.doc,.docx,.jpg,.jpeg,.png";

  return (
    <div className="space-y-2">
      {/* File list */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Cargando archivos...
        </div>
      ) : files.length > 0 ? (
        <div className="space-y-1.5">
          {files.map((file, idx) => {
            const isExpanded = expandedFileId === file.id;
            return (
              <div key={file.id} className="border border-border rounded-md bg-background/50">
                <div
                  className="flex items-center gap-2 p-2 cursor-pointer hover:bg-secondary/30 transition-colors"
                  onClick={() => void togglePreview(file)}
                >
                  <span className="text-[10px] font-display text-muted-foreground w-6 text-center shrink-0">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{file.custom_title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{file.file_name}</p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => void handleDownload(file)}
                      title="Descargar"
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                    {canManage && (
                      <>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => { setEditFile(file); setEditTitle(file.custom_title); }}
                          title="Editar título"
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => void handleDelete(file)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => void togglePreview(file)}>
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border p-3 bg-background animate-in slide-in-from-top-2 duration-200">
                    {previewUrls[file.id] ? (
                      <DocumentPreview url={previewUrls[file.id]} fileName={file.file_name} />
                    ) : (
                      <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando...
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Add file button */}
      {canManage && (
        <label className="cursor-pointer block">
          <input
            type="file"
            className="hidden"
            accept={acceptStr}
            onChange={(e) => {
              const f = e.target.files?.[0];
              onFilePicked(f);
              e.currentTarget.value = "";
            }}
          />
          <span className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] font-display uppercase tracking-widest rounded border border-dashed border-border hover:border-foreground/30 hover:bg-secondary/30 transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
            <Upload className="h-3 w-3" />
            {files.length === 0 ? "Subir archivo" : "Añadir otro archivo"}
          </span>
        </label>
      )}

      {/* Title dialog */}
      <Dialog open={titleDialogOpen} onOpenChange={(o) => { if (!o) { setTitleDialogOpen(false); setPendingFile(null); setCustomTitle(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Título del Documento</DialogTitle>
            <DialogDescription>
              Introduce un título descriptivo. Aparecerá en la app y en el índice del Libro del Edificio.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Título *</Label>
              <Input
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Ej: Ficha Técnica Viguetas Pretensadas"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter" && customTitle.trim()) void handleConfirmUpload(); }}
              />
            </div>
            {pendingFile && (
              <p className="text-[10px] text-muted-foreground">
                Archivo: <span className="font-mono">{pendingFile.name}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setTitleDialogOpen(false); setPendingFile(null); setCustomTitle(""); }}
              disabled={uploading}
            >
              Cancelar
            </Button>
            <Button onClick={() => void handleConfirmUpload()} disabled={!customTitle.trim() || uploading}>
              {uploading ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Subiendo...</> : "Subir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit title dialog */}
      <Dialog open={!!editFile} onOpenChange={(o) => { if (!o) { setEditFile(null); setEditTitle(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Editar Título</DialogTitle>
            <DialogDescription>Cambia el título mostrado para este documento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Título</Label>
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && editTitle.trim()) void handleEditTitle(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditFile(null); setEditTitle(""); }}>Cancelar</Button>
            <Button onClick={() => void handleEditTitle()} disabled={!editTitle.trim()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MultiFileSlotManager;
