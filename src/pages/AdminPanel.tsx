import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjectRole } from "@/hooks/useProjectRole";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { notifyUser } from "@/lib/notifications";
import { ArrowLeft, Shield, Trash2, History } from "lucide-react";

type AppRole = "DO" | "DEM" | "CON" | "PRO" | "CSS";

const roleLabels: Record<AppRole, string> = {
  DO: "Director de Obra (Arquitecto)",
  DEM: "Dir. Ejecución Material (Arq. Técnico)",
  CON: "Contratista",
  PRO: "Promotor",
  CSS: "Coord. Seguridad y Salud",
};

const roleColors: Record<AppRole, string> = {
  DO: "bg-primary/10 text-primary",
  DEM: "bg-accent/20 text-accent-foreground",
  CON: "bg-secondary text-secondary-foreground",
  PRO: "bg-muted text-muted-foreground",
  CSS: "bg-destructive/10 text-destructive",
};

/* Roles that can have CSS as secondary */
const CSS_ELIGIBLE_ROLES: AppRole[] = ["DEM", "DO"];

const AdminPanel = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [members, setMembers] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [updatingSecondaryId, setUpdatingSecondaryId] = useState<string | null>(null);
  const [creatorUserId, setCreatorUserId] = useState<string | null>(null);

  const { isAdmin } = useProjectRole(projectId);

  /* ─── Fetch members ─── */
  const fetchMembers = useCallback(async () => {
    if (!projectId) return;

    const { data: memberData } = await supabase
      .from("project_members")
      .select("*")
      .eq("project_id", projectId);

    const { data: project } = await supabase
      .from("projects")
      .select("created_by")
      .eq("id", projectId)
      .single();

    const projectCreator = project?.created_by ?? null;
    setCreatorUserId(projectCreator);

    let allMembers: any[] = memberData || [];

    // Collect user_ids for batch profile fetch
    const userIds = allMembers.map((m: any) => m.user_id).filter(Boolean);
    if (projectCreator && !userIds.includes(projectCreator)) {
      userIds.push(projectCreator);
    }

    let profilesMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, role")
        .in("user_id", userIds);

      if (profilesData) {
        profilesData.forEach((p: any) => { profilesMap[p.user_id] = p; });
      }
    }

    // Attach profile data
    allMembers = allMembers.map((m: any) => ({
      ...m,
      profiles: m.user_id ? profilesMap[m.user_id] || null : null,
    }));

    // Mark creator and add virtual entry if creator not in project_members
    if (projectCreator) {
      const creatorIdx = allMembers.findIndex((m: any) => m.user_id === projectCreator);
      if (creatorIdx >= 0) {
        allMembers[creatorIdx] = { ...allMembers[creatorIdx], _isCreator: true };
      } else {
        const creatorProfile = profilesMap[projectCreator];
        if (creatorProfile) {
          allMembers = [
            {
              id: `creator-${projectCreator}`,
              project_id: projectId,
              user_id: projectCreator,
              role: creatorProfile.role || "DO",
              secondary_role: null,
              status: "accepted",
              invited_email: creatorProfile.email,
              profiles: creatorProfile,
              _isCreator: true,
              _isVirtual: true,
            },
            ...allMembers,
          ];
        }
      }
    }

    setMembers(allMembers);
    setLoading(false);
  }, [projectId]);

  /* ─── Fetch audit logs ─── */
  const fetchAuditLogs = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("project_id", projectId)
      .in("action", ["role_changed", "secondary_role_changed", "member_removed", "member_invited"])
      .order("created_at", { ascending: false })
      .limit(50);
    setAuditLogs(data || []);
  }, [projectId]);

  /* ─── Broadcast role refresh across tabs/components ─── */
  const broadcastRoleRefresh = useCallback(async () => {
    if (!projectId) return;
    await supabase.auth.refreshSession().catch(() => undefined);
    const payload = JSON.stringify({ projectId, timestamp: Date.now() });
    localStorage.setItem("tektra_role_refresh", payload);
    window.dispatchEvent(new CustomEvent("tektra-role-updated", {
      detail: { projectId, timestamp: Date.now() },
    }));
  }, [projectId]);

  useEffect(() => {
    fetchMembers();
    fetchAuditLogs();
  }, [fetchMembers, fetchAuditLogs]);

  /* ─── Role change handler ─── */
  const handleRoleChange = async (memberId: string, newRole: AppRole, memberEmail: string, oldRole: string) => {
    if (!user || !projectId) return;

    const { error } = await supabase
      .from("project_members")
      .update({ role: newRole })
      .eq("id", memberId);

    if (error) {
      toast.error("Error al cambiar el rol");
      return;
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      project_id: projectId,
      action: "role_changed",
      details: { member_email: memberEmail, old_role: oldRole, new_role: newRole, changed_by: profile?.email },
    });

    const memberUserId = members.find((m: any) => m.id === memberId)?.user_id;
    if (memberUserId) {
      await notifyUser({
        userId: memberUserId, projectId,
        title: "Tu rol ha sido actualizado",
        message: `Tu rol ha cambiado de ${oldRole} a ${newRole}`,
        type: "info",
      });
    }

    toast.success(`Rol actualizado a ${roleLabels[newRole]}`);
    await broadcastRoleRefresh();
    fetchMembers();
    fetchAuditLogs();
  };

  /* ─── CSS dual role toggle (rebuilt from scratch) ─── */
  const handleSecondaryRoleToggle = async (member: any) => {
    if (!user || !projectId) return;

    const targetUserId = member.user_id;
    if (!targetUserId) {
      toast.error("Este miembro no tiene usuario vinculado");
      return;
    }

    setUpdatingSecondaryId(member.id);

    try {
      const isVirtual = member._isVirtual === true;
      const memberRole = (member.role as AppRole);

      if (!CSS_ELIGIBLE_ROLES.includes(memberRole)) {
        throw new Error("El rol dual CSS solo puede activarse sobre usuarios DO o DEM");
      }

      const currentSecondary = member.secondary_role as string | null;
      const newSecondary: AppRole | null = currentSecondary === "CSS" ? null : "CSS";
      const memberEmail = member.invited_email || member.profiles?.email || "—";

      if (isVirtual) {
        // Creator not yet in project_members → insert a real row
        const { error: insertError } = await supabase
          .from("project_members")
          .insert({
            project_id: projectId,
            user_id: targetUserId,
            invited_email: memberEmail === "—" ? null : memberEmail,
            role: memberRole,
            secondary_role: newSecondary,
            status: "accepted",
            accepted_at: new Date().toISOString(),
          });

        if (insertError) throw insertError;
      } else {
        // Real member → just update secondary_role
        const { error: updateError } = await supabase
          .from("project_members")
          .update({ secondary_role: newSecondary })
          .eq("id", member.id);

        if (updateError) throw updateError;
      }

      // Audit log
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        project_id: projectId,
        action: "secondary_role_changed",
        details: {
          member_email: memberEmail,
          target_user_id: targetUserId,
          old_secondary: currentSecondary,
          new_secondary: newSecondary,
          changed_by: profile?.email,
        },
      });

      // Notify affected user
      if (targetUserId !== user.id) {
        await notifyUser({
          userId: targetUserId, projectId,
          title: newSecondary ? "Rol dual CSS activado" : "Rol dual CSS desactivado",
          message: newSecondary
            ? "Se te ha asignado el rol dual CSS, ahora tienes acceso al Libro de Incidencias"
            : "Se ha desactivado tu rol dual CSS",
          type: "info",
        });
      }

      await broadcastRoleRefresh();
      await Promise.all([fetchMembers(), fetchAuditLogs()]);

      toast.success(newSecondary ? "Rol CSS activado como rol dual" : "Rol CSS desactivado");
    } catch (error) {
      console.error("Error al cambiar rol secundario:", error);
      toast.error(error instanceof Error ? error.message : "Error al cambiar rol secundario");
    } finally {
      setUpdatingSecondaryId(null);
    }
  };

  /* ─── Delete member ─── */
  const handleDeleteMember = async () => {
    if (!deleteTarget || !user || !projectId) return;

    const { error } = await supabase
      .from("project_members")
      .delete()
      .eq("id", deleteTarget.id);

    if (error) {
      toast.error("Error al eliminar agente");
      return;
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      project_id: projectId,
      action: "member_removed",
      details: {
        member_email: deleteTarget.invited_email || deleteTarget.profiles?.email,
        role: deleteTarget.role,
        removed_by: profile?.email,
      },
    });

    if (deleteTarget.user_id) {
      await notifyUser({
        userId: deleteTarget.user_id, projectId,
        title: "Acceso revocado",
        message: "Se ha revocado tu acceso a este proyecto",
        type: "warning",
      });
    }

    toast.success("Agente eliminado del proyecto");
    setDeleteTarget(null);
    fetchMembers();
    fetchAuditLogs();
  };

  /* ─── Access guard ─── */
  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">No tienes permisos de administración.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">
            Administración
          </p>
        </div>

        <div className="flex items-end justify-between mb-8">
          <div className="flex items-center gap-3">
            <Shield className="h-7 w-7 text-primary" />
            <h1 className="font-display text-3xl font-bold tracking-tighter">Panel Admin</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="font-display text-xs uppercase tracking-wider gap-2"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History className="h-4 w-4" />
            {showHistory ? "Agentes" : "Historial"}
          </Button>
        </div>

        {!showHistory ? (
          /* Members Table */
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="font-display text-xs uppercase tracking-wider">Agente</TableHead>
                  <TableHead className="font-display text-xs uppercase tracking-wider">Estado</TableHead>
                  <TableHead className="font-display text-xs uppercase tracking-wider">Rol Principal</TableHead>
                  <TableHead className="font-display text-xs uppercase tracking-wider">Rol Dual (CSS)</TableHead>
                  <TableHead className="font-display text-xs uppercase tracking-wider text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <div className="h-6 w-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : members.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No hay agentes en este proyecto
                    </TableCell>
                  </TableRow>
                ) : (
                  members.map((member) => {
                    const email = member.invited_email || member.profiles?.email || "—";
                    const name = member.profiles?.full_name || email;
                    const currentRole = member.role as AppRole;
                    const secondaryRole = member.secondary_role as string | null;
                    const isVirtual = member._isVirtual === true;
                    const isCreator = member._isCreator === true;
                    const canToggleCSS = CSS_ELIGIBLE_ROLES.includes(currentRole);

                    return (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground text-sm">
                              {name}
                              {isCreator && <span className="ml-2 text-xs text-primary">(Creador)</span>}
                            </p>
                            <p className="text-xs text-muted-foreground">{email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              member.status === "accepted"
                                ? "border-green-500/30 text-green-600 bg-green-500/10"
                                : "border-yellow-500/30 text-yellow-600 bg-yellow-500/10"
                            }
                          >
                            {member.status === "accepted" ? "Activo" : "Pendiente"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {isVirtual ? (
                            <Badge className={roleColors[currentRole]}>{roleLabels[currentRole]}</Badge>
                          ) : (
                            <Select
                              value={currentRole}
                              onValueChange={(val) =>
                                handleRoleChange(member.id, val as AppRole, email, currentRole)
                              }
                            >
                              <SelectTrigger className="w-[220px] h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(roleLabels) as AppRole[]).map((role) => (
                                  <SelectItem key={role} value={role} className="text-xs">
                                    {roleLabels[role]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell>
                          {canToggleCSS ? (
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={secondaryRole === "CSS"}
                                disabled={updatingSecondaryId === member.id}
                                onCheckedChange={() => handleSecondaryRoleToggle(member)}
                              />
                              <span className="text-xs text-muted-foreground">
                                {updatingSecondaryId === member.id
                                  ? "Actualizando..."
                                  : secondaryRole === "CSS"
                                    ? "CSS Activo"
                                    : "Desactivado"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {!isCreator && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteTarget(member)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          /* Audit History */
          <div className="space-y-3">
            <h2 className="font-display text-lg font-semibold tracking-tight mb-4">Historial de Cambios</h2>
            {auditLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin registros</p>
            ) : (
              auditLogs.map((log) => {
                const details = log.details as any;
                let description = "";
                if (log.action === "role_changed") {
                  description = `${details.changed_by} cambió el rol de ${details.member_email}: ${details.old_role} → ${details.new_role}`;
                } else if (log.action === "secondary_role_changed") {
                  description = `${details.changed_by} ${details.new_secondary ? "activó" : "desactivó"} rol dual CSS para ${details.member_email}`;
                } else if (log.action === "member_removed") {
                  description = `${details.removed_by} eliminó a ${details.member_email} (${details.role})`;
                } else if (log.action === "member_invited") {
                  description = `Se invitó a ${details.email} como ${details.role}`;
                }

                return (
                  <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card/50">
                    <History className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">{description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(log.created_at).toLocaleString("es-ES")}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Dual Role Info */}
        <div className="mt-6 p-4 rounded-lg border border-border bg-muted/20">
          <h3 className="font-display text-xs uppercase tracking-wider text-muted-foreground mb-2">
            ℹ️ Rol Dual CSS
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Al activar el rol dual CSS, el Director de Obra (DO) o el Arquitecto Técnico (DEM) obtiene
            acceso de escritura tanto en el Libro de Órdenes como en el Libro de Incidencias,
            manteniendo una sesión única. El creador del proyecto puede gestionar su propio rol dual.
            Todos los cambios quedan registrados en el historial de auditoría.
          </p>
        </div>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display">Eliminar Agente</AlertDialogTitle>
              <AlertDialogDescription>
                ¿Estás seguro de que deseas revocar el acceso de{" "}
                <strong>{deleteTarget?.invited_email || deleteTarget?.profiles?.email}</strong> a este proyecto?
                Esta acción es irreversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteMember}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
};

export default AdminPanel;
