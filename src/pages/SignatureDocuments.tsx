import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import { ArrowLeft, CheckCircle2, Download, ExternalLink, FileSignature, Loader2, PenSquare, Send, Trash2, Upload, RefreshCw, Plus, X, UserPlus, ZoomIn, ZoomOut, RotateCw, Eye, FolderArchive, ScanLine } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import FiscalDataModal from "@/components/FiscalDataModal";
import SignatureCanvas, { type SignatureCanvasHandle } from "@/components/SignatureCanvas";
import CertificateSignature, { type CertSignMetadata } from "@/components/CertificateSignature";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjectRole } from "@/hooks/useProjectRole";
import { sanitizeFileName, uploadFileWithFallback } from "@/lib/storage";
import { toast } from "sonner";
import { notifyUser } from "@/lib/notifications";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import DocumentScanner from "@/components/DocumentScanner";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

type SignatureDocument = {
  id: string;
  project_id: string;
  sender_id: string;
  recipient_id: string;
  title: string;
  original_file_name: string;
  original_file_path: string;
  signed_file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  status: "pending" | "signed";
  validation_hash: string | null;
  signed_at: string | null;
  created_at: string;
  is_info_only?: boolean;
};

type DocRecipient = {
  id: string;
  document_id: string;
  recipient_id: string;
  status: string;
  signed_at: string | null;
  validation_hash: string | null;
  signature_type: string | null;
  viewed_at?: string | null;
  viewed_by?: string | null;
};

