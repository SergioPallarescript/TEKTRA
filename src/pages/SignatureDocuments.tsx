import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { ArrowLeft, CheckCircle2, FileSignature, Loader2, PenSquare, Send, Upload } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import SignatureCanvas, { type SignatureCanvasHandle } from "@/components/SignatureCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { sanitizeFileName, uploadFileWithFallback } from "@/lib/storage";
import { toast } from "sonner";

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
};

const SignatureDocuments = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const signatureRef = useRef<SignatureCanvasHandle | null>(null);
  const [documents, setDocuments] = useState<SignatureDocument[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<SignatureDocument | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "sent">("pending");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [signing, setSigning] = useState(false);
  const [title, setTitle] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const fetchDocuments = async () => {
    if (!user) return;
    const { data } = await (supabase.from("signature_documents" as any) as any)
      .select("*")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    setDocuments((data || []) as SignatureDocument[]);
  };

  useEffect(() => {
    const load = async () => {
      if (!projectId || !user) return;

      const [{ data: memberRows }, _] = await Promise.all([
        supabase.from("project_members").select("user_id, role, invited_email").eq("project_id", projectId).eq("status", "accepted"),
        fetchDocuments(),
      ]);

      const userIds = (memberRows || []).map((member: any) => member.user_id).filter(Boolean);
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds)
        : { data: [] };

      const profileMap = new Map((profiles || []).map((profile: any) => [profile.user_id, profile]));
      setMembers(
        (memberRows || [])
          .filter((member: any) => member.user_id && member.user_id !== user.id)
          .map((member: any) => ({ ...member, profile: profileMap.get(member.user_id) || null })),
      );
      setLoading(false);
    };

    void load();
  }, [projectId, user]);

  useEffect(() => {
    const loadPreview = async () => {
      if (!selectedDocument) {
        setPreviewUrl(null);
        return;
      }

      const targetPath = selectedDocument.signed_file_path || selectedDocument.original_file_path;
      const { data, error } = await supabase.storage.from("plans").download(targetPath);
      if (error || !data) {
        toast.error("No se pudo abrir el PDF");
        setPreviewUrl(null);
        return;
      }

      const nextUrl = URL.createObjectURL(data);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextUrl;
      });
    };

    void loadPreview();

    return () => {
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    };
  }, [selectedDocument]);

  const pendingDocuments = useMemo(
    () => documents.filter((doc) => doc.recipient_id === user?.id && doc.status === "pending"),
    [documents, user?.id],
  );

  const sentAndCompletedDocuments = useMemo(
    () => documents.filter((doc) => doc.sender_id === user?.id || doc.status === "signed"),
    [documents, user?.id],
  );

  const activeDocuments = activeTab === "pending" ? pendingDocuments : sentAndCompletedDocuments;

  const handleCreateDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId || !user || !file || !recipientId || !title.trim()) return;

    setCreating(true);
    try {
      const safeName = sanitizeFileName(file.name);
      const path = `signature-documents/${projectId}/original/${Date.now()}_${safeName}`;
      const { error: uploadError } = await uploadFileWithFallback({ path, file });
      if (uploadError) throw uploadError;

      const { error: insertError } = await (supabase.from("signature_documents" as any) as any).insert({
        project_id: projectId,
        sender_id: user.id,
        recipient_id: recipientId,
        title: title.trim(),
        original_file_name: file.name,
        original_file_path: path,
        file_size: file.size,
        mime_type: file.type || "application/pdf",
      });

      if (insertError) throw insertError;

      await supabase.from("audit_logs").insert({
        user_id: user.id,
        project_id: projectId,
        action: "signature_document_created",
        details: { title: title.trim(), recipient_id: recipientId, file_name: file.name },
      });

      setTitle("");
      setRecipientId("");
      setFile(null);
      toast.success("Documento enviado para firma");
      await fetchDocuments();
      setActiveTab("sent");
    } catch (error: any) {
      toast.error(error?.message || "No se pudo enviar el documento a firma");
    } finally {
      setCreating(false);
    }
  };

  const handleSignDocument = async () => {
    if (!projectId || !selectedDocument || !previewUrl || !signatureRef.current) return;
    if (signatureRef.current.isEmpty()) {
      toast.error("Debes dibujar una firma antes de validar");
      return;
    }

    setSigning(true);
    try {
      const signatureDataUrl = signatureRef.current.toDataUrl();
      if (!signatureDataUrl) throw new Error("Firma no válida");

      const { data: originalFile, error: originalError } = await supabase.storage
        .from("plans")
        .download(selectedDocument.original_file_path);

      if (originalError || !originalFile) throw originalError || new Error("No se pudo descargar el PDF original");

      const originalBytes = await originalFile.arrayBuffer();
      const signedAt = new Date().toISOString();
      const hashSource = `${selectedDocument.id}:${signedAt}:${user?.id}:${signatureDataUrl}`;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hashSource));
      const validationHash = Array.from(new Uint8Array(digest))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 32)
        .toUpperCase();

      const pdfDoc = await PDFDocument.load(originalBytes);
      const lastPage = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
      const signatureImage = await pdfDoc.embedPng(signatureDataUrl);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const { width } = lastPage.getSize();
      const signatureWidth = 180;
      const signatureHeight = (signatureImage.height / signatureImage.width) * signatureWidth;
      const boxX = 36;
      const boxY = 36;

      lastPage.drawRectangle({
        x: boxX,
        y: boxY,
        width: Math.min(width - 72, 250),
        height: 96,
        color: rgb(0.97, 0.97, 0.97),
        borderColor: rgb(0.2, 0.2, 0.2),
        borderWidth: 1,
      });
      lastPage.drawText("Firma digital validada", { x: boxX + 12, y: boxY + 72, size: 10, font });
      lastPage.drawText(`Hash: ${validationHash}`, { x: boxX + 12, y: boxY + 58, size: 9, font });
      lastPage.drawText(`Fecha: ${new Date(signedAt).toLocaleString("es-ES")}`, { x: boxX + 12, y: boxY + 44, size: 9, font });
      lastPage.drawImage(signatureImage, {
        x: boxX + 12,
        y: boxY + 8,
        width: signatureWidth,
        height: Math.min(signatureHeight, 30),
      });

      const signedBytes = await pdfDoc.save();
      const signedFile = new File([signedBytes], `firmado_${sanitizeFileName(selectedDocument.original_file_name)}`, {
        type: "application/pdf",
      });
      const signedPath = `signature-documents/${projectId}/signed/${selectedDocument.id}_${Date.now()}.pdf`;
      const { error: uploadError } = await uploadFileWithFallback({ path: signedPath, file: signedFile });
      if (uploadError) throw uploadError;

      const { error: updateError } = await (supabase.from("signature_documents" as any) as any)
        .update({
          status: "signed",
          signed_file_path: signedPath,
          signed_at: signedAt,
          validation_hash: validationHash,
        })
        .eq("id", selectedDocument.id);

      if (updateError) throw updateError;

      await supabase.from("audit_logs").insert({
        user_id: user?.id,
        project_id: projectId,
        action: "signature_document_signed",
        details: { document_id: selectedDocument.id, hash: validationHash },
      });

      signatureRef.current.clear();
      toast.success("Documento firmado y validado");
      await fetchDocuments();
      setSelectedDocument(null);
    } catch (error: any) {
      toast.error(error?.message || "No se pudo firmar el documento");
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="space-y-3">
            {[1, 2, 3].map((index) => (
              <div key={index} className="h-24 rounded-lg border border-border bg-card animate-pulse" />
            ))}
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
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">Firma de Documentos</p>
        </div>

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <h1 className="font-display text-2xl font-bold tracking-tighter">Firma de Documentos</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Flujo privado entre emisor y receptor con validación legal y hash único.
              </p>
            </div>

            <form onSubmit={handleCreateDocument} className="rounded-lg border border-border bg-card p-4 space-y-4">
              <div className="space-y-2">
                <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Título</Label>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Acta de recepción parcial" required />
              </div>

              <div className="space-y-2">
                <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">Destinatario</Label>
                <select
                  value={recipientId}
                  onChange={(event) => setRecipientId(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  required
                >
                  <option value="">Selecciona agente</option>
                  {members.map((member: any) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.profile?.full_name || member.invited_email || member.user_id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">PDF</Label>
                <Input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                  required
                />
              </div>

              <Button type="submit" className="w-full gap-2 font-display text-xs uppercase tracking-wider" disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {creating ? "Enviando..." : "Enviar a firma"}
              </Button>
            </form>

            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex gap-2">
                <Button
                  variant={activeTab === "pending" ? "default" : "outline"}
                  className="flex-1 text-xs font-display uppercase tracking-wider"
                  onClick={() => setActiveTab("pending")}
                >
                  Pendientes de mi firma
                </Button>
                <Button
                  variant={activeTab === "sent" ? "default" : "outline"}
                  className="flex-1 text-xs font-display uppercase tracking-wider"
                  onClick={() => setActiveTab("sent")}
                >
                  Enviados / Completados
                </Button>
              </div>

              <div className="space-y-2">
                {activeDocuments.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No hay documentos en esta bandeja.</p>
                ) : (
                  activeDocuments.map((document) => (
                    <button
                      key={document.id}
                      onClick={() => setSelectedDocument(document)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        selectedDocument?.id === document.id
                          ? "border-primary bg-secondary/40"
                          : "border-border bg-background hover:border-foreground/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{document.title}</p>
                          <p className="truncate text-xs text-muted-foreground mt-1">{document.original_file_name}</p>
                        </div>
                        {document.status === "signed" ? (
                          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                        ) : (
                          <PenSquare className="h-4 w-4 text-warning shrink-0" />
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-4 min-w-0">
            {selectedDocument ? (
              <>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <h2 className="font-display text-xl font-semibold tracking-tight truncate">{selectedDocument.title}</h2>
                    <p className="text-sm text-muted-foreground truncate">{selectedDocument.original_file_name}</p>
                  </div>
                  <span className={`inline-flex items-center rounded px-2 py-1 text-[10px] font-display uppercase tracking-widest ${
                    selectedDocument.status === "signed"
                      ? "bg-success/10 text-success"
                      : "bg-warning/10 text-warning"
                  }`}>
                    {selectedDocument.status === "signed" ? "Firmado" : "Pendiente"}
                  </span>
                </div>

                <div className="overflow-hidden rounded-lg border border-border bg-background">
                  {previewUrl ? (
                    <object data={previewUrl} type="application/pdf" className="h-[420px] w-full">
                      <div className="p-6 text-sm text-muted-foreground">
                        Este navegador no puede incrustar el PDF. Ábrelo o descárgalo manualmente.
                      </div>
                    </object>
                  ) : (
                    <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">Cargando PDF…</div>
                  )}
                </div>

                {selectedDocument.recipient_id === user?.id && selectedDocument.status === "pending" ? (
                  <div className="space-y-4 rounded-lg border border-border bg-background p-4">
                    <div>
                      <h3 className="font-display text-sm font-semibold uppercase tracking-wider">Firma manual</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        La firma se estampará en el PDF y se generará un hash de validación único.
                      </p>
                    </div>
                    <SignatureCanvas ref={signatureRef} />
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => signatureRef.current?.clear()}>
                        Limpiar firma
                      </Button>
                      <Button onClick={handleSignDocument} disabled={signing} className="gap-2 font-display text-xs uppercase tracking-wider">
                        {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
                        {signing ? "Firmando..." : "Firmar y Validar"}
                      </Button>
                    </div>
                  </div>
                ) : selectedDocument.validation_hash ? (
                  <div className="rounded-lg border border-success/20 bg-success/5 p-4">
                    <p className="text-sm font-medium text-success">Hash de validación: {selectedDocument.validation_hash}</p>
                    {selectedDocument.signed_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Firmado el {new Date(selectedDocument.signed_at).toLocaleString("es-ES")}
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
                  Aquí verás el PDF integrado y, si te corresponde firmarlo, el panel táctil para validarlo.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default SignatureDocuments;