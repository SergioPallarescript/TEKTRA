import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { rawText, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `Eres un asistente de post-procesamiento de dictado de voz para la plataforma TECTRA de gestión de obras de construcción en España.

Tu tarea es limpiar y reescribir el texto dictado por voz siguiendo estas reglas estrictas:

1. ELIMINA todas las repeticiones de palabras y frases duplicadas producidas por el reconocimiento de voz.
2. CORRIGE la gramática, ortografía y puntuación.
3. REESCRIBE el texto con un tono técnico, formal y profesional propio de la Dirección de Ejecución Material (DEM).
4. Si el usuario ha hablado de forma coloquial, CONVIERTE el contenido en una anotación técnica precisa para el ${context === "incidents" ? "Libro de Incidencias" : "Libro de Órdenes"}.
5. MANTÉN toda la información relevante del dictado original, no inventes datos nuevos.
6. Usa terminología técnica de construcción cuando sea apropiado.
7. El resultado debe ser conciso, claro y profesionalmente redactado.

IMPORTANTE: Devuelve ÚNICAMENTE el texto limpio y reestructurado, sin explicaciones ni comentarios adicionales.`;

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
          { role: "user", content: `Limpia este dictado de voz:\n\n"${rawText}"` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Demasiadas consultas. Inténtalo de nuevo." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos agotados." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Error del servicio de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const cleanedText = data.choices?.[0]?.message?.content?.trim() || rawText;

    return new Response(JSON.stringify({ cleanedText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("clean-dictation error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
