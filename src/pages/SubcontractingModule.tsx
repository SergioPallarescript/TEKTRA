import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { downloadFile, isNative } from "@/lib/nativeMedia";
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
  Trash2, FileSignature, ChevronDown, ChevronUp, Loader2,
  Camera as CameraIcon, Image as ImageIcon, FolderOpen,
} from "lucide-react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import DocumentPreview from "@/components/DocumentPreview";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

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

const A4_PORTRAIT: [number, number] = [595.28, 841.89];
const A4_LANDSCAPE: [number, number] = [841.89, 595.28];

const fitInside = (sourceW: number, sourceH: number, targetW: number, targetH: number) => {
  const scale = Math.min(targetW / sourceW, targetH / sourceH);
  return { width: sourceW * scale, height: sourceH * scale };
};

const canvasToBlob = (canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.92): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo procesar la página"))), type, quality);
  });

const uint8ToArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const appendImageToA4 = async (pdf: PDFDocument, bytes: Uint8Array, fileName: string) => {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  let img;
  try {
    img = ext === "png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    const dataUrl = await readFileAsDataUrl(new Blob([uint8ToArrayBuffer(bytes)]));
    const im = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = im.naturalWidth;
    canvas.height = im.naturalHeight;
    canvas.getContext("2d")!.drawImage(im, 0, 0);
    const jpgBlob = await canvasToBlob(canvas);
    img = await pdf.embedJpg(new Uint8Array(await jpgBlob.arrayBuffer()));
  }

  const pageSize = img.width >= img.height ? A4_LANDSCAPE : A4_PORTRAIT;
  const margin = 24;
  const fitted = fitInside(img.width, img.height, pageSize[0] - margin * 2, pageSize[1] - margin * 2);
  const outPage = pdf.addPage(pageSize);
  outPage.drawImage(img, {
    x: (pageSize[0] - fitted.width) / 2,
    y: (pageSize[1] - fitted.height) / 2,
    width: fitted.width,
    height: fitted.height,
  });
};

