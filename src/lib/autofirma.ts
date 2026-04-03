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
 *
 * El servidor local de AutoFirma escucha en HTTPS en localhost y acepta
 * peticiones de firma con datos en Base64.
 */

const AUTOFIRMA_PORTS = [63117, 63118, 63119, 63120];
const AUTOFIRMA_TIMEOUT = 4000;

export interface AutoFirmaStatus {
  available: boolean;
  port?: number;
  method: "local-server" | "protocol" | "unavailable";
}

/**
 * Detecta si AutoFirma está disponible en el sistema.
 */
export async function detectAutoFirma(): Promise<AutoFirmaStatus> {
  // Try local server first
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
        return { available: true, port, method: "local-server" };
      }
    } catch {
      // Port not listening, try next
    }
  }

  // Check if protocol handler might be registered
  // We can't reliably detect this, so we offer it as an option
  return { available: false, method: "protocol" };
}

/**
 * Firma un PDF usando el servidor local de AutoFirma.
 *
 * @param pdfBase64 - PDF en Base64
 * @param port - Puerto del servidor local
 * @returns PDF firmado en Base64
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
  const timeout = setTimeout(() => controller.abort(), 120000); // 2 min for user interaction

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
 * Este método abre la aplicación AutoFirma instalada localmente.
 *
 * Limitación: no podemos recibir el resultado directamente en el navegador.
 * Se usa como fallback cuando el servidor local no está activo.
 */
export function launchAutoFirmaProtocol(pdfBase64: string): void {
  // The afirma:// protocol format
  const params = new URLSearchParams({
    op: "sign",
    algorithm: "SHA256withRSA",
    format: "PAdES",
    dat: pdfBase64,
  });

  const url = `afirma://sign?${params.toString()}`;

  // Create a hidden iframe to trigger the protocol without navigating away
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = url;
  document.body.appendChild(iframe);

  // Clean up after a delay
  setTimeout(() => {
    document.body.removeChild(iframe);
  }, 5000);
}

/**
 * Convierte ArrayBuffer a Base64.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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
