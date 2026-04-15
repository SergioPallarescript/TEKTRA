import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjectRole } from "@/hooks/useProjectRole";
import AppLayout from "@/components/AppLayout";
import AttachmentThumbnails from "@/components/AttachmentThumbnails";
import StructuredSectionsEditor from "@/components/StructuredSectionsEditor";
import BookCoverForm from "@/components/BookCoverForm";
import SignatureCanvas, { type SignatureCanvasHandle } from "@/components/SignatureCanvas";
import CertificateSignature, { type CertSignMetadata } from "@/components/CertificateSignature";
import FiscalDataModal from "@/components/FiscalDataModal";
import { formatOrderSections } from "@/lib/bookFormatting";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { notifyProjectMembers, notifyUser, pushNewOrder } from "@/lib/notifications";
import ShareButton from "@/components/ShareButton";
import {
  ArrowLeft, Plus, BookOpen, AlertTriangle, Mic, MicOff, Camera, Image, Paperclip, X, Download, Lock, ShieldCheck, FileSignature, PenLine, Sparkles,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

const ORDER_FIELDS = [
  { key: "estado", label: "Estado de la Obra", placeholder: "Describa el estado actual de la obra..." },
  { key: "instrucciones", label: "Instrucciones y Órdenes", placeholder: "Instrucciones dadas en esta visita..." },
  { key: "pendientes", label: "Pendientes", placeholder: "Tareas pendientes de resolver..." },
];

const DESTINATARIOS_ROLES: Record<string, string> = {
  "CONSTRUCTOR": "CON",
  "PROMOTOR": "PRO",
  "DIRECCIÓN FACULTATIVA": "DO",
  "COORD. SEGURIDAD Y SALUD": "CSS",
};
const DESTINATARIOS = ["CONSTRUCTOR", "PROMOTOR", "DIRECCIÓN FACULTATIVA", "COORD. SEGURIDAD Y SALUD", "TODOS LOS AGENTES"];
const EMISORES = ["DIRECCIÓN FACULTATIVA", "DIRECTOR DE OBRA", "DIRECTOR DE EJECUCIÓN", "COORD. SEGURIDAD Y SALUD"];

const OrdersModule = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const { isDEM, isDO, hasDualCSS, isAdmin, projectRole, isCON, isPRO, isCSS } = useProjectRole(projectId);
  const navigate = useNavigate();

  const [project, setProject] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [cleaning, setCleaning] = useState(false);
  const [structuredSections, setStructuredSections] = useState<Record<string, string> | null>(null);
  const [crossAlert, setCrossAlert] = useState<{ show: boolean; incidents: any[] }>({ show: false, incidents: [] });
  const recognitionRef = useRef<any>(null);

  // Legal fields
  const [dirigidaA, setDirigidaA] = useState("CONSTRUCTOR");
  const [escritaPor, setEscritaPor] = useState("DIRECCIÓN FACULTATIVA");
  const [asunto, setAsunto] = useState("");

  // Book cover
  const [bookCover, setBookCover] = useState<any>(null);
  const [coverConfigured, setCoverConfigured] = useState(false);

  // Signature
  const [signatureMethod, setSignatureMethod] = useState<string>(() => localStorage.getItem("tektra_sig_method") || "manual");
  const sigCanvasRef = useRef<SignatureCanvasHandle>(null);
  const [showFiscalModal, setShowFiscalModal] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);

  // Counter-sign
  const [counterSignOpen, setCounterSignOpen] = useState(false);
  const [counterSignOrder, setCounterSignOrder] = useState<any>(null);
  const [counterSignMethod, setCounterSignMethod] = useState<string>(() => localStorage.getItem("tektra_sig_method") || "manual");
  const counterSigRef = useRef<SignatureCanvasHandle>(null);
  const [counterSigning, setCounterSigning] = useState(false);
  const [counterFiscalModal, setCounterFiscalModal] = useState(false);

  const canWrite = isDEM || isDO || hasDualCSS;
  const canExport = isDEM || isDO;
  const [exporting, setExporting] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  const fetchProject = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase.from("projects").select("*").eq("id", projectId).single();
    if (data) setProject(data);
  }, [projectId]);

  const fetchOrders = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (data) setOrders(data);
    setLoading(false);
  }, [projectId]);

  const fetchMembers = useCallback(async () => {
    if (!projectId) return;
    const { data: memberRows } = await supabase
      .from("project_members")
      .select("user_id, role, secondary_role, invited_email")
      .eq("project_id", projectId)
      .eq("status", "accepted");
    const userIds = (memberRows || []).map((m: any) => m.user_id).filter(Boolean);
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds)
      : { data: [] };
    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
    setMembers((memberRows || []).map((m: any) => ({ ...m, profile: profileMap.get(m.user_id) || null })));
  }, [projectId]);

  useEffect(() => { fetchProject(); fetchOrders(); fetchMembers(); }, [fetchProject, fetchOrders, fetchMembers]);

  // Find the recipient user_id based on dirigidaA role mapping
  const findRecipientUserId = (dirigida: string): string | null => {
    if (dirigida === "TODOS LOS AGENTES") return null;
    const targetRole = DESTINATARIOS_ROLES[dirigida];
    if (!targetRole) return null;
    const member = members.find((m: any) => m.role === targetRole || m.secondary_role === targetRole);
    return member?.user_id || null;
  };

  const getGeoLocation = (): Promise<string> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve("No disponible"); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`),
        () => resolve("No disponible"),
        { timeout: 5000 }
      );
    });
  };

  const computeHash = async (text: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
  };

  const handleCreate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!projectId || !user || !profile) return;

    if (!profile.dni_cif || !profile.fiscal_address) {
      setShowFiscalModal(true);
      setPendingSubmit(true);
      return;
    }

    if (!coverConfigured) {
      toast.error("Debes configurar la portada del libro antes de crear órdenes");
      return;
    }

    if (!asunto.trim()) { toast.error("El asunto es obligatorio"); return; }

    const finalContent = structuredSections
      ? formatOrderSections({ estado: structuredSections.estado || "", instrucciones: structuredSections.instrucciones || "", pendientes: structuredSections.pendientes || "" })
      : content;

    if (!finalContent.trim()) { toast.error("El contenido de la orden es obligatorio"); return; }

    await checkCrossAlerts(finalContent);

    if (signatureMethod === "manual" && sigCanvasRef.current?.isEmpty()) {
      toast.error("Debes firmar la orden antes de enviarla");
      return;
    }

    setSubmitting(true);

    const photoUrls: string[] = [];
    for (const photo of photos) {
      const path = `orders/${projectId}/${Date.now()}_${photo.name}`;
      const { error } = await supabase.storage.from("plans").upload(path, photo);
      if (!error) photoUrls.push(path);
    }

    const geo = await getGeoLocation();
    const hash = await computeHash(finalContent + new Date().toISOString() + user.id);

    const signatureImage = signatureMethod === "manual" && sigCanvasRef.current
      ? sigCanvasRef.current.toDataUrl()
      : null;

    const recipientUserId = findRecipientUserId(dirigidaA);

    const { error } = await supabase.from("orders").insert({
      project_id: projectId,
      content: finalContent,
      created_by: user.id,
      requires_validation: false,
      ai_flags: {},
      photos: photoUrls.length > 0 ? photoUrls : [],
      dirigida_a: dirigidaA,
      escrita_por: escritaPor,
      asunto: asunto.trim(),
      signature_hash: hash,
      signature_geo: geo,
      signature_type: signatureMethod,
      signed_at: new Date().toISOString(),
      signed_by: user.id,
      is_locked: true,
      signature_image: signatureImage,
      recipient_user_id: recipientUserId,
    } as any);

    if (error) { toast.error("Error al crear la orden"); setSubmitting(false); return; }

    await supabase.from("audit_logs").insert({
      user_id: user.id, project_id: projectId,
      action: "order_created_legal",
      details: { has_photos: photoUrls.length > 0, dirigida_a: dirigidaA, asunto, signature_type: signatureMethod, hash, geo },
    });

    // Notify specific recipient about pending counter-signature
    if (recipientUserId) {
      await notifyUser({
        userId: recipientUserId,
        projectId: projectId!,
        title: "📋 Orden pendiente de firma",
        message: `Tienes una orden dirigida a ti pendiente de firmar: "${asunto}"`,
        type: "signature",
      });
    }

    // Also notify all project members
    await notifyProjectMembers({
      projectId, actorId: user.id,
      title: "Nueva orden registrada",
      message: `Se ha registrado la orden: ${asunto}`,
      type: "info",
    });

    toast.success("Orden registrada y firmada");
    resetForm();
    setCreateOpen(false);
    setSubmitting(false);
    fetchOrders();
  };

  const handleCertSign = async (signedPdfBytes: Uint8Array, metadata: CertSignMetadata) => {
    if (!projectId || !user || !profile) return;
    if (!coverConfigured) { toast.error("Configura la portada primero"); return; }
    if (!asunto.trim()) { toast.error("El asunto es obligatorio"); return; }

    const finalContent = structuredSections
      ? formatOrderSections({ estado: structuredSections.estado || "", instrucciones: structuredSections.instrucciones || "", pendientes: structuredSections.pendientes || "" })
      : content;

    if (!finalContent.trim()) { toast.error("El contenido es obligatorio"); return; }

    setSubmitting(true);
    const geo = await getGeoLocation();
    const hash = await computeHash(finalContent + new Date().toISOString() + user.id);

    const photoUrls: string[] = [];
    for (const photo of photos) {
      const path = `orders/${projectId}/${Date.now()}_${photo.name}`;
      const { error } = await supabase.storage.from("plans").upload(path, photo);
      if (!error) photoUrls.push(path);
    }

    const recipientUserId = findRecipientUserId(dirigidaA);

    const { error } = await supabase.from("orders").insert({
      project_id: projectId,
      content: finalContent,
      created_by: user.id,
      requires_validation: false,
      ai_flags: {},
      photos: photoUrls.length > 0 ? photoUrls : [],
      dirigida_a: dirigidaA,
      escrita_por: escritaPor,
      asunto: asunto.trim(),
      signature_hash: hash,
      signature_geo: geo,
      signature_type: "p12",
      signed_at: new Date().toISOString(),
      signed_by: user.id,
      is_locked: true,
      recipient_user_id: recipientUserId,
    } as any);

    if (error) { toast.error("Error al crear la orden"); setSubmitting(false); return; }

    if (recipientUserId) {
      await notifyUser({
        userId: recipientUserId,
        projectId: projectId!,
        title: "📋 Orden pendiente de firma",
        message: `Tienes una orden dirigida a ti pendiente de firmar: "${asunto}"`,
        type: "signature",
      });
    }

    toast.success("Orden registrada con certificado digital");
    await notifyProjectMembers({
      projectId, actorId: user.id,
      title: "Nueva orden registrada",
      message: `Orden firmada con certificado digital: ${asunto}`,
      type: "info",
    });
    resetForm();
    setCreateOpen(false);
    setSubmitting(false);
    fetchOrders();
  };

  // Counter-sign handler (manual)
  const handleCounterSign = async () => {
    if (!counterSignOrder || !user || !profile || !projectId) return;
    if (!profile.dni_cif || !profile.fiscal_address) {
      setCounterFiscalModal(true);
      return;
    }
    if (counterSignMethod === "manual" && counterSigRef.current?.isEmpty()) {
      toast.error("Debes dibujar tu firma"); return;
    }
    setCounterSigning(true);
    const geo = await getGeoLocation();
    const hash = await computeHash(counterSignOrder.content + new Date().toISOString() + user.id);
    const signatureImage = counterSignMethod === "manual" && counterSigRef.current
      ? counterSigRef.current.toDataUrl() : null;

    const { error } = await (supabase.from("orders") as any)
      .update({
        recipient_signed_by: user.id,
        recipient_signed_at: new Date().toISOString(),
        recipient_signature_type: counterSignMethod,
        recipient_signature_hash: hash,
        recipient_signature_geo: geo,
        recipient_signature_image: signatureImage,
      })
      .eq("id", counterSignOrder.id);

    if (error) { toast.error("Error al firmar"); setCounterSigning(false); return; }

    await supabase.from("audit_logs").insert({
      user_id: user.id, project_id: projectId,
      action: "order_countersigned",
      details: { order_id: counterSignOrder.id, signature_type: counterSignMethod, hash, geo },
    });

    toast.success("Orden firmada por el destinatario");
    setCounterSignOpen(false);
    setCounterSignOrder(null);
    setCounterSigning(false);
    fetchOrders();
  };

  const handleCounterCertSign = async (_bytes: Uint8Array, metadata: CertSignMetadata) => {
    if (!counterSignOrder || !user || !projectId) return;
    setCounterSigning(true);
    const geo = await getGeoLocation();
    const hash = await computeHash(counterSignOrder.content + new Date().toISOString() + user.id);

    const { error } = await (supabase.from("orders") as any)
      .update({
        recipient_signed_by: user.id,
        recipient_signed_at: new Date().toISOString(),
        recipient_signature_type: "p12",
        recipient_signature_hash: hash,
        recipient_signature_geo: geo,
      })
      .eq("id", counterSignOrder.id);

    if (error) { toast.error("Error al firmar"); setCounterSigning(false); return; }
    toast.success("Orden firmada con certificado digital");
    setCounterSignOpen(false);
    setCounterSignOrder(null);
    setCounterSigning(false);
    fetchOrders();
  };

  const resetForm = () => {
    setContent("");
    setPhotos([]);
    setStructuredSections(null);
    setAsunto("");
    setDirigidaA("CONSTRUCTOR");
    setEscritaPor("DIRECCIÓN FACULTATIVA");
  };

  const checkCrossAlerts = async (text: string) => {
    if (!projectId) return;
    const { data: openIncidents } = await supabase.from("incidents").select("*").eq("project_id", projectId).eq("status", "open");
    if (!openIncidents || openIncidents.length === 0) return;
    const lower = text.toLowerCase();
    const matching = openIncidents.filter((inc: any) => {
      const words = inc.content.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4);
      return words.some((word: string) => lower.includes(word));
    });
    if (matching.length > 0) setCrossAlert({ show: true, incidents: matching });
  };

  const cleanDictation = async (rawText: string) => {
    setCleaning(true);
    try {
      const { data, error } = await supabase.functions.invoke("clean-dictation", {
        body: { rawText, context: "orders", structured: true },
      });
      if (error) throw error;
      if (data.structured && data.sections) {
        setStructuredSections(data.sections);
        const combined = formatOrderSections(data.sections);
        setContent(combined);
        toast.success("Dictado estructurado por IA");
      } else {
        setContent(data.cleanedText || rawText);
        toast.success("Dictado procesado por IA");
      }
    } catch { toast.error("Error al procesar el dictado"); }
    finally { setCleaning(false); }
  };

  // Accumulates only final (committed) speech results to avoid mobile duplication
  const finalTranscriptRef = useRef("");
  const lastResultIndexRef = useRef(0);

  const toggleRecording = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      toast.error("Tu navegador no soporta reconocimiento de voz"); return;
    }
    if (recording) {
      recognitionRef.current?.stop(); recognitionRef.current = null; setRecording(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "es-ES"; recognition.continuous = true; recognition.interimResults = true;
    finalTranscriptRef.current = content; // preserve any manually typed text
    lastResultIndexRef.current = 0;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    recognition.onresult = (event: any) => {
      // Only process NEW results starting from resultIndex to avoid mobile duplication
      let newFinal = "";
      let interimPart = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          newFinal += result[0].transcript;
        } else {
          interimPart += result[0].transcript;
        }
      }
      if (newFinal) {
        finalTranscriptRef.current = (finalTranscriptRef.current + " " + newFinal).trim();
      }

      // Debounced state update to prevent rapid re-renders on mobile
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const display = interimPart
          ? (finalTranscriptRef.current + " " + interimPart).trim()
          : finalTranscriptRef.current;
        setContent(display);
      }, 80);
    };
    recognition.onerror = (e: any) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      setRecording(false); recognitionRef.current = null;
    };
    recognition.onend = () => {
      if (recognitionRef.current) {
        try { recognition.start(); } catch { /* already started */ }
      }
    };
    recognition.start();
    setRecording(true);
  };

  // AI restructure: takes current text (dictated or manual) and structures it
  const handleAIRestructure = () => {
    const text = content.trim();
    if (!text) { toast.error("Escribe o dicta algo antes de reestructurar"); return; }
    cleanDictation(text);
  };

  useEffect(() => {
    localStorage.setItem("tektra_sig_method", signatureMethod);
  }, [signatureMethod]);

  const roleLabel = profile?.role === "DO" ? "DIRECTOR DE OBRA" : profile?.role === "DEM" ? "DIRECTOR DE EJECUCIÓN" : profile?.role === "CSS" ? "COORD. SEGURIDAD Y SALUD" : "DIRECCIÓN FACULTATIVA";

  // Check if current user needs to counter-sign an order
  const isRecipientPending = (order: any) => {
    return order.recipient_user_id === user?.id && !order.recipient_signed_at;
  };

  const getRecipientName = (order: any) => {
    if (!order.recipient_user_id) return null;
    const m = members.find((m: any) => m.user_id === order.recipient_user_id);
    return m?.profile?.full_name || m?.invited_email || "Destinatario";
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">Libro de Órdenes y Asistencias</p>
        </div>

        <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tighter">Órdenes</h1>
            {bookCover?.libro_numero && (
              <p className="text-xs text-muted-foreground mt-1">Libro nº {bookCover.libro_numero}</p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {canWrite && (
              <BookCoverForm
                projectId={projectId!}
                bookType="orders"
                project={{ name: project?.name || "", address: project?.address || null, referencia_catastral: (project as any)?.referencia_catastral }}
                onConfigured={(c) => { setBookCover(c); setCoverConfigured(!!c.libro_numero); }}
              />
            )}
            {canExport && orders.length > 0 && (
              <Button
                variant="outline"
                disabled={exporting}
                onClick={async () => {
                  setExporting(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("export-orders", { body: { projectId } });
                    if (error) throw error;
                    const blob = new Blob([data.html], { type: "text/html" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = data.fileName || "Libro_Ordenes.html"; a.click();
                    URL.revokeObjectURL(url);
                    toast.success("Libro exportado");
                  } catch { toast.error("Error al exportar"); }
                  finally { setExporting(false); }
                }}
                className="font-display text-xs uppercase tracking-wider gap-2"
              >
                <Download className="h-4 w-4" />
                {exporting ? "Exportando..." : "Exportar Libro"}
              </Button>
            )}
            {canWrite && (
              <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button data-tour="new-order" className="font-display text-xs uppercase tracking-wider gap-2" disabled={!coverConfigured}>
                    <Plus className="h-4 w-4" />Nueva Orden
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="font-display">Registrar Orden</DialogTitle>
                    {bookCover?.libro_numero && (
                      <p className="text-xs text-muted-foreground">Libro de órdenes y asistencias nº {bookCover.libro_numero} — Orden nº {(orders.length || 0) + 1}</p>
                    )}
                  </DialogHeader>
                  <form onSubmit={handleCreate} className="space-y-4 mt-2">
                    {/* Legal identification fields */}
                    <div className="space-y-2">
                      <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Dirigida a *</Label>
                      <Select value={dirigidaA} onValueChange={setDirigidaA}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DESTINATARIOS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Escrita por</Label>
                      <Select value={escritaPor} onValueChange={setEscritaPor}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {EMISORES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Asunto *</Label>
                      <Input value={asunto} onChange={e => setAsunto(e.target.value)} placeholder="Resumen breve de la orden" required />
                    </div>

                    {/* Content with voice dictation */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Cuerpo de la Orden *</Label>
                        <div className="flex gap-1">
                          <Button type="button" variant={recording ? "destructive" : "outline"} size="sm" onClick={toggleRecording} disabled={cleaning} className="gap-1 text-xs">
                            {cleaning ? <><span className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> Procesando...</> : recording ? <><MicOff className="h-3 w-3" /> Parar</> : <><Mic className="h-3 w-3" /> Dictar</>}
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={handleAIRestructure} disabled={cleaning || recording || !content.trim()} className="gap-1 text-xs">
                             <Sparkles className="h-3 w-3" /> Reestructurar IA
                          </Button>
                          {(content.trim() || structuredSections) && !recording && !cleaning && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => { setContent(""); setStructuredSections(null); finalTranscriptRef.current = ""; }} className="gap-1 text-xs text-muted-foreground">
                              <X className="h-3 w-3" /> Limpiar
                            </Button>
                          )}
                        </div>
                      </div>
                      {structuredSections ? (
                        <StructuredSectionsEditor
                          fields={ORDER_FIELDS}
                          title="Vista previa editable"
                          values={structuredSections}
                          onChange={(key, value) => setStructuredSections(prev => prev ? { ...prev, [key]: value } : prev)}
                        />
                      ) : (
                        <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Describa la orden o use el dictado por voz..." rows={5} required={!structuredSections} />
                      )}
                    </div>

                    {/* Attachments */}
                    <div className="space-y-2">
                      <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Adjuntos</Label>
                      <div className="flex gap-2">
                        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { if (e.target.files) setPhotos(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value = ""; }} />
                        <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files) setPhotos(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value = ""; }} />
                        <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden" onChange={e => { if (e.target.files) setPhotos(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value = ""; }} />
                        {isMobile ? (
                          <>
                            <Button type="button" variant="outline" size="sm" className="gap-1 text-xs flex-1" onClick={() => cameraInputRef.current?.click()}><Camera className="h-3.5 w-3.5" /> Foto</Button>
                            <Button type="button" variant="outline" size="sm" className="gap-1 text-xs flex-1" onClick={() => galleryInputRef.current?.click()}><Image className="h-3.5 w-3.5" /> Galería</Button>
                            <Button type="button" variant="outline" size="sm" className="gap-1 text-xs flex-1" onClick={() => fileInputRef.current?.click()}><Paperclip className="h-3.5 w-3.5" /> Archivo</Button>
                          </>
                        ) : (
                          <>
                            <Button type="button" variant="outline" size="sm" className="gap-1 text-xs flex-1" onClick={() => galleryInputRef.current?.click()}><Camera className="h-3.5 w-3.5" /> Foto</Button>
                            <Button type="button" variant="outline" size="sm" className="gap-1 text-xs flex-1" onClick={() => fileInputRef.current?.click()}><Paperclip className="h-3.5 w-3.5" /> Archivo</Button>
                          </>
                        )}
                      </div>
                      {photos.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {photos.map((f, i) => (
                            <span key={i} className="flex items-center gap-1 px-2 py-1 text-xs bg-muted rounded">
                              {f.name.length > 20 ? f.name.slice(0, 17) + "..." : f.name}
                              <button type="button" onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Signature section */}
                    <div className="space-y-2 border-t border-border pt-4">
                      <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <FileSignature className="h-3.5 w-3.5" /> Firma Obligatoria
                      </Label>
                      <Tabs value={signatureMethod} onValueChange={setSignatureMethod}>
                        <TabsList className="w-full">
                          <TabsTrigger value="manual" className="flex-1 text-xs">Firma Manual</TabsTrigger>
                          <TabsTrigger value="certificate" className="flex-1 text-xs">Certificado Digital</TabsTrigger>
                        </TabsList>
                        <TabsContent value="manual" className="mt-3">
                          <SignatureCanvas ref={sigCanvasRef} />
                          <Button type="submit" disabled={submitting} className="w-full mt-3 font-display text-xs uppercase tracking-wider gap-2">
                            <ShieldCheck className="h-4 w-4" />
                            {submitting ? "Firmando y registrando..." : "Firmar y Registrar Orden"}
                          </Button>
                        </TabsContent>
                        <TabsContent value="certificate" className="mt-3">
                          <CertificateSignature
                            disabled={submitting}
                            userRole={roleLabel}
                            originalPdfBytes={null}
                            noPdfRequired
                            onSign={async (_bytes, metadata) => {
                              await handleCertSign(new Uint8Array(), metadata);
                            }}
                          />
                        </TabsContent>
                      </Tabs>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {!coverConfigured && canWrite && (
          <div className="mb-6 p-4 border border-warning/30 bg-warning/10 rounded-lg">
            <p className="text-sm font-display text-warning flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Configura la portada del libro antes de crear órdenes. Los datos de la portada aparecerán en todas las hojas y en el PDF exportado.
            </p>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-card border border-border rounded-lg animate-pulse" />)}</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="font-display text-muted-foreground">No hay órdenes registradas</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order, i) => {
              const isLocked = (order as any).is_locked;
              const needsCounterSign = isRecipientPending(order);
              const recipientName = getRecipientName(order);
              const hasRecipientSigned = !!(order as any).recipient_signed_at;
              return (
                <div key={order.id} className={`bg-card border rounded-lg p-5 animate-fade-in hover:shadow-lg hover:-translate-y-0.5 transition-all ${needsCounterSign ? "border-warning" : "border-border"}`} style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-display font-bold text-muted-foreground">#{order.order_number}</span>
                        {isLocked && (
                          <span className="flex items-center gap-1 text-[10px] text-success font-display uppercase tracking-wider">
                            <Lock className="h-3 w-3" /> Emisor
                          </span>
                        )}
                        {hasRecipientSigned ? (
                          <span className="flex items-center gap-1 text-[10px] text-success font-display uppercase tracking-wider">
                            <ShieldCheck className="h-3 w-3" /> Receptor
                          </span>
                        ) : (order as any).recipient_user_id ? (
                          <span className="flex items-center gap-1 text-[10px] text-warning font-display uppercase tracking-wider">
                            <PenLine className="h-3 w-3" /> Pte. Receptor
                          </span>
                        ) : null}
                        {(order as any).signature_type === "p12" && (
                          <span className="flex items-center gap-1 text-[10px] text-primary font-display uppercase tracking-wider">
                            <ShieldCheck className="h-3 w-3" /> Certificado
                          </span>
                        )}
                      </div>

                      {(order as any).asunto && (
                        <p className="text-sm font-semibold mb-1">{(order as any).asunto}</p>
                      )}

                      <div className="flex gap-3 text-[10px] text-muted-foreground mb-2 flex-wrap">
                        {(order as any).dirigida_a && <span>A: {(order as any).dirigida_a}{recipientName ? ` (${recipientName})` : ""}</span>}
                        {(order as any).escrita_por && <span>De: {(order as any).escrita_por}</span>}
                      </div>

                      {order.content.includes("**ESTADO DE LA OBRA:**") ? (
                        <div className="space-y-2 mt-1">
                          {order.content.split(/\*\*(?:ESTADO DE LA OBRA|INSTRUCCIONES Y ÓRDENES|PENDIENTES):\*\*/).filter(Boolean).map((section: string, si: number) => {
                            const titles = ["Estado de la Obra", "Instrucciones y Órdenes", "Pendientes"];
                            const colors = ["text-emerald-600 dark:text-emerald-400", "text-blue-600 dark:text-blue-400", "text-amber-600 dark:text-amber-400"];
                            return (
                              <div key={si} className="p-2.5 bg-secondary/20 rounded border border-border">
                                <p className={`text-[10px] font-display font-bold uppercase tracking-wider mb-0.5 ${colors[si] || "text-primary"}`}>{titles[si] || ""}</p>
                                <p className="text-sm whitespace-pre-wrap">{section.trim()}</p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{order.content}</p>
                      )}

                      {order.photos && order.photos.length > 0 && <AttachmentThumbnails paths={order.photos} />}

                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span>{new Date(order.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        {(order as any).signature_hash && (
                          <span className="text-[9px] font-mono truncate max-w-[200px]" title={(order as any).signature_hash}>
                            Hash: {(order as any).signature_hash.substring(0, 16)}...
                          </span>
                        )}
                      </div>

                      {/* Counter-sign button for recipient */}
                      {needsCounterSign && (
                        <Button
                          size="sm"
                          className="mt-3 gap-2 font-display text-xs uppercase tracking-wider"
                          onClick={() => { setCounterSignOrder(order); setCounterSignOpen(true); }}
                        >
                          <PenLine className="h-3.5 w-3.5" /> Firmar como destinatario
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

      {/* Counter-sign dialog */}
      <Dialog open={counterSignOpen} onOpenChange={(open) => { if (!open) { setCounterSignOpen(false); setCounterSignOrder(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Firmar Orden como Destinatario</DialogTitle>
            {counterSignOrder && (
              <p className="text-xs text-muted-foreground">Orden #{counterSignOrder.order_number} — {(counterSignOrder as any).asunto}</p>
            )}
          </DialogHeader>
          {counterSignOrder && (
            <div className="space-y-4 mt-2">
              <div className="p-3 bg-secondary/20 rounded border border-border">
                <p className="text-sm whitespace-pre-wrap">{counterSignOrder.content}</p>
              </div>
              <div className="space-y-2 border-t border-border pt-4">
                <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileSignature className="h-3.5 w-3.5" /> Tu Firma
                </Label>
                <Tabs value={counterSignMethod} onValueChange={setCounterSignMethod}>
                  <TabsList className="w-full">
                    <TabsTrigger value="manual" className="flex-1 text-xs">Firma Manual</TabsTrigger>
                    <TabsTrigger value="certificate" className="flex-1 text-xs">Certificado Digital</TabsTrigger>
                  </TabsList>
                  <TabsContent value="manual" className="mt-3">
                    <SignatureCanvas ref={counterSigRef} />
                    <Button onClick={handleCounterSign} disabled={counterSigning} className="w-full mt-3 font-display text-xs uppercase tracking-wider gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      {counterSigning ? "Firmando..." : "Firmar y Confirmar Recepción"}
                    </Button>
                  </TabsContent>
                  <TabsContent value="certificate" className="mt-3">
                    <CertificateSignature
                      disabled={counterSigning}
                      userRole={roleLabel}
                      originalPdfBytes={null}
                      noPdfRequired
                      onSign={async (_bytes, metadata) => {
                        await handleCounterCertSign(new Uint8Array(), metadata);
                      }}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cross-alert */}
      <AlertDialog open={crossAlert.show} onOpenChange={open => { if (!open) setCrossAlert({ show: false, incidents: [] }); }}>
        <AlertDialogContent className="border-destructive">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Alerta de Coherencia Cruzada
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Esta orden hace referencia a elementos con <strong>incidencias abiertas</strong>:</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {crossAlert.incidents.map((inc: any) => (
                    <div key={inc.id} className="p-2 bg-destructive/10 rounded text-xs border border-destructive/20">
                      <span className="font-bold">#{inc.incident_number}</span> — {inc.content.substring(0, 120)}...
                    </div>
                  ))}
                </div>
                <p className="text-xs font-medium">¿Deseas continuar?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setCrossAlert({ show: false, incidents: [] }); setSubmitting(false); }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => setCrossAlert({ show: false, incidents: [] })} className="bg-destructive text-destructive-foreground">Continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Fiscal data modals */}
      <FiscalDataModal
        open={showFiscalModal}
        onComplete={() => { setShowFiscalModal(false); if (pendingSubmit) { setPendingSubmit(false); handleCreate(); } }}
        onCancel={() => { setShowFiscalModal(false); setPendingSubmit(false); }}
      />
      <FiscalDataModal
        open={counterFiscalModal}
        onComplete={() => { setCounterFiscalModal(false); handleCounterSign(); }}
        onCancel={() => setCounterFiscalModal(false)}
      />
    </AppLayout>
  );
};

export default OrdersModule;
