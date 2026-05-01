import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { downloadFile, openFile, pickImage, isNative } from "@/lib/nativeMedia";
import { useAuth } from "@/hooks/useAuth";
import { useProjectRole } from "@/hooks/useProjectRole";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ArrowLeft, FileText, Plus, Download, ClipboardList,
  Trash2, FileSignature, ChevronDown, ChevronUp, Loader2, FolderOpen,
} from "lucide-react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import DocumentPreview from "@/components/DocumentPreview";

/* ──────────────────────────────────────────────────────────────────
 * Helpers de imagen / PDF
 * ────────────────────────────────────────────────────────────────── */

const readFileAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    img.src = src;
  });

/** Convierte a B/N tipo "escaneo": gris + umbral adaptativo simple. */
const scanifyImage = async (file: File): Promise<File> => {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);
  // Limita resolución para tamaño razonable
  const MAX = 1800;
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (Math.max(w, h) > MAX) {
    const k = MAX / Math.max(w, h);
    w = Math.round(w * k);
    h = Math.round(h * k);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  // Normalización + umbral
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    sum += g;
  }
  const avg = sum / (d.length / 4);
  const threshold = Math.min(190, Math.max(120, avg + 10));
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // suaviza un pelín contraste
    const adj = g > threshold ? 255 : Math.max(0, g * 0.85);
    d[i] = d[i + 1] = d[i + 2] = adj;
  }
  ctx.putImageData(imgData, 0, 0);
  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.85),
  );
  return new File([blob], file.name.replace(/\.\w+$/, "") + "_scan.jpg", { type: "image/jpeg" });
};

/* ──────────────────────────────────────────────────────────────────
 * Componente
 * ────────────────────────────────────────────────────────────────── */

