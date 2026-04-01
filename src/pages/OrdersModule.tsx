import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjectRole } from "@/hooks/useProjectRole";
import AppLayout from "@/components/AppLayout";
import AttachmentThumbnails from "@/components/AttachmentThumbnails";
import StructuredSectionsEditor from "@/components/StructuredSectionsEditor";
import { formatOrderSections } from "@/lib/bookFormatting";
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
import { notifyProjectMembers } from "@/lib/notifications";
import {
  ArrowLeft, Plus, BookOpen, AlertTriangle, Mic, MicOff, Camera, Image, Paperclip, X, Pencil, Trash2, Download,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

const ORDER_FIELDS = [
  { key: "estado", label: "Estado de la Obra", placeholder: "Describa el estado actual de la obra..." },
  { key: "instrucciones", label: "Instrucciones y Órdenes", placeholder: "Instrucciones dadas en esta visita..." },
  { key: "pendientes", label: "Pendientes", placeholder: "Tareas pendientes de resolver..." },
];

const OrdersModule = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { isDEM, isDO, hasDualCSS, isAdmin } = useProjectRole(projectId);
  const navigate = useNavigate();

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [editOrder, setEditOrder] = useState<any | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editPhotos, setEditPhotos] = useState<File[]>([]);
  const [editRemovedPhotos, setEditRemovedPhotos] = useState<string[]>([]);
  const [editRecording, setEditRecording] = useState(false);
  const [editCleaning, setEditCleaning] = useState(false);
  const [editStructuredSections, setEditStructuredSections] = useState<Record<string, string> | null>(null);
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const editCameraRef = useRef<HTMLInputElement>(null);
  const editGalleryRef = useRef<HTMLInputElement>(null);
  const editRecognitionRef = useRef<any>(null);
  const [structuredSections, setStructuredSections] = useState<Record<string, string> | null>(null);
  const [crossAlert, setCrossAlert] = useState<{ show: boolean; incidents: any[] }>({ show: false, incidents: [] });
  const recognitionRef = useRef<any>(null);

  const canWrite = isDEM || isDO || hasDualCSS;
  const canExport = isDEM || isDO;
  const [exporting, setExporting] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

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

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !user) return;

    // Build final content from structured sections if available
    const finalContent = structuredSections
      ? formatOrderSections({ estado: structuredSections.estado || "", instrucciones: structuredSections.instrucciones || "", pendientes: structuredSections.pendientes || "" })
      : content;

    // Check cross-alerts before submitting
    await checkCrossAlerts(finalContent);

    setSubmitting(true);
    const photoUrls: string[] = [];
    for (const photo of photos) {
      const path = `orders/${projectId}/${Date.now()}_${photo.name}`;
      const { error } = await supabase.storage.from("plans").upload(path, photo);
      if (!error) photoUrls.push(path);
    }
    const { error } = await supabase.from("orders").insert({
      project_id: projectId, content: finalContent, created_by: user.id,
      requires_validation: false, ai_flags: {},
      photos: photoUrls.length > 0 ? photoUrls : [],
    });
    if (error) { toast.error("Error al crear la orden"); setSubmitting(false); return; }
    await supabase.from("audit_logs").insert({
      user_id: user.id, project_id: projectId,
      action: "order_created", details: { has_photos: photoUrls.length > 0 },
    });
    toast.success("Orden registrada");
    await notifyProjectMembers({
      projectId,
      actorId: user.id,
      title: "Nueva orden registrada",
      message: `Se ha registrado una nueva orden en el Libro de Órdenes`,
      type: "info",
    });
    setContent(""); setPhotos([]); setStructuredSections(null); setCreateOpen(false); setSubmitting(false); fetchOrders();
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editOrder || !user) return;
    setEditSubmitting(true);

    const finalContent = editStructuredSections
      ? formatOrderSections({ estado: editStructuredSections.estado || "", instrucciones: editStructuredSections.instrucciones || "", pendientes: editStructuredSections.pendientes || "" })
      : editContent;

    const newPhotoUrls: string[] = [];
    for (const photo of editPhotos) {
      const path = `orders/${projectId}/${Date.now()}_${photo.name}`;
      const { error } = await supabase.storage.from("plans").upload(path, photo);
      if (!error) newPhotoUrls.push(path);
    }
    if (editRemovedPhotos.length > 0) {
      await supabase.storage.from("plans").remove(editRemovedPhotos);
    }
    const existingPhotos = (editOrder.photos || []).filter((p: string) => !editRemovedPhotos.includes(p));
    const finalPhotos = [...existingPhotos, ...newPhotoUrls];

    const { error } = await supabase.from("orders").update({
      content: finalContent,
      requires_validation: false,
      ai_flags: {},
      photos: finalPhotos,
    }).eq("id", editOrder.id);
    if (error) { toast.error("Error al editar la orden"); setEditSubmitting(false); return; }
    await supabase.from("audit_logs").insert({
      user_id: user.id, project_id: projectId!,
      action: "order_edited", details: { order_id: editOrder.id },
    });
    await notifyProjectMembers({
      projectId: projectId!,
      actorId: user.id,
      title: "Orden editada",
      message: `La orden #${editOrder.order_number} ha sido modificada`,
      type: "info",
    });
    toast.success("Orden actualizada");
    setEditOrder(null); setEditContent(""); setEditPhotos([]); setEditRemovedPhotos([]); setEditStructuredSections(null); setEditSubmitting(false); fetchOrders();
  };

  const cleanEditDictation = async (rawText: string) => {
    setEditCleaning(true);
    try {
      const { data, error } = await supabase.functions.invoke("clean-dictation", {
        body: { rawText, context: "orders", structured: true },
      });
      if (error) throw error;
      if (data.structured && data.sections) {
        setEditStructuredSections(data.sections);
        const combined = formatOrderSections(data.sections);
        setEditContent(combined);
        toast.success("Dictado estructurado por IA — edita las secciones antes de guardar");
      } else {
        setEditContent(data.cleanedText || rawText);
        toast.success("Dictado procesado por IA — revisa antes de guardar");
      }
    } catch {
      toast.error("Error al procesar el dictado");
    } finally {
      setEditCleaning(false);
    }
  };

  const toggleEditRecording = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      toast.error("Tu navegador no soporta reconocimiento de voz"); return;
    }
    if (editRecording) {
      editRecognitionRef.current?.stop();
      editRecognitionRef.current = null;
      setEditRecording(false);
      if (editContent.trim()) cleanEditDictation(editContent);
      return;
    }
    const startRecognition = () => {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      editRecognitionRef.current = recognition;
      recognition.lang = "es-ES"; recognition.continuous = true; recognition.interimResults = true;
      recognition.onresult = (event: any) => {
        let transcript = "";
        for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
        setEditContent(transcript);
      };
      recognition.onerror = (e: any) => {
        if (e.error === "no-speech" || e.error === "aborted") return;
        setEditRecording(false); editRecognitionRef.current = null;
        toast.error("Error en reconocimiento de voz");
      };
      recognition.onend = () => {
        if (editRecognitionRef.current) {
          try { recognition.start(); } catch { /* already started */ }
        }
      };
      recognition.start();
    };
    startRecognition();
    setEditRecording(true);
  };

  const handleDelete = async () => {
    if (!deleteOrderId || !user) return;
    const { error } = await supabase.from("orders").delete().eq("id", deleteOrderId);
    if (error) { toast.error("Error al eliminar la orden"); return; }
    await supabase.from("audit_logs").insert({
      user_id: user.id, project_id: projectId!,
      action: "order_deleted", details: { order_id: deleteOrderId },
    });
    await notifyProjectMembers({
      projectId: projectId!,
      actorId: user.id,
      title: "Orden eliminada",
      message: `Se ha eliminado una orden del Libro de Órdenes`,
      type: "warning",
    });
    toast.success("Orden eliminada");
    setDeleteOrderId(null); fetchOrders();
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
        toast.success("Dictado estructurado por IA — edita las secciones antes de guardar");
      } else {
        setContent(data.cleanedText || rawText);
        toast.success("Dictado procesado por IA — revisa el texto antes de guardar");
      }
    } catch {
      toast.error("Error al procesar el dictado, se mantiene el texto original");
    } finally {
      setCleaning(false);
    }
  };

  const checkCrossAlerts = async (text: string) => {
    if (!projectId) return;
    const { data: openIncidents } = await supabase
      .from("incidents")
      .select("*")
      .eq("project_id", projectId)
      .eq("status", "open");
    if (!openIncidents || openIncidents.length === 0) return;
    const lower = text.toLowerCase();
    const matching = openIncidents.filter((inc: any) => {
      const words = inc.content.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4);
      return words.some((word: string) => lower.includes(word));
    });
    if (matching.length > 0) {
      setCrossAlert({ show: true, incidents: matching });
    }
  };

  const toggleRecording = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      toast.error("Tu navegador no soporta reconocimiento de voz"); return;
    }
    if (recording) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setRecording(false);
      // Send to AI after manual stop
      if (content.trim()) cleanDictation(content);
      return;
    }
    const startRecognition = () => {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = "es-ES"; recognition.continuous = true; recognition.interimResults = true;
      recognition.onresult = (event: any) => {
        let transcript = "";
        for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
        setContent(transcript);
      };
      recognition.onerror = (e: any) => {
        if (e.error === "no-speech" || e.error === "aborted") return;
        setRecording(false); recognitionRef.current = null;
        toast.error("Error en reconocimiento de voz");
      };
      recognition.onend = () => {
        // Auto-restart if still in recording mode (user hasn't pressed stop)
        if (recognitionRef.current) {
          try { recognition.start(); } catch { /* already started */ }
        }
      };
      recognition.start();
    };
    startRecognition();
    setRecording(true);
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
        <div className="flex items-end justify-between mb-8 flex-wrap gap-2">
          <h1 className="font-display text-3xl font-bold tracking-tighter">Órdenes</h1>
          <div className="flex gap-2 flex-wrap">
            {canExport && orders.length > 0 && (
              <Button
                variant="outline"
                disabled={exporting}
                onClick={async () => {
                  setExporting(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("export-orders", {
                      body: { projectId },
                    });
                    if (error) throw error;
                    const blob = new Blob([data.html], { type: "text/html" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = data.fileName || "Libro_Ordenes.html";
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success("Libro de Órdenes exportado");
                  } catch {
                    toast.error("Error al exportar");
                  } finally {
                    setExporting(false);
                  }
                }}
                className="font-display text-xs uppercase tracking-wider gap-2"
              >
                <Download className="h-4 w-4" />
                {exporting ? "Exportando..." : "Exportar Libro (.docx)"}
              </Button>
            )}
            {canWrite && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="font-display text-xs uppercase tracking-wider gap-2"><Plus className="h-4 w-4" />Nueva Orden</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle className="font-display">Registrar Orden</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Contenido</Label>
                      <Button type="button" variant={recording ? "destructive" : "outline"} size="sm" onClick={toggleRecording} disabled={cleaning} className="gap-1 text-xs">
                        {cleaning ? <><span className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> Procesando...</> : recording ? <><MicOff className="h-3 w-3" /> Parar</> : <><Mic className="h-3 w-3" /> Dictar</>}
                      </Button>
                    </div>
                    {structuredSections ? (
                      <StructuredSectionsEditor
                        fields={ORDER_FIELDS}
                        title="Vista previa editable — revisa antes de guardar"
                        values={structuredSections}
                        onChange={(key, value) => setStructuredSections(prev => prev ? { ...prev, [key]: value } : prev)}
                      />
                    ) : (
                      <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Describa la orden de obra o use el dictado por voz..." rows={6} required={!structuredSections} />
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
              const isOwner = order.created_by === user?.id;
              return (
                <div key={order.id} className="bg-card border border-border rounded-lg p-5 animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-display font-bold text-muted-foreground">#{order.order_number}</span>
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
                      {order.photos && order.photos.length > 0 && (
                        <AttachmentThumbnails paths={order.photos} />
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(order.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {isOwner && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => { setEditOrder(order); setEditContent(order.content); setEditPhotos([]); setEditRemovedPhotos([]); setEditStructuredSections(null); }} className="gap-1 text-xs text-muted-foreground">
                            <Pencil className="h-3.5 w-3.5" /> Editar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteOrderId(order.id)} className="gap-1 text-xs text-destructive">
                            <Trash2 className="h-3.5 w-3.5" /> Eliminar
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

      {/* Edit dialog — full flow with dictation, editable structured preview, and photo replacement */}
      <Dialog open={!!editOrder} onOpenChange={(open) => { if (!open) { setEditOrder(null); setEditPhotos([]); setEditStructuredSections(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">Editar Orden</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Contenido</Label>
                <Button type="button" variant={editRecording ? "destructive" : "outline"} size="sm" onClick={toggleEditRecording} disabled={editCleaning} className="gap-1 text-xs">
                  {editCleaning ? <><span className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> Procesando...</> : editRecording ? <><MicOff className="h-3 w-3" /> Parar</> : <><Mic className="h-3 w-3" /> Dictar</>}
                </Button>
              </div>
              {editStructuredSections ? (
                <StructuredSectionsEditor
                  fields={ORDER_FIELDS}
                  title="Vista previa editable — revisa antes de guardar"
                  values={editStructuredSections}
                  onChange={(key, value) => setEditStructuredSections(prev => prev ? { ...prev, [key]: value } : prev)}
                />
              ) : (
                <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={6} required={!editStructuredSections} />
              )}
            </div>
            {/* Current photos with remove option */}
            {editOrder?.photos && editOrder.photos.length > 0 && (
              <div className="space-y-2">
                <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Fotos actuales</Label>
                <div className="flex flex-wrap gap-2">
                  {(editOrder.photos as string[]).filter((p: string) => !editRemovedPhotos.includes(p)).map((p: string, i: number) => (
                    <span key={i} className="flex items-center gap-1 px-2 py-1 text-xs bg-muted rounded">
                      Foto {i + 1}
                      <button type="button" onClick={() => setEditRemovedPhotos(prev => [...prev, p])} className="text-destructive hover:text-destructive/80"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {/* Add new photos */}
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Añadir fotos / documentos</Label>
              <div className="flex gap-2">
                <input ref={editCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files) setEditPhotos(prev => [...prev, ...Array.from(e.target.files!)]); if (e.target) e.target.value = ""; }} />
                <input ref={editGalleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) setEditPhotos(prev => [...prev, ...Array.from(e.target.files!)]); if (e.target) e.target.value = ""; }} />
                {isMobile ? (
                  <>
                    <Button type="button" variant="outline" size="sm" className="gap-1 text-xs flex-1" onClick={() => editCameraRef.current?.click()}><Camera className="h-3.5 w-3.5" /> Foto</Button>
                    <Button type="button" variant="outline" size="sm" className="gap-1 text-xs flex-1" onClick={() => editGalleryRef.current?.click()}><Image className="h-3.5 w-3.5" /> Galería</Button>
                  </>
                ) : (
                  <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={() => editGalleryRef.current?.click()}><Camera className="h-3.5 w-3.5" /> Foto</Button>
                )}
              </div>
              {editPhotos.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {editPhotos.map((f, i) => (
                    <span key={i} className="flex items-center gap-1 px-2 py-1 text-xs bg-muted rounded">
                      {f.name.length > 20 ? f.name.slice(0, 17) + "..." : f.name}
                      <button type="button" onClick={() => setEditPhotos(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <Button type="submit" disabled={editSubmitting} className="w-full font-display text-xs uppercase tracking-wider">
              {editSubmitting ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteOrderId} onOpenChange={() => setDeleteOrderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Eliminar Orden</AlertDialogTitle>
            <AlertDialogDescription>¿Estás seguro? Esta acción no se puede deshacer. La eliminación quedará registrada en el historial.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cross-alert: incidents related to order content */}
      <AlertDialog open={crossAlert.show} onOpenChange={(open) => { if (!open) setCrossAlert({ show: false, incidents: [] }); }}>
        <AlertDialogContent className="border-destructive">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Alerta de Coherencia Cruzada
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Esta orden hace referencia a elementos que tienen <strong>incidencias de seguridad abiertas</strong> en el Libro de Incidencias:</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {crossAlert.incidents.map((inc: any) => (
                    <div key={inc.id} className="p-2 bg-destructive/10 rounded text-xs border border-destructive/20">
                      <span className="font-bold">#{inc.incident_number}</span> — {inc.content.substring(0, 120)}...
                    </div>
                  ))}
                </div>
                <p className="text-xs font-medium">¿Deseas continuar con el registro de la orden?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setCrossAlert({ show: false, incidents: [] }); setSubmitting(false); }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => setCrossAlert({ show: false, incidents: [] })} className="bg-destructive text-destructive-foreground">Continuar de todos modos</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default OrdersModule;
