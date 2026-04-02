import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjectRole } from "@/hooks/useProjectRole";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ArrowLeft, Upload, FileText, Trash2, Ruler, Square, Move, RotateCcw,
  Loader2, Crosshair, Target, CheckCircle2,
} from "lucide-react";

interface PdfPoint { px: number; py: number; }

interface Measurement {
  type: "line" | "area";
  pdfPoints: PdfPoint[];
  value: number;
}

interface Calibration {
  p1: PdfPoint;
  p2: PdfPoint;
  realMeters: number;
  pdfUnitsPerMeter: number;
}

const SNAP_RADIUS_PX = 14;

const DWGViewer = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [files, setFiles] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);

  const [renderedType, setRenderedType] = useState<"pdf" | null>(null);

  /* PDF rendering */
  const pdfDocRef = useRef<any>(null);
  const pdfPageRef = useRef<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfViewport, setPdfViewport] = useState<any>(null);

  /* Pan / zoom */
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  /* Tool & measurement state */
  const [tool, setTool] = useState<"move" | "calibrate" | "line" | "area">("move");
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [currentPoints, setCurrentPoints] = useState<PdfPoint[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [mouseScreenPos, setMouseScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [snappedPoint, setSnappedPoint] = useState<PdfPoint | null>(null);

  /* Calibration */
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [calibPoints, setCalibPoints] = useState<PdfPoint[]>([]);
  const [calibInput, setCalibInput] = useState("");
  const [showCalibDialog, setShowCalibDialog] = useState(false);

  const { isAdmin: canUpload } = useProjectRole(projectId);

  /* ─── Fetch files ─── */
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

  /* ─── Upload (PDF only) ─── */
  const handleUpload = async (file: File) => {
    if (!projectId || !user || !canUpload) return;
    if (!file.name.match(/\.pdf$/i)) {
      toast.error("Solo se permiten archivos PDF");
      return;
    }
    setUploading(true);
    const path = `dwg/${projectId}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("plans").upload(path, file);
    if (error) { toast.error("Error al subir archivo"); setUploading(false); return; }
    await supabase.from("dwg_files").insert({
      project_id: projectId, uploaded_by: user.id,
      file_name: file.name, file_url: path, file_size: file.size,
    });
    await supabase.from("audit_logs").insert({
      user_id: user.id, project_id: projectId,
      action: "plan_file_uploaded", details: { file_name: file.name },
    });
    toast.success("Archivo subido correctamente");
    setUploading(false);
    fetchFiles();
  };

  const handleDelete = async (f: any) => {
    if (f.uploaded_by !== user?.id) return;
    await supabase.storage.from("plans").remove([f.file_url]);
    await supabase.from("dwg_files").delete().eq("id", f.id);
    toast.success("Archivo eliminado");
    if (selectedFile?.id === f.id) setSelectedFile(null);
    fetchFiles();
  };

  /* ─── PDF rendering with HIGH RESOLUTION ─── */
  const renderPdfPage = useCallback(async (pageNumber: number) => {
    const doc = pdfDocRef.current;
    if (!doc) return;
    const page = await doc.getPage(pageNumber);
    pdfPageRef.current = page;

    // Use high DPI scale for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    const baseScale = 3; // High resolution base
    const renderScale = baseScale * dpr;
    const vp = page.getViewport({ scale: baseScale });
    const renderVp = page.getViewport({ scale: renderScale });
    setPdfViewport(vp);

    const canvas = pdfCanvasRef.current;
    if (!canvas) return;
    // Set canvas internal size to high-res
    canvas.width = renderVp.width;
    canvas.height = renderVp.height;
    // Set display size to logical size
    canvas.style.width = `${vp.width}px`;
    canvas.style.height = `${vp.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    await page.render({ canvasContext: ctx, viewport: renderVp }).promise;
  }, []);

  const loadPdf = useCallback(async (fileRecord: any) => {
    setFileLoading(true);
    try {
      const { data: blob } = await supabase.storage.from("plans").download(fileRecord.file_url);
      if (!blob) throw new Error("No se pudo descargar");
      const arrayBuf = await blob.arrayBuffer();

      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

      const doc = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
      pdfDocRef.current = doc;
      setTotalPages(doc.numPages);
      setPageNum(1);
      await renderPdfPage(1);
      setRenderedType("pdf");

      fitToContainer();
      setFileLoading(false);
      toast.success("PDF cargado. Calibra la escala antes de medir.");
    } catch (err: any) {
      console.error("PDF load error:", err);
      toast.error("Error al cargar el PDF: " + (err.message || ""));
      setFileLoading(false);
    }
  }, [renderPdfPage]);

  /* Fit to container */
  const fitToContainer = () => {
    setTimeout(() => {
      const container = containerRef.current;
      const pdfCanvas = pdfCanvasRef.current;
      if (container && pdfCanvas) {
        // Use display size (style width/height) for fitting
        const displayW = parseFloat(pdfCanvas.style.width) || pdfCanvas.width;
        const displayH = parseFloat(pdfCanvas.style.height) || pdfCanvas.height;
        const scaleX = container.clientWidth / displayW;
        const scaleY = container.clientHeight / displayH;
        const fitZoom = Math.min(scaleX, scaleY, 1) * 0.95;
        setZoom(fitZoom);
        setOffset({
          x: (container.clientWidth - displayW * fitZoom) / 2,
          y: (container.clientHeight - displayH * fitZoom) / 2,
        });
      }
    }, 50);
  };

  /* Load file */
  const loadFile = (fileRecord: any) => {
    loadPdf(fileRecord);
  };

  /* Change page (PDF only) */
  const changePage = async (delta: number) => {
    const next = pageNum + delta;
    if (next < 1 || next > totalPages) return;
    setPageNum(next);
    await renderPdfPage(next);
  };

  /* ─── Coordinate conversions (use display size) ─── */
  const getDisplaySize = useCallback(() => {
    const canvas = pdfCanvasRef.current;
    if (!canvas) return { w: 1, h: 1 };
    return {
      w: parseFloat(canvas.style.width) || canvas.width,
      h: parseFloat(canvas.style.height) || canvas.height,
    };
  }, []);

  const screenToPdf = useCallback((sx: number, sy: number): PdfPoint => {
    const { w, h } = getDisplaySize();
    return {
      px: (sx - offset.x) / zoom,
      py: (sy - offset.y) / zoom,
    };
  }, [offset, zoom, getDisplaySize]);

  const pdfToScreen = useCallback((p: PdfPoint) => ({
    x: p.px * zoom + offset.x,
    y: p.py * zoom + offset.y,
  }), [offset, zoom]);

  /* ─── Snap ─── */
  const findSnap = useCallback((sx: number, sy: number): PdfPoint | null => {
    if (!snapEnabled) return null;
    const allPts: PdfPoint[] = [];
    measurements.forEach(m => m.pdfPoints.forEach(p => allPts.push(p)));
    currentPoints.forEach(p => allPts.push(p));
    if (calibration) { allPts.push(calibration.p1); allPts.push(calibration.p2); }
    calibPoints.forEach(p => allPts.push(p));

    let best: PdfPoint | null = null;
    let bestDist = Infinity;
    for (const p of allPts) {
      const sp = pdfToScreen(p);
      const d = Math.hypot(sp.x - sx, sp.y - sy);
      if (d < SNAP_RADIUS_PX && d < bestDist) { bestDist = d; best = p; }
    }
    return best;
  }, [snapEnabled, measurements, currentPoints, calibration, calibPoints, pdfToScreen]);

  /* ─── Distance ─── */
  const pdfDist = (a: PdfPoint, b: PdfPoint) => Math.hypot(a.px - b.px, a.py - b.py);

  const toMeters = useCallback((pdfUnits: number) => {
    if (!calibration) return pdfUnits;
    return pdfUnits / calibration.pdfUnitsPerMeter;
  }, [calibration]);

  /* ─── Draw overlay ─── */
  const drawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (parent) { canvas.width = parent.clientWidth; canvas.height = parent.clientHeight; }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const font = 'bold 13px "Space Grotesk", sans-serif';

    /* Calibration line */
    if (calibration) {
      const s1 = pdfToScreen(calibration.p1);
      const s2 = pdfToScreen(calibration.p2);
      ctx.beginPath();
      ctx.strokeStyle = "hsl(200, 90%, 50%)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
      ctx.setLineDash([]);
      [s1, s2].forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fillStyle = "hsl(200, 90%, 50%)"; ctx.fill(); });
      const mid = { x: (s1.x + s2.x) / 2, y: (s1.y + s2.y) / 2 };
      const label = `Ref: ${calibration.realMeters.toFixed(2)} m`;
      ctx.font = font;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "hsla(200, 90%, 95%, 0.9)";
      ctx.fillRect(mid.x - tw / 2 - 4, mid.y - 20, tw + 8, 22);
      ctx.fillStyle = "hsl(200, 90%, 30%)";
      ctx.fillText(label, mid.x - tw / 2, mid.y - 3);
    }

    /* In-progress calibration */
    if (tool === "calibrate" && calibPoints.length > 0) {
      const screenPts = calibPoints.map(p => pdfToScreen(p));
      ctx.beginPath();
      ctx.strokeStyle = "hsl(200, 90%, 50%)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(screenPts[0].x, screenPts[0].y);
      if (screenPts.length > 1) ctx.lineTo(screenPts[1].x, screenPts[1].y);
      else if (mouseScreenPos) ctx.lineTo(mouseScreenPos.x, mouseScreenPos.y);
      ctx.stroke();
      ctx.setLineDash([]);
      screenPts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fillStyle = "hsl(200, 90%, 50%)"; ctx.fill(); });
    }

    /* Completed measurements */
    measurements.forEach((m) => {
      const sPts = m.pdfPoints.map(p => pdfToScreen(p));
      const color = m.type === "line" ? "hsl(150, 45%, 40%)" : "hsl(38, 92%, 50%)";
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      if (m.type === "line" && sPts.length === 2) {
        ctx.moveTo(sPts[0].x, sPts[0].y); ctx.lineTo(sPts[1].x, sPts[1].y);
        ctx.stroke();
        sPts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); });
        const mid = { x: (sPts[0].x + sPts[1].x) / 2, y: (sPts[0].y + sPts[1].y) / 2 };
        const label = `${m.value.toFixed(2)} m`;
        ctx.font = font;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = "hsla(0, 0%, 100%, 0.9)";
        ctx.fillRect(mid.x - tw / 2 - 4, mid.y - 20, tw + 8, 22);
        ctx.fillStyle = "hsl(150, 45%, 30%)";
        ctx.fillText(label, mid.x - tw / 2, mid.y - 3);
      } else if (m.type === "area" && sPts.length >= 3) {
        ctx.moveTo(sPts[0].x, sPts[0].y);
        sPts.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fillStyle = "hsla(38, 92%, 50%, 0.1)";
        ctx.fill();
        ctx.stroke();
        sPts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); });
        const cx = sPts.reduce((s, p) => s + p.x, 0) / sPts.length;
        const cy = sPts.reduce((s, p) => s + p.y, 0) / sPts.length;
        const label = `${m.value.toFixed(2)} m²`;
        ctx.font = font;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = "hsla(0, 0%, 100%, 0.9)";
        ctx.fillRect(cx - tw / 2 - 4, cy - 20, tw + 8, 22);
        ctx.fillStyle = "hsl(38, 92%, 40%)";
        ctx.fillText(label, cx - tw / 2, cy - 3);
      }
    });

    /* In-progress measurement */
    if (currentPoints.length > 0 && (tool === "line" || tool === "area")) {
      const sPts = currentPoints.map(p => pdfToScreen(p));
      const color = tool === "line" ? "hsl(150, 45%, 40%)" : "hsl(38, 92%, 50%)";
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.moveTo(sPts[0].x, sPts[0].y);
      sPts.forEach(p => ctx.lineTo(p.x, p.y));
      if (mouseScreenPos) ctx.lineTo(mouseScreenPos.x, mouseScreenPos.y);
      ctx.stroke();
      ctx.setLineDash([]);
      sPts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); });
    }

    /* Snap indicator */
    if (snappedPoint && tool !== "move") {
      const sp = pdfToScreen(snappedPoint);
      ctx.beginPath(); ctx.strokeStyle = "hsl(0, 80%, 60%)"; ctx.lineWidth = 2;
      ctx.moveTo(sp.x - 10, sp.y); ctx.lineTo(sp.x + 10, sp.y);
      ctx.moveTo(sp.x, sp.y - 10); ctx.lineTo(sp.x, sp.y + 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y - 8); ctx.lineTo(sp.x + 8, sp.y);
      ctx.lineTo(sp.x, sp.y + 8); ctx.lineTo(sp.x - 8, sp.y);
      ctx.closePath(); ctx.strokeStyle = "hsl(0, 80%, 60%)"; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }, [measurements, currentPoints, tool, zoom, offset, pdfToScreen, mouseScreenPos, snappedPoint, calibration, calibPoints]);

  useEffect(() => { drawOverlay(); }, [drawOverlay]);

  /* ─── Canvas click ─── */
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (tool === "move") return;
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const pt = snappedPoint || screenToPdf(sx, sy);

    if (tool === "calibrate") {
      const newPts = [...calibPoints, pt];
      if (newPts.length === 2) {
        setCalibPoints(newPts);
        setShowCalibDialog(true);
      } else {
        setCalibPoints(newPts);
      }
      return;
    }

    if (!calibration) {
      toast.error("Primero debes calibrar la escala del plano");
      setTool("calibrate");
      return;
    }

    if (tool === "line") {
      const newPts = [...currentPoints, pt];
      if (newPts.length === 2) {
        const d = pdfDist(newPts[0], newPts[1]);
        const meters = toMeters(d);
        setMeasurements(p => [...p, { type: "line", pdfPoints: newPts, value: meters }]);
        setCurrentPoints([]);
      } else {
        setCurrentPoints(newPts);
      }
    } else if (tool === "area") {
      setCurrentPoints(p => [...p, pt]);
    }
  };

  const handleAreaComplete = () => {
    if (tool === "area" && currentPoints.length >= 3 && calibration) {
      let area = 0;
      for (let i = 0; i < currentPoints.length; i++) {
        const j = (i + 1) % currentPoints.length;
        area += currentPoints[i].px * currentPoints[j].py - currentPoints[j].px * currentPoints[i].py;
      }
      const pdfArea = Math.abs(area) / 2;
      const m2 = pdfArea / (calibration.pdfUnitsPerMeter * calibration.pdfUnitsPerMeter);
      setMeasurements(p => [...p, { type: "area", pdfPoints: [...currentPoints], value: m2 }]);
      setCurrentPoints([]);
    }
  };

  /* Confirm calibration */
  const confirmCalibration = () => {
    const realM = parseFloat(calibInput);
    if (!realM || realM <= 0 || calibPoints.length !== 2) {
      toast.error("Introduce una distancia real válida");
      return;
    }
    const pdfD = pdfDist(calibPoints[0], calibPoints[1]);
    const pdfUnitsPerMeter = pdfD / realM;
    setCalibration({ p1: calibPoints[0], p2: calibPoints[1], realMeters: realM, pdfUnitsPerMeter });
    setShowCalibDialog(false);
    setCalibPoints([]);
    setCalibInput("");
    setTool("line");
    toast.success(`Escala calibrada: ${pdfUnitsPerMeter.toFixed(1)} px/m. Ya puedes medir.`);
  };

  /* ─── Mouse handlers ─── */
  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (dragging && tool === "move") {
      setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
      return;
    }
    setMouseScreenPos({ x: sx, y: sy });
    if (tool !== "move") setSnappedPoint(findSnap(sx, sy));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool === "move") {
      setDragging(true);
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.05, Math.min(20, zoom * factor));
    setOffset({
      x: mx - (mx - offset.x) * (newZoom / zoom),
      y: my - (my - offset.y) * (newZoom / zoom),
    });
    setZoom(newZoom);
  };

  const isFileLoaded = renderedType !== null;

  /* ─── Touch handlers for mobile ─── */
  const lastTouchRef = useRef<{ x: number; y: number; dist?: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && tool === "move") {
      const t = e.touches[0];
      lastTouchRef.current = { x: t.clientX - offset.x, y: t.clientY - offset.y };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchRef.current = { x: 0, y: 0, dist: Math.hypot(dx, dy) };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && tool === "move" && lastTouchRef.current && !lastTouchRef.current.dist) {
      const t = e.touches[0];
      setOffset({ x: t.clientX - lastTouchRef.current.x, y: t.clientY - lastTouchRef.current.y });
    } else if (e.touches.length === 2 && lastTouchRef.current?.dist) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.hypot(dx, dy);
      const scale = newDist / lastTouchRef.current.dist;
      const newZoom = Math.max(0.05, Math.min(20, zoom * scale));
      setZoom(newZoom);
      lastTouchRef.current.dist = newDist;
    }
  };

  const handleTouchEnd = () => { lastTouchRef.current = null; };

  /* ─── RENDER ─── */
  return (
    <AppLayout>
      <div className="max-w-full mx-auto px-4 py-4">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">
            Metro Digital — Toma de medidas
          </p>
        </div>

        {!selectedFile ? (
          <>
            <div className="flex items-end justify-between mb-6">
              <div>
                <h1 className="font-display text-3xl font-bold tracking-tighter">Metro Digital</h1>
                <p className="text-sm text-muted-foreground mt-1">Sube un plano PDF. Calibra dos puntos de una cota conocida y mide con precisión.</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Solo DO y DEM pueden subir archivos · Formato: PDF</p>
              </div>
              {canUpload && (
                <label className="cursor-pointer">
                  <input type="file" className="hidden" accept=".pdf" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                  <Button asChild variant="outline" className="font-display text-xs uppercase tracking-wider gap-2" disabled={uploading}>
                    <span><Upload className="h-4 w-4" />{uploading ? "Subiendo..." : "Subir Plano"}</span>
                  </Button>
                </label>
              )}
            </div>

            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-card border border-border rounded-lg animate-pulse" />)}</div>
            ) : files.length === 0 ? (
              <div className="text-center py-20">
                <Ruler className="h-16 w-16 text-muted-foreground/20 mx-auto mb-4" />
                <p className="font-display text-muted-foreground">No hay planos subidos.</p>
                {canUpload && <p className="text-xs text-muted-foreground mt-2">Sube un PDF con escala gráfica para calibrar y medir.</p>}
              </div>
            ) : (
              <div className="space-y-2">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center justify-between p-4 bg-card border border-border rounded-lg hover:border-foreground/10 transition-all">
                    <button onClick={() => {
                      setSelectedFile(f);
                      setMeasurements([]); setCurrentPoints([]); setCalibration(null);
                      setCalibPoints([]); setZoom(1); setOffset({ x: 0, y: 0 }); setTool("move");
                      setRenderedType(null); pdfDocRef.current = null; pdfPageRef.current = null;
                    }} className="flex items-center gap-3 text-left flex-1">
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{f.file_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          PDF · {f.file_size ? `${(f.file_size / 1024).toFixed(0)} KB` : ""} · {new Date(f.created_at).toLocaleDateString("es-ES")}
                        </p>
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
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <button onClick={() => { setSelectedFile(null); pdfDocRef.current = null; pdfPageRef.current = null; setRenderedType(null); }} className="text-xs text-muted-foreground hover:text-foreground font-display uppercase tracking-wider mb-1 inline-block">
                  ← Volver a archivos
                </button>
                <h1 className="font-display text-xl font-bold tracking-tighter">{selectedFile.file_name}</h1>
              </div>
              <div className="flex items-center gap-3">
                {calibration && (
                  <span className="flex items-center gap-1 text-[10px] text-green-600 font-display">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Calibrado ({calibration.pdfUnitsPerMeter.toFixed(0)} px/m)
                  </span>
                )}
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => changePage(-1)} disabled={pageNum <= 1} className="text-xs h-7 px-2">←</Button>
                    <span className="text-[10px] text-muted-foreground font-display">{pageNum}/{totalPages}</span>
                    <Button variant="ghost" size="sm" onClick={() => changePage(1)} disabled={pageNum >= totalPages} className="text-xs h-7 px-2">→</Button>
                  </div>
                )}
                <span className="text-[10px] text-muted-foreground font-display">Zoom: {Math.round(zoom * 100)}%</span>
              </div>
            </div>

            {/* Toolbar */}
            <div data-tour="dwg-toolbar" className="flex items-center gap-1 mb-3 bg-card border border-border rounded-lg p-1.5 flex-wrap">
              <Button variant={tool === "move" ? "default" : "ghost"} size="sm" onClick={() => setTool("move")} className="gap-1 text-xs"><Move className="h-3.5 w-3.5" /> Mover</Button>
              <div className="w-px h-6 bg-border mx-1" />
              <Button data-tour="dwg-calibrate" variant={tool === "calibrate" ? "default" : "ghost"} size="sm"
                onClick={() => { setTool("calibrate"); setCalibPoints([]); setCurrentPoints([]); }}
                className="gap-1 text-xs">
                <Target className="h-3.5 w-3.5" /> {calibration ? "Recalibrar" : "① Calibrar"}
              </Button>
              <div className="w-px h-6 bg-border mx-1" />
              <Button variant={tool === "line" ? "default" : "ghost"} size="sm"
                onClick={() => { if (!calibration) { toast.error("Calibra primero"); setTool("calibrate"); } else setTool("line"); }}
                className="gap-1 text-xs"><Ruler className="h-3.5 w-3.5" /> Medir</Button>
              <Button variant={tool === "area" ? "default" : "ghost"} size="sm"
                onClick={() => { if (!calibration) { toast.error("Calibra primero"); setTool("calibrate"); } else { setTool("area"); setCurrentPoints([]); } }}
                className="gap-1 text-xs"><Square className="h-3.5 w-3.5" /> Área</Button>
              <div className="w-px h-6 bg-border mx-1" />
              <Button variant={snapEnabled ? "default" : "ghost"} size="sm" onClick={() => setSnapEnabled(!snapEnabled)} className="gap-1 text-xs">
                <Crosshair className="h-3.5 w-3.5" /> Snap {snapEnabled ? "ON" : "OFF"}
              </Button>
              <div className="w-px h-6 bg-border mx-1" />
              <Button variant="ghost" size="sm" onClick={() => { setMeasurements([]); setCurrentPoints([]); }} className="gap-1 text-xs"><RotateCcw className="h-3.5 w-3.5" /> Limpiar</Button>
              {tool === "area" && currentPoints.length >= 3 && (
                <Button size="sm" onClick={handleAreaComplete} className="gap-1 text-xs ml-2">Cerrar Área</Button>
              )}
              {!isFileLoaded && !fileLoading && (
                <>
                  <div className="w-px h-6 bg-border mx-1" />
                  <Button variant="outline" size="sm" onClick={() => loadFile(selectedFile)} className="gap-1 text-xs">
                    <FileText className="h-3.5 w-3.5" /> Cargar PDF
                  </Button>
                </>
              )}
            </div>

            {/* Calibration help banner */}
            {!calibration && isFileLoaded && (
              <div className="mb-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-xs text-blue-800 dark:text-blue-200 font-display">
                  <strong>① Calibrar:</strong> Selecciona la herramienta "Calibrar", marca dos puntos de una cota conocida o barra gráfica en el plano, e introduce la distancia real. Las medidas serán precisas independientemente del zoom.
                </p>
              </div>
            )}

            {/* Canvas container */}
            <div
              ref={containerRef}
              className="relative border border-border rounded-lg overflow-hidden bg-muted"
              style={{ height: "calc(100vh - 280px)", cursor: tool === "move" ? "grab" : "crosshair" }}
              onMouseUp={() => setDragging(false)}
              onMouseLeave={() => { setDragging(false); setMouseScreenPos(null); }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {fileLoading && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80">
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                    <p className="text-xs text-muted-foreground mt-2 font-display">Cargando plano en alta resolución...</p>
                  </div>
                </div>
              )}
              <canvas
                ref={pdfCanvasRef}
                className="absolute"
                style={{
                  transformOrigin: "0 0",
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                }}
              />
              <canvas
                ref={overlayCanvasRef}
                className="absolute inset-0 z-10"
                onClick={handleCanvasClick}
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                onWheel={handleWheel}
              />
            </div>

            {/* Measurements list */}
            {measurements.length > 0 && (
              <div className="mt-3 bg-card border border-border rounded-lg p-3">
                <h3 className="font-display text-xs uppercase tracking-wider text-muted-foreground mb-2">Mediciones ({measurements.length})</h3>
                <div className="space-y-1">
                  {measurements.map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{m.type === "line" ? "📏" : "📐"} Medida {i + 1}</span>
                      <span className="font-display font-bold">{m.value.toFixed(2)} {m.type === "line" ? "m" : "m²"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Calibration dialog */}
      {showCalibDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm mx-4">
            <h3 className="font-display text-lg font-bold tracking-tighter mb-2">Calibrar Escala</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Has marcado dos puntos en el plano. Introduce la distancia real entre ellos para calibrar las medidas.
            </p>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs font-display uppercase tracking-wider text-muted-foreground">Distancia real (metros)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={calibInput}
                  onChange={(e) => setCalibInput(e.target.value)}
                  placeholder="5.00"
                  className="mt-1"
                  autoFocus
                />
              </div>
              <Button onClick={confirmCalibration} className="font-display text-xs uppercase tracking-wider">
                Calibrar
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setShowCalibDialog(false); setCalibPoints([]); }} className="mt-2 text-xs w-full">
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default DWGViewer;
