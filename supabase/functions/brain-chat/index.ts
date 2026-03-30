import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, projectContext, projectId, dynamicContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Backend no configurado correctamente");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("No autorizado");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) throw new Error("No autorizado");

    let updatedExecutionHistory = typeof dynamicContext === "string" ? dynamicContext.trim() : "";

    if (projectId) {
      const [{ data: project }, { data: member }] = await Promise.all([
        supabase.from("projects").select("id, created_by").eq("id", projectId).single(),
        supabase.from("project_members").select("id").eq("project_id", projectId).eq("user_id", authData.user.id).eq("status", "accepted").maybeSingle(),
      ]);

      if (!project || (project.created_by !== authData.user.id && !member)) {
        throw new Error("Acceso denegado al proyecto");
      }

      const memoryPath = `project-memory/${projectId}/memoria_dinamica_${projectId}.txt`;
      const { data: memoryFile } = await supabase.storage.from("plans").download(memoryPath);
      if (memoryFile) {
        updatedExecutionHistory = await memoryFile.text();
      }
    }

    const systemPrompt = `Eres el "Cerebro de Obra" de TEKTRA, un asistente inteligente especializado en gestión de obras de construcción en España.

REGLA FUNDAMENTAL: Tu base de conocimiento se compone de documentos estáticos Y el Historial de Ejecución Actualizado. Si una orden de ejecución contradice un documento de diseño anterior, la orden de ejecución más reciente tiene prioridad absoluta. Debes basar tu respuesta en la suma de ambas fuentes, nunca solo en una.

Fuentes obligatorias a consultar de manera unificada:
1. Documentos Originales (Planos, Memorias, Pliegos, Proyectos Básicos).
2. Historial del Libro de Órdenes.
3. Historial del Libro de Incidencias.
4. HISTORIAL DE EJECUCIÓN ACTUALIZADO.

NO inventes información. NO uses conocimiento general. Si la información solicitada no está en ninguna de las tres fuentes, indica claramente: "Esta información no se encuentra en los documentos ni en el historial de actividad del proyecto."

JERARQUÍA DE INFORMACIÓN:
- Si hay contradicción entre un documento original y una orden/incidencia posterior, PRIORIZA la información más reciente, ya que representa una decisión tomada en obra.
- Ejemplo correcto: "Según el plano de estructuras, la solución era X, pero en la Orden #15 del 20/03/2026 el Director de Obra autorizó Y."

TRAZABILIDAD LEGAL:
- SIEMPRE cita la fuente exacta: nombre del documento, número de orden (#X) o número de incidencia (#X) con su fecha.
- Si combinas información de varias fuentes, cítalas todas.

Tu rol es:
- Responder preguntas cruzando documentos estáticos con la actividad diaria de obra
- Detectar contradicciones entre el proyecto original y las decisiones posteriores
- Identificar documentos faltantes para el cierre de obra
- Ofrecer un contexto completo que integre diseño original + ejecución real

=== HISTORIAL DE EJECUCIÓN ACTUALIZADO ===
${updatedExecutionHistory || "No hay historial de ejecución actualizado disponible todavía."}

${projectContext ? `\n${projectContext}` : 'No hay documentos ni historial de proyecto disponibles. Indica al usuario que suba documentos desde "Documentación de Proyecto" y que registre órdenes e incidencias.'}

Responde siempre en español. Sé preciso y profesional.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Demasiadas consultas. Inténtalo de nuevo en unos segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos agotados. Contacta con el administrador." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Error del servicio de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("brain-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
