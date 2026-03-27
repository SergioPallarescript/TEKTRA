import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowLeft, Upload, FileText, Trash2, Ruler, Square, Move, ZoomIn, ZoomOut, RotateCcw, Loader2,
} from "lucide-react";

const DWGViewer = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);

  const [files, setFiles] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  // Measurement state (manual overlay)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<"move" | "line" | "area">("move");
  const [measurements, setMeasurements] = useState<{ type: string; points: { x: number; y: number }[]; value?: number }[]>([]);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [scaleInput, setScaleInput] = useState("100");
  const scale = parseFloat(scaleInput) || 100;

  const canUpload = profile?.role === "DO" || profile?.role === "DEO";

  const fetchFiles = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("dwg_files")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    setFiles(data || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const handleUpload = async (file: File) => {
    if (!projectId || !user || !canUpload) return;
    if (!file.name.match(/\.dwg$/i)) {
      toast.error("Solo se permiten archivos .DWG");
      return;
    }

    setUploading(true);
    const path = `dwg/${projectId}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("plans").upload(path, file);
    if (error) { toast.error("Error al subir archivo"); setUploading(false); return; }

    await supabase.from("dwg_files").insert({
      project_id: projectId,
      uploaded_by: user.id,
      file_name: file.name,
      file_url: path,
      file_size: file.size,
    });

    await supabase.from("audit_logs").insert({
      user_id: user.id, project_id: projectId,
      action: "dwg_file_uploaded",
      details: { file_name: file.name },
    });

    toast.success("Archivo DWG subido correctamente");
    setUploading(false);
    fetchFiles();
  };

  const handleDelete = async (dwg: any) => {
    if (dwg.uploaded_by !== user?.id) return;
    await supabase.storage.from("plans").remove([dwg.file_url]);
    await supabase.from("dwg_files").delete().eq("id", dwg.id);
    toast.success("Archivo eliminado");
    if (selectedFile?.id === dwg.id) setSelectedFile(null);
    fetchFiles();
  };

  // Load DWG in viewer
  const loadDwgInViewer = useCallback(async (dwgFile: any) => {
    setViewerLoading(true);
    setViewerError(null);
    
    try {
      // Download the file as blob
      const { data: blob } = await supabase.storage.from("plans").download(dwgFile.file_url);
      if (!blob) throw new Error("No se pudo descargar el archivo");

      const objectUrl = URL.createObjectURL(blob);

      // Dynamically import @x-viewer/core
      const { Viewer2d } = await import("@x-viewer/core");

      // Destroy previous viewer
      if (viewerRef.current) {
        try { viewerRef.current.dispose?.(); } catch {}
        viewerRef.current = null;
      }

      // Clear container
      if (viewerContainerRef.current) {
        viewerContainerRef.current.innerHTML = '';
        // Create a div for the viewer
        const viewerDiv = document.createElement("div");
        viewerDiv.id = "dwg-viewer-canvas";
        viewerDiv.style.width = "100%";
        viewerDiv.style.height = "100%";
        viewerContainerRef.current.appendChild(viewerDiv);
      }

      const viewer = new Viewer2d({
        containerId: "dwg-viewer-canvas",
        enableSpinner: true,
        enableLayoutBar: true,
      });

      await viewer.loadModel(
        {
          modelId: dwgFile.id,
          name: dwgFile.file_name,
          src: objectUrl,
        },
        (event: any) => {
          const pct = event.total > 0 ? Math.round((event.loaded * 100) / event.total) : 0;
          console.log(`DWG loading: ${pct}%`);
        }
      );

      viewerRef.current = viewer;
      setViewerLoading(false);
      toast.success("Archivo DWG cargado correctamente");
    } catch (err: any) {
      console.error("DWG viewer error:", err);
      setViewerError(err.message || "Error al cargar el visor DWG");
      setViewerLoading(false);
    }
  }, []);

  // Cleanup viewer on unmount
  useEffect(() => {
    return () => {
      if (viewerRef.current) {
        try { viewerRef.current.dispose?.(); } catch {}
      }
    };
  }, []);

  // Measurement overlay canvas
  const drawMeasurements = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    measurements.forEach((m) => {
      ctx.beginPath();
      ctx.strokeStyle = m.type === "line" ? "hsl(150, 45%, 40%)" : "hsl(38, 92%, 50%)";
      ctx.lineWidth = 2;

      if (m.type === "line" && m.points.length === 2) {
        ctx.moveTo(m.points[0].x, m.points[0].y);
        ctx.lineTo(m.points[1].x, m.points[1].y);
        ctx.stroke();
        const mid = { x: (m.points[0].x + m.points[1].x) / 2, y: (m.points[0].y + m.points[1].y) / 2 };
        ctx.fillStyle = "hsl(150, 45%, 40%)";
        ctx.font = 'bold 14px "Space Grotesk", sans-serif';
        ctx.fillText(`${(m.value! / scale).toFixed(2)} m`, mid.x + 8, mid.y - 8);
      } else if (m.type === "area" && m.points.length >= 3) {
        ctx.moveTo(m.points[0].x, m.points[0].y);
        m.points.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fillStyle = "hsla(38, 92%, 50%, 0.1)";
        ctx.fill();
        ctx.stroke();
        const cx = m.points.reduce((s, p) => s + p.x, 0) / m.points.length;
        const cy = m.points.reduce((s, p) => s + p.y, 0) / m.points.length;
        ctx.fillStyle = "hsl(38, 92%, 50%)";
        ctx.font = 'bold 14px "Space Grotesk", sans-serif';
        ctx.fillText(`${(m.value! / (scale * scale)).toFixed(2)} m²`, cx, cy);
      }
    });

    // Current points
    if (currentPoints.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = tool === "line" ? "hsl(150, 45%, 40%)" : "hsl(38, 92%, 50%)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
      currentPoints.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
      ctx.setLineDash([]);
      currentPoints.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = tool === "line" ? "hsl(150, 45%, 40%)" : "hsl(38, 92%, 50%)";
        ctx.fill();
      });
    }
  }, [measurements, currentPoints, tool, scale]);

  useEffect(() => { drawMeasurements(); }, [drawMeasurements]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (tool === "move") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (tool === "line") {
      const newPts = [...currentPoints, point];
      if (newPts.length === 2) {
        const dx = newPts[1].x - newPts[0].x, dy = newPts[1].y - newPts[0].y;
        setMeasurements((p) => [...p, { type: "line", points: newPts, value: Math.sqrt(dx * dx + dy * dy) }]);
        setCurrentPoints([]);
      } else setCurrentPoints(newPts);
    } else if (tool === "area") {
      setCurrentPoints((p) => [...p, point]);
    }
  };

  const handleAreaComplete = () => {
    if (tool === "area" && currentPoints.length >= 3) {
      let area = 0;
      for (let i = 0; i < currentPoints.length; i++) {
        const j = (i + 1) % currentPoints.length;
        area += currentPoints[i].x * currentPoints[j].y - currentPoints[j].x * currentPoints[i].y;
      }
      setMeasurements((p) => [...p, { type: "area", points: [...currentPoints], value: Math.abs(area) / 2 }]);
      setCurrentPoints([]);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-full mx-auto px-4 py-4">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">
            Visor DWG — Solo archivos .dwg
          </p>
        </div>

        {!selectedFile ? (
          <>
            <div className="flex items-end justify-between mb-6">
              <div>
                <h1 className="font-display text-3xl font-bold tracking-tighter">Archivos DWG</h1>
                <p className="text-sm text-muted-foreground mt-1">Solo DO y DEO pueden subir archivos. Formato exclusivo: .dwg</p>
              </div>
              {canUpload && (
                <label className="cursor-pointer">
                  <input type="file" className="hidden" accept=".dwg" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                  <Button asChild variant="outline" className="font-display text-xs uppercase tracking-wider gap-2" disabled={uploading}>
                    <span><Upload className="h-4 w-4" />{uploading ? "Subiendo..." : "Subir DWG"}</span>
                  </Button>
                </label>
              )}
            </div>

            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-card border border-border rounded-lg animate-pulse" />)}</div>
            ) : files.length === 0 ? (
              <div className="text-center py-20">
                <Ruler className="h-16 w-16 text-muted-foreground/20 mx-auto mb-4" />
                <p className="font-display text-muted-foreground">No hay archivos DWG.</p>
                {canUpload && <p className="text-xs text-muted-foreground mt-2">Sube archivos .dwg para visualizarlos con el visor CAD.</p>}
              </div>
            ) : (
              <div className="space-y-2">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center justify-between p-4 bg-card border border-border rounded-lg hover:border-foreground/10 transition-all">
                    <button onClick={() => { setSelectedFile(f); setMeasurements([]); setCurrentPoints([]); }} className="flex items-center gap-3 text-left flex-1">
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{f.file_name}</p>
                        <p className="text-[10px] text-muted-foreground">{f.file_size ? `${(f.file_size / 1024).toFixed(0)} KB` : ""} · {new Date(f.created_at).toLocaleDateString("es-ES")}</p>
                      </div>
                    </button>
                    {f.uploaded_by === user?.id && (
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(f)} className="text-destructive/60 hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <button onClick={() => { setSelectedFile(null); if (viewerRef.current) { try { viewerRef.current.dispose?.(); } catch {} viewerRef.current = null; } }} className="text-xs text-muted-foreground hover:text-foreground font-display uppercase tracking-wider mb-1 inline-block">
                  ← Volver a archivos
                </button>
                <h1 className="font-display text-xl font-bold tracking-tighter">{selectedFile.file_name}</h1>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-[10px] font-display uppercase tracking-wider text-muted-foreground">Escala (px/m):</Label>
                <Input type="number" value={scaleInput} onChange={(e) => setScaleInput(e.target.value)} className="w-20 h-7 text-xs" />
              </div>
            </div>

            {/* Measurement Toolbar */}
            <div className="flex items-center gap-1 mb-3 bg-card border border-border rounded-lg p-1.5 flex-wrap">
              <Button variant={tool === "move" ? "default" : "ghost"} size="sm" onClick={() => setTool("move")} className="gap-1 text-xs"><Move className="h-3.5 w-3.5" /> Mover</Button>
              <Button variant={tool === "line" ? "default" : "ghost"} size="sm" onClick={() => setTool("line")} className="gap-1 text-xs"><Ruler className="h-3.5 w-3.5" /> Medir</Button>
              <Button variant={tool === "area" ? "default" : "ghost"} size="sm" onClick={() => { setTool("area"); setCurrentPoints([]); }} className="gap-1 text-xs"><Square className="h-3.5 w-3.5" /> Área</Button>
              <div className="w-px h-6 bg-border mx-1" />
              <Button variant="ghost" size="sm" onClick={() => { setMeasurements([]); setCurrentPoints([]); }} className="gap-1 text-xs"><RotateCcw className="h-3.5 w-3.5" /> Limpiar</Button>
              {tool === "area" && currentPoints.length >= 3 && (
                <Button size="sm" onClick={handleAreaComplete} className="gap-1 text-xs ml-2">Cerrar Área</Button>
              )}
              <div className="w-px h-6 bg-border mx-1" />
              <Button variant="outline" size="sm" onClick={() => loadDwgInViewer(selectedFile)} disabled={viewerLoading} className="gap-1 text-xs">
                {viewerLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                {viewerLoading ? "Cargando..." : "Renderizar DWG"}
              </Button>
            </div>

            {/* Viewer + Measurement overlay */}
            <div className="relative bg-card border border-border rounded-lg overflow-hidden" style={{ height: "calc(100vh - 260px)" }}>
              {/* DWG Viewer container */}
              <div ref={viewerContainerRef} className="absolute inset-0" style={{ zIndex: 1 }}>
                {!viewerLoading && !viewerRef.current && !viewerError && (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8">
                    <FileText className="h-16 w-16 text-muted-foreground/20 mb-4" />
                    <p className="font-display text-muted-foreground mb-2">Pulsa "Renderizar DWG" para cargar el archivo</p>
                    <p className="text-xs text-muted-foreground/60">El visor CAD procesará el archivo .dwg directamente en el navegador</p>
                  </div>
                )}
                {viewerLoading && (
                  <div className="flex flex-col items-center justify-center h-full">
                    <Loader2 className="h-10 w-10 text-muted-foreground animate-spin mb-3" />
                    <p className="font-display text-sm text-muted-foreground">Procesando archivo DWG...</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Esto puede tardar unos segundos</p>
                  </div>
                )}
                {viewerError && (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8">
                    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 max-w-md">
                      <p className="font-display text-sm text-destructive mb-2">Error al cargar el visor DWG</p>
                      <p className="text-xs text-muted-foreground mb-4">{viewerError}</p>
                      <p className="text-xs text-muted-foreground/60">
                        Si el problema persiste, puedes convertir el archivo .dwg a .pdf manteniendo la escala correcta con herramientas como AutoCAD o DWG TrueView.
                      </p>
                      <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={() => loadDwgInViewer(selectedFile)}>
                        Reintentar
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Measurement overlay canvas */}
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full"
                style={{ zIndex: tool !== "move" ? 10 : 0, cursor: tool === "move" ? "default" : "crosshair", pointerEvents: tool === "move" ? "none" : "auto" }}
                onClick={handleCanvasClick}
              />
            </div>

            {/* Measurements panel */}
            {measurements.length > 0 && (
              <div className="mt-3 bg-card border border-border rounded-lg p-4">
                <h3 className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Mediciones ({measurements.length})</h3>
                <div className="space-y-1">
                  {measurements.map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{m.type === "line" ? "📏 Distancia" : "📐 Área"} #{i + 1}</span>
                      <span className="font-display font-bold">
                        {m.type === "line" ? `${(m.value! / scale).toFixed(2)} m` : `${(m.value! / (scale * scale)).toFixed(2)} m²`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default DWGViewer;
