import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import ProgressRing from "@/components/ProgressRing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Building2, FileSignature, MapPin, Users } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Project {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  status: string;
  created_at: string;
}

const Dashboard = () => {
  const { user, profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newProject, setNewProject] = useState({ name: "", description: "", address: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [pendingSignatureDocs, setPendingSignatureDocs] = useState<any[]>([]);
  const navigate = useNavigate();

  const isAdmin = profile?.role === "DO" || profile?.role === "DEM";

  useEffect(() => {
    const fetchProjects = async () => {
      const { data } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) {
        setProjects(data);
        // Calculate progress for each project
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
            // Mix with order activity as a modifier (more orders = more progress confidence)
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
    fetchProjects();
  }, [user]);

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
      user_id: user.id,
      project_id: data.id,
      action: "project_created",
      details: { name: newProject.name },
    });

    setProjects((prev) => [data, ...prev]);
    setNewProject({ name: "", description: "", address: "" });
    setDialogOpen(false);
    toast.success("Proyecto creado");
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">Bienvenido</p>
            <h1 className="font-display text-3xl font-bold tracking-tighter mt-1">
              {profile?.full_name || "Panel Principal"}
            </h1>
          </div>

          {isAdmin && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="font-display text-xs uppercase tracking-wider gap-2">
                  <Plus className="h-4 w-4" />Nuevo Proyecto
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-display">Crear Proyecto</DialogTitle>
                </DialogHeader>
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

        {pendingSignatureDocs.length > 0 && (
          <button
            onClick={() => navigate(`/project/${pendingSignatureDocs[0].project_id}/signatures`)}
            className="mb-6 flex w-full items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-left transition-colors hover:border-warning"
          >
            <FileSignature className="mt-0.5 h-5 w-5 text-warning shrink-0" />
            <div>
              <p className="font-display text-sm font-semibold uppercase tracking-wider text-foreground">
                Documentos pendientes de firma
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tienes {pendingSignatureDocs.length} documento{pendingSignatureDocs.length > 1 ? "s" : ""} esperando tu validación.
              </p>
            </div>
          </button>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 bg-card border border-border rounded-lg animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20">
            <Building2 className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="font-display text-muted-foreground">
              {isAdmin ? "Crea tu primer proyecto" : "No tienes proyectos asignados"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((project, i) => (
              <button
                key={project.id}
                onClick={() => navigate(`/project/${project.id}`)}
                className="text-left bg-card border border-border rounded-lg p-6 hover:border-foreground/20 transition-all group animate-fade-in"
                style={{ animationDelay: `${i * 80}ms` }}
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
                    {(progress[project.id] ?? 0) > 0 && (
                      <ProgressRing percent={progress[project.id] || 0} />
                    )}
                    <span className={`px-2 py-0.5 text-[10px] font-display uppercase tracking-widest rounded ${
                      project.status === "active" ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"
                    }`}>
                      {project.status === "active" ? "Activo" : project.status}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                  {project.address && (
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{project.address}</span>
                  )}
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />Equipo</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Dashboard;
