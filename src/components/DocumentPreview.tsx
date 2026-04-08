import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RotateCw, Loader2, FileWarning } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface DocumentPreviewProps {
  url: string;
  fileName: string;
  className?: string;
}

const DocumentPreview = ({ url, fileName, className = "" }: DocumentPreviewProps) => {
  const [zoom, setZoom] = useState(100);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pdfPages, setPdfPages] = useState<HTMLCanvasElement[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const isPdf = fileName?.toLowerCase().endsWith(".pdf");
  const isImage = /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i.test(fileName || "");

  const handleZoomIn = () => setZoom((z) => Math.min(z + 25, 300));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 25, 25));
  const handleReset = () => setZoom(100);

  const renderPdf = useCallback(async (pdfUrl: string) => {
    try {
      setLoading(true);
      const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
      const pages: HTMLCanvasElement[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
        pages.push(canvas);
      }
      setPdfPages(pages);
      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isPdf && url) {
      renderPdf(url);
    } else if (isImage && url) {
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [url, isPdf, isImage, renderPdf]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isPdf || pdfPages.length === 0) return;
    container.innerHTML = "";
    pdfPages.forEach((canvas) => {
      canvas.style.width = `${zoom}%`;
      canvas.style.height = "auto";
      canvas.style.display = "block";
      canvas.style.marginBottom = "8px";
      canvas.style.transition = "width 0.2s ease";
      container.appendChild(canvas);
    });
  }, [pdfPages, zoom, isPdf]);

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center h-[300px] text-muted-foreground ${className}`}>
        <FileWarning className="h-10 w-10 mb-2 opacity-40" />
        <p className="text-sm">No se pudo cargar la previsualización</p>
        <p className="text-[10px] mt-1">Descarga el archivo para visualizarlo</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Zoom controls */}
      <div className="flex items-center gap-1 mb-2">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleZoomOut} disabled={zoom <= 25}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-[10px] font-display uppercase tracking-wider text-muted-foreground w-12 text-center">{zoom}%</span>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleZoomIn} disabled={zoom >= 300}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleReset}>
          <RotateCw className="h-3 w-3" />
        </Button>
      </div>

      {/* Preview container with scroll */}
      <div className="overflow-auto rounded border border-border bg-muted/30" style={{ maxHeight: "500px" }}>
        {loading ? (
          <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando previsualización...
          </div>
        ) : isPdf ? (
          <div ref={containerRef} className="p-2" />
        ) : isImage ? (
          <img
            src={url}
            alt={fileName}
            className="object-contain mx-auto"
            style={{
              maxWidth: `${zoom}%`,
              transition: "max-width 0.2s ease",
            }}
            onError={() => setError(true)}
          />
        ) : (
          <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
            Formato no soportado para previsualización
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentPreview;
