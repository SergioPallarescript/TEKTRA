import { Capacitor } from "@capacitor/core";

/**
 * Helper unificado para captura de imágenes.
 *
 * - En web/PWA: hace click en el <input type="file"> que se le pasa
 *   (mantiene comportamiento existente y filtros por extensión).
 * - En nativo (Capacitor): abre la cámara real o la galería real
 *   usando el plugin @capacitor/camera, y devuelve el resultado como
 *   File para que el flujo de subida actual funcione sin cambios.
 */
export async function pickImage(
  source: "camera" | "gallery",
  fallbackInput: HTMLInputElement | null,
): Promise<File[] | null> {
  if (!Capacitor.isNativePlatform()) {
    fallbackInput?.click();
    return null; // el onChange del input se encarga
  }

  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    // Solicita permisos antes de abrir.
    try {
      const perms = await Camera.checkPermissions();
      const needsCam = source === "camera" && perms.camera !== "granted";
      const needsPhotos = source === "gallery" && perms.photos !== "granted";
      if (needsCam || needsPhotos) {
        await Camera.requestPermissions({
          permissions: source === "camera" ? ["camera"] : ["photos"],
        });
      }
    } catch {
      // Algunos dispositivos no exponen checkPermissions; seguimos.
    }

    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
      saveToGallery: false,
    });

    const uri = photo.webPath || photo.path;
    if (!uri) return [];
    const res = await fetch(uri);
    const blob = await res.blob();
    const ext = photo.format || "jpg";
    const file = new File([blob], `foto-${Date.now()}.${ext}`, {
      type: blob.type || `image/${ext}`,
    });
    return [file];
  } catch (err: any) {
    // Cancelación del usuario o error: devolvemos array vacío.
    if (err?.message?.toLowerCase?.().includes("cancel")) return [];
    console.warn("[nativeMedia] pickImage error", err);
    return [];
  }
}

export const isNative = () => Capacitor.isNativePlatform();

/* ──────────────────────────────────────────────────────────────────
 *  Descarga / apertura de archivos (web + nativo)
 *  - Web/PWA: usa <a download> + window.open con object URLs.
 *  - Nativo (Capacitor): guarda en Filesystem.Documents y abre con
 *    @capacitor-community/file-opener para "Abrir con…" del sistema.
 * ──────────────────────────────────────────────────────────────── */

function inferMimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
    txt: "text/plain", csv: "text/csv", html: "text/html",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    zip: "application/zip", json: "application/json",
  };
  return map[ext] || "application/octet-stream";
}

function sanitizeFsName(name: string) {
  return (name || `archivo-${Date.now()}`).replace(/[\/\\:*?"<>|]+/g, "_");
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result || "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

async function fetchAsBlob(input: Blob | string): Promise<Blob> {
  if (input instanceof Blob) return input;
  const res = await fetch(input);
  if (!res.ok) throw new Error(`No se pudo descargar (${res.status})`);
  return await res.blob();
}

async function saveToNativeFs(blob: Blob, fileName: string) {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const data = await blobToBase64(blob);
  const safeName = sanitizeFsName(fileName);
  // Documents es la mejor opción cross-Android/iOS para "Abrir con".
  let directory: any = Directory.Documents;
  let written;
  try {
    written = await Filesystem.writeFile({
      path: safeName,
      data,
      directory,
      recursive: true,
    });
  } catch {
    // Fallback: cache (siempre escribible) si Documents falla.
    directory = Directory.Cache;
    written = await Filesystem.writeFile({
      path: safeName,
      data,
      directory,
      recursive: true,
    });
  }
  return { uri: written.uri, directory, path: safeName };
}

/**
 * Descarga un archivo (Blob o URL) en el dispositivo.
 * - Web: dispara descarga del navegador.
 * - Nativo: lo guarda en Documents y muestra "Abrir con…".
 */
export async function downloadFile(input: Blob | string, fileName: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    let url: string;
    let revoke = false;
    if (input instanceof Blob) {
      url = URL.createObjectURL(input);
      revoke = true;
    } else {
      url = input;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (revoke) setTimeout(() => URL.revokeObjectURL(url), 4000);
    return;
  }

  try {
    const blob = await fetchAsBlob(input);
    const { uri } = await saveToNativeFs(blob, fileName);
    const mime = blob.type || inferMimeFromName(fileName);
    const { FileOpener } = await import("@capacitor-community/file-opener");
    await FileOpener.open({ filePath: uri, contentType: mime });
  } catch (err: any) {
    console.error("[nativeMedia] downloadFile error", err);
    throw err;
  }
}

/**
 * Abre un archivo (Blob o URL) en un visor del sistema.
 * - Web: abre en pestaña nueva.
 * - Nativo Blob: lo guarda en Documents y abre con visor nativo.
 * - Nativo URL externa (http/https): abre con @capacitor/browser.
 */
export async function openFile(input: Blob | string, fileName: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    if (input instanceof Blob) {
      const url = URL.createObjectURL(input);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      window.open(input, "_blank");
    }
    return;
  }

  try {
    if (typeof input === "string" && /^https?:\/\//i.test(input)) {
      // URL externa → in-app browser nativo.
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: input });
      return;
    }
    const blob = await fetchAsBlob(input);
    const { uri } = await saveToNativeFs(blob, fileName);
    const mime = blob.type || inferMimeFromName(fileName);
    const { FileOpener } = await import("@capacitor-community/file-opener");
    await FileOpener.open({ filePath: uri, contentType: mime });
  } catch (err: any) {
    console.error("[nativeMedia] openFile error", err);
    throw err;
  }
}