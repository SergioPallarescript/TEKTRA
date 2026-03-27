import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ArrowLeft, Upload, FileText, Trash2, Ruler, Square, Move, RotateCcw,
  Loader2, Crosshair, Target, CheckCircle2,
} from "lucide-react";

/* ─── Coordinate point (canvas-space, independent of zoom) ─── */
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

  /* Rendered file type */
  const [renderedType, setRenderedType] = useState<"pdf" | "dwg" | null>(null);

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

  const canUpload = profile?.role === "DO" || profile?.role === "DEO";

  /* ─── helpers ─── */
  const isPdf = (name: string) => /\.pdf$/i.test(name);
  const isDwg = (name: string) => /\.dwg$/i.test(name);

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

  /* ─── Upload ─── */
  const handleUpload = async (file: File) => {
    if (!projectId || !user || !canUpload) return;
    if (!file.name.match(/\.(pdf|dwg)$/i)) {
      toast.error("Solo se permiten archivos .PDF o .DWG");
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

  /* ─── PDF rendering ─── */
  const renderPdfPage = useCallback(async (pageNumber: number) => {
    const doc = pdfDocRef.current;
    if (!doc) return;
    const page = await doc.getPage(pageNumber);
    pdfPageRef.current = page;
    const vp = page.getViewport({ scale: 1.5 });
    setPdfViewport(vp);

    const canvas = pdfCanvasRef.current;
    if (!canvas) return;
    canvas.width = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
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

  /* ─── DWG rendering via DxfParser (parses DWG → entities → canvas) ─── */
  const loadDwg = useCallback(async (fileRecord: any) => {
    setFileLoading(true);
    try {
      const { data: blob } = await supabase.storage.from("plans").download(fileRecord.file_url);
      if (!blob) throw new Error("No se pudo descargar");
      const arrayBuf = await blob.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuf);

      const xViewer = await import("@x-viewer/core");
      const parser = new xViewer.DxfParser();
      const dxfData: any = await parser.parseAsync(uint8 as any);

      if (!dxfData || !dxfData.entities) throw new Error("No se pudieron extraer entidades del DWG");

      const canvas = pdfCanvasRef.current;
      if (!canvas) throw new Error("Canvas no disponible");

      /* Compute bounding box */
      const entities = dxfData.entities;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      const expandBounds = (x: number, y: number) => {
        if (!isFinite(x) || !isFinite(y)) return;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      };

      for (const e of entities) {
        if (e.vertices) for (const v of e.vertices) expandBounds(v.x, v.y);
        if (e.startPoint) expandBounds(e.startPoint.x, e.startPoint.y);
        if (e.endPoint) expandBounds(e.endPoint.x, e.endPoint.y);
        if (e.center) {
          const r = e.radius || 0;
          expandBounds(e.center.x - r, e.center.y - r);
          expandBounds(e.center.x + r, e.center.y + r);
        }
        if (e.position) expandBounds(e.position.x, e.position.y);
      }

      if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 1000; maxY = 700; }

      const padding = 60;
      const drawW = maxX - minX || 1;
      const drawH = maxY - minY || 1;
      const cw = 2400;
      const ch = Math.max(800, Math.round(cw * (drawH / drawW)));
      canvas.width = cw;
      canvas.height = ch;

      const scale = Math.min((cw - padding * 2) / drawW, (ch - padding * 2) / drawH);

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No 2d context");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cw, ch);

      /* Transform DWG coords → canvas coords (flip Y) */
      const toC = (x: number, y: number) => ({
        cx: padding + (x - minX) * scale,
        cy: ch - padding - (y - minY) * scale,
      });

      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 1;

      for (const e of entities) {
        ctx.beginPath();
        const type = (e.type || "").toUpperCase();

        if (type === "LINE" && e.startPoint && e.endPoint) {
          const a = toC(e.startPoint.x, e.startPoint.y);
          const b = toC(e.endPoint.x, e.endPoint.y);
          ctx.moveTo(a.cx, a.cy); ctx.lineTo(b.cx, b.cy);
        } else if ((type === "LWPOLYLINE" || type === "POLYLINE") && e.vertices) {
          const pts = e.vertices.map((v: any) => toC(v.x, v.y));
          if (pts.length > 0) {
            ctx.moveTo(pts[0].cx, pts[0].cy);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].cx, pts[i].cy);
            if (e.shape || e.isClosed) ctx.closePath();
          }
        } else if (type === "CIRCLE" && e.center && e.radius) {
          const c = toC(e.center.x, e.center.y);
          ctx.arc(c.cx, c.cy, e.radius * scale, 0, Math.PI * 2);
        } else if (type === "ARC" && e.center && e.radius) {
          const c = toC(e.center.x, e.center.y);
          const sa = -(e.endAngle || 0) * Math.PI / 180;
          const ea = -(e.startAngle || 0) * Math.PI / 180;
          ctx.arc(c.cx, c.cy, e.radius * scale, sa, ea, false);
        } else if (type === "ELLIPSE" && e.center) {
          const c = toC(e.center.x, e.center.y);
          const rx = Math.hypot(e.majorAxisEndPoint?.x || 1, e.majorAxisEndPoint?.y || 0) * scale;
          const ry = rx * (e.axisRatio || 1);
          ctx.ellipse(c.cx, c.cy, rx, ry, 0, 0, Math.PI * 2);
        } else if (type === "SPLINE" && e.controlPoints) {
          const pts = e.controlPoints.map((v: any) => toC(v.x, v.y));
          if (pts.length > 0) {
            ctx.moveTo(pts[0].cx, pts[0].cy);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].cx, pts[i].cy);
          }
        } else if (type === "POINT" && e.position) {
          const p = toC(e.position.x, e.position.y);
          ctx.arc(p.cx, p.cy, 2, 0, Math.PI * 2);
          ctx.fillStyle = "#1a1a1a"; ctx.fill();
        } else if (type === "SOLID" && e.points) {
          const pts = e.points.map((v: any) => toC(v.x, v.y));
          if (pts.length >= 3) {
            ctx.moveTo(pts[0].cx, pts[0].cy);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].cx, pts[i].cy);
            ctx.closePath();
            ctx.fillStyle = "#cccccc"; ctx.fill();
          }
        }
        ctx.stroke();
      }

      setRenderedType("dwg");
      setTotalPages(0);
      fitToContainer();
      setFileLoading(false);
      toast.success("DWG renderizado. Calibra la escala antes de medir.");
    } catch (err: any) {
      console.error("DWG load error:", err);
      toast.error("Error al renderizar DWG: " + (err.message || ""));
      setFileLoading(false);
    }
  }, []);

  /* Fit to container */
  const fitToContainer = () => {
    setTimeout(() => {
      const container = containerRef.current;
      const pdfCanvas = pdfCanvasRef.current;
      if (container && pdfCanvas) {
        const scaleX = container.clientWidth / pdfCanvas.width;
        const scaleY = container.clientHeight / pdfCanvas.height;
        const fitZoom = Math.min(scaleX, scaleY, 1) * 0.95;
        setZoom(fitZoom);
        setOffset({
          x: (container.clientWidth - pdfCanvas.width * fitZoom) / 2,
          y: (container.clientHeight - pdfCanvas.height * fitZoom) / 2,
        });
      }
    }, 50);
  };

  /* Load file based on type */
  const loadFile = (fileRecord: any) => {
    if (isPdf(fileRecord.file_name)) loadPdf(fileRecord);
    else if (isDwg(fileRecord.file_name)) loadDwg(fileRecord);
  };

  /* Change page (PDF only) */
  const changePage = async (delta: number) => {
    const next = pageNum + delta;
    if (next < 1 || next > totalPages) return;
    setPageNum(next);
    await renderPdfPage(next);
  };

  /* ─── Coordinate conversions ─── */
  const screenToPdf = useCallback((sx: number, sy: number): PdfPoint => ({
    px: (sx - offset.x) / zoom,
    py: (sy - offset.y) / zoom,
  }), [offset, zoom]);

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
                <p className="text-sm text-muted-foreground mt-1">Sube un plano (PDF o DWG). Calibra dos puntos de una cota conocida y mide con precisión.</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Solo DO y DEO pueden subir archivos · Formatos: PDF, DWG</p>
              </div>
              {canUpload && (
                <label className="cursor-pointer">
                  <input type="file" className="hidden" accept=".pdf,.dwg" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
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
                {canUpload && <p className="text-xs text-muted-foreground mt-2">Sube un PDF o DWG con escala gráfica para calibrar y medir.</p>}
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
                          {isPdf(f.file_name) ? "PDF" : "DWG"} · {f.file_size ? `${(f.file_size / 1024).toFixed(0)} KB` : ""} · {new Date(f.created_at).toLocaleDateString("es-ES")}
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
                {renderedType === "pdf" && totalPages > 1 && (
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
            <div className="flex items-center gap-1 mb-3 bg-card border border-border rounded-lg p-1.5 flex-wrap">
              <Button variant={tool === "move" ? "default" : "ghost"} size="sm" onClick={() => setTool("move")} className="gap-1 text-xs"><Move className="h-3.5 w-3.5" /> Mover</Button>
              <div className="w-px h-6 bg-border mx-1" />
              <Button variant={tool === "calibrate" ? "default" : "ghost"} size="sm"
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
                    <FileText className="h-3.5 w-3.5" />
                    Cargar {isPdf(selectedFile.file_name) ? "PDF" : "DWG"}
                  </Button>
                </>
              )}
            </div>

            {/* Calibration help banner */}
            {!calibration && isFileLoaded && (
              <div className="mb-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-xs font-display text-blue-800 dark:text-blue-200">
                  <strong>Paso 1 — Calibrar escala:</strong> Pulsa "Calibrar", marca los dos extremos de una cota conocida o barra de escala del plano, e introduce la distancia real en metros.
                </p>
              </div>
            )}

            {/* Viewer area */}
            <div ref={containerRef} className="relative bg-muted/30 border border-border rounded-lg overflow-hidden" style={{ height: "calc(100vh - 280px)" }}>
              <canvas
                ref={pdfCanvasRef}
                className="absolute"
                style={{
                  transformOrigin: "0 0",
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                  imageRendering: "auto",
                  zIndex: 1,
                }}
              />

              {fileLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ zIndex: 5, pointerEvents: "none" }}>
                  <Loader2 className="h-10 w-10 text-muted-foreground animate-spin mb-3" />
                  <p className="font-display text-sm text-muted-foreground">Cargando {isPdf(selectedFile.file_name) ? "PDF" : "DWG"}…</p>
                </div>
              )}

              {!isFileLoaded && !fileLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8" style={{ zIndex: 5, pointerEvents: "none" }}>
                  <FileText className="h-16 w-16 text-muted-foreground/20 mb-4" />
                  <p className="font-display text-muted-foreground mb-2">
                    Pulsa "Cargar {isPdf(selectedFile.file_name) ? "PDF" : "DWG"}" para visualizar el plano
                  </p>
                </div>
              )}

              <canvas
                ref={overlayCanvasRef}
                className="absolute inset-0 w-full h-full"
                style={{
                  zIndex: 10,
                  cursor: tool === "move" ? (dragging ? "grabbing" : "grab") : "crosshair",
                }}
                onClick={handleCanvasClick}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={() => setDragging(false)}
                onMouseLeave={() => { setDragging(false); setMouseScreenPos(null); setSnappedPoint(null); }}
                onWheel={handleWheel}
              />
            </div>

            {/* Calibration dialog */}
            {showCalibDialog && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center" style={{ zIndex: 50 }}>
                <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
                  <h3 className="font-display text-lg font-bold mb-2">Calibrar escala</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Has marcado dos puntos sobre el plano. Introduce la distancia real que representan.
                  </p>
                  <div className="flex items-center gap-2 mb-4">
                    <Input
                      type="number" step="0.01" min="0.01" placeholder="Ej: 5.00"
                      value={calibInput} onChange={(e) => setCalibInput(e.target.value)}
                      className="flex-1" autoFocus
                    />
                    <span className="text-sm font-display text-muted-foreground">metros</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { setShowCalibDialog(false); setCalibPoints([]); }} className="flex-1 text-xs">Cancelar</Button>
                    <Button onClick={confirmCalibration} className="flex-1 text-xs gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Measurements panel */}
            {measurements.length > 0 && (
              <div className="mt-3 bg-card border border-border rounded-lg p-4">
                <h3 className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Mediciones ({measurements.length})</h3>
                <div className="space-y-1">
                  {measurements.map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{m.type === "line" ? "📏 Distancia" : "📐 Área"} #{i + 1}</span>
                      <span className="font-display font-bold">
                        {m.type === "line" ? `${m.value.toFixed(2)} m` : `${m.value.toFixed(2)} m²`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground/40 mt-2 text-center">
              Calibra marcando dos puntos de una cota conocida · Las medidas son independientes del zoom · Snap detecta puntos de medición previos
            </p>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default DWGViewer;
