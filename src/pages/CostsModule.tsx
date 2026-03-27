import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, DollarSign, CheckCircle2, XCircle, Clock, Upload, FileText,
} from "lucide-react";

const statusLabels: Record<string, { label: string; color: string }> = {
  pending_technical: { label: "Pendiente Aprobación Técnica", color: "text-warning bg-warning/10" },
  pending_payment: { label: "Pendiente Autorización de Pago", color: "text-accent bg-accent/10" },
  approved: { label: "Aprobado y Autorizado", color: "text-success bg-success/10" },
  rejected: { label: "Rechazado", color: "text-destructive bg-destructive/10" },
};

const CostsModule = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionClaim, setActionClaim] = useState<{ id: string; action: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const isCON = profile?.role === "CON";
  const isDO = profile?.role === "DO";
  const isDEO = profile?.role === "DEO";
  const isPRO = profile?.role === "PRO";
  const canSubmit = isCON;
  const canApproveTechnical = isDO || isDEO;
  const canAuthorizePayment = isPRO;

  const fetchClaims = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("cost_claims")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (data) setClaims(data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !user) return;
    setSubmitting(true);

    let fileUrl = null;
    let fileName = null;
    if (file) {
      const path = `costs/${projectId}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("plans").upload(path, file);
      if (!error) { fileUrl = path; fileName = file.name; }
    }

    const { error } = await supabase.from("cost_claims").insert({
      project_id: projectId,
      title,
      description: description || null,
      amount: parseFloat(amount),
      file_url: fileUrl,
      file_name: fileName,
      submitted_by: user.id,
    });

    if (error) {
      toast.error("Error al enviar la certificación");
      setSubmitting(false);
      return;
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      project_id: projectId,
      action: "cost_claim_submitted",
      details: { title, amount },
    });

    toast.success("Certificación enviada");
    setTitle(""); setDescription(""); setAmount(""); setFile(null);
    setCreateOpen(false);
    setSubmitting(false);
    fetchClaims();
  };

  const handleAction = async () => {
    if (!actionClaim || !user || !projectId) return;
    const { id, action } = actionClaim;

    if (action === "approve_technical") {
      await supabase.from("cost_claims").update({
        status: "pending_payment",
        technical_approved_by: user.id,
        technical_approved_at: new Date().toISOString(),
      }).eq("id", id);

      await supabase.from("audit_logs").insert({
        user_id: user.id, project_id: projectId,
        action: "cost_technical_approved", details: { claim_id: id },
      });
      toast.success("Aprobación técnica registrada");
    } else if (action === "authorize_payment") {
      await supabase.from("cost_claims").update({
        status: "approved",
        payment_authorized_by: user.id,
        payment_authorized_at: new Date().toISOString(),
      }).eq("id", id);

      await supabase.from("audit_logs").insert({
        user_id: user.id, project_id: projectId,
        action: "cost_payment_authorized", details: { claim_id: id },
      });
      toast.success("Pago autorizado");
    } else if (action === "reject") {
      await supabase.from("cost_claims").update({
        status: "rejected",
        rejected_by: user.id,
        rejected_at: new Date().toISOString(),
        rejection_reason: rejectReason || null,
      }).eq("id", id);

      await supabase.from("audit_logs").insert({
        user_id: user.id, project_id: projectId,
        action: "cost_claim_rejected", details: { claim_id: id, reason: rejectReason },
      });
      toast.success("Certificación rechazada");
    }

    setActionClaim(null);
    setRejectReason("");
    fetchClaims();
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">
            Validación de Costes
          </p>
        </div>

        <div className="flex items-end justify-between mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tighter">Certificaciones</h1>
          {canSubmit && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="font-display text-xs uppercase tracking-wider gap-2">
                  <Plus className="h-4 w-4" />
                  Nueva Certificación
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-display">Enviar Certificación</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Concepto</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Certificación Nº3 - Estructura" required />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Descripción</Label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalles..." rows={3} />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Importe (€)</Label>
                    <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="45000.00" required />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Documento PDF</Label>
                    <Input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="cursor-pointer" />
                  </div>
                  <Button type="submit" disabled={submitting} className="w-full font-display text-xs uppercase tracking-wider">
                    {submitting ? "Enviando..." : "Enviar Certificación"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-card border border-border rounded-lg animate-pulse" />
            ))}
          </div>
        ) : claims.length === 0 ? (
          <div className="text-center py-20">
            <DollarSign className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="font-display text-muted-foreground">No hay certificaciones</p>
          </div>
        ) : (
          <div className="space-y-3">
            {claims.map((claim, i) => {
              const st = statusLabels[claim.status] || statusLabels.pending_technical;
              const showApprove = canApproveTechnical && claim.status === "pending_technical";
              const showAuthorize = canAuthorizePayment && claim.status === "pending_payment";
              const showReject = (canApproveTechnical && claim.status === "pending_technical") ||
                (canAuthorizePayment && claim.status === "pending_payment");

              return (
                <div
                  key={claim.id}
                  className="bg-card border border-border rounded-lg p-5 animate-fade-in"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-display text-sm font-semibold tracking-tight">{claim.title}</h3>
                        <span className={`px-2 py-0.5 text-[10px] font-display uppercase tracking-widest rounded ${st.color}`}>
                          {st.label}
                        </span>
                      </div>
                      {claim.description && (
                        <p className="text-xs text-muted-foreground mb-1">{claim.description}</p>
                      )}
                      <p className="text-lg font-display font-bold tracking-tight">
                        {parseFloat(claim.amount).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
                      </p>
                      {claim.file_name && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <FileText className="h-3 w-3" /> {claim.file_name}
                        </span>
                      )}
                      {claim.rejection_reason && (
                        <p className="text-xs text-destructive mt-2 border-l-2 border-destructive/30 pl-3">
                          <strong>Motivo rechazo:</strong> {claim.rejection_reason}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(claim.created_at).toLocaleDateString("es-ES", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {showApprove && (
                        <Button size="sm" variant="outline" onClick={() => setActionClaim({ id: claim.id, action: "approve_technical" })}
                          className="font-display text-xs uppercase tracking-wider gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Aprobar
                        </Button>
                      )}
                      {showAuthorize && (
                        <Button size="sm" variant="outline" onClick={() => setActionClaim({ id: claim.id, action: "authorize_payment" })}
                          className="font-display text-xs uppercase tracking-wider gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Autorizar Pago
                        </Button>
                      )}
                      {showReject && (
                        <Button size="sm" variant="ghost" onClick={() => setActionClaim({ id: claim.id, action: "reject" })}
                          className="font-display text-xs uppercase tracking-wider gap-1 text-destructive">
                          <XCircle className="h-3.5 w-3.5" /> Rechazar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={!!actionClaim} onOpenChange={() => { setActionClaim(null); setRejectReason(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              {actionClaim?.action === "reject" ? "Rechazar Certificación" : "Confirmar Acción"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción quedará registrada legalmente con su firma digital y marca temporal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionClaim?.action === "reject" && (
            <div className="space-y-2 py-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Motivo de rechazo</Label>
              <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Indique el motivo..." rows={3} />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleAction}>
              {actionClaim?.action === "reject" ? "Rechazar" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default CostsModule;
