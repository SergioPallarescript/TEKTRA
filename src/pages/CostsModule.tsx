import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjectRole } from "@/hooks/useProjectRole";
import { sanitizeFileName, uploadFileWithFallback } from "@/lib/storage";
import AppLayout from "@/components/AppLayout";
import FiscalDataModal from "@/components/FiscalDataModal";
import SignatureCanvas, { type SignatureCanvasHandle } from "@/components/SignatureCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { notifyProjectMembers } from "@/lib/notifications";
import {
  ArrowLeft, Plus, DollarSign, CheckCircle2, XCircle, Download, ExternalLink,
  Pencil, Trash2, Loader2, FileSignature, Upload, FileText,
} from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

/* ───── status helpers ───── */
function getStatusInfo(claim: any) {
  const t = claim.doc_type || "certificacion";
  const s = claim.status;
  if (s === "rejected") return { label: "Rechazado", color: "text-destructive bg-destructive/10" };
  if (s === "approved") return { label: "Autorizado para Pago", color: "text-success bg-success/10" };
  if (t === "certificacion") {
    const demSigned = !!claim.dem_signed_by;
    const doSigned = !!claim.do_signed_by;
    if (s === "pending_technical") {
      if (!demSigned && !doSigned) return { label: "Pendiente de Firmas Técnicas", color: "text-warning bg-warning/10" };
      if (demSigned && !doSigned) return { label: "Falta Firma DO", color: "text-warning bg-warning/10" };
      if (!demSigned && doSigned) return { label: "Falta Firma DEM", color: "text-warning bg-warning/10" };
    }
    if (s === "pending_payment") return { label: "Validado: Pendiente de Autorización de Pago", color: "text-accent bg-accent/10" };
  } else {
    if (s === "pending_technical") return { label: "Pendiente Validación Técnica (DEM)", color: "text-warning bg-warning/10" };
    if (s === "pending_payment") return { label: "Pendiente Firma del Promotor", color: "text-accent bg-accent/10" };
  }
  return { label: s, color: "text-muted-foreground bg-muted" };
}

