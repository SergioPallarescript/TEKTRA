import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjectRole } from "@/hooks/useProjectRole";
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
  FileText, Brain, BookOpen, AlertTriangle, DollarSign, Ruler, ClipboardCheck,
  UserPlus, ArrowLeft, Users, Share2, Copy, MessageCircle, FolderOpen, BarChart3, Shield, FileSignature,
} from "lucide-react";
import DailyBriefing from "@/components/DailyBriefing";

type AppRole = "DO" | "DEM" | "CON" | "PRO" | "CSS";

const roleLabels: Record<AppRole, string> = {
  DO: "Director de Obra (Arquitecto)",
  DEM: "Dir. Ejecución Material (Arq. Técnico)",
  CON: "Contratista",
  PRO: "Promotor",
  CSS: "Coord. Seguridad y Salud",
};

const modules = [
  { key: "docs", label: "Documentación de Proyecto", icon: FolderOpen, desc: "Base de conocimiento" },
  { key: "plans", label: "Planos Válidos", icon: FileText, desc: "Repositorio de planos" },
  { key: "brain", label: "Cerebro de Obra", icon: Brain, desc: "IA basada en documentos" },
  { key: "orders", label: "Libro de Órdenes", icon: BookOpen, desc: "Solo DEM" },
  { key: "incidents", label: "Libro de Incidencias", icon: AlertTriangle, desc: "Solo CSS" },
  { key: "subcontracting", label: "Libro de Subcontratación", icon: ClipboardCheck, desc: "Solo Constructor" },
  { key: "costs", label: "Validación Económica", icon: DollarSign, desc: "Certificaciones y presupuestos" },
  { key: "dwg", label: "Metro Digital", icon: Ruler, desc: "Toma de medidas" },
  { key: "cfo", label: "CFO y Libro del Edificio", icon: ClipboardCheck, desc: "Gestión documental de cierre" },
  { key: "gantt", label: "Diagrama Gantt", icon: BarChart3, desc: "Cronología de obra" },
  { key: "signatures", label: "Documentos y Firmas", icon: FileSignature, desc: "Envío, registro y firma legal" },
];

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { isAdmin } = useProjectRole(id);
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("CON");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<{ email: string; role: AppRole } | null>(null);
  const isCreator = project?.created_by === user?.id;

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const { data: proj } = await supabase.from("projects").select("*").eq("id", id).single();
      setProject(proj);

      const { data: mems } = await supabase
        .from("project_members")
        .select("*")
        .eq("project_id", id);
      // Fetch profiles separately (no FK between project_members and profiles)
      if (mems && mems.length > 0) {
        const userIds = mems.map((m: any) => m.user_id).filter(Boolean);
        const { data: profiles } = userIds.length > 0
          ? await supabase.from("profiles").select("user_id, full_name, role").in("user_id", userIds)
          : { data: [] };
        const profileMap: Record<string, any> = {};
        (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p; });
        setMembers(mems.map((m: any) => ({ ...m, profiles: m.user_id ? profileMap[m.user_id] || null : null })));
      } else {
        setMembers([]);
      }
    };
    fetchData();
  }, [id]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !user) return;

    // Check if the invited email belongs to an already-registered user
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("email", inviteEmail.trim().toLowerCase())
      .maybeSingle();

    const memberPayload: any = {
      project_id: id,
      invited_email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
      status: existingProfile ? "accepted" : "pending",
      user_id: existingProfile?.user_id || null,
      accepted_at: existingProfile ? new Date().toISOString() : null,
    };

    const { error } = await supabase.from("project_members").insert(memberPayload);

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

    // Send invite email via transactional email
    try {
      const inviterProfile = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("user_id", user.id)
        .single();

      const inviterRoleLabel = inviterProfile.data?.role
        ? `${inviterProfile.data.role} — ${roleLabels[inviterProfile.data.role as AppRole] || inviterProfile.data.role}`
        : "";

      await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "project-invitation",
          recipientEmail: inviteEmail,
          idempotencyKey: `project-invite-${id}-${inviteEmail}-${Date.now()}`,
          templateData: {
            projectName: project?.name || "",
            roleName: `${inviteRole} — ${roleLabels[inviteRole]}`,
            inviterName: inviterProfile.data?.full_name || "",
            inviterRole: inviterRoleLabel,
            siteUrl: `${window.location.origin}/auth`,
          },
        },
      });
    } catch (emailErr) {
      console.error("Error sending invite email:", emailErr);
    }

    setInviteSuccess({ email: inviteEmail, role: inviteRole });
    setInviteEmail("");

    const { data: mems } = await supabase
      .from("project_members")
      .select("*")
      .eq("project_id", id);
    if (mems && mems.length > 0) {
      const userIds = mems.map((m: any) => m.user_id).filter(Boolean);
      const { data: profiles } = userIds.length > 0
        ? await supabase.from("profiles").select("user_id, full_name, role").in("user_id", userIds)
        : { data: [] };
      const profileMap: Record<string, any> = {};
      (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p; });
      setMembers(mems.map((m: any) => ({ ...m, profiles: m.user_id ? profileMap[m.user_id] || null : null })));
    } else {
      setMembers([]);
    }
  };

  // Sort members: accepted first, then pending
  const sortedMembers = [...members].sort((a, b) => {
    if (a.status === "accepted" && b.status !== "accepted") return -1;
    if (a.status !== "accepted" && b.status === "accepted") return 1;
    return 0;
  });

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
            <Dialog open={inviteOpen} onOpenChange={(open) => {
              setInviteOpen(open);
              if (!open) setInviteSuccess(null);
            }}>
              <DialogTrigger asChild>
                <Button data-tour="invite-agent" variant="outline" className="font-display text-xs uppercase tracking-wider gap-2">
                  <UserPlus className="h-4 w-4" />
                  Invitar Agente
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-display">
                    {inviteSuccess ? "¡Invitación Registrada!" : "Invitar Agente"}
                  </DialogTitle>
                </DialogHeader>

                {inviteSuccess ? (
                  <div className="space-y-4 mt-2">
                    <div className="bg-success/10 border border-success/30 rounded-lg p-4 space-y-2">
                      <p className="text-sm font-semibold text-success">✓ Agente añadido correctamente</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold">{inviteSuccess.email}</span> ha sido invitado como{" "}
                        <span className="font-bold">{inviteSuccess.role} — {roleLabels[inviteSuccess.role]}</span>
                      </p>
                    </div>

                    <div className="bg-secondary/50 border border-border rounded-lg p-4 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Ahora envíale el enlace de registro para que pueda acceder al proyecto. 
                        Al registrarse con <span className="font-semibold">{inviteSuccess.email}</span>, se vinculará automáticamente.
                      </p>
                    </div>

                    <p className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                      Enviar enlace de registro
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2 text-xs"
                        onClick={() => {
                          const msg = `¡Hola! 👋\n\nTe escribo para invitarte a participar como agente en nuestro proyecto de obra gestionado a través de TEKTRA. 🏗️\n\nDesde esta plataforma centralizaremos la dirección, ejecución, el libro de órdenes y las firmas digitales de forma segura.\n\nPara acceder a tu panel y revisar la documentación, solo tienes que confirmar tu cuenta aquí:\n🔗 https://tektra.es\n\nSistema de gestión profesional para la trazabilidad y seguridad jurídica de los agentes.`;
                          const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
                          window.open(waUrl, "_blank");
                        }}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        WhatsApp
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2 text-xs"
                        onClick={() => {
                          const signupUrl = `${window.location.origin}/auth`;
                          const msg = `¡Hola! Te invito al proyecto "${project?.name}" en TEKTRA como ${inviteSuccess.role} (${roleLabels[inviteSuccess.role]}).${project?.address ? `\n📍 ${project.address}` : ""}\n\nRegístrate con tu email ${inviteSuccess.email} aquí:\n${signupUrl}`;
                          if (navigator.share) {
                            navigator.share({ title: "Invitación TEKTRA", text: msg, url: signupUrl });
                          } else {
                            navigator.clipboard.writeText(msg);
                            toast.success("Mensaje copiado al portapapeles");
                          }
                        }}
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        Compartir
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2 text-xs"
                        onClick={() => {
                          const signupUrl = `${window.location.origin}/auth`;
                          const msg = `¡Hola! Te invito al proyecto "${project?.name}" en TEKTRA como ${inviteSuccess.role} (${roleLabels[inviteSuccess.role]}).${project?.address ? `\n📍 ${project.address}` : ""}\n\nRegístrate con tu email ${inviteSuccess.email} aquí:\n${signupUrl}`;
                          navigator.clipboard.writeText(msg);
                          toast.success("Mensaje copiado");
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-border">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="flex-1 font-display text-xs uppercase tracking-wider"
                        onClick={() => setInviteSuccess(null)}
                      >
                        <UserPlus className="h-3.5 w-3.5 mr-2" />
                        Invitar otro agente
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="font-display text-xs uppercase tracking-wider"
                        onClick={() => { setInviteOpen(false); setInviteSuccess(null); }}
                      >
                        Cerrar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
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
                  </>
                )}
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Team */}
        <div className="mb-8">
        <h2 data-tour="project-team" className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3 flex items-center gap-2">
            <Users className="h-3.5 w-3.5" />
            Equipo del Proyecto
          </h2>
          <div className="flex flex-wrap gap-2">
            {sortedMembers.map((m) => (
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

        {/* Daily Briefing */}
        <div className="mb-8">
          <DailyBriefing projectId={id!} projectAddress={project.address} />
        </div>

        {/* Modules Grid */}
        <h2 data-tour="modules-grid" className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
          Módulos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {modules.map((mod, i) => (
            <button
              key={mod.key}
              data-tour={`module-${mod.key}`}
              onClick={() => navigate(`/project/${id}/${mod.key}`)}
              className="bg-card border border-border rounded-lg p-5 text-left hover:border-foreground/20 hover:shadow-lg hover:-translate-y-0.5 transition-all group animate-fade-in"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <mod.icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors mb-3" />
              <h3 className="font-display text-sm font-semibold tracking-tight">
                {mod.label}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">{mod.desc}</p>
            </button>
          ))}

          {/* Admin Panel - only for DO/DEM */}
          {isAdmin && (
            <button
              onClick={() => navigate(`/project/${id}/admin`)}
              className="bg-card border border-primary/20 rounded-lg p-5 text-left hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5 transition-all group animate-fade-in"
              style={{ animationDelay: `${modules.length * 60}ms` }}
            >
              <Shield className="h-5 w-5 text-primary group-hover:text-primary transition-colors mb-3" />
              <h3 className="font-display text-sm font-semibold tracking-tight">
                ADMIN
              </h3>
              <p className="text-xs text-muted-foreground mt-1">Gestión de roles y permisos</p>
            </button>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default ProjectDetail;
