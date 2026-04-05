import { useState, useRef, useCallback, useEffect } from "react";
import { ShieldCheck, Upload, Loader2, Eye, EyeOff, FileKey, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseP12, signPdfWithP12, computeSHA256, type P12ParseResult, type SignerInfo } from "@/lib/pdfSigner";
import { toast } from "sonner";

interface CertificateSignatureProps {
  disabled?: boolean;
  userRole: string;
  onSign: (signedPdfBytes: Uint8Array, metadata: CertSignMetadata) => Promise<void>;
  originalPdfBytes?: ArrayBuffer | null;
  /** When true, the sign button activates as soon as the certificate is loaded (no PDF needed) */
  noPdfRequired?: boolean;
}

export interface CertSignMetadata {
  signerName: string;
  signerDni: string;
  validationHash: string;
  geo: string;
  signatureType: "p12";
  certificateCN: string;
  certificateSerial: string;
}

// Key for localStorage password store
const CERT_PASSWORDS_KEY = "tektra_cert_passwords";

function getSavedPasswords(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CERT_PASSWORDS_KEY) || "{}");
  } catch {
    return {};
  }
}

function savePassword(fileName: string, fileSize: number, password: string) {
  const saved = getSavedPasswords();
  // Use fileName + size as key to identify unique certificates
  saved[`${fileName}__${fileSize}`] = password;
  localStorage.setItem(CERT_PASSWORDS_KEY, JSON.stringify(saved));
}

function findSavedPassword(fileName: string, fileSize: number): string | null {
  const saved = getSavedPasswords();
  return saved[`${fileName}__${fileSize}`] || null;
}

export default function CertificateSignature({ disabled, userRole, onSign, originalPdfBytes, noPdfRequired }: CertificateSignatureProps) {
  const [p12File, setP12File] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [parsedCert, setParsedCert] = useState<P12ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [passwordRemembered, setPasswordRemembered] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setP12File(file);
    setParsedCert(null);
    setParseError(null);
    setPasswordRemembered(false);

    if (file) {
      const saved = findSavedPassword(file.name, file.size);
      if (saved) {
        setPassword(saved);
        setPasswordRemembered(true);
        // Auto-parse with saved password
        file.arrayBuffer().then((buffer) => {
          try {
            const result = parseP12(buffer, saved);
            setParsedCert(result);
            toast.success("Certificado reconocido automáticamente");
          } catch {
            // Saved password no longer valid
            setPassword("");
            setPasswordRemembered(false);
          }
        });
      } else {
        setPassword("");
      }
    }
  }, []);

  const handleParseCertificate = useCallback(async () => {
    if (!p12File || !password) {
      toast.error("Selecciona un archivo .p12/.pfx e introduce la contraseña");
      return;
    }
    try {
      const buffer = await p12File.arrayBuffer();
      const result = parseP12(buffer, password);
      setParsedCert(result);
      setParseError(null);
      // Save password for this certificate
      savePassword(p12File.name, p12File.size, password);
      setPasswordRemembered(true);
      toast.success("Certificado cargado correctamente");
    } catch (err: any) {
      setParsedCert(null);
      const msg = err?.message || "Error al leer el certificado";
      setParseError(msg.includes("Invalid password") ? "Contraseña incorrecta" : msg);
      toast.error("No se pudo leer el certificado");
    }
  }, [p12File, password]);

  const handleSign = useCallback(async () => {
    if (!parsedCert) return;
    if (!noPdfRequired && !originalPdfBytes) return;
    setSigning(true);
    try {
      let geo = "";
      try {
        const pos: GeolocationPosition = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
        );
        geo = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
      } catch {}

      const timestamp = new Date().toISOString();

      const signerInfo: SignerInfo = {
        name: parsedCert.commonName,
        dni: parsedCert.serialNumber || "N/A",
        role: userRole,
        geo,
        timestamp,
      };

      const signedBytes = await signPdfWithP12(originalPdfBytes, parsedCert, signerInfo);
      const hash = await computeSHA256(signedBytes);

      await onSign(signedBytes, {
        signerName: parsedCert.commonName,
        signerDni: parsedCert.serialNumber || "",
        validationHash: hash.slice(0, 32),
        geo,
        signatureType: "p12",
        certificateCN: parsedCert.commonName,
        certificateSerial: parsedCert.serialNumber || "",
      });

      // Clear sensitive data
      setPassword("");
      setParsedCert(null);
      setP12File(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: any) {
      toast.error(err?.message || "Error al firmar con certificado");
    } finally {
      setSigning(false);
    }
  }, [parsedCert, originalPdfBytes, userRole, onSign]);

  return (
    <div className="space-y-4">
      {/* File input */}
      <div className="space-y-2">
        <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <FileKey className="h-3.5 w-3.5" />
          Certificado digital (.p12 / .pfx)
        </Label>
        <Input
          ref={fileRef}
          type="file"
          accept=".p12,.pfx"
          onChange={handleFileChange}
          disabled={disabled || signing}
        />
      </div>

      {/* Password — hidden if remembered and auto-parsed */}
      {!passwordRemembered && (
        <div className="space-y-2">
          <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
            Contraseña del certificado
          </Label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={disabled || signing}
              autoComplete="off"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            🔒 La contraseña y la clave privada se procesan exclusivamente en tu navegador.
          </p>
        </div>
      )}

      {/* Remembered indicator */}
      {passwordRemembered && !parsedCert && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          Contraseña recordada para este certificado
        </div>
      )}

      {/* Parse button */}
      {!parsedCert && !passwordRemembered && (
        <Button
          variant="outline"
          onClick={handleParseCertificate}
          disabled={!p12File || !password || disabled || signing}
          className="w-full gap-2 font-display text-xs uppercase tracking-wider"
        >
          <Upload className="h-4 w-4" />
          Cargar certificado
        </Button>
      )}

      {/* Parse error */}
      {parseError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{parseError}</p>
        </div>
      )}

      {/* Certificate info preview */}
      {parsedCert && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-4 w-4" />
            <span className="font-display text-xs uppercase tracking-wider font-semibold">Certificado verificado</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <span className="text-muted-foreground">Titular:</span>
            <span className="font-medium">{parsedCert.commonName}</span>
            <span className="text-muted-foreground">DNI/NIF:</span>
            <span className="font-medium">{parsedCert.serialNumber || "No disponible"}</span>
          </div>
        </div>
      )}

      {/* Sign button */}
      {parsedCert && (
        <Button
          onClick={handleSign}
          disabled={!originalPdfBytes || signing || disabled}
          className="w-full gap-2 font-display text-xs uppercase tracking-wider"
        >
          {signing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Firmando con certificado…
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" />
              Firmar con Certificado Digital
            </>
          )}
        </Button>
      )}
    </div>
  );
}
