import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft, ZoomIn, ZoomOut, Ruler, Square, Move, RotateCcw, Download, FileText,
} from "lucide-react";

const DWGViewer = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [selectedVersion, setSelectedVersion] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tool, setTool] = useState<"move" | "line" | "area">("move");
  const [zoom, setZoom] = useState(1);
  const [measurements, setMeasurements] = useState<{ type: string; points: { x: number; y: number }[]; value?: number }[]>([]);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const fetchPlans = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("plans")
      .select("*, plan_versions(*)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (data) setPlans(data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const loadPlanFile = async (version: any) => {
    setSelectedVersion(version);
    const { data, error } = await supabase.storage.from("plans").download(version.file_url);
    if (error || !data) { toast.error("Error al cargar el archivo"); return; }

    const url = URL.createObjectURL(data);
    setPdfUrl(url);
    setImageLoaded(false);
    setMeasurements([]);
    setCurrentPoints([]);
    setZoom(1);
    setOffset({ x: 0, y: 0 });

    // For image files, load directly
    if (version.file_name.match(/\.(png|jpg|jpeg|gif|bmp|svg)$/i)) {
      const img = new Image();
      img.onload = () => { imgRef.current = img; setImageLoaded(true); drawCanvas(); };
      img.src = url;
    }
  };

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const container = containerRef.current;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    // Draw image if loaded
    if (imgRef.current && imageLoaded) {
      ctx.drawImage(imgRef.current, 0, 0);
    }

    // Draw completed measurements
    measurements.forEach((m) => {
      ctx.beginPath();
      ctx.strokeStyle = m.type === "line" ? "hsl(150, 45%, 40%)" : "hsl(38, 92%, 50%)";
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([]);

      if (m.type === "line" && m.points.length === 2) {
        ctx.moveTo(m.points[0].x, m.points[0].y);
        ctx.lineTo(m.points[1].x, m.points[1].y);
        ctx.stroke();

        // Label
        const mid = { x: (m.points[0].x + m.points[1].x) / 2, y: (m.points[0].y + m.points[1].y) / 2 };
        ctx.fillStyle = "hsl(150, 45%, 40%)";
        ctx.font = `bold ${14 / zoom}px "Space Grotesk", sans-serif`;
        ctx.fillText(`${m.value?.toFixed(1)} px`, mid.x + 5 / zoom, mid.y - 5 / zoom);
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
        ctx.font = `bold ${14 / zoom}px "Space Grotesk", sans-serif`;
        ctx.fillText(`${m.value?.toFixed(0)} px²`, cx, cy);
      }
    });

    // Draw current points
    if (currentPoints.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = tool === "line" ? "hsl(150, 45%, 40%)" : "hsl(38, 92%, 50%)";
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([5 / zoom, 5 / zoom]);
      ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
      currentPoints.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();

      currentPoints.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = tool === "line" ? "hsl(150, 45%, 40%)" : "hsl(38, 92%, 50%)";
        ctx.fill();
      });
    }

    ctx.restore();
  }, [zoom, offset, measurements, currentPoints, imageLoaded, tool]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  const getCanvasPoint = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - offset.x) / zoom,
      y: (e.clientY - rect.top - offset.y) / zoom,
    };
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (tool === "move") return;
    const point = getCanvasPoint(e);

    if (tool === "line") {
      const newPoints = [...currentPoints, point];
      if (newPoints.length === 2) {
        const dx = newPoints[1].x - newPoints[0].x;
        const dy = newPoints[1].y - newPoints[0].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        setMeasurements((prev) => [...prev, { type: "line", points: newPoints, value: dist }]);
        setCurrentPoints([]);
      } else {
        setCurrentPoints(newPoints);
      }
    } else if (tool === "area") {
      setCurrentPoints((prev) => [...prev, point]);
    }
  };

  const handleAreaComplete = () => {
    if (tool === "area" && currentPoints.length >= 3) {
      // Shoelace formula
      let area = 0;
      for (let i = 0; i < currentPoints.length; i++) {
        const j = (i + 1) % currentPoints.length;
        area += currentPoints[i].x * currentPoints[j].y;
        area -= currentPoints[j].x * currentPoints[i].y;
      }
      area = Math.abs(area) / 2;
      setMeasurements((prev) => [...prev, { type: "area", points: [...currentPoints], value: area }]);
      setCurrentPoints([]);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool === "move") {
      setDragging(true);
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging && tool === "move") {
      setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => { setDragging(false); };

  return (
    <AppLayout>
      <div className="max-w-full mx-auto px-4 py-4">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">
            Visor de Planos
          </p>
        </div>

        {!selectedPlan ? (
          <>
            <h1 className="font-display text-3xl font-bold tracking-tighter mb-6">Seleccionar Plano</h1>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-card border border-border rounded-lg animate-pulse" />
                ))}
              </div>
            ) : plans.length === 0 ? (
              <div className="text-center py-20">
                <FileText className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                <p className="font-display text-muted-foreground">No hay planos. Sube planos desde el módulo de Planos Últimos.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => {
                      setSelectedPlan(plan);
                      if (plan.plan_versions?.length > 0) {
                        const latest = plan.plan_versions.sort((a: any, b: any) => b.version_number - a.version_number)[0];
                        loadPlanFile(latest);
                      }
                    }}
                    className="w-full text-left bg-card border border-border rounded-lg p-4 hover:border-foreground/20 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-display text-sm font-semibold">{plan.name}</h3>
                        <p className="text-xs text-muted-foreground">{plan.category} · v{plan.current_version}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{plan.plan_versions?.length || 0} versiones</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <button
                  onClick={() => { setSelectedPlan(null); setSelectedVersion(null); setPdfUrl(null); }}
                  className="text-xs text-muted-foreground hover:text-foreground font-display uppercase tracking-wider mb-1 inline-block"
                >
                  ← Volver a planos
                </button>
                <h1 className="font-display text-xl font-bold tracking-tighter">{selectedPlan.name}</h1>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-1 mb-3 bg-card border border-border rounded-lg p-1.5 flex-wrap">
              <Button variant={tool === "move" ? "default" : "ghost"} size="sm" onClick={() => setTool("move")} className="gap-1 text-xs">
                <Move className="h-3.5 w-3.5" /> Mover
              </Button>
              <Button variant={tool === "line" ? "default" : "ghost"} size="sm" onClick={() => setTool("line")} className="gap-1 text-xs">
                <Ruler className="h-3.5 w-3.5" /> Medir
              </Button>
              <Button variant={tool === "area" ? "default" : "ghost"} size="sm" onClick={() => { setTool("area"); setCurrentPoints([]); }} className="gap-1 text-xs">
                <Square className="h-3.5 w-3.5" /> Área
              </Button>
              <div className="w-px h-6 bg-border mx-1" />
              <Button variant="ghost" size="sm" onClick={() => setZoom((z) => Math.min(z * 1.3, 5))} className="gap-1 text-xs">
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setZoom((z) => Math.max(z / 1.3, 0.2))} className="gap-1 text-xs">
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground font-display px-2">{Math.round(zoom * 100)}%</span>
              <div className="w-px h-6 bg-border mx-1" />
              <Button variant="ghost" size="sm" onClick={() => { setMeasurements([]); setCurrentPoints([]); }} className="gap-1 text-xs">
                <RotateCcw className="h-3.5 w-3.5" /> Limpiar
              </Button>
              {tool === "area" && currentPoints.length >= 3 && (
                <Button size="sm" onClick={handleAreaComplete} className="gap-1 text-xs ml-2">
                  Cerrar Área
                </Button>
              )}
            </div>

            {/* Canvas / PDF viewer */}
            <div
              ref={containerRef}
              className="relative bg-card border border-border rounded-lg overflow-hidden"
              style={{ height: "calc(100vh - 240px)", cursor: tool === "move" ? "grab" : "crosshair" }}
            >
              {pdfUrl && selectedVersion?.file_name?.match(/\.pdf$/i) ? (
                <iframe
                  src={pdfUrl}
                  className="w-full h-full"
                  title="Plan PDF Viewer"
                />
              ) : pdfUrl ? (
                <canvas
                  ref={canvasRef}
                  className="w-full h-full"
                  onClick={handleCanvasClick}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">No se pudo cargar el archivo</p>
                </div>
              )}
            </div>

            {/* Measurements panel */}
            {measurements.length > 0 && (
              <div className="mt-3 bg-card border border-border rounded-lg p-4">
                <h3 className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
                  Mediciones ({measurements.length})
                </h3>
                <div className="space-y-1">
                  {measurements.map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {m.type === "line" ? "📏 Distancia" : "📐 Área"} #{i + 1}
                      </span>
                      <span className="font-display font-bold">
                        {m.type === "line" ? `${m.value?.toFixed(1)} px` : `${m.value?.toFixed(0)} px²`}
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
