import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjectRole } from "@/hooks/useProjectRole";
import AppLayout from "@/components/AppLayout";
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
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft, FileText, Plus, Upload, Download, Lock, ShieldCheck, FileSignature, CalendarIcon, ClipboardList, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const HABILITACION_CAUSES = [
  { value: "nueva_obra", label: "Nueva obra" },
  { value: "continuacion", label: "Continuación de libro anterior" },
  { value: "perdida", label: "Pérdida" },
  { value: "destruccion", label: "Destrucción" },
];

const SubcontractingModule = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const { isCON, isAdmin, isDEM, isDO } = useProjectRole(projectId);
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [project, setProject] = useState<any>(null);
  const [book, setBook] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<any[]>([]);

  // Diligencia form
  const [showDiligencia, setShowDiligencia] = useState(false);
  const [reaNumber, setReaNumber] = useState("");
  const [aperturaNumber, setAperturaNumber] = useState("");
  const [habCause, setHabCause] = useState("nueva_obra");
  const [lastAnnotation, setLastAnnotation] = useState("");
  const [submittingDiligencia, setSubmittingDiligencia] = useState(false);

  // Upload sealed
  const [uploading, setUploading] = useState(false);
  const sealedInputRef = useRef<HTMLInputElement>(null);

  // New entry form
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [empresaNombre, setEmpresaNombre] = useState("");
  const [empresaNif, setEmpresaNif] = useState("");
  const [nivelSub, setNivelSub] = useState("1");
  const [objetoContrato, setObjetoContrato] = useState("");
  const [fechaComienzo, setFechaComienzo] = useState<Date>();
  const [responsableNombre, setResponsableNombre] = useState("");
  const [responsableDni, setResponsableDni] = useState("");
  const [fechaPlanSeguridad, setFechaPlanSeguridad] = useState<Date>();
  const [instrucciones, setInstrucciones] = useState("");
  const [submittingEntry, setSubmittingEntry] = useState(false);

  // Signature
  const [signatureMethod, setSignatureMethod] = useState<string>(() => localStorage.getItem("tektra_sig_method") || "manual");
  const sigCanvasRef = useRef<SignatureCanvasHandle>(null);
  const [showFiscalModal, setShowFiscalModal] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);

  const canWrite = isCON;

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const [{ data: proj }, { data: bookData }, { data: memberData }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase.from("subcontracting_books" as any).select("*").eq("project_id", projectId).maybeSingle(),
      supabase.from("project_members").select("*, profiles:user_id(full_name, role, dni_cif)").eq("project_id", projectId).eq("status", "accepted"),
    ]);
    if (proj) setProject(proj);
    if (bookData) {
      setBook(bookData);
      const { data: entryData } = await supabase
        .from("subcontracting_entries" as any)
        .select("*")
        .eq("book_id", (bookData as any).id)
        .order("entry_number", { ascending: true });
      setEntries(entryData || []);
    }
    setMembers(memberData || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  // Create diligencia
  const handleCreateDiligencia = async () => {
    if (!projectId || !user) return;
    if (!reaNumber.trim() || !aperturaNumber.trim()) {
      toast.error("Los campos REA y Nº Apertura son obligatorios");
      return;
    }
    setSubmittingDiligencia(true);
    const { error } = await supabase.from("subcontracting_books" as any).insert({
      project_id: projectId,
      rea_number: reaNumber.trim(),
      apertura_number: aperturaNumber.trim(),
      habilitacion_cause: habCause,
      last_annotation_number: lastAnnotation.trim() || null,
      diligencia_generated_at: new Date().toISOString(),
      created_by: user.id,
    } as any);
    if (error) {
      toast.error("Error al crear la diligencia");
      console.error(error);
    } else {
      toast.success("Diligencia de Habilitación generada");
      setShowDiligencia(false);
      fetchData();
    }
    setSubmittingDiligencia(false);
  };

  // Upload sealed file
  const handleUploadSealed = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !book) return;
    setUploading(true);
    const path = `subcontracting/${projectId}/${Date.now()}_${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("plans").upload(path, file);
    if (uploadErr) {
      toast.error("Error al subir el archivo");
      setUploading(false);
      return;
    }
    const { error } = await supabase
      .from("subcontracting_books" as any)
      .update({ sealed_file_path: path, sealed_file_name: file.name, is_activated: true } as any)
      .eq("id", book.id);
    if (error) {
      toast.error("Error al activar el libro");
    } else {
      toast.success("Libro de Subcontratación activado");
      fetchData();
    }
    setUploading(false);
    if (sealedInputRef.current) sealedInputRef.current.value = "";
  };

  // Create new entry (manual signature)
  const handleCreateEntry = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!projectId || !user || !profile || !book) return;

    if (!profile.dni_cif || !profile.fiscal_address) {
      setShowFiscalModal(true);
      setPendingSubmit(true);
      return;
    }

    if (!empresaNombre.trim() || !empresaNif.trim() || !objetoContrato.trim() || !fechaComienzo || !responsableNombre.trim() || !responsableDni.trim()) {
      toast.error("Completa todos los campos obligatorios");
      return;
    }

    if (signatureMethod === "manual" && sigCanvasRef.current?.isEmpty()) {
      toast.error("Debes firmar el asiento antes de registrarlo");
      return;
    }

    setSubmittingEntry(true);
    const geo = await getGeoLocation();
    const hashInput = `${empresaNombre}|${empresaNif}|${objetoContrato}|${new Date().toISOString()}|${user.id}`;
    const hash = await computeHash(hashInput);
    const signatureImage = signatureMethod === "manual" && sigCanvasRef.current ? sigCanvasRef.current.toDataUrl() : null;

    const { error } = await supabase.from("subcontracting_entries" as any).insert({
      book_id: book.id,
      project_id: projectId,
      empresa_nombre: empresaNombre.trim(),
      empresa_nif: empresaNif.trim(),
      nivel_subcontratacion: parseInt(nivelSub),
      objeto_contrato: objetoContrato.trim(),
      fecha_comienzo: format(fechaComienzo, "yyyy-MM-dd"),
      responsable_nombre: responsableNombre.trim(),
      responsable_dni: responsableDni.trim(),
      fecha_plan_seguridad: fechaPlanSeguridad ? format(fechaPlanSeguridad, "yyyy-MM-dd") : null,
      instrucciones_seguridad: instrucciones.trim() || null,
      signature_hash: hash,
      signature_geo: geo,
      signature_type: signatureMethod,
      signature_image: signatureImage,
      signed_by: user.id,
      signed_at: new Date().toISOString(),
      is_locked: true,
      created_by: user.id,
    } as any);

    if (error) {
      toast.error("Error al registrar la subcontrata");
      console.error(error);
    } else {
      toast.success("Subcontrata registrada correctamente");
      resetEntryForm();
      setShowNewEntry(false);
      fetchData();
    }
    setSubmittingEntry(false);
  };

  const handleCertSign = async (_bytes: Uint8Array, metadata: CertSignMetadata) => {
    if (!projectId || !user || !profile || !book) return;

    if (!empresaNombre.trim() || !empresaNif.trim() || !objetoContrato.trim() || !fechaComienzo || !responsableNombre.trim() || !responsableDni.trim()) {
      toast.error("Completa todos los campos obligatorios");
      return;
    }

    setSubmittingEntry(true);
    const geo = await getGeoLocation();

    const { error } = await supabase.from("subcontracting_entries" as any).insert({
      book_id: book.id,
      project_id: projectId,
      empresa_nombre: empresaNombre.trim(),
      empresa_nif: empresaNif.trim(),
      nivel_subcontratacion: parseInt(nivelSub),
      objeto_contrato: objetoContrato.trim(),
      fecha_comienzo: format(fechaComienzo!, "yyyy-MM-dd"),
      responsable_nombre: responsableNombre.trim(),
      responsable_dni: responsableDni.trim(),
      fecha_plan_seguridad: fechaPlanSeguridad ? format(fechaPlanSeguridad, "yyyy-MM-dd") : null,
      instrucciones_seguridad: instrucciones.trim() || null,
      signature_hash: metadata.validationHash,
      signature_geo: geo,
      signature_type: "p12",
      signed_by: user.id,
      signed_at: new Date().toISOString(),
      is_locked: true,
      created_by: user.id,
    } as any);

    if (error) {
      toast.error("Error al registrar la subcontrata");
      console.error(error);
    } else {
      toast.success("Subcontrata registrada con certificado digital");
      resetEntryForm();
      setShowNewEntry(false);
      fetchData();
    }
    setSubmittingEntry(false);
  };

  const resetEntryForm = () => {
    setEmpresaNombre("");
    setEmpresaNif("");
    setNivelSub("1");
    setObjetoContrato("");
    setFechaComienzo(undefined);
    setResponsableNombre("");
    setResponsableDni("");
    setFechaPlanSeguridad(undefined);
    setInstrucciones("");
  };

  // Export book
  const handleExport = async () => {
    if (!book || !project) return;
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-subcontracting", { body: { projectId } });
      if (error) throw error;
      const blob = new Blob([data.html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.fileName || "Libro_Subcontratacion.html";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Libro exportado correctamente");
    } catch (err: any) {
      toast.error("Error al exportar: " + (err?.message || ""));
    }
    setExporting(false);
  };

  const DatePickerField = ({ label, value, onChange, required }: { label: string; value?: Date; onChange: (d: Date | undefined) => void; required?: boolean }) => (
    <div className="space-y-2">
      <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">{label} {required && "*"}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm", !value && "text-muted-foreground")}>
            <CalendarIcon className="h-4 w-4 mr-2" />
            {value ? format(value, "d 'de' MMMM yyyy", { locale: es }) : "Seleccionar fecha"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={value} onSelect={onChange} initialFocus className={cn("p-3 pointer-events-auto")} />
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto py-6 px-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-display font-bold tracking-tight truncate flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary shrink-0" />
              Libro de Subcontratación
            </h1>
            {project && <p className="text-xs text-muted-foreground truncate">{project.name}</p>}
          </div>
          <div className="flex gap-2 flex-wrap">
            {book?.is_activated && entries.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting} className="gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" />
                {exporting ? "Exportando..." : "Exportar Libro"}
              </Button>
            )}
            {book?.is_activated && canWrite && (
              <Button size="sm" onClick={() => setShowNewEntry(true)} className="gap-1.5 text-xs font-display uppercase tracking-wider">
                <Plus className="h-3.5 w-3.5" />
                Nueva Subcontrata
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-card border border-border rounded-lg animate-pulse" />)}</div>
        ) : !book ? (
          /* No book yet - show creation */
          <div className="text-center py-16">
            <FileText className="h-14 w-14 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="font-display text-lg font-semibold mb-2">Libro de Subcontratación</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              Genera la Diligencia de Habilitación para iniciar el libro según la Ley 32/2006.
            </p>
            {canWrite ? (
              <Button onClick={() => setShowDiligencia(true)} className="gap-2 font-display text-xs uppercase tracking-wider">
                <FileText className="h-4 w-4" />
                Generar Diligencia de Habilitación
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Solo el Contratista puede generar la diligencia.</p>
            )}
          </div>
        ) : !book.is_activated ? (
          /* Book exists but not activated */
          <div className="space-y-6">
            <div className="p-6 border border-warning/30 bg-warning/5 rounded-lg space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-display font-semibold text-sm">Diligencia pendiente de sello</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Descarga la diligencia, llévala a sellar por la Autoridad Laboral y sube el documento sellado para activar el libro.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => {
                  // Generate downloadable diligencia HTML
                  const html = generateDiligenciaHtml(book, project, members);
                  const blob = new Blob([html], { type: "text/html" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `Diligencia_Habilitacion_${project?.name?.replace(/\s+/g, "_")}.html`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}>
                  <Download className="h-3.5 w-3.5" />
                  Descargar Diligencia
                </Button>
                {canWrite && (
                  <>
                    <input ref={sealedInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleUploadSealed} />
                    <Button size="sm" className="gap-1.5 text-xs font-display uppercase tracking-wider" disabled={uploading} onClick={() => sealedInputRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5" />
                      {uploading ? "Subiendo..." : "Subir 1ª Hoja HABILITADA"}
                    </Button>
                  </>
                )}
              </div>
            </div>
            {/* Show diligencia data */}
            <div className="bg-card border border-border rounded-lg p-5">
              <h3 className="font-display text-sm font-semibold mb-3">Datos de la Diligencia</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <span className="text-muted-foreground">Nº Inscripción REA:</span>
                <span className="font-medium">{book.rea_number}</span>
                <span className="text-muted-foreground">Nº Registro Apertura:</span>
                <span className="font-medium">{book.apertura_number}</span>
                <span className="text-muted-foreground">Causa:</span>
                <span className="font-medium">{HABILITACION_CAUSES.find(c => c.value === book.habilitacion_cause)?.label}</span>
                <span className="text-muted-foreground">Generada:</span>
                <span className="font-medium">{new Date(book.diligencia_generated_at).toLocaleDateString("es-ES")}</span>
              </div>
            </div>
          </div>
        ) : (
          /* Book activated - show entries */
          <div className="space-y-4">
            <div className="bg-card border border-primary/20 rounded-lg p-4 flex items-center gap-3 mb-2">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-display font-semibold">Libro Activado</p>
                <p className="text-xs text-muted-foreground">REA: {book.rea_number} — Apertura: {book.apertura_number}</p>
              </div>
            </div>

            {entries.length === 0 ? (
              <div className="text-center py-12">
                <ClipboardList className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No hay subcontratas registradas</p>
              </div>
            ) : (
              entries.map((entry: any, i: number) => (
                <div key={entry.id} className="bg-card border border-border rounded-lg p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-display font-bold text-muted-foreground">#{entry.entry_number}</span>
                        <span className="px-2 py-0.5 text-[10px] font-display uppercase tracking-widest rounded bg-primary/10 text-primary">
                          Nivel {entry.nivel_subcontratacion}
                        </span>
                        {entry.is_locked && (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-display uppercase tracking-wider">
                            <Lock className="h-3 w-3" /> Firmado
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold">{entry.empresa_nombre}</p>
                      <p className="text-xs text-muted-foreground">NIF: {entry.empresa_nif}</p>
                      <p className="text-xs mt-1">{entry.objeto_contrato}</p>
                      <div className="flex gap-4 text-[10px] text-muted-foreground mt-2 flex-wrap">
                        <span>Inicio: {new Date(entry.fecha_comienzo).toLocaleDateString("es-ES")}</span>
                        <span>Resp.: {entry.responsable_nombre}</span>
                        {entry.fecha_plan_seguridad && <span>PSS: {new Date(entry.fecha_plan_seguridad).toLocaleDateString("es-ES")}</span>}
                      </div>
                      {entry.signature_hash && (
                        <span className="text-[9px] font-mono text-muted-foreground mt-1 block truncate max-w-xs">
                          Hash: {entry.signature_hash.substring(0, 24)}...
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Diligencia dialog */}
      <Dialog open={showDiligencia} onOpenChange={setShowDiligencia}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-base">Diligencia de Habilitación</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Nº Inscripción REA *</Label>
              <Input value={reaNumber} onChange={e => setReaNumber(e.target.value)} placeholder="Número de inscripción en el REA" />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Nº Registro Comunicación Apertura *</Label>
              <Input value={aperturaNumber} onChange={e => setAperturaNumber(e.target.value)} placeholder="Número de registro de apertura" />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Causa de habilitación</Label>
              <Select value={habCause} onValueChange={setHabCause}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HABILITACION_CAUSES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {(habCause === "continuacion" || habCause === "perdida" || habCause === "destruccion") && (
              <div className="space-y-2">
                <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Nº última anotación libro anterior</Label>
                <Input value={lastAnnotation} onChange={e => setLastAnnotation(e.target.value)} placeholder="Nº de orden" />
              </div>
            )}
            <Button onClick={handleCreateDiligencia} disabled={submittingDiligencia} className="w-full gap-2 font-display text-xs uppercase tracking-wider">
              <FileText className="h-4 w-4" />
              {submittingDiligencia ? "Generando..." : "Generar Diligencia"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Entry dialog */}
      <Dialog open={showNewEntry} onOpenChange={setShowNewEntry}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-base">Nueva Subcontrata</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateEntry} className="space-y-4 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Empresa / Autónomo *</Label>
                <Input value={empresaNombre} onChange={e => setEmpresaNombre(e.target.value)} placeholder="Nombre de la empresa" required />
              </div>
              <div className="space-y-2">
                <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">NIF *</Label>
                <Input value={empresaNif} onChange={e => setEmpresaNif(e.target.value)} placeholder="NIF / CIF" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Nivel de Subcontratación *</Label>
              <Select value={nivelSub} onValueChange={setNivelSub}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={String(n)}>Nivel {n}º</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Objeto del contrato *</Label>
              <Textarea value={objetoContrato} onChange={e => setObjetoContrato(e.target.value)} placeholder="Descripción de los trabajos subcontratados" rows={3} required />
            </div>

            <DatePickerField label="Fecha comienzo de trabajos" value={fechaComienzo} onChange={setFechaComienzo} required />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Responsable dirección trabajos *</Label>
                <Input value={responsableNombre} onChange={e => setResponsableNombre(e.target.value)} placeholder="Nombre completo" required />
              </div>
              <div className="space-y-2">
                <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">DNI Responsable *</Label>
                <Input value={responsableDni} onChange={e => setResponsableDni(e.target.value)} placeholder="DNI" required />
              </div>
            </div>

            <DatePickerField label="Fecha entrega Plan de Seguridad" value={fechaPlanSeguridad} onChange={setFechaPlanSeguridad} />

            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Instrucciones de Seguridad</Label>
              <Textarea value={instrucciones} onChange={e => setInstrucciones(e.target.value)} placeholder="Instrucciones sobre el procedimiento de coordinación..." rows={2} />
            </div>

            {/* Signature */}
            <div className="space-y-2 border-t border-border pt-4">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileSignature className="h-3.5 w-3.5" /> Firma Obligatoria del Contratista
              </Label>
              <Tabs value={signatureMethod} onValueChange={v => { setSignatureMethod(v); localStorage.setItem("tektra_sig_method", v); }}>
                <TabsList className="w-full">
                  <TabsTrigger value="manual" className="flex-1 text-xs">Firma Manual</TabsTrigger>
                  <TabsTrigger value="certificate" className="flex-1 text-xs">Certificado Digital</TabsTrigger>
                </TabsList>
                <TabsContent value="manual" className="mt-3">
                  <SignatureCanvas ref={sigCanvasRef} />
                  <Button type="submit" disabled={submittingEntry} className="w-full mt-3 font-display text-xs uppercase tracking-wider gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    {submittingEntry ? "Registrando..." : "Firmar y Registrar"}
                  </Button>
                </TabsContent>
                <TabsContent value="certificate" className="mt-3">
                  <CertificateSignature
                    disabled={submittingEntry}
                    userRole="CON"
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

      <FiscalDataModal
        open={showFiscalModal}
        onComplete={() => { setShowFiscalModal(false); if (pendingSubmit) { setPendingSubmit(false); handleCreateEntry(); } }}
        onCancel={() => { setShowFiscalModal(false); setPendingSubmit(false); }}
      />
    </AppLayout>
  );
};

// Generate the Diligencia HTML document
function generateDiligenciaHtml(book: any, project: any, members: any[]) {
  const promotor = members.find((m: any) => m.role === "PRO");
  const df = members.find((m: any) => m.role === "DO" || m.role === "DEM");
  const css = members.find((m: any) => m.role === "CSS" || m.secondary_role === "CSS");
  const con = members.find((m: any) => m.role === "CON");

  const getName = (m: any) => m?.profiles?.full_name || m?.invited_email || "—";
  const getNif = (m: any) => m?.profiles?.dni_cif || "—";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Diligencia de Habilitación</title>
<style>
  body { font-family: 'Times New Roman', serif; max-width: 700px; margin: 0 auto; padding: 40px 30px; color: #111; font-size: 13px; line-height: 1.5; }
  h1 { text-align: center; font-size: 18px; margin: 0 0 6px; }
  h2 { text-align: center; font-size: 14px; margin: 20px 0 12px; border-bottom: 1px solid #333; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  td { padding: 4px 8px; border: 1px solid #999; font-size: 12px; vertical-align: middle; }
  .label { background: #f5f5f5; font-weight: bold; width: 40%; }
  .seal-area { border: 2px dashed #999; min-height: 120px; margin: 20px 0; display: flex; align-items: center; justify-content: center; color: #999; font-style: italic; text-align: center; }
  .footer { text-align: center; margin-top: 40px; font-size: 11px; color: #666; }
</style></head><body>
<p style="text-align:center;font-size:11px;color:#666;">COMUNIDAD AUTÓNOMA DE _______________</p>
<h1>LIBRO DE SUBCONTRATACIÓN</h1>
<h2>DATOS IDENTIFICATIVOS DE LA OBRA</h2>
<table>
  <tr><td class="label">Promotor</td><td>${getName(promotor)}</td><td style="width:100px;">NIF</td><td>${getNif(promotor)}</td></tr>
  <tr><td class="label">Contratista</td><td>${getName(con)}</td><td>NIF</td><td>${getNif(con)}</td></tr>
  <tr><td class="label">Dirección Facultativa</td><td>${getName(df)}</td><td>NIF</td><td>${getNif(df)}</td></tr>
  <tr><td class="label">Coordinador de Seg. y Salud</td><td>${getName(css)}</td><td>NIF</td><td>${getNif(css)}</td></tr>
  <tr><td class="label">Domicilio de la obra</td><td>${project?.address || "—"}</td><td>Nº Inscripción REA</td><td>${book.rea_number}</td></tr>
  <tr><td class="label">Nº Registro comunicación apertura</td><td>${book.apertura_number}</td><td>Localidad</td><td>${project?.address || "—"}</td></tr>
  ${book.last_annotation_number ? `<tr><td class="label">Nº última anotación libro anterior</td><td colspan="3">${book.last_annotation_number}</td></tr>` : ""}
  <tr><td class="label">Causa de habilitación</td><td colspan="3">${book.habilitacion_cause === "nueva_obra" ? "Nueva obra" : book.habilitacion_cause === "continuacion" ? "Continuación de libro anterior" : book.habilitacion_cause === "perdida" ? "Pérdida" : "Destrucción"}</td></tr>
</table>
<h2>DILIGENCIA DE HABILITACIÓN</h2>
<p>D. ........................................................., en su condición de autoridad laboral competente, como titular de la ......................................................... de la Comunidad Autónoma de referencia.</p>
<p><strong>CERTIFICO:</strong> que en el día de la fecha he procedido a habilitar, de conformidad con las disposiciones vigentes, este Libro de Subcontratación correspondiente al contratista de la obra de construcción cuyos datos de identificación figuran más arriba, y que consta de 10 hojas numeradas y duplicadas, en la que figura el sello de este organismo.</p>
<div class="seal-area">SELLO AUTORIDAD LABORAL</div>
<p style="text-align:right;">En .................... a ...... de .................... de ..........</p>
<p style="text-align:right;">Fdo.: ..........................................................</p>
<div class="footer">Generado por TEKTRA — ${new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</div>
</body></html>`;
}

export default SubcontractingModule;
