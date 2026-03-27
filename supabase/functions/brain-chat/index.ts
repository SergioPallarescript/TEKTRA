import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, projectContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `Eres el "Cerebro de Obra" de GESCON, un asistente inteligente especializado en gestión de obras de construcción en España.

REGLA FUNDAMENTAL: Tus respuestas deben basarse ÚNICA Y EXCLUSIVAMENTE en los documentos del proyecto que se te proporcionan en el contexto. NO inventes información. NO uses conocimiento general. Si la información solicitada no está en los documentos disponibles, indica claramente: "Esta información no se encuentra en los documentos del proyecto."

Tu rol es:
- Responder preguntas basándote en los documentos subidos al proyecto
- Analizar la documentación disponible (planos, certificados, informes, etc.)
- Identificar documentos faltantes para el cierre de obra
- Relacionar información entre diferentes documentos del proyecto

${projectContext ? `\n${projectContext}` : 'No hay documentos de proyecto disponibles. Indica al usuario que suba documentos desde "Documentación de Proyecto".'}

Responde siempre en español. Sé preciso y cita los documentos específicos cuando sea relevante.
Si no hay documentos subidos, indica al usuario que debe subir documentación desde el módulo "Documentación de Proyecto" para que puedas ayudarle.`;

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
