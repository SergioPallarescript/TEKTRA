import { useState, useCallback, useEffect } from "react";
import { ShieldCheck, Loader2, Monitor, Smartphone, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  detectAutoFirma,
  signWithLocalServer,
  launchAutoFirmaProtocol,
  arrayBufferToBase64,
  base64ToUint8Array,
  type AutoFirmaStatus,
} from "@/lib/autofirma";
import { computeSHA256 } from "@/lib/pdfSigner";

interface AutoFirmaSignatureProps {
  disabled?: boolean;
  onSign: (signedPdfBytes: Uint8Array, metadata: AutoFirmaMetadata) => Promise<void>;
  originalPdfBytes: ArrayBuffer | null;
}

export interface AutoFirmaMetadata {
  signerName: string;
  validationHash: string;
  geo: string;
  signatureType: "autofirma";
}

export default function AutoFirmaSignature({ disabled, onSign, originalPdfBytes }: AutoFirmaSignatureProps) {
  const [status, setStatus] = useState<AutoFirmaStatus | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [signing, setSigning] = useState(false);

  const checkAutoFirma = useCallback(async () => {
    setDetecting(true);
    try {
      const result = await detectAutoFirma();
      setStatus(result);
      if (result.available) {
        toast.success("AutoFirma detectado en el sistema");
      }
    } catch {
      setStatus({ available: false, method: "unavailable", isMobile: false });
    } finally {
      setDetecting(false);
    }
  }, []);

  useEffect(() => {
    void checkAutoFirma();
  }, [checkAutoFirma]);

  const handleSign = useCallback(async () => {
    if (!originalPdfBytes || !status) return;
    setSigning(true);
    try {
      let geo = "";
      try {
        const pos: GeolocationPosition = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
        );
        geo = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
      } catch {}

      const pdfBase64 = arrayBufferToBase64(originalPdfBytes);

      if (status.available && status.port) {
        // Use local server
        const signedBase64 = await signWithLocalServer(pdfBase64, status.port);
        const signedBytes = base64ToUint8Array(signedBase64);
        const hash = await computeSHA256(signedBytes);

        await onSign(signedBytes, {
          signerName: "Firmado con AutoFirma",
          validationHash: hash.slice(0, 32),
          geo,
          signatureType: "autofirma",
        });
      } else {
        // Launch protocol handler
        const launched = launchAutoFirmaProtocol(pdfBase64);
        if (!launched) {
          toast.error("El PDF es demasiado grande para firmar con el protocolo AutoFirma. Usa la pestaña 'Certificado .P12'.");
        } else {
          toast.info(
            status?.isMobile
              ? "Se está abriendo la app AutoFirma. Firma el documento en la app y luego sube el PDF firmado manualmente."
              : "Se ha abierto AutoFirma. Firma el documento en la ventana de AutoFirma y luego sube el PDF firmado manualmente.",
            { duration: 10000 }
          );
        }
        setSigning(false);
        return;
      }
    } catch (err: any) {
      toast.error(err?.message || "Error al firmar con AutoFirma");
    } finally {
      setSigning(false);
    }
  }, [originalPdfBytes, status, onSign]);

  return (
    <div className="space-y-4">
      {/* Detection status */}
      <div className="rounded-lg border border-border bg-background p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-muted-foreground" />
            <span className="font-display text-xs uppercase tracking-wider text-muted-foreground">
              Estado de AutoFirma
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={checkAutoFirma}
            disabled={detecting}
            className="h-7 gap-1 text-xs"
          >
            <RefreshCw className={`h-3 w-3 ${detecting ? "animate-spin" : ""}`} />
            Detectar
          </Button>
        </div>

        {detecting ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Buscando AutoFirma en el sistema…
          </div>
        ) : status?.available ? (
          <div className="flex items-center gap-2 text-sm text-primary">
            <ShieldCheck className="h-4 w-4" />
            <span>AutoFirma detectado (puerto {status.port})</span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-warning">
              <AlertTriangle className="h-4 w-4" />
              <span>AutoFirma no detectado en este dispositivo</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Puedes intentar abrir AutoFirma mediante el protocolo del sistema, o{" "}
              <a
                href="https://firmaelectronica.gob.es/Home/Descargas.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline inline-flex items-center gap-0.5"
              >
                descargar AutoFirma <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        )}
      </div>

      {/* Info about native certificates */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
        <div className="flex items-center gap-2 text-primary">
          <Smartphone className="h-4 w-4" />
          <span className="font-display text-xs uppercase tracking-wider font-semibold">
            Firma con certificados del sistema
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          AutoFirma accede directamente a los certificados instalados en tu dispositivo
          (Windows, macOS, DNIe). Al firmar se abrirá el diálogo nativo del sistema
          para seleccionar tu certificado.
        </p>
        <p className="text-[10px] text-muted-foreground">
          🔒 La clave privada nunca sale de tu dispositivo. Solo el documento firmado se envía al servidor.
        </p>
      </div>

      {/* Sign button */}
      <Button
        onClick={handleSign}
        disabled={!originalPdfBytes || signing || disabled || detecting}
        className="w-full gap-2 font-display text-xs uppercase tracking-wider"
      >
        {signing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Esperando firma en AutoFirma…
          </>
        ) : status?.available ? (
          <>
            <ShieldCheck className="h-4 w-4" />
            Firmar con AutoFirma
          </>
        ) : (
          <>
            <ShieldCheck className="h-4 w-4" />
            Abrir AutoFirma para firmar
          </>
        )}
      </Button>
    </div>
  );
}