const appendPdfToA4 = async (pdf: PDFDocument, bytes: Uint8Array) => {
  const src = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  for (let i = 1; i <= src.numPages; i++) {
    const srcPage = await src.getPage(i);
    const viewport = srcPage.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await srcPage.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
    const blob = await canvasToBlob(canvas);
    const img = await pdf.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    const pageSize = viewport.width >= viewport.height ? A4_LANDSCAPE : A4_PORTRAIT;
    const margin = 24;
    const fitted = fitInside(img.width, img.height, pageSize[0] - margin * 2, pageSize[1] - margin * 2);
    const outPage = pdf.addPage(pageSize);
    outPage.drawImage(img, {
      x: (pageSize[0] - fitted.width) / 2,
      y: (pageSize[1] - fitted.height) / 2,
      width: fitted.width,
      height: fitted.height,
    });
  }
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

  // Inputs ocultos para fallback web
  const firstFileRef = useRef<HTMLInputElement>(null);
  const entryFileRef = useRef<HTMLInputElement>(null);

  // Preview inline expandible / borrado
  const [expandedPageId, setExpandedPageId] = useState<string | null>(null);
  const [pagePreviewUrls, setPagePreviewUrls] = useState<Record<string, string>>({});
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  // Borrado de actas
  const [deleteActTarget, setDeleteActTarget] = useState<any | null>(null);

  // Preview inline de actas
  const [expandedActId, setExpandedActId] = useState<string | null>(null);
  const [actPreviewUrls, setActPreviewUrls] = useState<Record<string, string>>({});
  const [loadingActPreviewId, setLoadingActPreviewId] = useState<string | null>(null);

  // Diálogo para nombrar la subcontrata tras subir una ficha
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [pendingName, setPendingName] = useState("");
  const [namingOpen, setNamingOpen] = useState(false);

  // Acta de adhesión
  const [showActDialog, setShowActDialog] = useState(false);
  const [actWork, setActWork] = useState("");
  const [actLocation, setActLocation] = useState("");
  const [actPromoter, setActPromoter] = useState("");
  const [actContractor, setActContractor] = useState("");
  const [actSubcontractor, setActSubcontractor] = useState("");
  const [actRepresentative, setActRepresentative] = useState("");
  const [actTask, setActTask] = useState("");
  const [actCity, setActCity] = useState("");
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
    setActCity((v) => {
      if (v) return v;
      const addr = project?.address || "";
      // Toma la última parte tras la última coma como localidad por defecto
      const parts = addr.split(",").map((s: string) => s.trim()).filter(Boolean);
      return parts.length > 1 ? parts[parts.length - 1] : "";
    });
    setActPromoter(
      (v) => v || promoter?.profiles?.full_name || promoter?.invited_email || "",
    );
    setActContractor(
      (v) => v || contractor?.profiles?.full_name || contractor?.invited_email || "",
    );
  }, [showActDialog, project, members]);

  /* ─── Subida de páginas ─────────────────────────────────────── */

  const uploadOneFile = async (
    file: File,
    kind: "first_sheet" | "entry_sheet",
    displayName?: string,
  ) => {
    if (!projectId || !user) return;
    const finalFile = file;
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
    const computedDisplay =
      displayName?.trim() ||
      (kind === "first_sheet" ? "Primera hoja (datos contratista)" : finalFile.name);
    const { error: insErr } = await supabase.from("subcontracting_pages" as any).insert({
      project_id: projectId,
      page_index: nextIndex,
      file_path: path,
      file_name: finalFile.name,
      display_name: computedDisplay,
      kind,
      uploaded_by: user.id,
    } as any);
    if (insErr) throw insErr;
  };

  const handleUploadFiles = async (
    files: FileList | File[] | null,
    kind: "first_sheet" | "entry_sheet",
    displayName?: string,
  ) => {
    if (!files || (files as any).length === 0) return;
    const arr = Array.from(files as any) as File[];
    const setBusy = kind === "first_sheet" ? setUploadingFirst : setUploadingEntry;
    setBusy(true);
    try {
      for (const f of arr) await uploadOneFile(f, kind, displayName);
      toast.success(arr.length === 1 ? "Hoja añadida" : `${arr.length} hojas añadidas`);
      await fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error("Error al subir: " + (e?.message || ""));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Para la primera hoja: abre directamente cámara/galería en nativo,
   * o el explorador en web.
   *
   * Para las fichas: SIEMPRE pide primero el nombre de la subcontrata y,
   * tras confirmarlo, lanza el selector. Así el flujo es idéntico en
   * web y nativo y evitamos errores silenciosos del plugin de cámara.
   */
  const triggerUpload = async (kind: "first_sheet" | "entry_sheet") => {
    if (kind === "entry_sheet") {
      // Pedir nombre primero, el archivo se elige tras "Continuar"
      setPendingFiles(null);
      setPendingName("");
      setNamingOpen(true);
      return;
    }

    const ref = kind === "first_sheet" ? firstFileRef : entryFileRef;
    if (isNative()) {
      try {
        const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
        const photo = await Camera.getPhoto({
          quality: 85,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Prompt, // muestra Cámara / Galería / Archivos
          promptLabelHeader: "Primera hoja",
          promptLabelPhoto: "Galería",
          promptLabelPicture: "Cámara",
          saveToGallery: false,
        });
        const uri = photo.webPath || photo.path;
        if (!uri) return;
        const res = await fetch(uri);
        const blob = await res.blob();
        const ext = photo.format || "jpg";
        const file = new File([blob], `hoja-${Date.now()}.${ext}`, {
          type: blob.type || `image/${ext}`,
        });
        await handleUploadFiles([file], "first_sheet");
      } catch (err: any) {
        if (!err?.message?.toLowerCase?.().includes("cancel")) {
          console.warn("[subcontracting] camera prompt", err);
          // Fallback: si la cámara nativa falla, abrimos el explorador web
          ref.current?.click();
        }
      }
      return;
    }
    // Web → explorador del SO directamente
    if (ref.current) ref.current.click();
  };

  /**
   * Tras confirmar el nombre de la subcontrata, pedimos el archivo.
   * Funciona en web (input file) y en nativo (cámara/galería con fallback).
   */
  const pickEntryFromCamera = async (mode: "camera" | "gallery") => {
    if (!pendingName.trim()) {
      toast.error("Indica un nombre para la subcontrata");
      return;
    }
    const name = pendingName.trim();
    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      // Permisos
      try {
        const perms = await Camera.checkPermissions();
        const needsCam = mode === "camera" && perms.camera !== "granted";
        const needsPhotos = mode === "gallery" && perms.photos !== "granted";
        if (needsCam || needsPhotos) {
          await Camera.requestPermissions({
            permissions: mode === "camera" ? ["camera"] : ["photos"],
          });
        }
      } catch { /* algunos dispositivos no exponen checkPermissions */ }
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: mode === "camera" ? CameraSource.Camera : CameraSource.Photos,
        saveToGallery: false,
      });
      const uri = photo.webPath || photo.path;
      if (!uri) return;
      const res = await fetch(uri);
      const blob = await res.blob();
      const ext = photo.format || "jpg";
      const file = new File([blob], `${name}-${Date.now()}.${ext}`, {
        type: blob.type || `image/${ext}`,
      });
      setNamingOpen(false);
      setPendingName("");
      setPendingFiles(null);
      await handleUploadFiles([file], "entry_sheet", name);
    } catch (err: any) {
      if (err?.message?.toLowerCase?.().includes("cancel")) return;
      console.warn("[subcontracting] entry capture error", err);
      toast.error("No se pudo abrir la cámara/galería. Prueba con 'Archivo'.");
    }
  };

  const pickEntryFromFiles = () => {
    if (!pendingName.trim()) {
      toast.error("Indica un nombre para la subcontrata");
      return;
    }
    // Dispara el input file. El nombre persiste en pendingName y se aplica en su onChange.
    entryFileRef.current?.click();
  };

  /* ─── Preview / borrado ─────────────────────────────────────── */

  const togglePagePreview = async (page: any) => {
    if (expandedPageId === page.id) {
      setExpandedPageId(null);
      return;
    }
    setExpandedPageId(page.id);
    if (pagePreviewUrls[page.id]) return;
    setLoadingPreviewId(page.id);
    try {
      const { data, error } = await supabase.storage
        .from("plans")
        .download(page.file_path);
      if (error || !data) {
        toast.error("No se pudo cargar la previsualización");
        return;
      }
      const url = URL.createObjectURL(data);
      setPagePreviewUrls((prev) => ({ ...prev, [page.id]: url }));
    } catch {
      toast.error("Error al cargar archivo");
    } finally {
      setLoadingPreviewId(null);
    }
  };

  const handleDownloadPage = async (page: any) => {
    const { data, error } = await supabase.storage.from("plans").download(page.file_path);
    if (error || !data) { toast.error("Error al descargar"); return; }
    await downloadFile(data, page.file_name || "hoja");
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
        if (ext === "pdf") await appendPdfToA4(pdf, buf);
        else await appendImageToA4(pdf, buf, page.file_name || "hoja.jpg");
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
        !actSubcontractor.trim() || !actTask.trim() || !actCity.trim()) {
      toast.error("Completa Obra, Ubicación, Localidad, Promotor, Subcontrata y Tarea");
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
      const place = actCity.trim();
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

  const toggleActPreview = async (act: any) => {
    if (expandedActId === act.id) {
      setExpandedActId(null);
      return;
    }
    setExpandedActId(act.id);
    if (actPreviewUrls[act.id]) return;
    setLoadingActPreviewId(act.id);
    try {
      const { data, error } = await supabase.storage
        .from("plans")
        .download(act.file_path);
      if (error || !data) {
        toast.error("No se pudo cargar la previsualización");
        return;
      }
      const url = URL.createObjectURL(data);
      setActPreviewUrls((prev) => ({ ...prev, [act.id]: url }));
    } catch {
      toast.error("Error al cargar el acta");
    } finally {
      setLoadingActPreviewId(null);
    }
  };

  const handleDownloadAct = async (act: any) => {
    const { data, error } = await supabase.storage.from("plans").download(act.file_path);
    if (error || !data) { toast.error("Error al descargar"); return; }
    await downloadFile(data, act.file_name || "acta.pdf");
  };

  const handleDeleteAct = async () => {
    if (!deleteActTarget) return;
    const { error: stErr } = await supabase.storage
      .from("plans")
      .remove([deleteActTarget.file_path]);
    if (stErr) console.warn("storage remove", stErr);
    const { error } = await supabase
      .from("subcontracting_adhesion_acts" as any)
      .delete()
      .eq("id", deleteActTarget.id);
    if (error) toast.error("Error al eliminar");
    else {
      toast.success("Acta eliminada");
      setDeleteActTarget(null);
      fetchData();
    }
  };

  /* ─── Botón compuesto de subida ─────────────────────────────── */

  const UploadButton = ({
    kind, busy, label,
  }: {
    kind: "first_sheet" | "entry_sheet"; busy: boolean; label: string;
  }) => (
    <Button
      size="lg"
      disabled={busy}
      onClick={() => triggerUpload(kind)}
      className="gap-2 font-display text-xs uppercase tracking-wider"
    >
      {busy
        ? <><Loader2 className="h-4 w-4 animate-spin" /> Subiendo…</>
        : <><Plus className="h-4 w-4" /> {label}</>}
    </Button>
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
            <h1 className="text-base sm:text-xl font-display font-bold tracking-tight flex items-center gap-2 min-w-0">
              <ClipboardList className="h-5 w-5 text-primary shrink-0" />
              <span className="truncate min-w-0">Libro de Subcontratas y Seguridad</span>
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
          className="hidden"
          onChange={(e) => {
            const filesList = e.target.files;
            if (!filesList || filesList.length === 0) {
              if (entryFileRef.current) entryFileRef.current.value = "";
              return;
            }
            // Capturamos la lista ANTES de limpiar el value (FileList se desreferencia)
            const filesArr = Array.from(filesList);
            if (entryFileRef.current) entryFileRef.current.value = "";
            const name = pendingName.trim();
            if (!name) {
              toast.error("Indica un nombre para la subcontrata");
              return;
            }
            // Cierra el diálogo de nombre y sube el archivo con ese nombre
            setNamingOpen(false);
            setPendingName("");
            setPendingFiles(null);
            handleUploadFiles(filesArr, "entry_sheet", name);
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
            <section className="space-y-4" data-tour="subcontracting-digital">
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
                    data-tour="subcontracting-export"
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
                    <UploadButton
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
                  <div className="space-y-2">
                    {pages.map((p, i) => {
                      const label =
                        p.display_name ||
                        (p.kind === "first_sheet"
                          ? "Primera hoja (datos contratista)"
                          : p.file_name);
                      const expanded = expandedPageId === p.id;
                      return (
                        <div
                          key={p.id}
                          className={`bg-card border rounded-lg animate-fade-in ${p.kind === "first_sheet" ? "border-foreground/20" : "border-border"}`}
                          style={{ animationDelay: `${i * 40}ms` }}
                        >
                          <div
                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-secondary/30 transition-colors rounded-lg gap-3"
                            onClick={() => togglePagePreview(p)}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="font-display text-xs font-bold px-2 py-1 rounded bg-secondary text-muted-foreground shrink-0">
                                #{i + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate" title={label}>{label}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {p.kind === "first_sheet" ? "1ª hoja · " : "Ficha · "}
                                  {new Date(p.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDownloadPage(p); }} title="Descargar">
                                <Download className="h-4 w-4" />
                              </Button>
                              {canWrite && (
                                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }} title="Eliminar">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                              {expanded
                                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                            </div>
                          </div>
                          {expanded && (
                            <div className="px-4 pb-4 border-t border-border pt-3">
                              {loadingPreviewId === p.id ? (
                                <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando previsualización...
                                </div>
                              ) : pagePreviewUrls[p.id] ? (
                                <DocumentPreview url={pagePreviewUrls[p.id]} fileName={p.file_name} />
                              ) : (
                                <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                                  No se pudo cargar la previsualización
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {canWrite && (
                    <div className="flex justify-center pt-2">
                      <UploadButton
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
            <section className="space-y-4" data-tour="subcontracting-acts">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Actas de Adhesión al Plan de Seguridad
                </h2>
                {canWrite && (
                  <Button
                    size="sm"
                    onClick={() => setShowActDialog(true)}
                    className="gap-1.5 text-xs font-display uppercase tracking-wider"
                    data-tour="subcontracting-create-act"
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
                  {acts.map((a) => {
                    const expanded = expandedActId === a.id;
                    return (
                      <div
                        key={a.id}
                        className="bg-card border border-border rounded-lg animate-fade-in"
                      >
                        <div
                          className="p-3 flex items-center gap-3 cursor-pointer hover:bg-secondary/30 transition-colors rounded-lg"
                          onClick={() => toggleActPreview(a)}
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
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDownloadAct(a); }} title="Descargar">
                              <Download className="h-4 w-4" />
                            </Button>
                            {canWrite && (
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDeleteActTarget(a); }} title="Eliminar">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                            {expanded
                              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </div>
                        {expanded && (
                          <div className="px-4 pb-4 border-t border-border pt-3">
                            {loadingActPreviewId === a.id ? (
                              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando previsualización...
                              </div>
                            ) : actPreviewUrls[a.id] ? (
                              <DocumentPreview url={actPreviewUrls[a.id]} fileName={a.file_name || "acta.pdf"} />
                            ) : (
                              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                                No se pudo cargar la previsualización
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Diálogo: nombre de la subcontrata para una nueva ficha */}
      <Dialog open={namingOpen} onOpenChange={(o) => { if (!o) { setNamingOpen(false); setPendingFiles(null); setPendingName(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-base">Nombre de la subcontrata</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
              Nombre que aparecerá en el listado
            </Label>
            <Input
              autoFocus
              value={pendingName}
              onChange={(e) => setPendingName(e.target.value)}
              placeholder="Ej. Estructuras García S.L."
            />
            <p className="text-[11px] text-muted-foreground pt-1">
              Tras pulsar “Continuar” podrás seleccionar la foto o PDF de la ficha.
            </p>
          </div>
          <DialogFooter className="mt-4 gap-2 sm:space-x-0">
            <Button
              variant="outline"
              onClick={() => { setNamingOpen(false); setPendingFiles(null); setPendingName(""); }}
              disabled={uploadingEntry}
            >
              Cancelar
            </Button>
            {isNative() ? (
              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
                <Button
                  variant="outline"
                  onClick={() => pickEntryFromCamera("camera")}
                  disabled={uploadingEntry || !pendingName.trim()}
                  className="w-full gap-2 font-display text-xs uppercase tracking-wider"
                >
                  <CameraIcon className="h-4 w-4" /> Cámara
                </Button>
                <Button
                  variant="outline"
                  onClick={() => pickEntryFromCamera("gallery")}
                  disabled={uploadingEntry || !pendingName.trim()}
                  className="w-full gap-2 font-display text-xs uppercase tracking-wider"
                >
                  <ImageIcon className="h-4 w-4" /> Galería
                </Button>
                <Button
                  onClick={pickEntryFromFiles}
                  disabled={uploadingEntry || !pendingName.trim()}
                  className="w-full gap-2 font-display text-xs uppercase tracking-wider"
                >
                  {uploadingEntry
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Subiendo…</>
                    : <><FolderOpen className="h-4 w-4" /> Archivo</>}
                </Button>
              </div>
            ) : (
              <Button
                onClick={pickEntryFromFiles}
                disabled={uploadingEntry || !pendingName.trim()}
                className="gap-2 font-display text-xs uppercase tracking-wider"
              >
                {uploadingEntry
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Subiendo…</>
                  : <>Continuar</>}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación: borrar acta */}
      <AlertDialog open={!!deleteActTarget} onOpenChange={(o) => { if (!o) setDeleteActTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este acta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el PDF generado de forma permanente. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAct}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                Localidad *
              </Label>
              <Input
                value={actCity}
                onChange={(e) => setActCity(e.target.value)}
                placeholder="Ej. Chipiona"
              />
              <p className="text-[11px] text-muted-foreground">
                Aparecerá en la fórmula final del acta: “En {`{Localidad}`}, a {`{fecha actual}`}.”
              </p>
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