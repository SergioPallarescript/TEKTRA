/**
 * AutoFirma Bridge — Integración con la aplicación AutoFirma del Gobierno de España.
 *
 * AutoFirma permite firmar con certificados instalados en el almacén del sistema
 * operativo (Windows CAPI, macOS Keychain, Firefox NSS).
 *
 * Flujo:
 *  1. Intentar conectar con el servidor local de AutoFirma (localhost:63117-63120)
 *  2. Si no disponible, lanzar protocolo afirma://
 *  3. Si tampoco funciona, indicar al usuario que instale AutoFirma
 */

const AUTOFIRMA_PORTS = [63117, 63118, 63119, 63120];
const AUTOFIRMA_TIMEOUT = 3000;

export interface AutoFirmaStatus {
  available: boolean;
  port?: number;
  method: "local-server" | "protocol" | "unavailable";
  isMobile: boolean;
}

function detectMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Detecta si AutoFirma está disponible en el sistema.
 */
export async function detectAutoFirma(): Promise<AutoFirmaStatus> {
  const isMobile = detectMobile();

  // On mobile, AutoFirma local server doesn't run — only protocol handler
  if (isMobile) {
    return { available: false, method: "protocol", isMobile: true };
  }

  // Try local server on desktop
  for (const port of AUTOFIRMA_PORTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), AUTOFIRMA_TIMEOUT);

      const response = await fetch(`https://127.0.0.1:${port}/afirma`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "echo", dat: "test" }),
      });
      clearTimeout(timeout);

      if (response.ok || response.status === 200) {
        return { available: true, port, method: "local-server", isMobile: false };
      }
    } catch {
      // Port not listening, try next
    }
  }

  // Desktop but no local server found — offer protocol as fallback
  return { available: false, method: "protocol", isMobile: false };
}

/**
 * Firma un PDF usando el servidor local de AutoFirma.
 */
export async function signWithLocalServer(
  pdfBase64: string,
  port: number,
): Promise<string> {
  const signRequest = {
    op: "sign",
    algorithm: "SHA256withRSA",
    format: "PAdES",
    dat: pdfBase64,
    properties: btoa(
      "mode=implicit\n" +
      "signaturePage=-1\n" +
      "signatureRubricImage=\n" +
      "signaturePositionOnPageLowerLeftX=36\n" +
      "signaturePositionOnPageLowerLeftY=36\n" +
      "signaturePositionOnPageUpperRightX=336\n" +
      "signaturePositionOnPageUpperRightY=136\n"
    ),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(`https://127.0.0.1:${port}/afirma`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signRequest),
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AutoFirma devolvió error: ${errText}`);
    }

    const result = await response.json();
    if (result.error) {
      throw new Error(result.error);
    }

    return result.result || result.dat || "";
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Lanza AutoFirma vía protocolo URL (afirma://).
 * Works on both desktop (if AutoFirma installed) and Android.
 *
 * On Android, the AutoFirma app registers as handler for this scheme.
 * On desktop, the OS protocol handler opens the installed AutoFirma app.
 */
export function launchAutoFirmaProtocol(pdfBase64: string): boolean {
  const isMobile = detectMobile();

  // For large PDFs, the protocol URL may be too long.
  // AutoFirma protocol has a practical limit of ~2MB in the URL.
  if (pdfBase64.length > 2_000_000) {
    return false; // Caller should show an error about file size
  }

  const params = new URLSearchParams({
    op: "sign",
    algorithm: "SHA256withRSA",
    format: "PAdES",
    dat: pdfBase64,
  });

  const url = `afirma://sign?${params.toString()}`;

  if (isMobile) {
    // On mobile, use window.location for better app switching
    window.location.href = url;
  } else {
    // On desktop, use window.open which is less disruptive
    const w = window.open(url, "_blank");
    // Some browsers block window.open for custom protocols; fallback to location
    if (!w) {
      window.location.href = url;
    }
  }

  return true;
}

/**
 * Convierte ArrayBuffer a Base64 sin desbordar la pila.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    parts.push(String.fromCharCode.apply(null, slice as unknown as number[]));
  }
  return btoa(parts.join(""));
}

/**
 * Convierte Base64 a Uint8Array.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
