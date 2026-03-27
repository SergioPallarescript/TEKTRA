import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Upload, FileText, Trash2, FolderOpen } from "lucide-react";

const ProjectDocs = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const canUpload = profile?.role === "DO" || profile?.role === "DEO";

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

    for (const file of Array.from(files)) {
      const path = `project-docs/${projectId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("plans").upload(path, file);
      if (uploadErr) { toast.error(`Error subiendo ${file.name}`); continue; }

      await supabase.from("project_documents").insert({
        project_id: projectId,
        uploaded_by: user.id,
        file_name: file.name,
        file_url: path,
        file_size: file.size,
        file_type: file.type,
      });

      await supabase.from("audit_logs").insert({
        user_id: user.id,
        project_id: projectId,
        action: "project_doc_uploaded",
        details: { file_name: file.name },
      });
    }

    toast.success("Documentos subidos correctamente");
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

        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tighter">Documentación</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Base de conocimiento del Cerebro de Obra. Solo DO y DEO pueden subir archivos.
            </p>
          </div>
          {canUpload && (
            <label className="cursor-pointer">
              <input
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png,.txt"
                onChange={(e) => e.target.files && handleUpload(e.target.files)}
              />
              <Button asChild variant="outline" className="font-display text-xs uppercase tracking-wider gap-2" disabled={uploading}>
                <span>
                  <Upload className="h-4 w-4" />
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
                <button onClick={() => handleDownload(doc)} className="flex items-center gap-3 text-left flex-1">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{doc.file_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : ""} · {new Date(doc.created_at).toLocaleDateString("es-ES")}
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
