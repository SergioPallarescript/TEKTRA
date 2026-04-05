import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeFileName, uploadFileWithFallback } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import ProgressRing from "@/components/ProgressRing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Building2, FileSignature, MapPin, Users, Settings, Pencil, Trash2, X, ImagePlus } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Project {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  status: string;
  created_at: string;
  created_by: string | null;
  cover_image_url: string | null;
}

/** Compress image to max 1000px WebP at 80% quality */
const compressCoverImage = (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1000;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        const ratio = Math.min(MAX / w, MAX / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("Compression failed")); return; }
          resolve(new File([blob], "cover.webp", { type: "image/webp" }));
        },
        "image/webp",
        0.8
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
};


const Dashboard = () => {
  const { user, profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newProject, setNewProject] = useState({ name: "", description: "", address: "", referencia_catastral: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [pendingSignatureDocs, setPendingSignatureDocs] = useState<any[]>([]);
  const navigate = useNavigate();

  const isAdmin = profile?.role === "DO" || profile?.role === "DEM";

  // Management mode
  const [manageMode, setManageMode] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editData, setEditData] = useState({ name: "", description: "", address: "", status: "" });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});

  const fetchProjects = async () => {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) {
      setProjects(data as Project[]);
      // Build cover image URLs
      const urls: Record<string, string> = {};
      for (const p of data) {
        if ((p as any).cover_image_url) {
          const { data: urlData } = await supabase.storage.from("plans").createSignedUrl((p as any).cover_image_url, 3600);
          if (urlData?.signedUrl) urls[p.id] = urlData.signedUrl;
        }
      }
      setCoverUrls(urls);

      const progressMap: Record<string, number> = {};
      for (const project of data) {
        const [{ data: milestones }, { data: orders }] = await Promise.all([
          supabase.from("gantt_milestones").select("start_date, end_date").eq("project_id", project.id),
          supabase.from("orders").select("id").eq("project_id", project.id),
        ]);
        if (milestones && milestones.length > 0) {
          const today = new Date();
          const allDates = milestones.flatMap((m: any) => [new Date(m.start_date), new Date(m.end_date)]);
          const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
          const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
          const totalSpan = maxDate.getTime() - minDate.getTime();
          const elapsed = today.getTime() - minDate.getTime();
          const ganttPercent = totalSpan > 0 ? Math.min(100, Math.max(0, (elapsed / totalSpan) * 100)) : 0;
          const orderFactor = Math.min(1, (orders?.length || 0) / Math.max(1, milestones.length * 2));
          progressMap[project.id] = Math.round(ganttPercent * (0.7 + 0.3 * orderFactor));
        } else {
          progressMap[project.id] = 0;
        }
      }
      setProgress(progressMap);
    }

    if (user) {
      const { data: signatureDocs } = await (supabase.from("signature_documents" as any) as any)
        .select("id, project_id, title")
        .eq("recipient_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5);
      setPendingSignatureDocs(signatureDocs || []);
    }

    setLoading(false);
  };

  useEffect(() => { fetchProjects(); }, [user]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { data, error } = await supabase
      .from("projects")
      .insert({
        name: newProject.name,
        description: newProject.description || null,
        address: newProject.address || null,
        created_by: user.id,
      })
      .select()
      .single();
    if (error) { toast.error("Error al crear el proyecto"); return; }
    await supabase.from("project_members").insert({
      project_id: data.id,
      user_id: user.id,
      role: profile?.role || "DO",
      status: "accepted",
      invited_email: profile?.email,
      accepted_at: new Date().toISOString(),
    });
    await supabase.from("audit_logs").insert({
      user_id: user.id, project_id: data.id,
      action: "project_created", details: { name: newProject.name },
    });
    setProjects((prev) => [data, ...prev]);
    setNewProject({ name: "", description: "", address: "" });
    setDialogOpen(false);
    toast.success("Proyecto creado");
  };

  const handleEditProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProject || !user) return;
    setEditSubmitting(true);
    try {
      let coverImageUrl = editProject.cover_image_url;

      // Upload cover image if provided (compress to WebP first)
      if (coverFile) {
        const compressed = await compressCoverImage(coverFile);
        const path = `project-covers/${editProject.id}/${Date.now()}_cover.webp`;
        const { error: upErr } = await uploadFileWithFallback({ path, file: compressed });
        if (upErr) throw new Error("Error al subir la imagen de portada");
        coverImageUrl = path;
      }

      const { data: session } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-project", {
        body: {
          action: "update",
          projectId: editProject.id,
          name: editData.name,
          description: editData.description,
          address: editData.address,
          status: editData.status,
          cover_image_url: coverImageUrl,
        },
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      toast.success("Proyecto actualizado");
      setEditProject(null);
      setCoverFile(null);
      fetchProjects();
    } catch (err: any) {
      toast.error(err.message || "Error al editar el proyecto");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!deleteProjectId || !user) return;
    setDeleteSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-project", {
        body: { action: "delete", projectId: deleteProjectId },
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      toast.success("Proyecto eliminado");
      setDeleteProjectId(null);
      setManageMode(false);
      fetchProjects();
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar el proyecto");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-8">
          <div>
            <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">Bienvenido</p>
            <h1 className="font-display text-3xl font-bold tracking-tighter mt-1">
              {profile?.full_name || "Panel Principal"}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin && projects.length > 0 && (
              <Button
                variant={manageMode ? "default" : "outline"}
                size="sm"
                className="font-display text-xs uppercase tracking-wider gap-2"
                onClick={() => setManageMode(!manageMode)}
              >
                {manageMode ? <><X className="h-3.5 w-3.5" /> Salir</> : <><Settings className="h-3.5 w-3.5" /> Gestionar</>}
              </Button>
            )}
            {isAdmin && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-tour="new-project" className="font-display text-xs uppercase tracking-wider gap-2">
                    <Plus className="h-4 w-4" />Nuevo Proyecto
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle className="font-display">Crear Proyecto</DialogTitle></DialogHeader>
                  <form onSubmit={handleCreateProject} className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Nombre del Proyecto</Label>
                      <Input value={newProject.name} onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} placeholder="Edificio Residencial Norte" required />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Descripción</Label>
                      <Input value={newProject.description} onChange={(e) => setNewProject({ ...newProject, description: e.target.value })} placeholder="40 viviendas, 3 plantas + sótano" />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Dirección</Label>
                      <Input value={newProject.address} onChange={(e) => setNewProject({ ...newProject, address: e.target.value })} placeholder="Calle Mayor 12, Madrid" />
                    </div>
                    <Button type="submit" className="w-full font-display text-xs uppercase tracking-wider">Crear Proyecto</Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {pendingSignatureDocs.length > 0 && (
          <button
            onClick={() => navigate(`/project/${pendingSignatureDocs[0].project_id}/signatures`)}
            className="mb-6 flex w-full items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-left transition-colors hover:border-warning"
          >
            <FileSignature className="mt-0.5 h-5 w-5 text-warning shrink-0" />
            <div>
              <p className="font-display text-sm font-semibold uppercase tracking-wider text-foreground">Documentos pendientes de firma</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tienes {pendingSignatureDocs.length} documento{pendingSignatureDocs.length > 1 ? "s" : ""} esperando tu validación.
              </p>
            </div>
          </button>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-40 bg-card border border-border rounded-lg animate-pulse" />)}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20">
            <Building2 className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="font-display text-muted-foreground">
              {isAdmin ? "Crea tu primer proyecto" : "No tienes proyectos asignados"}
            </p>
          </div>
        ) : (
          <div data-tour="projects-list" className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((project, i) => (
              <div
                key={project.id}
                className={`text-left bg-card border rounded-lg p-6 transition-all group animate-fade-in relative overflow-hidden ${manageMode ? "border-primary/30" : "border-border hover:border-foreground/20 hover:shadow-lg hover:-translate-y-0.5"}`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {coverUrls[project.id] && (
                  <div
                    className="absolute inset-0 bg-cover bg-center pointer-events-none"
                    style={{
                      backgroundImage: `url(${coverUrls[project.id]})`,
                      filter: "grayscale(100%) brightness(1.2)",
                      opacity: 0.12,
                    }}
                  />
                )}
                <button
                  onClick={() => !manageMode && navigate(`/project/${project.id}`)}
                  className="w-full text-left relative z-10"
                  disabled={manageMode}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-display text-lg font-semibold tracking-tight group-hover:text-foreground transition-colors">
                        {project.name}
                      </h3>
                      {project.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{project.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {(progress[project.id] ?? 0) > 0 && <ProgressRing percent={progress[project.id] || 0} />}
                      <span className={`px-2 py-0.5 text-[10px] font-display uppercase tracking-widest rounded ${
                        project.status === "active" ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"
                      }`}>
                        {project.status === "active" ? "Activo" : project.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                    {project.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{project.address}</span>}
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />Equipo</span>
                  </div>
                </button>
                {manageMode && isAdmin && (
                  <div className="flex gap-2 mt-4 pt-3 border-t border-border relative z-10">
                    <Button variant="outline" size="sm" className="gap-1 text-xs font-display uppercase tracking-wider flex-1" onClick={() => {
                      setEditProject(project);
                      setEditData({ name: project.name, description: project.description || "", address: project.address || "", status: project.status });
                    }}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1 text-xs font-display uppercase tracking-wider flex-1 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setDeleteProjectId(project.id)}>
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit project dialog */}
      <Dialog open={!!editProject} onOpenChange={(open) => { if (!open) setEditProject(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Editar Proyecto</DialogTitle></DialogHeader>
          <form onSubmit={handleEditProject} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Nombre</Label>
              <Input value={editData.name} onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Descripción</Label>
              <Textarea value={editData.description} onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Dirección</Label>
              <Input value={editData.address} onChange={(e) => setEditData(prev => ({ ...prev, address: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Estado</Label>
              <Input value={editData.status} onChange={(e) => setEditData(prev => ({ ...prev, status: e.target.value }))} placeholder="active, completed, cancelled" />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ImagePlus className="h-3.5 w-3.5" /> Imagen de Portada
              </Label>
              <Input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} className="cursor-pointer" />
              {editProject?.cover_image_url && !coverFile && (
                <p className="text-xs text-muted-foreground">Ya tiene imagen de portada</p>
              )}
            </div>
            <Button type="submit" disabled={editSubmitting} className="w-full font-display text-xs uppercase tracking-wider">
              {editSubmitting ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete project confirm */}
      <AlertDialog open={!!deleteProjectId} onOpenChange={() => setDeleteProjectId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Eliminar Proyecto</AlertDialogTitle>
            <AlertDialogDescription>¿Estás seguro? Se eliminarán TODOS los datos del proyecto: órdenes, incidencias, planos, documentos y firmas. Esta acción es irreversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProject} disabled={deleteSubmitting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteSubmitting ? "Eliminando..." : "Eliminar Proyecto"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Dashboard;
