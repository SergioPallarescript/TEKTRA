import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjectRole } from "@/hooks/useProjectRole";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Upload, FileText, Trash2, FolderOpen, Loader2 } from "lucide-react";
import { sanitizeFileName, uploadFileWithFallback } from "@/lib/storage";

const ProjectDocs = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { isAdmin: canUpload } = useProjectRole(projectId);
  const navigate = useNavigate();
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

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

  const handleUpload = async (files: FileList) => {
    if (!projectId || !user || !canUpload) return;
    setUploading(true);
    let successCount = 0;
    let failCount = 0;

    for (const file of Array.from(files)) {
      try {
        const safeName = sanitizeFileName(file.name);
        const path = `project-docs/${projectId}/${Date.now()}_${safeName}`;

        const { error: uploadErr } = await uploadFileWithFallback({
          path,
          file,
          cacheControl: "3600",
          upsert: false,
        });

        if (uploadErr) {
          console.error("Storage upload error:", uploadErr);
          toast.error(`Error subiendo ${file.name}: ${uploadErr.message}`);
          failCount++;
          continue;
        }

        const { error: dbErr } = await supabase.from("project_documents").insert({
          project_id: projectId,
          uploaded_by: user.id,
          file_name: file.name,
          file_url: path,
          file_size: file.size,
          file_type: file.type,
        });

        if (dbErr) {
          console.error("DB insert error:", dbErr);
          // Clean up orphan file
          await supabase.storage.from("plans").remove([path]);
          toast.error(`Error registrando ${file.name}`);
          failCount++;
          continue;
        }

        await supabase.from("audit_logs").insert({
          user_id: user.id,
          project_id: projectId,
          action: "project_doc_uploaded",
          details: { file_name: file.name },
        });

        successCount++;
      } catch (err: any) {
        console.error("Upload exception:", err);
        toast.error(`Error inesperado subiendo ${file.name}`);
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} documento${successCount > 1 ? "s" : ""} subido${successCount > 1 ? "s" : ""} correctamente`);
    }
    if (failCount > 0 && successCount === 0) {
      toast.error("No se pudo subir ningún archivo. Verifica el tamaño (máx. 50 MB).");
    }

    setUploading(false);
    fetchDocs();
  };

  const handleDelete = async (doc: any) => {
    if (doc.uploaded_by !== user?.id) return;
    await supabase.storage.from("plans").remove([doc.file_url]);
    await supabase.from("project_documents").delete().eq("id", doc.id);
    toast.success("Documento eliminado");
    fetchDocs();
  };

  const handleDownload = async (doc: any) => {
    const { data } = await supabase.storage.from("plans").download(doc.file_url);
    if (!data) return;
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.file_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
            <label className="cursor-pointer shrink-0">
              <input
                type="file"
                multiple
                className="hidden"
                accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,text/plain,.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt"
                onChange={(e) => {
                  if (e.target.files) void handleUpload(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
              <Button asChild variant="outline" className="font-display text-xs uppercase tracking-wider gap-2" disabled={uploading}>
                <span>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? "Subiendo..." : "Subir Documentos"}
                </span>
              </Button>
            </label>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-card border border-border rounded-lg animate-pulse" />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-20">
            <FolderOpen className="h-16 w-16 text-muted-foreground/20 mx-auto mb-4" />
            <p className="font-display text-muted-foreground">No hay documentos de proyecto.</p>
            {canUpload && <p className="text-xs text-muted-foreground mt-2">Sube documentos para alimentar el Cerebro de Obra.</p>}
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-4 bg-card border border-border rounded-lg hover:border-foreground/10 transition-all"
              >
                <button onClick={() => handleDownload(doc)} className="flex items-center gap-3 text-left flex-1 min-w-0">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.file_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatSize(doc.file_size)} · {new Date(doc.created_at).toLocaleDateString("es-ES")}
                    </p>
                  </div>
                </button>
                {doc.uploaded_by === user?.id && (
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(doc)} className="text-destructive/60 hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default ProjectDocs;