const SignatureDocuments = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { projectRole } = useProjectRole(projectId);
  const signatureRef = useRef<SignatureCanvasHandle | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const [documents, setDocuments] = useState<SignatureDocument[]>([]);
  const [docRecipients, setDocRecipients] = useState<DocRecipient[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<SignatureDocument | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "sent" | "archive">("pending");
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfPages, setPdfPages] = useState<HTMLCanvasElement[]>([]);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [signing, setSigning] = useState(false);
  const [title, setTitle] = useState("");
  const [recipientIds, setRecipientIds] = useState<string[]>([""]);
  const [file, setFile] = useState<File | null>(null);
  const [isInfoOnly, setIsInfoOnly] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SignatureDocument | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<SignatureDocument | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [fiscalModalOpen, setFiscalModalOpen] = useState(false);
  const [fiscalData, setFiscalData] = useState<{ full_name: string; dni_cif: string } | null>(null);
  const [signMethod, setSignMethod] = useState<string>(() => {
    const saved = localStorage.getItem("tektra_sign_method");
    return saved === "autofirma" ? "certificate" : (saved || "certificate");
  });
  const [originalPdfBuffer, setOriginalPdfBuffer] = useState<ArrayBuffer | null>(null);

  const fetchDocuments = async () => {
    if (!user) return;
    const { data } = await (supabase.from("signature_documents" as any) as any)
      .select("*")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    
    const { data: recipientRows } = await (supabase.from("signature_document_recipients" as any) as any)
      .select("*")
      .eq("recipient_id", user.id);

    if (recipientRows && recipientRows.length > 0) {
      const extraDocIds = recipientRows.map((r: any) => r.document_id).filter((id: string) => !(data || []).some((d: any) => d.id === id));
      if (extraDocIds.length > 0) {
        const { data: extraDocs } = await (supabase.from("signature_documents" as any) as any)
          .select("*")
          .in("id", extraDocIds);
        if (extraDocs) data?.push(...extraDocs);
      }
    }

    setDocuments((data || []) as SignatureDocument[]);
    setDocRecipients((recipientRows || []) as DocRecipient[]);
  };

  const fetchAllRecipients = async (docIds: string[]) => {
    if (docIds.length === 0) return;
    const { data } = await (supabase.from("signature_document_recipients" as any) as any)
      .select("*")
      .in("document_id", docIds);
    setDocRecipients((data || []) as DocRecipient[]);
  };

  useEffect(() => {
    const load = async () => {
      if (!projectId || !user) return;
      const [{ data: memberRows }] = await Promise.all([
        supabase.from("project_members").select("user_id, role, invited_email").eq("project_id", projectId).eq("status", "accepted"),
        fetchDocuments(),
      ]);
      const userIds = (memberRows || []).map((m: any) => m.user_id).filter(Boolean);
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds)
        : { data: [] };
      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      setMembers(
        (memberRows || [])
          .filter((m: any) => m.user_id && m.user_id !== user.id)
          .map((m: any) => ({ ...m, profile: profileMap.get(m.user_id) || null })),
      );
      setLoading(false);
    };
    void load();
  }, [projectId, user]);

  useEffect(() => {
    if (documents.length > 0) {
      fetchAllRecipients(documents.map(d => d.id));
    }
  }, [documents.length]);

  const renderPdf = useCallback(async (url: string) => {
    try {
      const loadingTask = pdfjsLib.getDocument(url);
      const pdf = await loadingTask.promise;
      const pages: HTMLCanvasElement[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const scale = 1.5;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        pages.push(canvas);
      }
      setPdfPages(pages);
    } catch {
      setPdfPages([]);
    }
  }, []);

  // Record read receipt when opening an info-only document
  const recordViewReceipt = useCallback(async (doc: SignatureDocument) => {
    if (!user || !doc.is_info_only) return;
    const myRecipientRow = docRecipients.find(r => r.document_id === doc.id && r.recipient_id === user.id);
    if (myRecipientRow && !myRecipientRow.viewed_at) {
      await (supabase.from("signature_document_recipients" as any) as any)
        .update({ viewed_at: new Date().toISOString(), viewed_by: user.id })
        .eq("id", myRecipientRow.id);
      // Refresh recipients
      fetchAllRecipients(documents.map(d => d.id));
    }
  }, [user, docRecipients, documents]);

  useEffect(() => {
    if (!selectedDocument) {
      setPdfBlobUrl((c) => { if (c) URL.revokeObjectURL(c); return null; });
      setPdfPages([]);
      setOriginalPdfBuffer(null);
      return;
    }
    const loadPreview = async () => {
      const targetPath = selectedDocument.signed_file_path || selectedDocument.original_file_path;
      const { data, error } = await supabase.storage.from("plans").download(targetPath);
      if (error || !data) { toast.error("No se pudo abrir el PDF"); return; }
      if (selectedDocument.status === "pending" && !selectedDocument.is_info_only) {
        setOriginalPdfBuffer(await data.arrayBuffer());
      }
      const url = URL.createObjectURL(data);
      setPdfBlobUrl((c) => { if (c) URL.revokeObjectURL(c); return url; });
      await renderPdf(url);
      // Record view receipt for info-only docs
      recordViewReceipt(selectedDocument);
    };
    void loadPreview();
    return () => { setPdfBlobUrl((c) => { if (c) URL.revokeObjectURL(c); return null; }); };
  }, [selectedDocument, renderPdf]);

  useEffect(() => {
    setPreviewZoom(100);
  }, [selectedDocument?.id]);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container || pdfPages.length === 0) return;
    container.innerHTML = "";
    pdfPages.forEach((canvas) => {
      canvas.style.width = `${previewZoom}%`;
      canvas.style.height = "auto";
      canvas.style.maxWidth = "none";
      canvas.style.display = "block";
      canvas.style.transition = "width 0.2s ease";
      canvas.style.marginLeft = "auto";
      canvas.style.marginRight = "auto";
      canvas.style.marginBottom = "8px";
      container.appendChild(canvas);
    });
  }, [pdfPages, previewZoom]);

  const userNeedsToSign = (doc: SignatureDocument) => {
    if (doc.is_info_only) return false;
    if (doc.recipient_id === user?.id && doc.status === "pending") return true;
    const myRecipientRow = docRecipients.find(r => r.document_id === doc.id && r.recipient_id === user?.id);
    return myRecipientRow?.status === "pending";
  };

  // Documents needing signature action
  const pendingDocuments = useMemo(
    () => documents.filter((d) => !d.is_info_only && userNeedsToSign(d)),
    [documents, user?.id, docRecipients],
  );

  // Sent + completed (non-info-only)
  const sentAndCompletedDocuments = useMemo(
    () => documents.filter((d) => !d.is_info_only && (d.sender_id === user?.id || d.status === "signed" || (!userNeedsToSign(d) && d.recipient_id !== user?.id))),
    [documents, user?.id, docRecipients],
  );

  // Archive / Mi Carpeta — info-only documents
  const archiveDocuments = useMemo(
    () => documents.filter((d) => d.is_info_only),
    [documents],
  );

  const activeDocuments = activeTab === "pending" ? pendingDocuments : activeTab === "sent" ? sentAndCompletedDocuments : archiveDocuments;

  // Multi-recipient helpers
  const addRecipient = () => {
    if (recipientIds.length >= 4) { toast.error("Máximo 4 destinatarios"); return; }
    setRecipientIds([...recipientIds, ""]);
  };
  const removeRecipient = (idx: number) => {
    if (recipientIds.length <= 1) return;
    setRecipientIds(recipientIds.filter((_, i) => i !== idx));
  };
  const updateRecipient = (idx: number, value: string) => {
    const updated = [...recipientIds];
    updated[idx] = value;
    setRecipientIds(updated);
  };

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    const validRecipients = recipientIds.filter(id => id.trim() !== "");
    if (!projectId || !user || !file || validRecipients.length === 0 || !title.trim()) return;
    setCreating(true);
    try {
      const safeName = sanitizeFileName(file.name);
      const path = `signature-documents/${projectId}/original/${Date.now()}_${safeName}`;
      const { error: uploadError } = await uploadFileWithFallback({ path, file });
      if (uploadError) throw uploadError;

      const primaryRecipient = validRecipients[0];
      const docStatus = isInfoOnly ? "signed" : "pending"; // info-only docs don't need signing
      const { data: insertedDoc, error: insertError } = await (supabase.from("signature_documents" as any) as any).insert({
        project_id: projectId, sender_id: user.id, recipient_id: primaryRecipient,
        title: title.trim(), original_file_name: file.name, original_file_path: path,
        file_size: file.size, mime_type: file.type || "application/pdf",
        is_info_only: isInfoOnly, status: docStatus,
      }).select().single();
      if (insertError) throw insertError;

      // Insert all recipients into the junction table
      const allRecipientRows = validRecipients.map(rid => ({
        document_id: insertedDoc.id,
        recipient_id: rid,
        status: isInfoOnly ? "signed" : "pending",
      }));
      await (supabase.from("signature_document_recipients" as any) as any).insert(allRecipientRows);

      await supabase.from("audit_logs").insert({
        user_id: user.id, project_id: projectId,
        action: isInfoOnly ? "document_sent_info_only" : "signature_document_created",
        details: { title: title.trim(), recipients: validRecipients, file_name: file.name, is_info_only: isInfoOnly },
      });

      // Notify all recipients
      for (const rid of validRecipients) {
        await notifyUser({
          userId: rid,
          projectId: projectId!,
          title: isInfoOnly ? "📄 Nuevo documento de registro" : "Firma pendiente",
          message: isInfoOnly
            ? `Has recibido un nuevo documento de registro en tu carpeta: "${title.trim()}"`
            : `Tienes un nuevo documento para firmar: "${title.trim()}"`,
          type: isInfoOnly ? "info" : "signature",
        });
      }

      setTitle(""); setRecipientIds([""]); setFile(null); setIsInfoOnly(false);
      toast.success(isInfoOnly ? "Documento enviado a carpeta de destinatarios" : "Documento enviado para firma");
      await fetchDocuments();
      setActiveTab(isInfoOnly ? "archive" : "sent");
    } catch (err: any) {
      toast.error(err?.message || "No se pudo enviar el documento");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !user) return;
    try {
      // 1. Delete all recipient rows first (FK constraint)
      const { error: recErr } = await (supabase.from("signature_document_recipients" as any) as any)
        .delete()
        .eq("document_id", deleteTarget.id);
      if (recErr) console.warn("Error deleting recipients:", recErr);
      // 2. Remove file from storage
      await supabase.storage.from("plans").remove([deleteTarget.original_file_path]);
      if (deleteTarget.signed_file_path) {
        await supabase.storage.from("plans").remove([deleteTarget.signed_file_path]);
      }
      // 3. Delete the document record
      const { error: docErr } = await (supabase.from("signature_documents" as any) as any)
        .delete()
        .eq("id", deleteTarget.id)
        .eq("sender_id", user.id);
      if (docErr) throw docErr;
      await supabase.from("audit_logs").insert({
        user_id: user.id, project_id: projectId,
        action: "signature_document_deleted", details: { document_id: deleteTarget.id, title: deleteTarget.title },
      });
      toast.success("Documento eliminado completamente");
      if (selectedDocument?.id === deleteTarget.id) setSelectedDocument(null);
      // Remove from local state immediately
      setDocuments(prev => prev.filter(d => d.id !== deleteTarget.id));
      setDocRecipients(prev => prev.filter(r => r.document_id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) { toast.error(err?.message || "Error al eliminar"); }
  };

  const handleReplace = async () => {
    if (!replaceTarget || !replaceFile || !user) return;
    setReplacing(true);
    try {
      await supabase.storage.from("plans").remove([replaceTarget.original_file_path]);
      const safeName = sanitizeFileName(replaceFile.name);
      const newPath = `signature-documents/${projectId}/original/${Date.now()}_${safeName}`;
      const { error: uploadError } = await uploadFileWithFallback({ path: newPath, file: replaceFile });
      if (uploadError) throw uploadError;
      await (supabase.from("signature_documents" as any) as any)
        .update({ original_file_path: newPath, original_file_name: replaceFile.name, file_size: replaceFile.size })
        .eq("id", replaceTarget.id);
      toast.success("Documento sustituido");
      setReplaceTarget(null); setReplaceFile(null);
      await fetchDocuments();
      if (selectedDocument?.id === replaceTarget.id) setSelectedDocument(null);
    } catch { toast.error("Error al sustituir"); }
    finally { setReplacing(false); }
  };

  const initiateSign = async () => {
    if (!user) return;
    const { data: prof } = await supabase.from("profiles").select("full_name, dni_cif").eq("user_id", user.id).single();
    if (prof?.dni_cif) {
      setFiscalData({ full_name: prof.full_name || "", dni_cif: (prof as any).dni_cif || "" });
      handleSignDocument(prof.full_name || "", (prof as any).dni_cif || "");
    } else {
      setFiscalModalOpen(true);
    }
  };

  const handleFiscalComplete = (data: { full_name: string; dni_cif: string; fiscal_address: string }) => {
    setFiscalModalOpen(false);
    setFiscalData({ full_name: data.full_name, dni_cif: data.dni_cif });
    handleSignDocument(data.full_name, data.dni_cif);
  };

  const handleSignDocument = async (signerName: string, signerDni: string) => {
    if (!projectId || !selectedDocument || !pdfBlobUrl || !signatureRef.current) return;
    if (signatureRef.current.isEmpty()) { toast.error("Debes dibujar una firma"); return; }
    setSigning(true);
    try {
      const signatureDataUrl = signatureRef.current.toDataUrl();
      if (!signatureDataUrl) throw new Error("Firma no válida");

      let geo = "";
      try {
        const pos: GeolocationPosition = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }));
        geo = `${pos.coords.latitude},${pos.coords.longitude}`;
      } catch {}

      const { data: originalFile } = await supabase.storage.from("plans").download(selectedDocument.original_file_path);
      if (!originalFile) throw new Error("No se pudo descargar el PDF original");
      const originalBytes = await originalFile.arrayBuffer();
      const signedAt = new Date().toISOString();
      const hashSource = `${selectedDocument.id}:${signedAt}:${user?.id}:${signatureDataUrl}`;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hashSource));
      const validationHash = Array.from(new Uint8Array(digest)).map((v) => v.toString(16).padStart(2, "0")).join("").slice(0, 32).toUpperCase();

      const pdfDoc = await PDFDocument.load(originalBytes);
      const lastPage = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
      const signatureImage = await pdfDoc.embedPng(signatureDataUrl);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boxX = 36, boxY = 36;

      lastPage.drawRectangle({ x: boxX, y: boxY, width: 250, height: 120, color: rgb(0.97, 0.97, 0.97), borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1 });
      lastPage.drawText("Firma digital validada — TEKTRA", { x: boxX + 12, y: boxY + 102, size: 9, font });
      lastPage.drawText(signerName, { x: boxX + 12, y: boxY + 90, size: 8, font, color: rgb(0.1, 0.1, 0.1) });
      lastPage.drawText(`DNI/CIF: ${signerDni}`, { x: boxX + 12, y: boxY + 78, size: 8, font, color: rgb(0.1, 0.1, 0.1) });
      lastPage.drawText(`Hash: ${validationHash}`, { x: boxX + 12, y: boxY + 66, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
      lastPage.drawText(`Fecha: ${new Date(signedAt).toLocaleString("es-ES")}`, { x: boxX + 12, y: boxY + 56, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
      lastPage.drawText(`Geo: ${geo || "N/A"}`, { x: boxX + 12, y: boxY + 46, size: 6, font, color: rgb(0.5, 0.5, 0.5) });
      const sigW = 160, sigH = Math.min((signatureImage.height / signatureImage.width) * sigW, 32);
      lastPage.drawImage(signatureImage, { x: boxX + 12, y: boxY + 6, width: sigW, height: sigH });

      const signedBytes = await pdfDoc.save();
      const signedBlob = new Blob([Uint8Array.from(signedBytes)], { type: "application/pdf" });
      const signedFile = new File([signedBlob], `firmado_${sanitizeFileName(selectedDocument.original_file_name)}`, { type: "application/pdf" });
      const signedPath = `signature-documents/${projectId}/signed/${selectedDocument.id}_${Date.now()}.pdf`;
      const { error: uploadError } = await uploadFileWithFallback({ path: signedPath, file: signedFile });
      if (uploadError) throw uploadError;

      if (selectedDocument.recipient_id === user?.id) {
        await (supabase.from("signature_documents" as any) as any)
          .update({ status: "signed", signed_file_path: signedPath, signed_at: signedAt, validation_hash: validationHash, signature_type: "manual" })
          .eq("id", selectedDocument.id);
      }

      await (supabase.from("signature_document_recipients" as any) as any)
        .update({ status: "signed", signed_at: signedAt, validation_hash: validationHash, signature_type: "manual", signed_file_path: signedPath })
        .eq("document_id", selectedDocument.id)
        .eq("recipient_id", user?.id);

      await supabase.from("audit_logs").insert({
        user_id: user?.id, project_id: projectId,
        action: "signature_document_signed",
        details: { document_id: selectedDocument.id, hash: validationHash, geo_location: geo, signer_name: signerName, signer_dni: signerDni },
        geo_location: geo,
      });

      signatureRef.current.clear();
      toast.success("Documento firmado y validado");
      await fetchDocuments();
      setSelectedDocument(null);
    } catch (err: any) {
      toast.error(err?.message || "No se pudo firmar el documento");
    } finally {
      setSigning(false);
    }
  };

  const handleCertSign = useCallback(async (signedPdfBytes: Uint8Array, metadata: CertSignMetadata) => {
    if (!projectId || !selectedDocument || !user) return;
    const signedAt = new Date().toISOString();
    const signedBlob = new Blob([new Uint8Array(Array.from(signedPdfBytes))], { type: "application/pdf" });
    const signedFile = new File([signedBlob], `firmado_${sanitizeFileName(selectedDocument.original_file_name)}`, { type: "application/pdf" });
    const signedPath = `signature-documents/${projectId}/signed/${selectedDocument.id}_${Date.now()}.pdf`;
    const { error: uploadError } = await uploadFileWithFallback({ path: signedPath, file: signedFile });
    if (uploadError) throw uploadError;

    if (selectedDocument.recipient_id === user.id) {
      await (supabase.from("signature_documents" as any) as any)
        .update({
          status: "signed", signed_file_path: signedPath, signed_at: signedAt,
          validation_hash: metadata.validationHash, signature_type: "p12",
          certificate_cn: metadata.certificateCN, certificate_serial: metadata.certificateSerial,
        })
        .eq("id", selectedDocument.id);
    }

    await (supabase.from("signature_document_recipients" as any) as any)
      .update({
        status: "signed", signed_at: signedAt, validation_hash: metadata.validationHash,
        signature_type: "p12", certificate_cn: metadata.certificateCN, certificate_serial: metadata.certificateSerial,
        signed_file_path: signedPath,
      })
      .eq("document_id", selectedDocument.id)
      .eq("recipient_id", user.id);

    await supabase.from("audit_logs").insert({
      user_id: user.id, project_id: projectId,
      action: "signature_document_signed_p12",
      details: {
        document_id: selectedDocument.id, hash: metadata.validationHash,
        geo_location: metadata.geo, signer_name: metadata.signerName, signer_dni: metadata.signerDni,
        certificate_cn: metadata.certificateCN, certificate_serial: metadata.certificateSerial,
      },
      geo_location: metadata.geo,
    });

    const downloadUrl = URL.createObjectURL(signedBlob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `${selectedDocument.original_file_name.replace(/\.pdf$/i, "")}_FIRMADO.pdf`;
    a.click();
    URL.revokeObjectURL(downloadUrl);

    toast.success("Documento firmado con certificado digital");
    await fetchDocuments();
    setSelectedDocument(null);
  }, [projectId, selectedDocument, user]);

  const handleSignMethodChange = (method: string) => {
    setSignMethod(method);
    localStorage.setItem("tektra_sign_method", method);
  };

  const handleDownload = () => {
    if (!pdfBlobUrl || !selectedDocument) return;
    const a = document.createElement("a");
    a.href = pdfBlobUrl;
    a.download = selectedDocument.signed_file_path ? `firmado_${selectedDocument.original_file_name}` : selectedDocument.original_file_name;
    a.click();
  };

  const handleOpenExternal = () => {
    if (!pdfBlobUrl) return;
    window.open(pdfBlobUrl, "_blank");
  };

  const getDocSigningStatus = (doc: SignatureDocument) => {
    const recipients = docRecipients.filter(r => r.document_id === doc.id);
    if (recipients.length === 0) return null;
    const signed = recipients.filter(r => r.status === "signed").length;
    return { signed, total: recipients.length };
  };

  const getMemberName = (userId: string) => {
    const m = members.find((m: any) => m.user_id === userId);
    return m?.profile?.full_name || m?.invited_email || userId;
  };

  // Get view status for info-only docs
  const getViewStatus = (doc: SignatureDocument) => {
    const recipients = docRecipients.filter(r => r.document_id === doc.id);
    return recipients.map(r => ({
      ...r,
      name: getMemberName(r.recipient_id),
    }));
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-lg border border-border bg-card animate-pulse" />)}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">Documentos y Firmas</p>
        </div>

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* Left panel */}
          <div className="space-y-4 min-w-0">
            <div className="rounded-lg border border-border bg-card p-4">
              <h1 className="font-display text-2xl font-bold tracking-tighter">Documentos y Firmas</h1>
              <p className="mt-1 text-sm text-muted-foreground">Envío, registro y firma legal con trazabilidad.</p>
            </div>

            <form data-tour="send-signature" onSubmit={handleCreateDocument} className="rounded-lg border border-border bg-card p-4 space-y-4">
              <div data-tour="sig-title" className="space-y-2">
                <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Título</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Acta de recepción parcial" required />
              </div>
              <div data-tour="sig-recipient" className="space-y-2">
                <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Destinatario(s)</Label>
                {recipientIds.map((rid, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select value={rid} onChange={(e) => updateRecipient(idx, e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" required>
                      <option value="">Selecciona agente</option>
                      {members.filter((m: any) => !recipientIds.includes(m.user_id) || m.user_id === rid).map((m: any) => (
                        <option key={m.user_id} value={m.user_id}>{m.profile?.full_name || m.invited_email || m.user_id} ({m.role})</option>
                      ))}
                    </select>
                    {recipientIds.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeRecipient(idx)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                {recipientIds.length < 4 && (
                  <Button type="button" variant="outline" size="sm" className="gap-1 text-xs w-full" onClick={addRecipient}>
                    <UserPlus className="h-3.5 w-3.5" /> Añadir destinatario ({recipientIds.length}/4)
                  </Button>
                )}
              </div>

              {/* Info-only switch */}
              <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/20 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-display uppercase tracking-wider text-foreground">Solo Envío/Registro</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Sin firma — el documento irá a «Archivo / Mi Carpeta»</p>
                </div>
                <Switch checked={isInfoOnly} onCheckedChange={setIsInfoOnly} />
              </div>

              <div data-tour="sig-file" className="space-y-2">
                <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">PDF / Documento</Label>
                <div className="flex gap-2">
                  <Input type="file" accept="application/pdf,.pdf,.jpg,.jpeg,.png" className="flex-1" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  <Button type="button" variant="outline" size="icon" className="shrink-0 h-10 w-10" onClick={() => setScannerOpen(true)} title="Escanear documento">
                    <ScanLine className="h-4 w-4" />
                  </Button>
                </div>
                {file && <p className="text-[10px] text-muted-foreground truncate">{file.name}</p>}
              </div>
              <Button type="submit" className="w-full gap-2 font-display text-xs uppercase tracking-wider" disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : isInfoOnly ? <FolderArchive className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                {creating ? "Enviando..." : isInfoOnly ? `Enviar a carpeta (${recipientIds.filter(r => r).length} dest.)` : `Enviar a firma (${recipientIds.filter(r => r).length} dest.)`}
              </Button>
            </form>

            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex gap-1 w-full overflow-hidden">
                <Button variant={activeTab === "pending" ? "default" : "outline"} className="flex-1 min-w-0 text-[9px] sm:text-xs font-display uppercase tracking-wider px-1.5 truncate" onClick={() => setActiveTab("pending")}>
                  Pend. ({pendingDocuments.length})
                </Button>
                <Button variant={activeTab === "sent" ? "default" : "outline"} className="flex-1 min-w-0 text-[9px] sm:text-xs font-display uppercase tracking-wider px-1.5 truncate" onClick={() => setActiveTab("sent")}>
                  Firmados
                </Button>
                <Button variant={activeTab === "archive" ? "default" : "outline"} className="flex-1 min-w-0 text-[9px] sm:text-xs font-display uppercase tracking-wider px-1.5 gap-1 truncate" onClick={() => setActiveTab("archive")}>
                  <FolderArchive className="h-3 w-3 shrink-0" /> <span className="truncate">Archivo ({archiveDocuments.length})</span>
                </Button>
              </div>

              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {activeDocuments.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No hay documentos en esta bandeja.</p>
                ) : (
                  activeDocuments.map((doc) => {
                    const isSender = doc.sender_id === user?.id;
                    const canModify = isSender && doc.status === "pending" && !doc.is_info_only;
                    const canDelete = isSender;
                    const sigStatus = getDocSigningStatus(doc);
                    const isInfoDoc = doc.is_info_only;

                    // For info-only docs sent by current user, show view status
                    const viewRecipients = isInfoDoc && isSender ? getViewStatus(doc) : [];

                    return (
                      <div key={doc.id}
                        className={`rounded-lg border p-3 transition-colors cursor-pointer ${
                          selectedDocument?.id === doc.id ? "border-primary bg-secondary/40" : "border-border bg-background hover:border-foreground/20"
                        }`}
                        onClick={() => setSelectedDocument(doc)}
                      >
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {isInfoDoc && <FolderArchive className="h-3 w-3 text-muted-foreground shrink-0" />}
                              <p className="truncate text-sm font-medium">{doc.title}</p>
                            </div>
                            <p className="truncate text-xs text-muted-foreground mt-0.5">{doc.original_file_name}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {new Date(doc.created_at).toLocaleDateString("es-ES")}
                            </p>
                            {/* View status for info-only docs */}
                            {viewRecipients.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {viewRecipients.map(r => (
                                  <p key={r.id} className="text-[10px]">
                                    {r.viewed_at ? (
                                      <span className="text-success">
                                        <Eye className="h-2.5 w-2.5 inline mr-0.5" />
                                        Visto por {r.name} el {new Date(r.viewed_at).toLocaleString("es-ES")}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">
                                        ⏳ {r.name} — No visto
                                      </span>
                                    )}
                                  </p>
                                ))}
                              </div>
                            )}
                            {!isInfoDoc && sigStatus && sigStatus.total > 1 && (
                              <p className="text-[10px] mt-1 font-display">
                                <span className={sigStatus.signed === sigStatus.total ? "text-success" : "text-warning"}>
                                  {sigStatus.signed}/{sigStatus.total} firmados
                                </span>
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {canModify && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setReplaceTarget(doc); }}>
                                <RefreshCw className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteTarget(doc); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {isInfoDoc ? (
                              <FolderArchive className="h-4 w-4 text-muted-foreground" />
                            ) : doc.status === "signed" ? (
                              <CheckCircle2 className="h-4 w-4 text-success" />
                            ) : (
                              <PenSquare className="h-4 w-4 text-warning" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right panel - PDF viewer */}
          <div className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-4 min-w-0 overflow-hidden">
            {selectedDocument ? (
              <>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg sm:text-xl font-semibold tracking-tight truncate">{selectedDocument.title}</h2>
                    <p className="text-xs sm:text-sm text-muted-foreground truncate">{selectedDocument.original_file_name}</p>
                    {selectedDocument.is_info_only && (
                      <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-display uppercase tracking-wider bg-secondary text-muted-foreground border border-border">
                        Solo Registro
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button data-tour="sig-download" variant="outline" size="sm" onClick={handleDownload} className="gap-1.5 text-xs">
                      <Download className="h-3.5 w-3.5" /> Descargar
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleOpenExternal} className="gap-1.5 text-xs">
                      <ExternalLink className="h-3.5 w-3.5" /> Abrir
                    </Button>
                  </div>
                </div>

                {/* Multi-recipient status for signature docs */}
                {!selectedDocument.is_info_only && (() => {
                  const sigStatus = getDocSigningStatus(selectedDocument);
                  if (sigStatus && sigStatus.total > 1) {
                    const recipients = docRecipients.filter(r => r.document_id === selectedDocument.id);
                    return (
                      <div className="p-3 rounded-lg border border-border bg-secondary/10">
                        <p className="text-xs font-display uppercase tracking-wider text-muted-foreground mb-2">Estado de firmas ({sigStatus.signed}/{sigStatus.total})</p>
                        <div className="space-y-1">
                          {recipients.map(r => (
                            <div key={r.id} className="flex items-center justify-between text-xs">
                              <span>{getMemberName(r.recipient_id)}</span>
                              <span className={r.status === "signed" ? "text-success font-display uppercase" : "text-warning font-display uppercase"}>
                                {r.status === "signed" ? "✅ Firmado" : "⏳ Pendiente"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* View receipts for info-only docs */}
                {selectedDocument.is_info_only && selectedDocument.sender_id === user?.id && (() => {
                  const viewRecipients = getViewStatus(selectedDocument);
                  if (viewRecipients.length === 0) return null;
                  return (
                    <div className="p-3 rounded-lg border border-border bg-secondary/10">
                      <p className="text-xs font-display uppercase tracking-wider text-muted-foreground mb-2">Acuse de Recibo</p>
                      <div className="space-y-1">
                        {viewRecipients.map(r => (
                          <div key={r.id} className="flex items-center justify-between text-xs">
                            <span>{r.name}</span>
                            {r.viewed_at ? (
                              <span className="text-success font-display">
                                <Eye className="h-3 w-3 inline mr-1" />
                                Visto {new Date(r.viewed_at).toLocaleString("es-ES")}
                              </span>
                            ) : (
                              <span className="text-muted-foreground font-display">⏳ No visto</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPreviewZoom((z) => Math.max(z - 25, 25))} disabled={previewZoom <= 25}>
                      <ZoomOut className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-12 text-center text-[10px] font-display uppercase tracking-wider text-muted-foreground">{previewZoom}%</span>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPreviewZoom((z) => Math.min(z + 25, 300))} disabled={previewZoom >= 300}>
                      <ZoomIn className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewZoom(100)}>
                      <RotateCw className="h-3 w-3" />
                    </Button>
                  </div>
                  <div data-tour="sig-preview" ref={canvasContainerRef} className="overflow-auto max-h-[420px] rounded-lg border border-border bg-background p-2">
                    {pdfPages.length === 0 && (
                      <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando PDF…
                      </div>
                    )}
                  </div>
                </div>

                {/* Signing panel — only for non-info-only docs that need signing */}
                {!selectedDocument.is_info_only && userNeedsToSign(selectedDocument) ? (
                  <div data-tour="sig-signature-panel" className="space-y-4 rounded-lg border border-border bg-background p-4">
                    <Tabs value={signMethod} onValueChange={handleSignMethodChange}>
                      <TabsList className="w-full">
                        <TabsTrigger data-tour="sig-certificate-tab" value="certificate" className="flex-1 text-[10px] sm:text-xs font-display uppercase tracking-wider">Certificado digital</TabsTrigger>
                        <TabsTrigger data-tour="sig-manual-tab" value="manual" className="flex-1 text-[10px] sm:text-xs font-display uppercase tracking-wider">Firma Manual</TabsTrigger>
                      </TabsList>

                      <TabsContent value="certificate" className="mt-4">
                        <CertificateSignature
                          disabled={signing}
                          userRole={projectRole || "N/A"}
                          onSign={handleCertSign}
                          originalPdfBytes={originalPdfBuffer}
                        />
                      </TabsContent>

                      <TabsContent value="manual" className="space-y-4 mt-4">
                        <p className="text-sm text-muted-foreground">Se estampará en el PDF con hash de validación, timestamp y geolocalización.</p>
                        <SignatureCanvas ref={signatureRef} />
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" className="text-xs" onClick={() => signatureRef.current?.clear()}>Limpiar firma</Button>
                          <Button size="sm" onClick={initiateSign} disabled={signing} className="gap-2 font-display text-xs uppercase tracking-wider">
                            {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
                            {signing ? "Firmando..." : "Firmar y Validar"}
                          </Button>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </div>
                ) : !selectedDocument.is_info_only && selectedDocument.validation_hash ? (
                  <div className="rounded-lg border border-success/20 bg-success/5 p-4 space-y-1">
                    <p className="text-xs font-semibold text-success">Hash de Integridad</p>
                    <p className="text-sm font-mono text-success break-all">{selectedDocument.validation_hash}</p>
                    {selectedDocument.signed_at && (
                      <p className="text-xs text-muted-foreground">
                        Firmado: {new Date(selectedDocument.signed_at).toLocaleString("es-ES")}
                      </p>
                    )}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                <Upload className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <h2 className="font-display text-xl font-semibold tracking-tight">Selecciona un documento</h2>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Visualización integrada con PDF.js, firma táctil y validación legal.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente "{deleteTarget?.title}". Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Replace dialog */}
      <AlertDialog open={!!replaceTarget} onOpenChange={(open) => { if (!open) { setReplaceTarget(null); setReplaceFile(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sustituir documento</AlertDialogTitle>
            <AlertDialogDescription>
              Selecciona el nuevo PDF que sustituirá a "{replaceTarget?.original_file_name}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input type="file" accept="application/pdf,.pdf" onChange={(e) => setReplaceFile(e.target.files?.[0] || null)} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReplace} disabled={!replaceFile || replacing}>
              {replacing ? "Sustituyendo..." : "Sustituir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FiscalDataModal
        open={fiscalModalOpen}
        onComplete={handleFiscalComplete}
        onCancel={() => setFiscalModalOpen(false)}
      />

      <DocumentScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanComplete={(scannedFile) => {
          setFile(scannedFile);
          setScannerOpen(false);
        }}
      />
    </AppLayout>
  );
};

export default SignatureDocuments;
