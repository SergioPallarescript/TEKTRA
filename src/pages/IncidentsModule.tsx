import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import AttachmentThumbnails from "@/components/AttachmentThumbnails";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, AlertTriangle, ShieldAlert, CheckCircle2, Mic, MicOff, Camera, Image, Paperclip,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

const severityLabels: Record<string, { label: string; color: string }> = {
  low: { label: "Baja", color: "text-success bg-success/10" },
  medium: { label: "Media", color: "text-warning bg-warning/10" },
  high: { label: "Alta", color: "text-destructive bg-destructive/10" },
  critical: { label: "Crítica", color: "text-destructive bg-destructive/20" },
};

const IncidentsModule = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

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
  const [recording, setRecording] = useState(false);

  const isCSS = profile?.role === "CSS";
  const [hasDualCSS, setHasDualCSS] = useState(false);
  const canWrite = isCSS || hasDualCSS;

  // Check dual role
  useEffect(() => {
    if (!user || !projectId) return;
    supabase
      .from("project_members")
      .select("secondary_role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.secondary_role === "CSS") setHasDualCSS(true);
      });
  }, [user, projectId]);

  const fetchIncidents = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("incidents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (data) setIncidents(data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchIncidents(); }, [fetchIncidents]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !user) return;
    setSubmitting(true);

    // Upload photos if any
    const photoUrls: string[] = [];
    for (const photo of photos) {
      const path = `incidents/${projectId}/${Date.now()}_${photo.name}`;
      const { error } = await supabase.storage.from("plans").upload(path, photo);
      if (!error) photoUrls.push(path);
    }

    const { error } = await supabase.from("incidents").insert({
      project_id: projectId,
      content,
      severity,
      remedial_actions: remedial || null,
      photos: photoUrls,
      created_by: user.id,
    });

    if (error) {
      toast.error("Error al registrar incidencia");
      setSubmitting(false);
      return;
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      project_id: projectId,
      action: "incident_created",
      details: { severity, has_photos: photoUrls.length > 0 },
    });

    toast.success("Incidencia registrada");
    setContent("");
    setSeverity("medium");
    setRemedial("");
    setPhotos([]);
    setCreateOpen(false);
    setSubmitting(false);
    fetchIncidents();
  };

  const toggleRecording = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      toast.error("Tu navegador no soporta reconocimiento de voz");
      return;
    }
    if (recording) { setRecording(false); return; }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "es-ES";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setContent(transcript);
    };
    recognition.onerror = () => { setRecording(false); toast.error("Error en reconocimiento de voz"); };
    recognition.onend = () => setRecording(false);
    recognition.start();
    setRecording(true);
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">
            Libro de Incidencias
          </p>
        </div>

        <div className="flex items-end justify-between mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tighter">Incidencias</h1>
          {canWrite && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="font-display text-xs uppercase tracking-wider gap-2">
                  <Plus className="h-4 w-4" />
                  Nueva Incidencia
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-display">Registrar Incidencia</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                      Gravedad
                    </Label>
                    <Select value={severity} onValueChange={setSeverity}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(severityLabels).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                        Descripción del Riesgo
                      </Label>
                      <Button
                        type="button"
                        variant={recording ? "destructive" : "outline"}
                        size="sm"
                        onClick={toggleRecording}
                        className="gap-1 text-xs"
                      >
                        {recording ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                        {recording ? "Parar" : "Dictar"}
                      </Button>
                    </div>
                    <Textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="Describa la incidencia de seguridad..."
                      rows={5}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                      Acciones Correctoras
                    </Label>
                    <Textarea
                      value={remedial}
                      onChange={(e) => setRemedial(e.target.value)}
                      placeholder="Medidas correctoras propuestas..."
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Camera className="h-3.5 w-3.5" />
                      Fotografías
                    </Label>
                    <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files) setPhotos(prev => [...prev, ...Array.from(e.target.files!)]); if (e.target) e.target.value = ""; }} />
                    <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) setPhotos(prev => [...prev, ...Array.from(e.target.files!)]); if (e.target) e.target.value = ""; }} />
                    <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden" onChange={(e) => { if (e.target.files) setPhotos(prev => [...prev, ...Array.from(e.target.files!)]); if (e.target) e.target.value = ""; }} />
                    <div className="flex gap-2">
                      {isMobile ? (
                        <>
                          <Button type="button" variant="outline" size="sm" className="gap-1 text-xs flex-1" onClick={() => cameraInputRef.current?.click()}>
                            <Camera className="h-3.5 w-3.5" /> Foto
                          </Button>
                          <Button type="button" variant="outline" size="sm" className="gap-1 text-xs flex-1" onClick={() => galleryInputRef.current?.click()}>
                            <Image className="h-3.5 w-3.5" /> Galería
                          </Button>
                          <Button type="button" variant="outline" size="sm" className="gap-1 text-xs flex-1" onClick={() => fileInputRef.current?.click()}>
                            <Paperclip className="h-3.5 w-3.5" /> Archivo
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button type="button" variant="outline" size="sm" className="gap-1 text-xs flex-1" onClick={() => galleryInputRef.current?.click()}>
                            <Camera className="h-3.5 w-3.5" /> Foto
                          </Button>
                          <Button type="button" variant="outline" size="sm" className="gap-1 text-xs flex-1" onClick={() => fileInputRef.current?.click()}>
                            <Paperclip className="h-3.5 w-3.5" /> Archivo
                          </Button>
                        </>
                      )}
                    </div>
                    {photos.length > 0 && (
                      <p className="text-xs text-muted-foreground">{photos.length} archivo(s) seleccionado(s)</p>
                    )}
                  </div>
                  <Button type="submit" disabled={submitting} className="w-full font-display text-xs uppercase tracking-wider">
                    {submitting ? "Registrando..." : "Registrar Incidencia"}
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
        ) : incidents.length === 0 ? (
          <div className="text-center py-20">
            <ShieldAlert className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="font-display text-muted-foreground">No hay incidencias registradas</p>
          </div>
        ) : (
          <div className="space-y-3">
            {incidents.map((inc, i) => {
              const sev = severityLabels[inc.severity] || severityLabels.medium;
              return (
                <div
                  key={inc.id}
                  className={`bg-card border border-border rounded-lg p-5 animate-fade-in ${
                    inc.status === "resolved" ? "opacity-60" : ""
                  }`}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-display font-bold text-muted-foreground">
                          #{inc.incident_number}
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] font-display uppercase tracking-widest rounded ${sev.color}`}>
                          {sev.label}
                        </span>
                        {inc.status === "resolved" && (
                          <span className="flex items-center gap-1 text-xs text-success">
                            <CheckCircle2 className="h-3 w-3" /> Resuelta
                          </span>
                        )}
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{inc.content}</p>
                      {inc.photos && inc.photos.length > 0 && (
                        <AttachmentThumbnails paths={inc.photos} />
                      )}
                      {inc.remedial_actions && (
                        <p className="text-xs text-muted-foreground mt-2 border-l-2 border-border pl-3">
                          <strong>Correctoras:</strong> {inc.remedial_actions}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(inc.created_at).toLocaleDateString("es-ES", {
                          day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default IncidentsModule;
