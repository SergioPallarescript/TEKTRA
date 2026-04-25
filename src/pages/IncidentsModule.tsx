import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjectRole } from "@/hooks/useProjectRole";
import AppLayout from "@/components/AppLayout";
import AttachmentThumbnails from "@/components/AttachmentThumbnails";
import BookCoverForm from "@/components/BookCoverForm";
import SignatureCanvas, { type SignatureCanvasHandle } from "@/components/SignatureCanvas";
import CertificateSignature, { type CertSignMetadata } from "@/components/CertificateSignature";
import FiscalDataModal from "@/components/FiscalDataModal";
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
import { toast } from "sonner";
import { notifyProjectMembers } from "@/lib/notifications";
import {
  ArrowLeft, Plus, ShieldAlert, Mic, MicOff, Camera, Image, Paperclip, X, Lock, ShieldCheck, FileSignature, CheckCircle2,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { AlertTriangle } from "lucide-react";
import { useVoiceDictation } from "@/hooks/useVoiceDictation";

const severityLabels: Record<string, { label: string; color: string }> = {
  low: { label: "Baja", color: "text-success bg-success/10" },
  medium: { label: "Media", color: "text-warning bg-warning/10" },
  high: { label: "Alta", color: "text-destructive bg-destructive/10" },
  critical: { label: "Crítica", color: "text-destructive bg-destructive/20" },
};

const DESTINATARIOS = ["CONSTRUCTOR", "PROMOTOR", "DIRECCIÓN FACULTATIVA", "TODOS LOS AGENTES"];
const EMISORES = ["COORD. SEGURIDAD Y SALUD", "DIRECCIÓN FACULTATIVA"];

const IncidentsModule = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const { isCSS, hasDualCSS } = useProjectRole(projectId);
  const navigate = useNavigate();

  const [project, setProject] = useState<any>(null);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [content, setContent] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [remedial, setRemedial] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const [submitting, setSubmitting] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const dictation = useVoiceDictation({
    onFinalChange: (text) => setContent(text),
  });
  const recording = dictation.recording;

  // Legal fields
  const [dirigidaA, setDirigidaA] = useState("CONSTRUCTOR");
  const [escritaPor, setEscritaPor] = useState("COORD. SEGURIDAD Y SALUD");
  const [asunto, setAsunto] = useState("");

  // Book cover
  const [bookCover, setBookCover] = useState<any>(null);
  const [coverConfigured, setCoverConfigured] = useState(false);

  // Signature
  const [signatureMethod, setSignatureMethod] = useState<string>(() => localStorage.getItem("tektra_sig_method") || "manual");
  const sigCanvasRef = useRef<SignatureCanvasHandle>(null);
  const [showFiscalModal, setShowFiscalModal] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);

  const canWrite = isCSS || hasDualCSS;

  const fetchProject = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase.from("projects").select("*").eq("id", projectId).single();
    if (data) setProject(data);
  }, [projectId]);

  const fetchIncidents = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase.from("incidents").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
    if (data) setIncidents(data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchProject(); fetchIncidents(); }, [fetchProject, fetchIncidents]);

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
      toast.error("Debes configurar la portada del libro antes de crear incidencias");
      return;
    }
    if (!asunto.trim()) { toast.error("El asunto es obligatorio"); return; }
    if (!content.trim()) { toast.error("La descripción es obligatoria"); return; }

    if (signatureMethod === "manual" && sigCanvasRef.current?.isEmpty()) {
      toast.error("Debes firmar la incidencia antes de enviarla");
      return;
    }

    setSubmitting(true);
    const photoUrls: string[] = [];
    for (const photo of photos) {
      const path = `incidents/${projectId}/${Date.now()}_${photo.name}`;
      const { error } = await supabase.storage.from("plans").upload(path, photo);
      if (!error) photoUrls.push(path);
    }

    const geo = await getGeoLocation();
    const hash = await computeHash(content + new Date().toISOString() + user.id);

    // Capture canvas signature image for manual signatures
    const signatureImage = signatureMethod === "manual" && sigCanvasRef.current
      ? sigCanvasRef.current.toDataUrl()
      : null;

    const { error } = await supabase.from("incidents").insert({
      project_id: projectId, content, severity,
      remedial_actions: remedial || null, photos: photoUrls, created_by: user.id,
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
    } as any);

    if (error) { toast.error("Error al registrar incidencia"); setSubmitting(false); return; }

    await supabase.from("audit_logs").insert({
      user_id: user.id, project_id: projectId,
      action: "incident_created_legal",
      details: { severity, asunto, dirigida_a: dirigidaA, signature_type: signatureMethod, hash, geo },
    });

    await notifyProjectMembers({
      projectId, actorId: user.id,
      title: "Nueva incidencia registrada",
      message: `Incidencia de gravedad ${severity}: ${asunto}`,
      type: severity === "critical" || severity === "high" ? "warning" : "info",
    });

    toast.success("Incidencia registrada y firmada");
    resetForm();
    setCreateOpen(false); setSubmitting(false); fetchIncidents();
  };

  const handleCertSign = async (_bytes: Uint8Array, metadata: CertSignMetadata) => {
    if (!projectId || !user || !profile) return;
    if (!coverConfigured) { toast.error("Configura la portada primero"); return; }
    if (!asunto.trim()) { toast.error("El asunto es obligatorio"); return; }
    if (!content.trim()) { toast.error("La descripción es obligatoria"); return; }

    setSubmitting(true);
    const geo = await getGeoLocation();
    const hash = await computeHash(content + new Date().toISOString() + user.id);

    const photoUrls: string[] = [];
    for (const photo of photos) {
      const path = `incidents/${projectId}/${Date.now()}_${photo.name}`;
      const { error } = await supabase.storage.from("plans").upload(path, photo);
      if (!error) photoUrls.push(path);
    }

    const { error } = await supabase.from("incidents").insert({
      project_id: projectId, content, severity,
      remedial_actions: remedial || null, photos: photoUrls, created_by: user.id,
      dirigida_a: dirigidaA, escrita_por: escritaPor, asunto: asunto.trim(),
      signature_hash: hash, signature_geo: geo, signature_type: "p12",
      signed_at: new Date().toISOString(), signed_by: user.id, is_locked: true,
    } as any);

    if (error) { toast.error("Error al registrar incidencia"); setSubmitting(false); return; }

    toast.success("Incidencia registrada con certificado digital");
    resetForm(); setCreateOpen(false); setSubmitting(false); fetchIncidents();
  };

  const resetForm = () => {
    setContent(""); setSeverity("medium"); setRemedial(""); setPhotos([]);
    setAsunto(""); setDirigidaA("CONSTRUCTOR"); setEscritaPor("COORD. SEGURIDAD Y SALUD");
  };

  const cleanDictation = async (rawText: string) => {
    setCleaning(true);
    try {
      const { data, error } = await supabase.functions.invoke("clean-dictation", { body: { rawText, context: "incidents" } });
      if (error) throw error;
      setContent(data.cleanedText || rawText);
      toast.success("Dictado procesado por IA");
    } catch { toast.error("Error al procesar el dictado"); }
    finally { setCleaning(false); }
  };

  const toggleRecording = () => {
    if (!dictation.supported) {
      toast.error("Tu navegador no soporta reconocimiento de voz");
      return;
    }
    if (recording) {
      dictation.stop();
      const finalText = dictation.getFinal().trim();
      if (finalText) cleanDictation(finalText);
      return;
    }
    dictation.start(content);
  };

  const roleLabel = profile?.role === "CSS" ? "COORD. SEGURIDAD Y SALUD" : "DIRECCIÓN FACULTATIVA";

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">Libro de Incidencias</p>
        </div>

        <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tighter">Incidencias</h1>
            {bookCover?.libro_numero && <p className="text-xs text-muted-foreground mt-1">Libro nº {bookCover.libro_numero}</p>}
          </div>
          <div className="flex gap-2 flex-wrap">
            {canWrite && (
              <BookCoverForm
                projectId={projectId!}
                bookType="incidents"
                project={{ name: project?.name || "", address: project?.address || null, referencia_catastral: (project as any)?.referencia_catastral }}
                onConfigured={c => { setBookCover(c); setCoverConfigured(!!c.libro_numero); }}
              />
            )}
            {canWrite && (
              <Dialog open={createOpen} onOpenChange={open => { setCreateOpen(open); if (!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button data-tour="new-incident" className="font-display text-xs uppercase tracking-wider gap-2" disabled={!coverConfigured}>
                    <Plus className="h-4 w-4" />Nueva Incidencia
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="font-display">Registrar Incidencia</DialogTitle>
                    {bookCover?.libro_numero && (
                      <p className="text-xs text-muted-foreground">Libro de incidencias nº {bookCover.libro_numero} — Incidencia nº {(incidents.length || 0) + 1}</p>
                    )}
                  </DialogHeader>
                  <form onSubmit={handleCreate} className="space-y-4 mt-2">
                    <div className="space-y-2">
                      <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Dirigida a *</Label>
                      <Select value={dirigidaA} onValueChange={setDirigidaA}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{DESTINATARIOS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Escrita por</Label>
                      <Select value={escritaPor} onValueChange={setEscritaPor}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{EMISORES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Asunto *</Label>
                      <Input value={asunto} onChange={e => setAsunto(e.target.value)} placeholder="Resumen breve de la incidencia" required />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Gravedad</Label>
                      <Select value={severity} onValueChange={setSeverity}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(severityLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Descripción del Riesgo *</Label>
                        <Button type="button" variant={recording ? "destructive" : "outline"} size="sm" onClick={toggleRecording} disabled={cleaning} className="gap-1 text-xs">
                          {cleaning ? <><span className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> Procesando...</> : recording ? <><MicOff className="h-3 w-3" /> Parar</> : <><Mic className="h-3 w-3" /> Dictar</>}
                        </Button>
                      </div>
                      <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Describa la incidencia de seguridad..." rows={5} required />
                      {recording && dictation.interim && (
                        <p className="text-xs text-muted-foreground italic mt-1">
                          Escuchando: <span className="opacity-70">{dictation.interim}</span>
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Acciones Correctoras</Label>
                      <Textarea value={remedial} onChange={e => setRemedial(e.target.value)} placeholder="Medidas correctoras propuestas..." rows={3} />
                    </div>
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
                      {photos.length > 0 && <p className="text-xs text-muted-foreground">{photos.length} archivo(s) seleccionado(s)</p>}
                    </div>

                    {/* Signature */}
                    <div className="space-y-2 border-t border-border pt-4">
                      <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <FileSignature className="h-3.5 w-3.5" /> Firma Obligatoria
                      </Label>
                      <Tabs value={signatureMethod} onValueChange={v => { setSignatureMethod(v); localStorage.setItem("tektra_sig_method", v); }}>
                        <TabsList className="w-full">
                          <TabsTrigger value="manual" className="flex-1 text-xs">Firma Manual</TabsTrigger>
                          <TabsTrigger value="certificate" className="flex-1 text-xs">Certificado Digital</TabsTrigger>
                        </TabsList>
                        <TabsContent value="manual" className="mt-3">
                          <SignatureCanvas ref={sigCanvasRef} />
                          <Button type="submit" disabled={submitting} className="w-full mt-3 font-display text-xs uppercase tracking-wider gap-2">
                            <ShieldCheck className="h-4 w-4" />
                            {submitting ? "Firmando..." : "Firmar y Registrar"}
                          </Button>
                        </TabsContent>
                        <TabsContent value="certificate" className="mt-3">
                          <CertificateSignature
                            disabled={submitting}
                            userRole={roleLabel}
                            originalPdfBytes={null}
                            noPdfRequired
                            onSign={async (_bytes, metadata) => { await handleCertSign(new Uint8Array(), metadata); }}
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
              Configura la portada del libro antes de crear incidencias.
            </p>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-card border border-border rounded-lg animate-pulse" />)}</div>
        ) : incidents.length === 0 ? (
          <div className="text-center py-20">
            <ShieldAlert className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="font-display text-muted-foreground">No hay incidencias registradas</p>
          </div>
        ) : (
          <div className="space-y-3">
            {incidents.map((inc, i) => {
              const sev = severityLabels[inc.severity] || severityLabels.medium;
              const isLocked = (inc as any).is_locked;
              return (
                <div key={inc.id} className={`bg-card border border-border rounded-lg p-5 animate-fade-in hover:shadow-lg hover:-translate-y-0.5 transition-all ${inc.status === "resolved" ? "opacity-60" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-display font-bold text-muted-foreground">#{inc.incident_number}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-display uppercase tracking-widest rounded ${sev.color}`}>{sev.label}</span>
                        {isLocked && <span className="flex items-center gap-1 text-[10px] text-success font-display uppercase tracking-wider"><Lock className="h-3 w-3" /> Firmada</span>}
                        {inc.status === "resolved" && <span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3 w-3" /> Resuelta</span>}
                      </div>
                      {(inc as any).asunto && <p className="text-sm font-semibold mb-1">{(inc as any).asunto}</p>}
                      <div className="flex gap-3 text-[10px] text-muted-foreground mb-2 flex-wrap">
                        {(inc as any).dirigida_a && <span>A: {(inc as any).dirigida_a}</span>}
                        {(inc as any).escrita_por && <span>De: {(inc as any).escrita_por}</span>}
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{inc.content}</p>
                      {inc.photos && inc.photos.length > 0 && <AttachmentThumbnails paths={inc.photos} />}
                      {inc.remedial_actions && (
                        <p className="text-xs text-muted-foreground mt-2 border-l-2 border-border pl-3">
                          <strong>Correctoras:</strong> {inc.remedial_actions}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span>{new Date(inc.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        {(inc as any).signature_hash && (
                          <span className="text-[9px] font-mono truncate max-w-[200px]">Hash: {(inc as any).signature_hash.substring(0, 16)}...</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <FiscalDataModal
        open={showFiscalModal}
        onComplete={() => { setShowFiscalModal(false); if (pendingSubmit) { setPendingSubmit(false); handleCreate(); } }}
        onCancel={() => { setShowFiscalModal(false); setPendingSubmit(false); }}
      />
    </AppLayout>
  );
};

export default IncidentsModule;
