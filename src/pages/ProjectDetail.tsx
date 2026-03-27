import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  FileText,
  Brain,
  BookOpen,
  AlertTriangle,
  DollarSign,
  Ruler,
  ClipboardCheck,
  UserPlus,
  ArrowLeft,
  Users,
} from "lucide-react";

type AppRole = "DO" | "DEO" | "CON" | "PRO" | "CSS";

const roleLabels: Record<AppRole, string> = {
  DO: "Director de Obra",
  DEO: "Director de Ejecución",
  CON: "Contratista",
  PRO: "Promotor",
  CSS: "Coord. Seguridad y Salud",
};

const modules = [
  { key: "plans", label: "Planos Últimos", icon: FileText, desc: "Repositorio de planos" },
  { key: "brain", label: "Cerebro de Obra", icon: Brain, desc: "Consultas RAG" },
  { key: "orders", label: "Libro de Órdenes", icon: BookOpen, desc: "Solo DEO" },
  { key: "incidents", label: "Libro de Incidencias", icon: AlertTriangle, desc: "Solo CSS" },
  { key: "costs", label: "Validación de Costes", icon: DollarSign, desc: "Flujo financiero" },
  { key: "dwg", label: "Visor DWG", icon: Ruler, desc: "Mediciones CAD" },
  { key: "cfo", label: "Docs Finales (CFO)", icon: ClipboardCheck, desc: "Checklist inteligente" },
];

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("CON");
  const [inviteOpen, setInviteOpen] = useState(false);
  const isCreator = project?.created_by === user?.id;

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const { data: proj } = await supabase.from("projects").select("*").eq("id", id).single();
      setProject(proj);

      const { data: mems } = await supabase
        .from("project_members")
        .select("*, profiles(full_name, role)")
        .eq("project_id", id);
      setMembers(mems || []);
    };
    fetchData();
  }, [id]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !user) return;

    const { error } = await supabase.from("project_members").insert({
      project_id: id,
      invited_email: inviteEmail,
      role: inviteRole,
      status: "pending",
    });

    if (error) {
      toast.error(error.message.includes("duplicate") ? "Ya está invitado" : "Error al invitar");
      return;
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      project_id: id,
      action: "member_invited",
      details: { email: inviteEmail, role: inviteRole },
    });

    toast.success(`Invitación enviada a ${inviteEmail}`);
    setInviteEmail("");
    setInviteOpen(false);

    // Refresh members
    const { data: mems } = await supabase
      .from("project_members")
      .select("*, profiles(full_name, role)")
      .eq("project_id", id);
    setMembers(mems || []);
  };

  if (!project) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">
            Proyecto
          </p>
        </div>
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tighter">{project.name}</h1>
            {project.address && (
              <p className="text-sm text-muted-foreground mt-1">{project.address}</p>
            )}
          </div>
          {isCreator && (
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="font-display text-xs uppercase tracking-wider gap-2">
                  <UserPlus className="h-4 w-4" />
                  Invitar Agente
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-display">Invitar Agente</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleInvite} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                      Correo del Agente
                    </Label>
                    <Input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="agente@empresa.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                      Rol
                    </Label>
                    <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AppRole)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(roleLabels) as AppRole[]).map((r) => (
                          <SelectItem key={r} value={r}>
                            {r} — {roleLabels[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full font-display text-xs uppercase tracking-wider">
                    Enviar Invitación
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Team */}
        <div className="mb-8">
          <h2 className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3 flex items-center gap-2">
            <Users className="h-3.5 w-3.5" />
            Equipo del Proyecto
          </h2>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <div
                key={m.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-display uppercase tracking-wider ${
                  m.status === "accepted"
                    ? "border-success/30 bg-success/5 text-success"
                    : "border-border bg-secondary/50 text-muted-foreground"
                }`}
              >
                <span className="font-bold">{m.role}</span>
                <span className="font-body normal-case text-xs">
                  {m.profiles?.full_name || m.invited_email}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Modules Grid */}
        <h2 className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
          Módulos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {modules.map((mod, i) => (
            <button
              key={mod.key}
              onClick={() => {
                if (mod.key === "plans") navigate(`/project/${id}/plans`);
                else if (mod.key === "orders") navigate(`/project/${id}/orders`);
                else if (mod.key === "incidents") navigate(`/project/${id}/incidents`);
                else if (mod.key === "costs") navigate(`/project/${id}/costs`);
                else toast.info(`Módulo "${mod.label}" — próximamente`);
              }}
              className="bg-card border border-border rounded-lg p-5 text-left hover:border-foreground/20 transition-all group animate-fade-in"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <mod.icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors mb-3" />
              <h3 className="font-display text-sm font-semibold tracking-tight">
                {mod.label}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">{mod.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </AppLayout>
  );
};

export default ProjectDetail;
