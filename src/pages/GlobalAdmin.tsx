import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Shield, ArrowLeft, Save, Users, FolderPlus, Search, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type AppRole = "DO" | "DEM" | "CON" | "PRO" | "CSS";

const roleLabels: Record<AppRole, string> = {
  DO: "Director de Obra",
  DEM: "Dir. Ejecución Material",
  CON: "Contratista",
  PRO: "Promotor",
  CSS: "Coord. Seguridad y Salud",
};

const ADMIN_EMAILS = ["info@tektra.es"];

interface UserProfile {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole | null;
  created_at: string;
}

interface ProjectInfo {
  id: string;
  name: string;
}

interface MembershipInfo {
  id: string;
  project_id: string;
  role: AppRole;
  status: string;
}

const GlobalAdmin = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editRole, setEditRole] = useState<AppRole>("CON");
  const [editEmail, setEditEmail] = useState("");
  const [editName, setEditName] = useState("");
  const [assignUser, setAssignUser] = useState<UserProfile | null>(null);
  const [assignRole, setAssignRole] = useState<AppRole>("CON");
  const [userMemberships, setUserMemberships] = useState<MembershipInfo[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [deletingUser, setDeletingUser] = useState<UserProfile | null>(null);

  const deleteUser = async () => {
    if (!deletingUser) return;
    const { error } = await supabase.rpc("admin_delete_auth_user" as any, { _user_id: deletingUser.user_id });
    if (error) { toast.error("Error al eliminar: " + error.message); return; }
    toast.success("Usuario eliminado por completo");
    setDeletingUser(null);
    fetchData();
  };

  const isAdmin = ADMIN_EMAILS.includes(profile?.email?.toLowerCase() || "");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: profilesData }, { data: projectsData }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("projects").select("id, name").order("name"),
    ]);
    setUsers((profilesData as UserProfile[]) || []);
    setProjects((projectsData as ProjectInfo[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openEdit = (u: UserProfile) => {
    setEditingUser(u);
    setEditRole(u.role || "CON");
    setEditEmail(u.email || "");
    setEditName(u.full_name || "");
  };

  const saveEdit = async () => {
    if (!editingUser) return;
    const { error } = await supabase
      .from("profiles")
      .update({ role: editRole, email: editEmail.trim(), full_name: editName.trim() })
      .eq("id", editingUser.id);
    if (error) { toast.error("Error al guardar"); return; }
    toast.success("Perfil actualizado");
    setEditingUser(null);
    fetchData();
  };

  const openAssign = async (u: UserProfile) => {
    setAssignUser(u);
    setAssignRole("CON");
    const { data } = await supabase
      .from("project_members")
      .select("id, project_id, role, status")
      .eq("user_id", u.user_id);
    setUserMemberships((data as MembershipInfo[]) || []);
    setSelectedProjects([]);
  };

  const saveAssignments = async () => {
    if (!assignUser) return;
    const existingProjectIds = userMemberships.map(m => m.project_id);
    const newProjectIds = selectedProjects.filter(pid => !existingProjectIds.includes(pid));
    if (newProjectIds.length === 0) { toast.info("No hay proyectos nuevos seleccionados"); return; }

    const rows = newProjectIds.map(pid => ({
      project_id: pid,
      user_id: assignUser.user_id,
      invited_email: assignUser.email,
      role: assignRole,
      status: "accepted",
      accepted_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("project_members").insert(rows);
    if (error) { toast.error("Error al asignar: " + error.message); return; }
    toast.success(`Asignado a ${newProjectIds.length} proyecto(s)`);
    setAssignUser(null);
    fetchData();
  };

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Acceso restringido.</p>
        </div>
      </AppLayout>
    );
  }

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return !q || (u.email || "").toLowerCase().includes(q) || (u.full_name || "").toLowerCase().includes(q);
  });

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">
            Administración Global
          </p>
        </div>

        <div className="flex items-end justify-between mb-6">
          <div className="flex items-center gap-3">
            <Shield className="h-7 w-7 text-primary" />
            <h1 className="font-display text-3xl font-bold tracking-tighter">Gestión de Usuarios</h1>
          </div>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 h-9 text-sm"
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-display text-xs uppercase tracking-wider">Usuario</TableHead>
                <TableHead className="font-display text-xs uppercase tracking-wider">Rol Global</TableHead>
                <TableHead className="font-display text-xs uppercase tracking-wider">Registrado</TableHead>
                <TableHead className="font-display text-xs uppercase tracking-wider text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    <div className="h-6 w-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No hay usuarios
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <p className="font-medium text-sm text-foreground">{u.full_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{u.email || "—"}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {u.role ? roleLabels[u.role] : "Sin rol"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString("es-ES")}
                      </span>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => openEdit(u)}>
                        <Users className="h-3 w-3" /> Editar
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => openAssign(u)}>
                        <FolderPlus className="h-3 w-3" /> Proyectos
                      </Button>
                      <Button variant="destructive" size="sm" className="text-xs gap-1" onClick={() => setDeletingUser(u)}>
                        <Trash2 className="h-3 w-3" /> Eliminar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Edit User Dialog */}
        <Dialog open={!!editingUser} onOpenChange={(o) => !o && setEditingUser(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display">Editar Usuario</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre</label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
                <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Rol Global</label>
                <Select value={editRole} onValueChange={(v) => setEditRole(v as AppRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(roleLabels) as AppRole[]).map(r => (
                      <SelectItem key={r} value={r}>{roleLabels[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full gap-2" onClick={saveEdit}>
                <Save className="h-4 w-4" /> Guardar Cambios
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Assign Projects Dialog */}
        <Dialog open={!!assignUser} onOpenChange={(o) => !o && setAssignUser(null)}>
          <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">
                Asignar Proyectos — {assignUser?.full_name || assignUser?.email}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Rol en los proyectos</label>
                <Select value={assignRole} onValueChange={(v) => setAssignRole(v as AppRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(roleLabels) as AppRole[]).map(r => (
                      <SelectItem key={r} value={r}>{roleLabels[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Proyectos</label>
                <div className="space-y-2 max-h-60 overflow-y-auto border border-border rounded-lg p-3">
                  {projects.map(p => {
                    const existing = userMemberships.find(m => m.project_id === p.id);
                    const isSelected = selectedProjects.includes(p.id);
                    return (
                      <div key={p.id} className="flex items-center gap-3">
                        <Checkbox
                          checked={!!existing || isSelected}
                          disabled={!!existing}
                          onCheckedChange={(checked) => {
                            setSelectedProjects(prev =>
                              checked ? [...prev, p.id] : prev.filter(x => x !== p.id)
                            );
                          }}
                        />
                        <span className="text-sm text-foreground flex-1">{p.name}</span>
                        {existing && (
                          <Badge variant="outline" className="text-[10px]">
                            {roleLabels[existing.role] || existing.role} · {existing.status === "accepted" ? "Activo" : "Pendiente"}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <Button className="w-full gap-2" onClick={saveAssignments}>
                <FolderPlus className="h-4 w-4" /> Asignar Seleccionados
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete User Confirmation */}
        <AlertDialog open={!!deletingUser} onOpenChange={(o) => !o && setDeletingUser(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar usuario</AlertDialogTitle>
              <AlertDialogDescription>
                ¿Estás seguro de que deseas eliminar a <strong>{deletingUser?.full_name || deletingUser?.email}</strong>? 
                Se borrarán todos sus datos, membresías y su cuenta de autenticación. Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={deleteUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Eliminar permanentemente
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
};

export default GlobalAdmin;
