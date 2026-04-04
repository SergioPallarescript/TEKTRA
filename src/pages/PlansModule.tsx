import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjectRole } from "@/hooks/useProjectRole";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { notifyProjectMembers } from "@/lib/notifications";
import { sanitizeFileName, uploadFileWithFallback } from "@/lib/storage";
import {
  ArrowLeft, Upload, FileText, CheckCircle2, Clock, Plus, Download, History, ShieldCheck, Pencil, Trash2,
} from "lucide-react";

const ROLES = ["DO", "DEM", "CSS", "CON", "PRO"] as const;

const roleLabels: Record<string, string> = {
  DO: "Director de Obra",
  DEM: "Dir. Ejecución Material",
  CON: "Contratista",
  PRO: "Promotor",
  CSS: "Coord. Seguridad",
};

interface Plan {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  current_version: number;
  created_at: string;
}

interface PlanVersion {
  id: string;
  plan_id: string;
  version_number: number;
  file_url: string;
  file_name: string;
  file_size: number | null;
  uploaded_by: string;
  notes: string | null;
  created_at: string;
}

interface Conformity {
  id: string;
  plan_version_id: string;
  user_id: string;
  role: string;
  signed_at: string;
  geo_location: string | null;
}

const PlansModule = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [versions, setVersions] = useState<PlanVersion[]>([]);
  const [conformities, setConformities] = useState<Conformity[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [newPlan, setNewPlan] = useState({ name: "", description: "", category: "" });

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploading, setUploading] = useState(false);

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [signing, setSigning] = useState(false);

  // Edit/Delete plan entry
  const [editPlanOpen, setEditPlanOpen] = useState(false);
  const [editPlanData, setEditPlanData] = useState<{ id: string; name: string; category: string; description: string }>({ id: "", name: "", category: "", description: "" });
  const [editPlanSubmitting, setEditPlanSubmitting] = useState(false);
  const [deletePlanId, setDeletePlanId] = useState<string | null>(null);
  const [deletePlanSubmitting, setDeletePlanSubmitting] = useState(false);

  const { isAdmin, projectRole } = useProjectRole(projectId);

  const fetchPlans = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("plans")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (data) setPlans(data);
    setLoading(false);
  }, [projectId]);

  const fetchVersions = useCallback(async (planId: string) => {
    const { data } = await supabase
      .from("plan_versions")
      .select("*")
      .eq("plan_id", planId)
      .order("version_number", { ascending: false });
    if (data) setVersions(data);
  }, []);

  const fetchConformities = useCallback(async (versionId: string) => {
    const { data } = await supabase
      .from("plan_conformities")
      .select("*")
      .eq("plan_version_id", versionId);
    if (data) setConformities(data);
  }, []);

  const fetchMembers = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("project_members")
      .select("*")
      .eq("project_id", projectId)
      .eq("status", "accepted");
    if (data && data.length > 0) {
      const userIds = data.map((m: any) => m.user_id).filter(Boolean);
      const { data: profiles } = userIds.length > 0
        ? await supabase.from("profiles").select("user_id, full_name, role").in("user_id", userIds)
        : { data: [] };
      const profileMap: Record<string, any> = {};
      (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p; });
      setMembers(data.map((m: any) => ({ ...m, profiles: m.user_id ? profileMap[m.user_id] || null : null })));
    } else {
      setMembers(data || []);
    }
  }, [projectId]);

  useEffect(() => {
    fetchPlans();
    fetchMembers();
  }, [fetchPlans, fetchMembers]);

  useEffect(() => {
    if (selectedPlan) fetchVersions(selectedPlan.id);
  }, [selectedPlan, fetchVersions]);

  const latestVersion = versions[0];

  useEffect(() => {
    if (latestVersion) fetchConformities(latestVersion.id);
    else setConformities([]);
  }, [latestVersion, fetchConformities]);

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !user) return;
    const { error } = await supabase
      .from("plans")
      .insert({
        project_id: projectId,
        name: newPlan.name,
        description: newPlan.description || null,
        category: newPlan.category || null,
        created_by: user.id,
      });
    if (error) { toast.error("Error al crear el plano"); return; }
    await supabase.from("audit_logs").insert({
      user_id: user.id, project_id: projectId,
      action: "plan_created", details: { plan_name: newPlan.name },
    });
    await notifyProjectMembers({
      projectId, actorId: user.id,
      title: "Nuevo plano creado",
      message: `Se ha creado el plano "${newPlan.name}"`,
      type: "plan",
    });
    setNewPlan({ name: "", description: "", category: "" });
    setCreateOpen(false);
    fetchPlans();
    toast.success("Plano creado");
  };

  const handleEditPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !user) return;
    setEditPlanSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-plan", {
        body: {
          action: "update",
          projectId,
          planId: editPlanData.id,
          name: editPlanData.name,
          category: editPlanData.category,
          description: editPlanData.description,
        },
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      toast.success("Plano actualizado");
      setEditPlanOpen(false);
      fetchPlans();
      if (selectedPlan?.id === editPlanData.id) {
        setSelectedPlan({ ...selectedPlan, name: editPlanData.name, description: editPlanData.description || null, category: editPlanData.category || null });
      }
    } catch (err: any) {
      toast.error(err.message || "Error al editar el plano");
    } finally {
      setEditPlanSubmitting(false);
    }
  };

  const handleDeletePlan = async () => {
    if (!deletePlanId || !projectId || !user) return;
    setDeletePlanSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-plan", {
        body: { action: "delete", projectId, planId: deletePlanId },
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      toast.success("Plano eliminado");
      setDeletePlanId(null);
      if (selectedPlan?.id === deletePlanId) {
        setSelectedPlan(null); setVersions([]); setConformities([]);
      }
      fetchPlans();
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar el plano");
    } finally {
      setDeletePlanSubmitting(false);
    }
  };

  const handleUploadVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan || !uploadFile || !user || !projectId) return;
    setUploading(true);
    try {
      const actualVersion = versions.length > 0 ? versions[0].version_number + 1 : 1;
      const filePath = `${projectId}/${selectedPlan.id}/v${actualVersion}_${sanitizeFileName(uploadFile.name)}`;
      const { error: storageError } = await uploadFileWithFallback({ path: filePath, file: uploadFile });
      if (storageError) throw storageError;
      const { error: versionError } = await supabase.from("plan_versions").insert({
        plan_id: selectedPlan.id,
        version_number: actualVersion,
        file_url: filePath,
        file_name: uploadFile.name,
        file_size: uploadFile.size,
        uploaded_by: user.id,
        notes: uploadNotes || null,
      });
      if (versionError) throw versionError;
      await supabase.from("plans").update({ current_version: actualVersion }).eq("id", selectedPlan.id);
      await supabase.from("audit_logs").insert({
        user_id: user.id, project_id: projectId,
        action: "plan_version_uploaded",
        details: { plan_name: selectedPlan.name, version: actualVersion, file_name: uploadFile.name },
      });
      await notifyProjectMembers({
        projectId, actorId: user.id,
        title: "Nueva versión de plano",
        message: `Se ha subido la versión ${actualVersion} del plano "${selectedPlan.name}"`,
        type: "plan",
      });
      setSelectedPlan({ ...selectedPlan, current_version: actualVersion });
      setUploadFile(null); setUploadNotes(""); setUploadOpen(false);
      fetchVersions(selectedPlan.id);
      toast.success(`Versión ${actualVersion} subida correctamente`);
    } catch (err: any) {
      toast.error(err.message || "Error al subir el archivo");
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmConformity = async () => {
    if (!latestVersion || !user || !profile || !projectId) return;
    setSigning(true);
    let geoString = "unavailable";
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
      );
      geoString = `${pos.coords.latitude},${pos.coords.longitude}`;
    } catch {}
    const memberRole = projectRole || "DO";
    const { error } = await supabase.from("plan_conformities").insert({
      plan_version_id: latestVersion.id, user_id: user.id, role: memberRole, geo_location: geoString,
    });
    if (error) {
      if (error.message.includes("duplicate")) toast.info("Ya has firmado esta versión");
      else toast.error("Error al firmar conformidad");
      setSigning(false); setShowConfirmDialog(false); return;
    }
    await supabase.from("audit_logs").insert({
      user_id: user.id, project_id: projectId,
      action: "plan_conformity_signed",
      details: { plan_name: selectedPlan?.name, version: latestVersion.version_number, role: memberRole, geo_location: geoString },
    });
    fetchConformities(latestVersion.id);
    setSigning(false); setShowConfirmDialog(false);
    toast.success("Conformidad registrada legalmente");
  };

  const handleDownload = async (fileUrl: string, fileName: string) => {
    const { data, error } = await supabase.storage.from("plans").download(fileUrl);
    if (error || !data) { toast.error("Error al descargar"); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a"); a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
    if (user && projectId) {
      await supabase.from("audit_logs").insert({
        user_id: user.id, project_id: projectId, action: "plan_opened", details: { file_name: fileName },
      });
    }
  };

  const userHasSigned = conformities.some((c) => c.user_id === user?.id);

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">Planos Válidos</p>
        </div>

        {!selectedPlan ? (
          <>
            <div className="flex items-end justify-between mb-8">
              <h1 className="font-display text-3xl font-bold tracking-tighter">Repositorio de Planos</h1>
              {isAdmin && (
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button data-tour="new-plan" className="font-display text-xs uppercase tracking-wider gap-2"><Plus className="h-4 w-4" />Nuevo Plano</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle className="font-display">Añadir Plano</DialogTitle></DialogHeader>
                    <form onSubmit={handleCreatePlan} className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Nombre</Label>
                        <Input value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })} placeholder="Planta Baja - Estructura" required />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Categoría</Label>
                        <Input value={newPlan.category} onChange={(e) => setNewPlan({ ...newPlan, category: e.target.value })} placeholder="Estructura, Arquitectura, MEP..." />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Descripción</Label>
                        <Input value={newPlan.description} onChange={(e) => setNewPlan({ ...newPlan, description: e.target.value })} placeholder="Detalles del plano" />
                      </div>
                      <Button type="submit" className="w-full font-display text-xs uppercase tracking-wider">Crear Plano</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-card border border-border rounded-lg animate-pulse" />)}
              </div>
            ) : plans.length === 0 ? (
              <div className="text-center py-20">
                <FileText className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                <p className="font-display text-muted-foreground">No hay planos todavía</p>
              </div>
            ) : (
              <div className="space-y-3">
                {plans.map((plan, i) => (
                  <div
                    key={plan.id}
                    className="w-full bg-card border border-border rounded-lg p-5 hover:border-foreground/20 transition-all group animate-fade-in flex items-center justify-between"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <button
                      onClick={() => setSelectedPlan(plan)}
                      className="flex items-center gap-3 flex-1 text-left"
                    >
                      <FileText className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                      <div>
                        <h3 className="font-display text-sm font-semibold tracking-tight">{plan.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {plan.category && `${plan.category} · `}Versión {plan.current_version}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-muted-foreground font-display mr-2">v{plan.current_version}</span>
                      {isAdmin && (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => {
                            e.stopPropagation();
                            setEditPlanData({ id: plan.id, name: plan.name, category: plan.category || "", description: plan.description || "" });
                            setEditPlanOpen(true);
                          }}>
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => {
                            e.stopPropagation();
                            setDeletePlanId(plan.id);
                          }}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-end justify-between mb-8">
              <div>
                <button
                  onClick={() => { setSelectedPlan(null); setVersions([]); setConformities([]); }}
                  className="text-xs text-muted-foreground hover:text-foreground font-display uppercase tracking-wider mb-1 inline-block"
                >
                  ← Volver a planos
                </button>
                <h1 className="font-display text-2xl font-bold tracking-tighter">{selectedPlan.name}</h1>
                {selectedPlan.description && <p className="text-sm text-muted-foreground mt-1">{selectedPlan.description}</p>}
              </div>
              <div className="flex gap-2">
                {isAdmin && (
                  <>
                    <Button variant="outline" size="sm" className="gap-1 text-xs font-display uppercase tracking-wider" onClick={() => {
                      setEditPlanData({ id: selectedPlan.id, name: selectedPlan.name, category: selectedPlan.category || "", description: selectedPlan.description || "" });
                      setEditPlanOpen(true);
                    }}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1 text-xs font-display uppercase tracking-wider text-destructive" onClick={() => setDeletePlanId(selectedPlan.id)}>
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </Button>
                  </>
                )}
                <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                  <DialogTrigger asChild>
                    <Button data-tour="upload-version" className="font-display text-xs uppercase tracking-wider gap-2"><Upload className="h-4 w-4" />Subir Versión</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle className="font-display">Subir Nueva Versión</DialogTitle></DialogHeader>
                    <form onSubmit={handleUploadVersion} className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Archivo (PDF, DWG, DXF)</Label>
                        <Input type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.dwg,.dxf,.png,.jpg,.jpeg" onChange={(e) => { const f = e.target.files?.[0] || null; setUploadFile(f); }} required className="cursor-pointer" />
                        <p className="text-[10px] text-muted-foreground">Solo DO y DEM pueden subir planos</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Notas de revisión</Label>
                        <Input value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} placeholder="Cambios respecto a la versión anterior..." />
                      </div>
                      <Button type="submit" disabled={uploading} className="w-full font-display text-xs uppercase tracking-wider">
                        {uploading ? "Subiendo..." : "Subir Archivo"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Conformity Signatures */}
            {latestVersion && (
              <div data-tour="conformity-section" className="bg-card border border-border rounded-lg p-6 mb-6 animate-fade-in">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />Conformidad — Versión {latestVersion.version_number}
                  </h2>
                  {!userHasSigned && projectRole && (
                    <Button onClick={() => setShowConfirmDialog(true)} className="font-display text-xs uppercase tracking-wider gap-2 bg-success hover:bg-success/90 text-success-foreground">
                      <CheckCircle2 className="h-4 w-4" />Confirmar Conformidad
                    </Button>
                  )}
                  {userHasSigned && (
                    <span className="text-xs font-display text-success flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Firmado</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  {ROLES.map((role) => {
                    const signed = conformities.find((c) => c.role === role);
                    const memberWithRole = members.find((m) => m.role === role);
                    return (
                      <div key={role} className={`flex items-center gap-2 px-4 py-2.5 rounded border transition-all ${signed ? "border-success/40 bg-success/10 text-success" : "border-border bg-secondary/30 text-muted-foreground"}`}>
                        <span className="font-display text-sm font-bold">{role}</span>
                        {signed ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4 opacity-50" />}
                        <div className="text-[10px] leading-tight">
                          {signed ? (
                            <>
                              <p className="font-medium">Firmado</p>
                              <p className="opacity-70">{new Date(signed.signed_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                            </>
                          ) : (
                            <p>{memberWithRole ? "Pendiente" : "Sin asignar"}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Version History */}
            <h2 className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3 flex items-center gap-2">
              <History className="h-3.5 w-3.5" />Historial de Versiones
            </h2>
            <div className="space-y-2">
              {versions.map((v, i) => (
                <div key={v.id} className={`bg-card border rounded-lg p-4 flex items-center justify-between animate-fade-in ${i === 0 ? "border-foreground/20" : "border-border"}`} style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="flex items-center gap-3">
                    <span className={`font-display text-xs font-bold px-2 py-1 rounded ${i === 0 ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"}`}>v{v.version_number}</span>
                    <div>
                      <p className="text-sm font-medium">{v.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {v.notes && `${v.notes} · `}
                        {new Date(v.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                        {v.file_size && ` · ${(v.file_size / 1024 / 1024).toFixed(1)} MB`}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDownload(v.file_url, v.file_name)} title="Descargar">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {versions.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No hay versiones. Sube el primer archivo.</p>}
            </div>
          </>
        )}
      </div>

      {/* Edit plan dialog */}
      <Dialog open={editPlanOpen} onOpenChange={setEditPlanOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Editar Plano</DialogTitle></DialogHeader>
          <form onSubmit={handleEditPlan} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Nombre</Label>
              <Input value={editPlanData.name} onChange={(e) => setEditPlanData(prev => ({ ...prev, name: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Categoría</Label>
              <Input value={editPlanData.category} onChange={(e) => setEditPlanData(prev => ({ ...prev, category: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Descripción</Label>
              <Input value={editPlanData.description} onChange={(e) => setEditPlanData(prev => ({ ...prev, description: e.target.value }))} />
            </div>
            <Button type="submit" disabled={editPlanSubmitting} className="w-full font-display text-xs uppercase tracking-wider">
              {editPlanSubmitting ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete plan confirm */}
      <AlertDialog open={!!deletePlanId} onOpenChange={() => setDeletePlanId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Eliminar Plano</AlertDialogTitle>
            <AlertDialogDescription>¿Estás seguro? Se eliminarán todas las versiones y conformidades asociadas. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePlan} disabled={deletePlanSubmitting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deletePlanSubmitting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conformity Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-success" />Confirmar Conformidad
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm space-y-2">
              <p>Al confirmar, está declarando digitalmente su conformidad con la versión <strong>{latestVersion?.version_number}</strong> del plano <strong>{selectedPlan?.name}</strong>.</p>
              <p>Se registrarán su identidad, marca de tiempo y ubicación geográfica como firma digital legalmente vinculante.</p>
              <p className="text-muted-foreground italic">Rol: {projectRole} — {roleLabels[projectRole || ""] || projectRole}</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-display text-xs uppercase tracking-wider">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmConformity} disabled={signing} className="font-display text-xs uppercase tracking-wider bg-success hover:bg-success/90 text-success-foreground">
              {signing ? "Firmando..." : "Firmar Conformidad"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default PlansModule;