const SubcontractingModule = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { isCON, isAdmin, isDEM, isDO } = useProjectRole(projectId);
  const navigate = useNavigate();

  const [project, setProject] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [pages, setPages] = useState<any[]>([]);
  const [acts, setActs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Carga
  const [uploadingFirst, setUploadingFirst] = useState(false);
  const [uploadingEntry, setUploadingEntry] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [scanMode, setScanMode] = useState(false);

  // Inputs ocultos para fallback web
  const firstFileRef = useRef<HTMLInputElement>(null);
  const entryFileRef = useRef<HTMLInputElement>(null);

  // Preview / borrado
  const [previewPage, setPreviewPage] = useState<any | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  // Acta de adhesión
  const [showActDialog, setShowActDialog] = useState(false);
  const [actWork, setActWork] = useState("");
  const [actLocation, setActLocation] = useState("");
  const [actPromoter, setActPromoter] = useState("");
  const [actContractor, setActContractor] = useState("");
  const [actSubcontractor, setActSubcontractor] = useState("");
  const [actRepresentative, setActRepresentative] = useState("");
  const [actTask, setActTask] = useState("");
  const [generatingAct, setGeneratingAct] = useState(false);

  const canWrite = isCON || isDEM || isDO || isAdmin;

  /* ─── Fetch ─────────────────────────────────────────────────── */

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const [{ data: proj }, { data: memberData }, { data: pageData }, { data: actData }] =
      await Promise.all([
        supabase.from("projects").select("*").eq("id", projectId).single(),
        supabase
          .from("project_members")
          .select("*, profiles:user_id(full_name, role, dni_cif)")
          .eq("project_id", projectId)
          .eq("status", "accepted"),
        supabase
          .from("subcontracting_pages" as any)
          .select("*")
          .eq("project_id", projectId)
          .order("page_index", { ascending: true }),
        supabase
          .from("subcontracting_adhesion_acts" as any)
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
      ]);
    if (proj) setProject(proj);
    setMembers(memberData || []);
    setPages(pageData || []);
    setActs(actData || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ─── Acta: prefills ────────────────────────────────────────── */

  useEffect(() => {
    if (!showActDialog) return;
    const promoter = members.find((m) => m.role === "PRO");
    const contractor = members.find((m) => m.role === "CON");
    setActWork((v) => v || project?.name || "");
    setActLocation((v) => v || project?.address || "");
    setActPromoter(
      (v) => v || promoter?.profiles?.full_name || promoter?.invited_email || "",
    );
    setActContractor(
      (v) => v || contractor?.profiles?.full_name || contractor?.invited_email || "",
    );
  }, [showActDialog, project, members]);

  /* ─── Subida de páginas ─────────────────────────────────────── */

  const uploadOneFile = async (file: File, kind: "first_sheet" | "entry_sheet") => {
    if (!projectId || !user) return;
    let finalFile = file;
    if (scanMode && file.type.startsWith("image/")) {
      try { finalFile = await scanifyImage(file); }
      catch (e) { console.warn("scanify falló, subo original", e); }
    }
    const ts = Date.now();
    const safeName = finalFile.name.replace(/[^\w.\-]+/g, "_");
    const path = `${projectId}/subcontracting/${ts}_${safeName}`;
    const { error: upErr } = await supabase.storage.from("plans").upload(path, finalFile, {
      cacheControl: "3600",
      contentType: finalFile.type || "image/jpeg",
      upsert: false,
    });
    if (upErr) throw upErr;

    const nextIndex = (pages[pages.length - 1]?.page_index ?? -1) + 1;
    const { error: insErr } = await supabase.from("subcontracting_pages" as any).insert({
      project_id: projectId,
      page_index: nextIndex,
      file_path: path,
      file_name: finalFile.name,
      kind,
      uploaded_by: user.id,
    } as any);
    if (insErr) throw insErr;
  };

  const handleUploadFiles = async (
    files: FileList | File[] | null,
    kind: "first_sheet" | "entry_sheet",
  ) => {
    if (!files || (files as any).length === 0) return;
    const arr = Array.from(files as any) as File[];
    const setBusy = kind === "first_sheet" ? setUploadingFirst : setUploadingEntry;
    setBusy(true);
    try {
      for (const f of arr) await uploadOneFile(f, kind);
      toast.success(arr.length === 1 ? "Hoja añadida" : `${arr.length} hojas añadidas`);
      await fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error("Error al subir: " + (e?.message || ""));
    } finally {
      setBusy(false);
    }
  };

  const triggerSource = async (
    source: "camera" | "gallery" | "scan",
    kind: "first_sheet" | "entry_sheet",
  ) => {
    setScanMode(source === "scan");
    const ref = kind === "first_sheet" ? firstFileRef : entryFileRef;
    if (isNative()) {
      const camMode = source === "camera" ? "camera" : "gallery";
      const files = await pickImage(camMode, ref.current);
      if (files && files.length) await handleUploadFiles(files, kind);
    } else {
      // Web: dispara el input file (la cámara la abre el navegador con capture)
      if (ref.current) {
        ref.current.setAttribute(
          "accept",
          source === "camera" ? "image/*" : "image/*,application/pdf",
        );
        if (source === "camera") ref.current.setAttribute("capture", "environment");
        else ref.current.removeAttribute("capture");
        ref.current.click();
      }
    }
  };

  /* ─── Preview / borrado ─────────────────────────────────────── */

  const handlePreview = async (page: any) => {
    setPreviewPage(page);
    setPreviewUrl(null);
    const { data, error } = await supabase.storage
      .from("plans")
      .createSignedUrl(page.file_path, 3600);
    if (error) {
      toast.error("No se pudo abrir la hoja");
      setPreviewPage(null);
      return;
    }
    setPreviewUrl(data.signedUrl);
  };

  const handleDeletePage = async () => {
    if (!deleteTarget) return;
    const { error: stErr } = await supabase.storage.from("plans").remove([deleteTarget.file_path]);
    if (stErr) console.warn("storage remove", stErr);
    const { error } = await supabase
      .from("subcontracting_pages" as any)
      .delete()
      .eq("id", deleteTarget.id);
    if (error) toast.error("Error al eliminar");
    else {
      toast.success("Hoja eliminada");
      setDeleteTarget(null);
      fetchData();
    }
  };

  /* ─── Exportar libro a PDF ──────────────────────────────────── */

  const handleExportBook = async () => {
    if (pages.length === 0 || !project) return;
    setExporting(true);
    try {
      const pdf = await PDFDocument.create();
      for (const page of pages) {
        const { data: signed, error: sErr } = await supabase.storage
          .from("plans")
          .createSignedUrl(page.file_path, 600);
        if (sErr || !signed) throw sErr || new Error("URL fallida");
        const res = await fetch(signed.signedUrl);
        const buf = new Uint8Array(await res.arrayBuffer());

        const ext = (page.file_name.split(".").pop() || "").toLowerCase();
        if (ext === "pdf") {
          const src = await PDFDocument.load(buf);
          const copied = await pdf.copyPages(src, src.getPageIndices());
          copied.forEach((p) => pdf.addPage(p));
        } else {
          let img;
          try {
            img = ext === "png"
              ? await pdf.embedPng(buf)
              : await pdf.embedJpg(buf);
          } catch {
            // Fallback: re-codifica como JPG via canvas
            const dataUrl = await readFileAsDataUrl(new Blob([buf]));
            const im = await loadImage(dataUrl);
            const canvas = document.createElement("canvas");
            canvas.width = im.naturalWidth;
            canvas.height = im.naturalHeight;
            canvas.getContext("2d")!.drawImage(im, 0, 0);
            const jpgBlob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.9));
            const jpgBuf = new Uint8Array(await jpgBlob.arrayBuffer());
            img = await pdf.embedJpg(jpgBuf);
          }
          // Página A4 vertical, ajusta imagen manteniendo proporción
          const A4 = { w: 595.28, h: 841.89 };
          const margin = 24;
          const maxW = A4.w - margin * 2;
          const maxH = A4.h - margin * 2;
          const scale = Math.min(maxW / img.width, maxH / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          const pdfPage = pdf.addPage([A4.w, A4.h]);
          pdfPage.drawImage(img, {
            x: (A4.w - w) / 2,
            y: (A4.h - h) / 2,
            width: w,
            height: h,
          });
        }
      }
      const bytes = await pdf.save();
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const safe = (project.name || "Proyecto").replace(/\s+/g, "_");
      await downloadFile(blob, `Libro_Subcontratas_${safe}.pdf`);
      toast.success("Libro exportado");
    } catch (e: any) {
      console.error(e);
      toast.error("Error al exportar: " + (e?.message || ""));
    } finally {
      setExporting(false);
    }
  };

  /* ─── Generar acta de adhesión PDF ──────────────────────────── */

  const handleGenerateAct = async () => {
    if (!projectId || !user) return;
    if (!actWork.trim() || !actLocation.trim() || !actPromoter.trim() ||
        !actSubcontractor.trim() || !actTask.trim()) {
      toast.error("Completa Obra, Ubicación, Promotor, Subcontrata y Tarea");
      return;
    }
    setGeneratingAct(true);
    try {
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([595.28, 841.89]); // A4
      const helv = await pdf.embedFont(StandardFonts.Helvetica);
      const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

      const margin = 50;
      let y = 800;
      const text = (s: string, opts: { bold?: boolean; size?: number; x?: number; color?: any } = {}) => {
        const size = opts.size ?? 10;
        page.drawText(s, {
          x: opts.x ?? margin,
          y,
          size,
          font: opts.bold ? helvBold : helv,
          color: opts.color || rgb(0, 0, 0),
        });
      };
      const wrap = (s: string, maxWidth: number, font: any, size: number) => {
        const words = s.split(/\s+/);
        const lines: string[] = [];
        let cur = "";
        for (const w of words) {
          const test = cur ? cur + " " + w : w;
          if (font.widthOfTextAtSize(test, size) > maxWidth) {
            if (cur) lines.push(cur);
            cur = w;
          } else cur = test;
        }
        if (cur) lines.push(cur);
        return lines;
      };
      const drawWrapped = (s: string, font: any, size: number, lh = 14) => {
        const lines = wrap(s, 595.28 - margin * 2, font, size);
        for (const ln of lines) {
          page.drawText(ln, { x: margin, y, size, font, color: rgb(0, 0, 0) });
          y -= lh;
        }
      };

      // Título
      const title = "ACTA DE ADHESIÓN AL PLAN DE SEGURIDAD Y SALUD";
      const titleSize = 13;
      const tw = helvBold.widthOfTextAtSize(title, titleSize);
      page.drawText(title, {
        x: (595.28 - tw) / 2,
        y,
        size: titleSize,
        font: helvBold,
        color: rgb(0, 0, 0),
      });
      // Subrayado
      page.drawLine({
        start: { x: (595.28 - tw) / 2, y: y - 2 },
        end: { x: (595.28 + tw) / 2, y: y - 2 },
        thickness: 0.7,
        color: rgb(0, 0, 0),
      });
      y -= 30;

      // Datos de la obra
      text("DATOS DE LA OBRA", { bold: true, size: 11 }); y -= 18;
      text("Obra: ", { bold: true });
      page.drawText(actWork, { x: margin + helvBold.widthOfTextAtSize("Obra: ", 10), y, size: 10, font: helv });
      y -= 16;
      text("Ubicación: ", { bold: true });
      page.drawText(actLocation, { x: margin + helvBold.widthOfTextAtSize("Ubicación: ", 10), y, size: 10, font: helv });
      y -= 16;
      text("Promotor: ", { bold: true });
      page.drawText(actPromoter, { x: margin + helvBold.widthOfTextAtSize("Promotor: ", 10), y, size: 10, font: helv });
      y -= 26;

      // Cuerpo
      text("CUERPO DEL ACTA", { bold: true, size: 11 }); y -= 18;
      const contractorText = actContractor || "EL CONTRATISTA PRINCIPAL";
      const body1 =
        `${contractorText}, como contratista principal de la obra referenciada, ha entregado copia ` +
        `del plan de seguridad y salud redactado para la misma a la empresa subcontratista ` +
        `${actSubcontractor} en virtud de lo dispuesto en el artículo 15 del Real Decreto 1627/1997, ` +
        `de 24 de octubre, y en el artículo 7, Capítulo III del Real Decreto 171/2004, de 30 de enero, ` +
        `que desarrolla el artículo 24 de la Ley 31/1995, de 8 de noviembre, de Prevención de Riesgos ` +
        `Laborales, en materia de coordinación de actividades empresariales.`;
      drawWrapped(body1, helv, 10, 14);
      y -= 6;

      const repText = actRepresentative
        ? `D./Dña. ${actRepresentative} representante legal de la empresa ${actSubcontractor}`
        : `El representante legal de la empresa ${actSubcontractor}`;
      const body2 =
        `${repText} encargada de las tareas de ${actTask} por el presente asume dicho plan y las ` +
        `medidas preventivas a adoptar en el mismo especificadas, realizando traslado a sus ` +
        `trabajadores de su contenido.`;
      drawWrapped(body2, helv, 10, 14);
      y -= 6;

      drawWrapped("Y para que conste a los efectos oportunos.", helv, 10, 14);
      y -= 6;

      const today = new Date();
      const monthsEs = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
      ];
      const place = (actLocation.split(",")[1] || actLocation.split(",")[0] || "").trim();
      const dateLine = `En ${place || "________"}, a ${today.getDate()} de ${monthsEs[today.getMonth()]} de ${today.getFullYear()}.`;
      drawWrapped(dateLine, helv, 10, 14);
      y -= 24;

      // FIRMAS
      text("FIRMAS", { bold: true, size: 11 }); y -= 18;
      const boxW = (595.28 - margin * 2 - 20) / 2;
      const boxH = 110;
      const boxY = y - boxH;
      // Caja izquierda
      page.drawRectangle({
        x: margin, y: boxY, width: boxW, height: boxH,
        borderColor: rgb(0, 0, 0), borderWidth: 0.7,
      });
      // Caja derecha
      page.drawRectangle({
        x: margin + boxW + 20, y: boxY, width: boxW, height: boxH,
        borderColor: rgb(0, 0, 0), borderWidth: 0.7,
      });
      // Encabezados
      const labelL = "Por el Contratista Principal";
      const labelR = "Por la Empresa Subcontratista";
      page.drawText(labelL, {
        x: margin + (boxW - helvBold.widthOfTextAtSize(labelL, 10)) / 2,
        y: boxY + boxH - 16, size: 10, font: helvBold,
      });
      page.drawText(labelR, {
        x: margin + boxW + 20 + (boxW - helvBold.widthOfTextAtSize(labelR, 10)) / 2,
        y: boxY + boxH - 16, size: 10, font: helvBold,
      });
      // Nombres
      const nL = contractorText;
      const nR = actSubcontractor;
      page.drawText(nL, {
        x: margin + (boxW - helv.widthOfTextAtSize(nL, 9)) / 2,
        y: boxY + boxH - 30, size: 9, font: helv,
      });
      page.drawText(nR, {
        x: margin + boxW + 20 + (boxW - helv.widthOfTextAtSize(nR, 9)) / 2,
        y: boxY + boxH - 30, size: 9, font: helv,
      });
      // Línea de firma
      page.drawLine({
        start: { x: margin + 15, y: boxY + 18 },
        end: { x: margin + boxW - 15, y: boxY + 18 },
        thickness: 0.5, color: rgb(0.4, 0.4, 0.4),
      });
      page.drawLine({
        start: { x: margin + boxW + 20 + 15, y: boxY + 18 },
        end: { x: margin + boxW + 20 + boxW - 15, y: boxY + 18 },
        thickness: 0.5, color: rgb(0.4, 0.4, 0.4),
      });
      page.drawText("Firma", {
        x: margin + (boxW - helv.widthOfTextAtSize("Firma", 8)) / 2,
        y: boxY + 6, size: 8, font: helv, color: rgb(0.4, 0.4, 0.4),
      });
      page.drawText("Firma", {
        x: margin + boxW + 20 + (boxW - helv.widthOfTextAtSize("Firma", 8)) / 2,
        y: boxY + 6, size: 8, font: helv, color: rgb(0.4, 0.4, 0.4),
      });

      const bytes = await pdf.save();
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const safe = `${actSubcontractor}`.replace(/[^\w]+/g, "_").slice(0, 60);
      const fileName = `Acta_Adhesion_PSS_${safe}_${today.getTime()}.pdf`;

      // Subir al bucket
      const path = `${projectId}/subcontracting/acts/${fileName}`;
      const { error: upErr } = await supabase.storage.from("plans").upload(path, blob, {
        cacheControl: "3600", contentType: "application/pdf", upsert: false,
      });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase
        .from("subcontracting_adhesion_acts" as any)
        .insert({
          project_id: projectId,
          work_name: actWork.trim(),
          location: actLocation.trim(),
          promoter_name: actPromoter.trim(),
          contractor_name: actContractor.trim() || null,
          subcontractor_name: actSubcontractor.trim(),
          subcontractor_representative: actRepresentative.trim() || null,
          subcontractor_task: actTask.trim(),
          file_path: path,
          file_name: fileName,
          generated_by: user.id,
        } as any);
      if (insErr) throw insErr;

      await downloadFile(blob, fileName);
      toast.success("Acta generada");
      setShowActDialog(false);
      // Reset
      setActSubcontractor(""); setActRepresentative(""); setActTask("");
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error("Error al generar el acta: " + (e?.message || ""));
    } finally {
      setGeneratingAct(false);
    }
  };

  const openAct = async (act: any) => {
    if (!act.file_path) return;
    const { data, error } = await supabase.storage
      .from("plans")
      .createSignedUrl(act.file_path, 600);
    if (error || !data) { toast.error("No se pudo abrir el acta"); return; }
    const res = await fetch(data.signedUrl);
    const blob = await res.blob();
    await openFile(blob, act.file_name || "acta.pdf");
  };

  /* ─── Botón compuesto Galería / Cámara / Escaneo ────────────── */

  const SourceMenu = ({
    kind, busy, label,
  }: {
    kind: "first_sheet" | "entry_sheet"; busy: boolean; label: string;
  }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="lg"
          disabled={busy}
          className="gap-2 font-display text-xs uppercase tracking-wider"
        >
          {busy
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Subiendo…</>
            : <><Plus className="h-4 w-4" /> {label} <ChevronDown className="h-3 w-3 ml-1" /></>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => triggerSource("gallery", kind)}>
          <ImageIcon className="h-4 w-4 mr-2" /> Galería
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => triggerSource("camera", kind)}>
          <Camera className="h-4 w-4 mr-2" /> Cámara
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => triggerSource("scan", kind)}>
          <ScanLine className="h-4 w-4 mr-2" /> Escanear (B/N)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  /* ─── Render ────────────────────────────────────────────────── */

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto py-6 px-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/project/${projectId}`)}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-display font-bold tracking-tight truncate flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary shrink-0" />
              Libro de Subcontratas y Seguridad
            </h1>
            {project && (
              <p className="text-xs text-muted-foreground truncate">{project.name}</p>
            )}
          </div>
        </div>

        {/* Inputs ocultos (fallback web) */}
        <input
          ref={firstFileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            handleUploadFiles(e.target.files, "first_sheet");
            if (firstFileRef.current) firstFileRef.current.value = "";
          }}
        />
        <input
          ref={entryFileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            handleUploadFiles(e.target.files, "entry_sheet");
            if (entryFileRef.current) entryFileRef.current.value = "";
          }}
        />

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 bg-card border border-border rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {/* ───── BLOQUE 1: Libro de subcontratas (digitalización) ───── */}
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Digitalización del Libro Físico
                </h2>
                {pages.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportBook}
                    disabled={exporting}
                    className="gap-1.5 text-xs"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {exporting ? "Exportando…" : "Exportar libro de subcontratas"}
                  </Button>
                )}
              </div>

              {pages.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-border rounded-lg">
                  <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
                    Sube la primera hoja del Libro de Subcontratación con los datos del contratista.
                  </p>
                  {canWrite ? (
                    <SourceMenu
                      kind="first_sheet"
                      busy={uploadingFirst}
                      label="Primera hoja (datos contratista)"
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Solo Constructor, DEM o DO pueden añadir hojas.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {pages.map((p, i) => (
                      <div
                        key={p.id}
                        className="group relative border border-border rounded-lg overflow-hidden bg-card hover:shadow-md transition-all"
                      >
                        <div className="aspect-[3/4] flex items-center justify-center bg-muted/40 text-muted-foreground">
                          <FileText className="h-8 w-8" />
                          <span className="absolute top-1.5 left-1.5 text-[10px] font-display bg-background/90 px-1.5 py-0.5 rounded">
                            #{i + 1}
                          </span>
                          {p.kind === "first_sheet" && (
                            <span className="absolute top-1.5 right-1.5 text-[9px] font-display uppercase tracking-wider bg-primary/15 text-primary px-1.5 py-0.5 rounded">
                              1ª hoja
                            </span>
                          )}
                        </div>
                        <div className="p-2 space-y-1">
                          <p className="text-[10px] truncate text-muted-foreground" title={p.file_name}>
                            {p.file_name}
                          </p>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="flex-1 h-7 text-[10px] gap-1"
                              onClick={() => handlePreview(p)}
                            >
                              <Eye className="h-3 w-3" /> Ver
                            </Button>
                            {canWrite && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-[10px] text-destructive hover:text-destructive"
                                onClick={() => setDeleteTarget(p)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {canWrite && (
                    <div className="flex justify-center pt-2">
                      <SourceMenu
                        kind="entry_sheet"
                        busy={uploadingEntry}
                        label="Ficha del libro de subcontratación"
                      />
                    </div>
                  )}
                </>
              )}
            </section>

            {/* ───── BLOQUE 2: Acta de adhesión al PSS ───── */}
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Actas de Adhesión al Plan de Seguridad
                </h2>
                {canWrite && (
                  <Button
                    size="sm"
                    onClick={() => setShowActDialog(true)}
                    className="gap-1.5 text-xs font-display uppercase tracking-wider"
                  >
                    <FileSignature className="h-3.5 w-3.5" />
                    Crear acta de adhesión al plan
                  </Button>
                )}
              </div>

              {acts.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-border rounded-lg">
                  <FileSignature className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Aún no se ha generado ningún acta de adhesión.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {acts.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg hover:shadow-sm transition-all"
                    >
                      <FileSignature className="h-5 w-5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {a.subcontractor_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {a.subcontractor_task} · {new Date(a.created_at).toLocaleDateString("es-ES")}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs"
                        onClick={() => openAct(a)}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Abrir
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Preview dialog */}
      <Dialog
        open={!!previewPage}
        onOpenChange={(o) => { if (!o) { setPreviewPage(null); setPreviewUrl(null); } }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-base truncate">
              {previewPage?.file_name}
            </DialogTitle>
          </DialogHeader>
          {!previewUrl ? (
            <div className="h-64 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : previewPage?.file_name?.toLowerCase().endsWith(".pdf") ? (
            <iframe src={previewUrl} className="w-full h-[70vh] border rounded" title="preview" />
          ) : (
            <img src={previewUrl} alt={previewPage?.file_name} className="w-full h-auto rounded" />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta hoja?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la imagen y se reordenarán las páginas restantes. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePage}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Acta dialog */}
      <Dialog open={showActDialog} onOpenChange={setShowActDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-base">
              Acta de Adhesión al Plan de Seguridad
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                Obra *
              </Label>
              <Input value={actWork} onChange={(e) => setActWork(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                Ubicación *
              </Label>
              <Input value={actLocation} onChange={(e) => setActLocation(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                Promotor *
              </Label>
              <Input value={actPromoter} onChange={(e) => setActPromoter(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                Contratista principal
              </Label>
              <Input
                value={actContractor}
                onChange={(e) => setActContractor(e.target.value)}
                placeholder="Empresa contratista"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                Empresa subcontratada *
              </Label>
              <Input
                value={actSubcontractor}
                onChange={(e) => setActSubcontractor(e.target.value)}
                placeholder="Razón social"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                Representante legal
              </Label>
              <Input
                value={actRepresentative}
                onChange={(e) => setActRepresentative(e.target.value)}
                placeholder="Nombre y apellidos"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                Tarea de subcontrata *
              </Label>
              <Textarea
                value={actTask}
                onChange={(e) => setActTask(e.target.value)}
                placeholder="Ej. Cimentación y estructura"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setShowActDialog(false)}
              disabled={generatingAct}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleGenerateAct}
              disabled={generatingAct}
              className="gap-2 font-display text-xs uppercase tracking-wider"
            >
              {generatingAct
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando…</>
                : <><FileSignature className="h-4 w-4" /> Generar PDF</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default SubcontractingModule;