const CostsModule = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { isDO, isDEM, isCON, isPRO, projectRole } = useProjectRole(projectId);
  const navigate = useNavigate();
  const signatureRef = useRef<SignatureCanvasHandle | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [docType, setDocType] = useState<string>("certificacion");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [selectedClaim, setSelectedClaim] = useState<any | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfPages, setPdfPages] = useState<HTMLCanvasElement[]>([]);
  const [signing, setSigning] = useState(false);

  const [actionClaim, setActionClaim] = useState<{ id: string; action: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [editClaim, setEditClaim] = useState<any | null>(null);
  const [editData, setEditData] = useState({ title: "", description: "", amount: "" });
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deleteClaim, setDeleteClaim] = useState<string | null>(null);
  const [fiscalModalOpen, setFiscalModalOpen] = useState(false);

  const canSubmit = isCON;

  const fetchClaims = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase.from("cost_claims").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
    if (data) setClaims(data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  /* ───── PDF.js render ───── */
  const renderPdf = useCallback(async (url: string) => {
    try {
      const pdf = await pdfjsLib.getDocument(url).promise;
      const pages: HTMLCanvasElement[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
        pages.push(canvas);
      }
      setPdfPages(pages);
    } catch { setPdfPages([]); }
  }, []);

  useEffect(() => {
    if (!selectedClaim?.file_url) {
      setPdfBlobUrl(c => { if (c) URL.revokeObjectURL(c); return null; });
      setPdfPages([]);
      return;
    }
    const load = async () => {
      const targetPath = (selectedClaim as any).signed_file_path || selectedClaim.file_url;
      const { data, error } = await supabase.storage.from("plans").download(targetPath);
      if (error || !data) { toast.error("No se pudo abrir el PDF"); return; }
      const url = URL.createObjectURL(data);
      setPdfBlobUrl(c => { if (c) URL.revokeObjectURL(c); return url; });
      await renderPdf(url);
    };
    void load();
    return () => { setPdfBlobUrl(c => { if (c) URL.revokeObjectURL(c); return null; }); };
  }, [selectedClaim, renderPdf]);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container || pdfPages.length === 0) return;
    container.innerHTML = "";
    pdfPages.forEach(canvas => {
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      canvas.style.display = "block";
      canvas.style.marginBottom = "8px";
      container.appendChild(canvas);
    });
  }, [pdfPages]);

  /* ───── Create ───── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !user) return;
    setSubmitting(true);
    let fileUrl = null; let fileName = null;
    if (file) {
      const path = `costs/${projectId}/${Date.now()}_${sanitizeFileName(file.name)}`;
      const { error } = await uploadFileWithFallback({ path, file });
      if (!error) { fileUrl = path; fileName = file.name; }
    }
    const { error } = await supabase.from("cost_claims").insert({
      project_id: projectId, title, description: description || null,
      amount: parseFloat(amount), file_url: fileUrl, file_name: fileName,
      submitted_by: user.id, doc_type: docType,
    } as any);
    if (error) { toast.error("Error al enviar"); setSubmitting(false); return; }
    const docLabel = docType === "presupuesto" ? "Presupuesto" : "Certificación";
    toast.success(`${docLabel} enviado`);
    // Notify project members about new economic document
    await notifyProjectMembers({
      projectId: projectId!,
      actorId: user.id,
      title: `Nueva ${docLabel}: ${title}`,
      message: `Se ha subido ${docLabel === "Certificación" ? "una nueva Certificación" : "un nuevo Presupuesto"} pendiente de validación: "${title}"`,
      type: "cost",
    });
    setTitle(""); setDescription(""); setAmount(""); setFile(null); setDocType("certificacion");
    setCreateOpen(false); setSubmitting(false); fetchClaims();
  };

  /* ───── Actions ───── */
  const handleAction = async () => {
    if (!actionClaim || !user || !projectId) return;
    const { id, action } = actionClaim;
    if (action === "approve_technical") {
      await supabase.from("cost_claims").update({
        status: "pending_payment", technical_approved_by: user.id,
        technical_approved_at: new Date().toISOString(),
      }).eq("id", id);
      toast.success("Validación técnica registrada");
      const { data: claim } = await supabase.from("cost_claims").select("title, doc_type").eq("id", id).single();
      const dt = claim?.doc_type === "presupuesto" ? "Presupuesto" : "Certificación";
      await notifyProjectMembers({
        projectId: projectId!,
        actorId: user.id,
        title: `${dt} validada técnicamente`,
        message: `"${claim?.title || ""}" ha sido validada. Pendiente de autorización de pago.`,
        type: "cost",
      });
    } else if (action === "authorize_payment") {
      await supabase.from("cost_claims").update({
        status: "approved", payment_authorized_by: user.id,
        payment_authorized_at: new Date().toISOString(),
      }).eq("id", id);
      toast.success("Pago autorizado");
      const { data: claim } = await supabase.from("cost_claims").select("title, doc_type").eq("id", id).single();
      const dt = claim?.doc_type === "presupuesto" ? "Presupuesto" : "Certificación";
      await notifyProjectMembers({
        projectId: projectId!,
        actorId: user.id,
        title: `Pago autorizado: ${dt}`,
        message: `"${claim?.title || ""}" ha sido autorizada para pago.`,
        type: "cost",
      });
    } else if (action === "reject") {
      await supabase.from("cost_claims").update({
        status: "rejected", rejected_by: user.id,
        rejected_at: new Date().toISOString(), rejection_reason: rejectReason || null,
      }).eq("id", id);
      toast.success("Documento rechazado");
      const { data: claim } = await supabase.from("cost_claims").select("title, doc_type, submitted_by").eq("id", id).single();
      const dt = claim?.doc_type === "presupuesto" ? "Presupuesto" : "Certificación";
      await notifyProjectMembers({
        projectId: projectId!,
        actorId: user.id,
        title: `${dt} rechazada`,
        message: `"${claim?.title || ""}" ha sido rechazada.${rejectReason ? ` Motivo: ${rejectReason}` : ""}`,
        type: "cost",
      });
    }
    setActionClaim(null); setRejectReason(""); fetchClaims();
    if (selectedClaim?.id === id) {
      const { data } = await supabase.from("cost_claims").select("*").eq("id", id).single();
      if (data) setSelectedClaim(data);
    }
  };

  /* ───── Signature (for Certificación: DEM/DO; for Presupuesto: PRO) ───── */
  const canSignHere = useMemo(() => {
    if (!selectedClaim || !user) return false;
    const dt = (selectedClaim as any).doc_type || "certificacion";
    const s = selectedClaim.status;
    if (dt === "certificacion" && s === "pending_technical") {
      if (isDEM && !(selectedClaim as any).dem_signed_by) return true;
      if (isDO && !(selectedClaim as any).do_signed_by) return true;
    }
    if (dt === "presupuesto" && s === "pending_payment" && isPRO) return true;
    return false;
  }, [selectedClaim, user, isDEM, isDO, isPRO]);

  /* ───── Signature with fiscal data check ───── */
  const initiateSign = async () => {
    if (!user) return;
    const { data: prof } = await supabase.from("profiles").select("full_name, dni_cif").eq("user_id", user.id).single();
    if ((prof as any)?.dni_cif) {
      performSign(prof?.full_name || "", (prof as any).dni_cif || "");
    } else {
      setFiscalModalOpen(true);
    }
  };

  const handleFiscalComplete = (data: { full_name: string; dni_cif: string; fiscal_address: string }) => {
    setFiscalModalOpen(false);
    performSign(data.full_name, data.dni_cif);
  };

  const performSign = async (signerName: string, signerDni: string) => {
    if (!selectedClaim || !user || !pdfBlobUrl || !signatureRef.current) return;
    if (signatureRef.current.isEmpty()) { toast.error("Dibuja tu firma"); return; }
    setSigning(true);
    try {
      const sigDataUrl = signatureRef.current.toDataUrl();
      if (!sigDataUrl) throw new Error("Firma no válida");

      let geo = "";
      try {
        const pos: GeolocationPosition = await new Promise((r, j) => navigator.geolocation.getCurrentPosition(r, j, { timeout: 5000 }));
        geo = `${pos.coords.latitude},${pos.coords.longitude}`;
      } catch {}

      const targetPath = (selectedClaim as any).signed_file_path || selectedClaim.file_url;
      const { data: pdfBlob } = await supabase.storage.from("plans").download(targetPath);
      if (!pdfBlob) throw new Error("No se pudo descargar el PDF");
      const bytes = await pdfBlob.arrayBuffer();
      const signedAt = new Date().toISOString();
      const hashSrc = `${selectedClaim.id}:${signedAt}:${user.id}:${sigDataUrl}`;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hashSrc));
      const hash = Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, "0")).join("").slice(0, 32).toUpperCase();

      const pdfDoc = await PDFDocument.load(bytes);
      const lastPage = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
      const sigImg = await pdfDoc.embedPng(sigDataUrl);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const roleName = projectRole || "?";
      const existingSignatures = [(selectedClaim as any).dem_signed_by, (selectedClaim as any).do_signed_by, (selectedClaim as any).pro_signed_by].filter(Boolean).length;
      const boxX = 36 + existingSignatures * 260;
      const boxY = 36;

      lastPage.drawRectangle({ x: boxX, y: boxY, width: 250, height: 120, color: rgb(0.97, 0.97, 0.97), borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1 });
      lastPage.drawText(`Firma ${roleName} — TEKTRA`, { x: boxX + 12, y: boxY + 102, size: 9, font });
      lastPage.drawText(signerName, { x: boxX + 12, y: boxY + 90, size: 8, font, color: rgb(0.1, 0.1, 0.1) });
      lastPage.drawText(`DNI/CIF: ${signerDni}`, { x: boxX + 12, y: boxY + 78, size: 8, font, color: rgb(0.1, 0.1, 0.1) });
      lastPage.drawText(`Hash: ${hash}`, { x: boxX + 12, y: boxY + 66, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
      lastPage.drawText(`Fecha: ${new Date(signedAt).toLocaleString("es-ES")}`, { x: boxX + 12, y: boxY + 56, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
      lastPage.drawText(`Rol: ${roleName} | Geo: ${geo || "N/A"}`, { x: boxX + 12, y: boxY + 46, size: 6, font, color: rgb(0.5, 0.5, 0.5) });
      const sigW = 160, sigH = Math.min((sigImg.height / sigImg.width) * sigW, 32);
      lastPage.drawImage(sigImg, { x: boxX + 12, y: boxY + 6, width: sigW, height: sigH });

      const signedBytes = await pdfDoc.save();
      const signedBlob = new Blob([Uint8Array.from(signedBytes)], { type: "application/pdf" });
      const signedFile = new File([signedBlob], `firmado_${sanitizeFileName(selectedClaim.file_name || "doc.pdf")}`, { type: "application/pdf" });
      const signedPath = `costs/${projectId}/signed/${selectedClaim.id}_${Date.now()}.pdf`;
      const { error: upErr } = await uploadFileWithFallback({ path: signedPath, file: signedFile });
      if (upErr) throw upErr;

      // Update DB based on role
      const dt = (selectedClaim as any).doc_type || "certificacion";
      const updates: any = { signed_file_path: signedPath, validation_hash: hash };

      if (dt === "certificacion") {
        if (isDEM) { updates.dem_signed_by = user.id; updates.dem_signed_at = signedAt; }
        if (isDO) { updates.do_signed_by = user.id; updates.do_signed_at = signedAt; }
        const demDone = isDEM ? true : !!(selectedClaim as any).dem_signed_by;
        const doDone = isDO ? true : !!(selectedClaim as any).do_signed_by;
        if (demDone && doDone) updates.status = "pending_payment";
      } else if (dt === "presupuesto" && isPRO) {
        updates.pro_signed_by = user.id;
        updates.pro_signed_at = signedAt;
        updates.status = "approved";
      }

      await supabase.from("cost_claims").update(updates).eq("id", selectedClaim.id);
      await supabase.from("audit_logs").insert({
        user_id: user.id, project_id: projectId, action: "cost_document_signed",
        details: { claim_id: selectedClaim.id, hash, role: roleName, geo_location: geo, signer_name: signerName, signer_dni: signerDni },
        geo_location: geo,
      });

      signatureRef.current.clear();
      toast.success("Documento firmado");
      await fetchClaims();
      const { data: refreshed } = await supabase.from("cost_claims").select("*").eq("id", selectedClaim.id).single();
      if (refreshed) setSelectedClaim(refreshed);
    } catch (err: any) {
      toast.error(err?.message || "Error al firmar");
    } finally { setSigning(false); }
  };

  /* ───── Edit / Delete ───── */
  const isEditable = (claim: any) => claim.submitted_by === user?.id && claim.status === "pending_technical";

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editClaim || !user) return;
    setEditSubmitting(true);
    try {
      let fileUrl = editClaim.file_url;
      let fileName = editClaim.file_name;
      if (editFile) {
        const path = `costs/${projectId}/${Date.now()}_${sanitizeFileName(editFile.name)}`;
        const { error } = await uploadFileWithFallback({ path, file: editFile });
        if (!error) { fileUrl = path; fileName = editFile.name; }
      }
      await supabase.from("cost_claims").update({
        title: editData.title, description: editData.description || null,
        amount: parseFloat(editData.amount), file_url: fileUrl, file_name: fileName,
      }).eq("id", editClaim.id);
      toast.success("Documento actualizado");
      setEditClaim(null); setEditFile(null); fetchClaims();
    } catch { toast.error("Error al actualizar"); }
    setEditSubmitting(false);
  };

  const handleDelete = async () => {
    if (!deleteClaim || !user) return;
    await supabase.from("cost_claims").update({
      status: "rejected", rejected_by: user.id,
      rejected_at: new Date().toISOString(), rejection_reason: "Eliminado por el emisor",
    }).eq("id", deleteClaim);
    toast.success("Registro eliminado");
    if (selectedClaim?.id === deleteClaim) setSelectedClaim(null);
    setDeleteClaim(null); fetchClaims();
  };

  const handleDownload = () => {
    if (!pdfBlobUrl || !selectedClaim) return;
    const a = document.createElement("a");
    a.href = pdfBlobUrl;
    a.download = selectedClaim.file_name || "documento.pdf";
    a.click();
  };

  const handleOpenExternal = () => {
    if (!pdfBlobUrl) return;
    window.open(pdfBlobUrl, "_blank");
  };

  /* ───── Action buttons per claim ───── */
  const getActions = (claim: any) => {
    const dt = (claim as any).doc_type || "certificacion";
    const s = claim.status;
    const actions: { label: string; action: string; icon: any; variant?: string }[] = [];

    if (dt === "presupuesto") {
      if (s === "pending_technical" && isDEM) {
        actions.push({ label: "Validar", action: "approve_technical", icon: CheckCircle2 });
        actions.push({ label: "Rechazar", action: "reject", icon: XCircle, variant: "destructive" });
      }
      // PRO signs in detail view, not button here
      if (s === "pending_payment" && isPRO) {
        actions.push({ label: "Rechazar", action: "reject", icon: XCircle, variant: "destructive" });
      }
    } else {
      // Certificación - DEM/DO sign in detail view
      if (s === "pending_technical" && (isDEM || isDO)) {
        actions.push({ label: "Rechazar", action: "reject", icon: XCircle, variant: "destructive" });
      }
      if (s === "pending_payment" && isPRO) {
        actions.push({ label: "Autorizar Pago", action: "authorize_payment", icon: CheckCircle2 });
        actions.push({ label: "Rechazar", action: "reject", icon: XCircle, variant: "destructive" });
      }
    }
    return actions;
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-8 pb-24 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">Proyecto</p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tighter">Validación Económica</h1>
          {canSubmit && (
            <Button onClick={() => setCreateOpen(true)} className="font-display text-xs uppercase tracking-wider gap-2">
              <Plus className="h-4 w-4" /> Nuevo Documento
            </Button>
          )}
        </div>

        {/* Two-column layout */}
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* LEFT: list */}
          <div className="space-y-2 min-w-0">
            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-card border border-border rounded-lg animate-pulse" />)}</div>
            ) : claims.length === 0 ? (
              <div className="text-center py-20">
                <DollarSign className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                <p className="font-display text-muted-foreground">No hay documentos económicos</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                {claims.map(claim => {
                  const st = getStatusInfo(claim);
                  const editable = isEditable(claim);
                  const dt = (claim as any).doc_type || "certificacion";
                  return (
                    <div
                      key={claim.id}
                      onClick={() => setSelectedClaim(claim)}
                      className={`rounded-lg border p-4 transition-colors cursor-pointer ${
                        selectedClaim?.id === claim.id ? "border-primary bg-secondary/40" : "border-border bg-card hover:border-foreground/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-display uppercase tracking-widest px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {dt === "presupuesto" ? "Presupuesto" : "Certificación"}
                            </span>
                          </div>
                          <p className="text-sm font-medium truncate">{claim.title}</p>
                          <p className="text-lg font-display font-bold tracking-tight">
                            {parseFloat(claim.amount).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(claim.created_at).toLocaleDateString("es-ES")}
                          </p>
                          <span className={`inline-block mt-1 px-2 py-0.5 text-[10px] font-display uppercase tracking-widest rounded ${st.color}`}>
                            {st.label}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          {editable && (
                            <>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={e => { e.stopPropagation(); setEditClaim(claim); setEditData({ title: claim.title, description: claim.description || "", amount: String(claim.amount) }); }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={e => { e.stopPropagation(); setDeleteClaim(claim.id); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* RIGHT: PDF viewer + actions */}
          <div className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-4 min-w-0 overflow-hidden">
            {selectedClaim ? (() => {
              const st = getStatusInfo(selectedClaim);
              const actions = getActions(selectedClaim);
              const dt = (selectedClaim as any).doc_type || "certificacion";
              return (
                <>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="font-display text-lg sm:text-xl font-semibold tracking-tight truncate">{selectedClaim.title}</h2>
                      <p className="text-xs sm:text-sm text-muted-foreground truncate">{selectedClaim.file_name}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5 text-xs">
                        <Download className="h-3.5 w-3.5" /> Descargar
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleOpenExternal} className="gap-1.5 text-xs">
                        <ExternalLink className="h-3.5 w-3.5" /> Abrir
                      </Button>
                      <span className={`inline-flex items-center rounded px-2 py-1 text-[10px] font-display uppercase tracking-widest ${st.color}`}>
                        {st.label}
                      </span>
                    </div>
                  </div>

                  {selectedClaim.description && (
                    <p className="text-xs text-muted-foreground border-l-2 border-border pl-3">{selectedClaim.description}</p>
                  )}
                  {selectedClaim.rejection_reason && (
                    <p className="text-xs text-destructive border-l-2 border-destructive/30 pl-3"><strong>Motivo rechazo:</strong> {selectedClaim.rejection_reason}</p>
                  )}

                  <p className="text-2xl font-display font-bold tracking-tight">
                    {parseFloat(selectedClaim.amount).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
                  </p>

                  {/* PDF viewer */}
                  {selectedClaim.file_url ? (
                    <div ref={canvasContainerRef} className="overflow-y-auto max-h-[420px] rounded-lg border border-border bg-background p-2">
                      {pdfPages.length === 0 && (
                        <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando PDF…
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                      <FileText className="h-5 w-5 mr-2" /> Sin documento adjunto
                    </div>
                  )}

                  {/* Action buttons */}
                  {actions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {actions.map(a => (
                        <Button
                          key={a.action}
                          size="sm"
                          variant={a.variant === "destructive" ? "outline" : "default"}
                          className={`font-display text-xs uppercase tracking-wider gap-1 ${a.variant === "destructive" ? "text-destructive border-destructive/30" : ""}`}
                          onClick={() => setActionClaim({ id: selectedClaim.id, action: a.action })}
                        >
                          <a.icon className="h-3.5 w-3.5" /> {a.label}
                        </Button>
                      ))}
                    </div>
                  )}

                  {/* Signature panel */}
                  {canSignHere && (
                    <div className="space-y-4 rounded-lg border border-border bg-background p-4">
                      <div>
                        <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
                          {dt === "certificacion" ? `Firma Técnica (${projectRole})` : "Firma de Aceptación (Promotor)"}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Se estampará en el PDF con hash de validación, timestamp, rol y geolocalización.
                        </p>
                      </div>
                      <SignatureCanvas ref={signatureRef} />
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => signatureRef.current?.clear()}>Limpiar firma</Button>
                        <Button onClick={handleSign} disabled={signing} className="gap-2 font-display text-xs uppercase tracking-wider">
                          {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
                          {signing ? "Firmando..." : "Firmar y Validar"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Signature info */}
                  {((selectedClaim as any).dem_signed_by || (selectedClaim as any).do_signed_by || (selectedClaim as any).pro_signed_by || (selectedClaim as any).validation_hash) && (
                    <div className="rounded-lg border border-success/20 bg-success/5 p-4 space-y-2">
                      <p className="text-xs font-semibold text-success">Firmas Registradas</p>
                      {(selectedClaim as any).dem_signed_at && (
                        <p className="text-xs text-muted-foreground">DEM: {new Date((selectedClaim as any).dem_signed_at).toLocaleString("es-ES")}</p>
                      )}
                      {(selectedClaim as any).do_signed_at && (
                        <p className="text-xs text-muted-foreground">DO: {new Date((selectedClaim as any).do_signed_at).toLocaleString("es-ES")}</p>
                      )}
                      {(selectedClaim as any).pro_signed_at && (
                        <p className="text-xs text-muted-foreground">PRO: {new Date((selectedClaim as any).pro_signed_at).toLocaleString("es-ES")}</p>
                      )}
                      {(selectedClaim as any).validation_hash && (
                        <p className="text-xs font-mono text-success break-all">Hash: {(selectedClaim as any).validation_hash}</p>
                      )}
                    </div>
                  )}
                </>
              );
            })() : (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                <Upload className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <h2 className="font-display text-xl font-semibold tracking-tight">Selecciona un documento</h2>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Visualización integrada con previsualización de PDF, firma digital y validación legal.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create dialog */}
      <AlertDialog open={createOpen} onOpenChange={setCreateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Enviar Documento Económico</AlertDialogTitle>
          </AlertDialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Tipo de Documento</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="certificacion">Certificación</SelectItem>
                  <SelectItem value="presupuesto">Presupuesto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Concepto</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Certificación Nº3 - Estructura" required />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Descripción</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Detalles..." rows={3} />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Importe (€)</Label>
              <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="45000.00" required />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Documento PDF</Label>
              <Input type="file" accept=".pdf" onChange={e => setFile(e.target.files?.[0] || null)} className="cursor-pointer" />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
              <AlertDialogAction type="submit" disabled={submitting}>
                {submitting ? "Enviando..." : "Enviar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit dialog */}
      <AlertDialog open={!!editClaim} onOpenChange={open => { if (!open) setEditClaim(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle className="font-display">Editar Documento</AlertDialogTitle></AlertDialogHeader>
          <form onSubmit={handleEditSave} className="space-y-4">
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Concepto</Label>
              <Input value={editData.title} onChange={e => setEditData(p => ({ ...p, title: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Descripción</Label>
              <Textarea value={editData.description} onChange={e => setEditData(p => ({ ...p, description: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Importe (€)</Label>
              <Input type="number" step="0.01" value={editData.amount} onChange={e => setEditData(p => ({ ...p, amount: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Sustituir PDF</Label>
              <Input type="file" accept=".pdf" onChange={e => setEditFile(e.target.files?.[0] || null)} className="cursor-pointer" />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
              <AlertDialogAction type="submit" disabled={editSubmitting}>
                {editSubmitting ? "Guardando..." : "Guardar Cambios"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteClaim} onOpenChange={() => setDeleteClaim(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Eliminar Documento</AlertDialogTitle>
            <AlertDialogDescription>¿Estás seguro? El registro se marcará como eliminado.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Action confirm */}
      <AlertDialog open={!!actionClaim} onOpenChange={() => { setActionClaim(null); setRejectReason(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">{actionClaim?.action === "reject" ? "Rechazar Documento" : "Confirmar Acción"}</AlertDialogTitle>
            <AlertDialogDescription>Esta acción quedará registrada con marca temporal y trazabilidad legal.</AlertDialogDescription>
          </AlertDialogHeader>
          {actionClaim?.action === "reject" && (
            <div className="space-y-2 py-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Motivo de rechazo</Label>
              <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Indique el motivo..." rows={3} />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleAction}>{actionClaim?.action === "reject" ? "Rechazar" : "Confirmar"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default CostsModule;
