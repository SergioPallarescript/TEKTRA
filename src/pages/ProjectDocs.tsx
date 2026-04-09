import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjectRole } from "@/hooks/useProjectRole";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Upload, FileText, Trash2, FolderOpen, Loader2, Download, RefreshCw, ChevronDown, ChevronUp, ScanLine } from "lucide-react";
import DocumentPreview from "@/components/DocumentPreview";
import DocumentScanner from "@/components/DocumentScanner";
import { sanitizeFileName, uploadFileWithFallback } from "@/lib/storage";

const ProjectDocs = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { isAdmin: canUpload } = useProjectRole(projectId);
  const navigate = useNavigate();
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [scannerOpen, setScannerOpen] = useState(false);

  const fetchDocs = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("project_documents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    setDocs(data || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const togglePreview = async (doc: any) => {
    if (expandedDoc === doc.id) { setExpandedDoc(null); return; }
    setExpandedDoc(doc.id);
    if (!previewUrls[doc.id] && doc.file_url) {
      const { data } = await supabase.storage.from("plans").download(doc.file_url);
      if (data) {
        const url = URL.createObjectURL(data);
        setPreviewUrls(prev => ({ ...prev, [doc.id]: url }));
      }
    }
  };

  const handleUpload = async (files: FileList) => {
    if (!projectId || !user || !canUpload) return;
    setUploading(true);
    let successCount = 0;
    let failCount = 0;

    for (const file of Array.from(files)) {
      try {
        const safeName = sanitizeFileName(file.name);
        const path = `project-docs/${projectId}/${Date.now()}_${safeName}`;
        const { error: uploadErr } = await uploadFileWithFallback({ path, file, cacheControl: "3600", upsert: false });
        if (uploadErr) { toast.error(`Error subiendo ${file.name}: ${uploadErr.message}`); failCount++; continue; }
        const { error: dbErr } = await supabase.from("project_documents").insert({
          project_id: projectId, uploaded_by: user.id,
          file_name: file.name, file_url: path, file_size: file.size, file_type: file.type,
        });
        if (dbErr) { await supabase.storage.from("plans").remove([path]); toast.error(`Error registrando ${file.name}`); failCount++; continue; }
        successCount++;
      } catch { toast.error(`Error inesperado`); failCount++; }
    }
    if (successCount > 0) toast.success(`${successCount} documento${successCount > 1 ? "s" : ""} subido${successCount > 1 ? "s" : ""}`);
    if (failCount > 0 && successCount === 0) toast.error("No se pudo subir ningún archivo.");
    setUploading(false); fetchDocs();
  };

  const handleReplace = async (doc: any, file: File) => {
    if (!projectId || !user || doc.uploaded_by !== user.id) return;
    try {
      const safeName = sanitizeFileName(file.name);
      const path = `project-docs/${projectId}/${Date.now()}_${safeName}`;
      const { error: uploadErr } = await uploadFileWithFallback({ path, file });
      if (uploadErr) { toast.error("Error subiendo archivo"); return; }
      // Remove old preview cache
      if (previewUrls[doc.id]) { URL.revokeObjectURL(previewUrls[doc.id]); setPreviewUrls(prev => { const n = { ...prev }; delete n[doc.id]; return n; }); }
      if (doc.file_url) await supabase.storage.from("plans").remove([doc.file_url]);
      // We can't UPDATE project_documents (no RLS for UPDATE), so delete+insert
      await supabase.from("project_documents").delete().eq("id", doc.id);
      await supabase.from("project_documents").insert({
        project_id: projectId, uploaded_by: user.id,
        file_name: file.name, file_url: path, file_size: file.size, file_type: file.type,
      });
      toast.success("Documento sustituido"); fetchDocs();
    } catch { toast.error("Error al sustituir"); }
  };

  const handleDelete = async (doc: any) => {
    if (doc.uploaded_by !== user?.id) return;
    await supabase.storage.from("plans").remove([doc.file_url]);
    await supabase.from("project_documents").delete().eq("id", doc.id);
    if (previewUrls[doc.id]) { URL.revokeObjectURL(previewUrls[doc.id]); setPreviewUrls(prev => { const n = { ...prev }; delete n[doc.id]; return n; }); }
    if (expandedDoc === doc.id) setExpandedDoc(null);
    toast.success("Documento eliminado"); fetchDocs();
  };

  const handleDownload = async (doc: any) => {
    const { data } = await supabase.storage.from("plans").download(doc.file_url);
    if (!data) return;
    const url = URL.createObjectURL(data);
    const a = document.createElement("a"); a.href = url; a.download = doc.file_name; a.click();
    URL.revokeObjectURL(url);
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isPreviewable = (doc: any) => {
    const ext = (doc.file_name || "").toLowerCase();
    return ext.endsWith(".pdf") || ext.endsWith(".jpg") || ext.endsWith(".jpeg") || ext.endsWith(".png");
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">
            Documentación de Proyecto
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold tracking-tighter">Documentación</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Base de conocimiento del Cerebro de Obra. Solo DO y DEM pueden subir archivos (máx. 50 MB).
            </p>
          </div>
          {canUpload && (
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" className="font-display text-xs uppercase tracking-wider gap-2" onClick={() => setScannerOpen(true)}>
                <ScanLine className="h-4 w-4" /> Escanear
              </Button>
              <label data-tour="upload-docs" className="cursor-pointer">
                <input
                  type="file" multiple className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt"
                  onChange={(e) => { if (e.target.files) void handleUpload(e.target.files); e.currentTarget.value = ""; }}
                />
                <Button asChild variant="outline" className="font-display text-xs uppercase tracking-wider gap-2" disabled={uploading}>
                  <span>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploading ? "Subiendo..." : "Subir"}
                  </span>
                </Button>
              </label>
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-card border border-border rounded-lg animate-pulse" />)}
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-20">
            <FolderOpen className="h-16 w-16 text-muted-foreground/20 mx-auto mb-4" />
            <p className="font-display text-muted-foreground">No hay documentos de proyecto.</p>
            {canUpload && <p className="text-xs text-muted-foreground mt-2">Sube documentos para alimentar el Cerebro de Obra.</p>}
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => {
              const isExpanded = expandedDoc === doc.id;
              const canPreview = isPreviewable(doc);
              return (
                <div key={doc.id}>
                  <div
                    className={`flex items-center justify-between p-4 bg-card border border-border rounded-lg hover:border-foreground/10 hover:shadow-md transition-all cursor-pointer ${isExpanded ? "rounded-b-none" : ""}`}
                    onClick={() => canPreview && togglePreview(doc)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{doc.file_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatSize(doc.file_size)} · {new Date(doc.created_at).toLocaleDateString("es-ES")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(doc)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      {doc.uploaded_by === user?.id && (
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(doc)} className="h-8 w-8 text-destructive/60 hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      {canPreview && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); togglePreview(doc); }}>
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Accordion preview */}
                  {isExpanded && (
                    <div className="border border-t-0 border-border rounded-b-lg p-4 bg-background animate-in slide-in-from-top-2 duration-200">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <Button size="sm" variant="outline" onClick={() => handleDownload(doc)} className="text-[10px] font-display uppercase tracking-widest gap-1 h-7">
                          <Download className="h-3 w-3" /> Descargar
                        </Button>
                        {doc.uploaded_by === user?.id && (
                          <>
                            <label className="cursor-pointer">
                              <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleReplace(doc, f); e.currentTarget.value = ""; }} />
                              <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-display uppercase tracking-widest rounded border border-border hover:border-foreground/20 transition-colors cursor-pointer">
                                <RefreshCw className="h-3 w-3" /> Sustituir
                              </span>
                            </label>
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(doc)} className="text-[10px] font-display uppercase tracking-widest gap-1 h-7 text-destructive hover:text-destructive">
                              <Trash2 className="h-3 w-3" /> Eliminar
                            </Button>
                          </>
                        )}
                      </div>
                      {previewUrls[doc.id] ? (
                        <DocumentPreview url={previewUrls[doc.id]} fileName={doc.file_name || ""} />
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
        )}
      </div>

      <DocumentScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanComplete={(scannedFile) => {
          setScannerOpen(false);
          void handleUpload([scannedFile] as unknown as FileList);
        }}
      />
    </AppLayout>
  );
};

export default ProjectDocs;
