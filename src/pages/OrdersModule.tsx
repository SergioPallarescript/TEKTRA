import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import AttachmentThumbnails from "@/components/AttachmentThumbnails";
import { Button } from "@/components/ui/button";
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
  ArrowLeft, Plus, BookOpen, AlertTriangle, CheckCircle2, Clock, Mic, MicOff, Camera, Image, Paperclip, X,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

const CHANGE_KEYWORDS = ["modificar", "mover", "cambiar", "sustituir", "demoler", "ampliar", "reducir", "eliminar", "añadir", "reemplazar"];

const OrdersModule = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [orders, setOrders] = useState<any[]>([]);
  const [validations, setValidations] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [confirmValidate, setConfirmValidate] = useState<string | null>(null);

  const isDEM = profile?.role === "DEM";
  const isDO = profile?.role === "DO";
  // Dual role: check if user has secondary_role CSS via project_members
  const [hasDualCSS, setHasDualCSS] = useState(false);
  const canWrite = isDEM || isDO || hasDualCSS;
  const canValidate = profile?.role === "CON" || profile?.role === "PRO";
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

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

  const fetchOrders = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (data) {
      setOrders(data);
      const flagged = data.filter((o: any) => o.requires_validation);
      if (flagged.length > 0) {
        const { data: vals } = await supabase
          .from("order_validations")
          .select("*")
          .in("order_id", flagged.map((o: any) => o.id));
        if (vals) {
          const grouped: Record<string, any[]> = {};
          vals.forEach((v: any) => {
            if (!grouped[v.order_id]) grouped[v.order_id] = [];
            grouped[v.order_id].push(v);
          });
          setValidations(grouped);
        }
      }
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const detectChanges = (text: string) => {
    const lower = text.toLowerCase();
    return CHANGE_KEYWORDS.filter((kw) => lower.includes(kw));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !user) return;
    setSubmitting(true);

    // Upload photos/docs if any
    const photoUrls: string[] = [];
    for (const photo of photos) {
      const path = `orders/${projectId}/${Date.now()}_${photo.name}`;
      const { error } = await supabase.storage.from("plans").upload(path, photo);
      if (!error) photoUrls.push(path);
    }

    const flags = detectChanges(content);
    const requiresValidation = flags.length > 0;
    const { error } = await supabase.from("orders").insert({
      project_id: projectId, content, created_by: user.id,
      requires_validation: requiresValidation, ai_flags: { keywords: flags },
      photos: photoUrls.length > 0 ? photoUrls : [],
    });
    if (error) { toast.error("Error al crear la orden"); setSubmitting(false); return; }
    await supabase.from("audit_logs").insert({
      user_id: user.id, project_id: projectId,
      action: "order_created", details: { requires_validation: requiresValidation, ai_flags: flags, has_photos: photoUrls.length > 0 },
    });
    if (requiresValidation) {
      toast.warning(`⚠️ Orden marcada para validación — palabras clave detectadas: ${flags.join(", ")}`);
    } else {
      toast.success("Orden registrada");
    }
    setContent(""); setPhotos([]); setCreateOpen(false); setSubmitting(false); fetchOrders();
  };

  const handleValidate = async (orderId: string) => {
    if (!user || !profile) return;
    let geoString = "unavailable";
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
      );
      geoString = `${pos.coords.latitude},${pos.coords.longitude}`;
    } catch {}
    const { error } = await supabase.from("order_validations").insert({
      order_id: orderId, user_id: user.id, role: profile.role || "CON", geo_location: geoString,
    });
    if (error) {
      toast.info(error.message.includes("duplicate") ? "Ya has validado esta orden" : "Error al validar");
    } else {
      toast.success("Validación registrada");
      await supabase.from("audit_logs").insert({
        user_id: user.id, project_id: projectId!,
        action: "order_validated", details: { order_id: orderId, role: profile.role },
      });
    }
    setConfirmValidate(null); fetchOrders();
  };

  const toggleRecording = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      toast.error("Tu navegador no soporta reconocimiento de voz"); return;
    }
    if (recording) { setRecording(false); return; }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "es-ES"; recognition.continuous = true; recognition.interimResults = true;
    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      setContent(transcript);
    };
    recognition.onerror = () => { setRecording(false); toast.error("Error en reconocimiento de voz"); };
    recognition.onend = () => setRecording(false);
    recognition.start(); setRecording(true);
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">Libro de Órdenes</p>
        </div>
        <div className="flex items-end justify-between mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tighter">Órdenes</h1>
          {canWrite && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="font-display text-xs uppercase tracking-wider gap-2"><Plus className="h-4 w-4" />Nueva Orden</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle className="font-display">Registrar Orden</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Contenido</Label>
                      <Button type="button" variant={recording ? "destructive" : "outline"} size="sm" onClick={toggleRecording} className="gap-1 text-xs">
                        {recording ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                        {recording ? "Parar" : "Dictar"}
                      </Button>
                    </div>
                    <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Describa la orden de obra..." rows={6} required />
                    {content && detectChanges(content).length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 px-3 py-2 rounded">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Palabras clave detectadas: {detectChanges(content).join(", ")}. Se requerirá validación de CON y PRO.
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Adjuntar fotos / documentos</Label>
                    <div className="flex gap-2">
                      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files) { setPhotos(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value = ""; } }} />
                      <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) { setPhotos(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value = ""; } }} />
                      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden" onChange={(e) => { if (e.target.files) { setPhotos(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value = ""; } }} />
                      {isMobile ? (
                        <>
                          <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={() => cameraInputRef.current?.click()}>
                            <Camera className="h-3.5 w-3.5" /> Foto
                          </Button>
                          <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={() => galleryInputRef.current?.click()}>
                            <Image className="h-3.5 w-3.5" /> Galería
                          </Button>
                          <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={() => fileInputRef.current?.click()}>
                            <Paperclip className="h-3.5 w-3.5" /> Archivo
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={() => galleryInputRef.current?.click()}>
                            <Camera className="h-3.5 w-3.5" /> Foto
                          </Button>
                          <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={() => fileInputRef.current?.click()}>
                            <Paperclip className="h-3.5 w-3.5" /> Archivo
                          </Button>
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
                  <Button type="submit" disabled={submitting} className="w-full font-display text-xs uppercase tracking-wider">
                    {submitting ? "Registrando..." : "Registrar Orden"}
                   </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 bg-card border border-border rounded-lg animate-pulse" />)}</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="font-display text-muted-foreground">No hay órdenes registradas</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order, i) => {
              const orderVals = validations[order.id] || [];
              const userValidated = orderVals.some((v: any) => v.user_id === user?.id);
              return (
                <div key={order.id} className={`bg-card border rounded-lg p-5 animate-fade-in ${order.requires_validation ? "border-warning/40" : "border-border"}`} style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-display font-bold text-muted-foreground">#{order.order_number}</span>
                        {order.requires_validation && (
                          <span className="px-2 py-0.5 text-[10px] font-display uppercase tracking-widest bg-warning/10 text-warning rounded">Requiere validación</span>
                        )}
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{order.content}</p>
                      {order.photos && order.photos.length > 0 && (
                        <AttachmentThumbnails paths={order.photos} />
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(order.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {order.requires_validation && orderVals.length > 0 && (
                        <div className="flex gap-2 mt-2">
                          {orderVals.map((v: any) => (
                            <span key={v.id} className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3 w-3" /> {v.role}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {order.requires_validation && canValidate && !userValidated && (
                      <Button size="sm" variant="outline" onClick={() => setConfirmValidate(order.id)} className="font-display text-xs uppercase tracking-wider gap-1 shrink-0">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Validar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={!!confirmValidate} onOpenChange={() => setConfirmValidate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Confirmar Validación</AlertDialogTitle>
            <AlertDialogDescription>Esta acción quedará registrada legalmente con su firma digital, geolocalización y marca temporal.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmValidate && handleValidate(confirmValidate)}>Validar Orden</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default OrdersModule;
