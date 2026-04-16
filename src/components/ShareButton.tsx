import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const APP_URL = "https://tektra.es";

export type ShareModule = "order" | "plan" | "cost" | "signature";

interface ShareData {
  module: ShareModule;
  projectId: string;
  projectName: string;
  /** Item id for deep link */
  itemId: string;
  /** Extra fields per module */
  meta: Record<string, string>;
}

function buildDeepLink(module: ShareModule, projectId: string, itemId: string) {
  const routes: Record<ShareModule, string> = {
    order: `/project/${projectId}/orders?item=${itemId}`,
    plan: `/project/${projectId}/plans?item=${itemId}`,
    cost: `/project/${projectId}/costs?item=${itemId}`,
    signature: `/project/${projectId}/signatures?item=${itemId}`,
  };
  return `${APP_URL}${routes[module]}`;
}

function buildShareText(data: ShareData): { title: string; text: string } {
  const link = buildDeepLink(data.module, data.projectId, data.itemId);

  switch (data.module) {
    case "order":
      return {
        title: "TEKTRA - Nueva Orden Registrada",
        text: [
          "🔔 NUEVA ORDEN EN EL LIBRO DE ÓRDENES",
          "",
          `Obra: ${data.projectName}`,
          data.meta.emitidaPor ? `Emitida por: ${data.meta.emitidaPor}` : "",
          `Fecha: ${data.meta.fecha || new Date().toLocaleDateString("es-ES")}`,
          data.meta.asunto ? `Asunto: ${data.meta.asunto}` : "",
          "",
          "📄 Accede a TEKTRA para visualizar el detalle técnico y la firma con Hash de seguridad:",
          link,
          "",
          "⚠️ Compartir este aviso no sustituye la firma legal dentro de TEKTRA.",
        ].filter(Boolean).join("\n"),
      };

    case "plan":
      return {
        title: "TEKTRA - Actualización de Planos",
        text: [
          "📐 NUEVA VERSIÓN DE PLANO DISPONIBLE",
          "",
          `Se ha subido la Versión ${data.meta.version || "?"} del plano: ${data.meta.planName || ""}`,
          "",
          "⚠️ Acción requerida: Esta versión desactiva la anterior y requiere tu conformidad digital para continuar con la ejecución.",
          "",
          `🔗 ${link}`,
          "",
          "⚠️ Compartir este aviso no sustituye la firma legal dentro de TEKTRA.",
        ].join("\n"),
      };

    case "cost": {
      const docType = data.meta.docType || "Certificación";
      const headerType = docType.toUpperCase();
      return {
        title: "TEKTRA - Validación Económica",
        text: [
          `💸 NUEVA ${headerType} PENDIENTE`,
          "",
          `Tienes pendiente una ${docType} enviada por ${data.meta.emisor || "un agente"}.`,
          `Estado: Pendiente de ${data.meta.estado || "Validación"}.`,
          data.meta.importe ? `Importe: ${data.meta.importe} €` : "",
          "",
          `📲 ${link}`,
          "",
          "⚠️ Compartir este aviso no sustituye la firma legal dentro de TEKTRA.",
        ].filter(Boolean).join("\n"),
      };
    }

    case "signature": {
      const isInfoOnly = data.meta.estado === "Solo Lectura";
      const header = isInfoOnly ? "📂 DOCUMENTO RECIBIDO" : "✍️ DOCUMENTO PENDIENTE DE FIRMA";
      return {
        title: "TEKTRA - Documento",
        text: [
          header,
          "",
          `Documento: ${data.meta.docName || ""}`,
          `Estado: ${data.meta.estado || "Firma Requerida"}`,
          "",
          `✍️ ${link}`,
          "",
          "⚠️ Compartir este aviso no sustituye la firma legal dentro de TEKTRA.",
        ].join("\n"),
      };
    }
  }
}

interface ShareButtonProps {
  data: ShareData;
  size?: "icon" | "sm" | "default";
  className?: string;
}

export default function ShareButton({ data, size = "icon", className }: ShareButtonProps) {
  const handleShare = async () => {
    const { title, text } = buildShareText(data);

    if (navigator.share) {
      try {
        await navigator.share({ title, text });
      } catch (e: any) {
        if (e.name !== "AbortError") toast.error("No se pudo compartir");
      }
    } else {
      try {
        await navigator.clipboard.writeText(`${title}\n\n${text}`);
        toast.success("Texto copiado al portapapeles");
      } catch {
        toast.error("No se pudo copiar al portapapeles");
      }
    }
  };

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={handleShare}
      className={className}
      title="Compartir"
    >
      <Share2 className="h-4 w-4" />
      {size !== "icon" && <span className="ml-1">Compartir</span>}
    </Button>
  );
}

export { buildDeepLink };
