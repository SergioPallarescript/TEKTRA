import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Building2, MapPin, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  const navigate = useNavigate();

  const isAdmin = profile?.role === "DO" || profile?.role === "DEM";

  useEffect(() => {
    const fetchProjects = async () => {
      const { data } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setProjects(data);
      setLoading(false);
    };
    fetchProjects();
  }, []);

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

    if (error) {
      toast.error("Error al crear el proyecto");
      return;
    }

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
            <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">
              Bienvenido
            </p>
            <h1 className="font-display text-3xl font-bold tracking-tighter mt-1">
              {profile?.full_name || "Panel Principal"}
            </h1>
          </div>

          {isAdmin && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="font-display text-xs uppercase tracking-wider gap-2">
                  <Plus className="h-4 w-4" />
                  Nuevo Proyecto
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-display">Crear Proyecto</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateProject} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                      Nombre del Proyecto
                    </Label>
                    <Input
                      value={newProject.name}
                      onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                      placeholder="Edificio Residencial Norte"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                      Descripción
                    </Label>
                    <Input
                      value={newProject.description}
                      onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                      placeholder="40 viviendas, 3 plantas + sótano"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                      Dirección
                    </Label>
                    <Input
                      value={newProject.address}
                      onChange={(e) => setNewProject({ ...newProject, address: e.target.value })}
                      placeholder="Calle Mayor 12, Madrid"
                    />
                  </div>
                  <Button type="submit" className="w-full font-display text-xs uppercase tracking-wider">
                    Crear Proyecto
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

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
                  <div>
                    <h3 className="font-display text-lg font-semibold tracking-tight group-hover:text-foreground transition-colors">
                      {project.name}
                    </h3>
                    {project.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {project.description}
                      </p>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] font-display uppercase tracking-widest rounded ${
                    project.status === "active"
                      ? "bg-success/10 text-success"
                      : "bg-secondary text-muted-foreground"
                  }`}>
                    {project.status === "active" ? "Activo" : project.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                  {project.address && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {project.address}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    Equipo
                  </span>
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
