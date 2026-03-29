import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { projectId, startDate } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: docs } = await supabase
      .from("project_documents")
      .select("file_name, file_type")
      .eq("project_id", projectId);

    const { data: project } = await supabase
      .from("projects")
      .select("name, description")
      .eq("id", projectId)
      .single();

    const { data: orders } = await supabase
      .from("orders")
      .select("content, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(20);

    const docList = (docs || []).map(d => `- ${d.file_name} (${d.file_type || "documento"})`).join("\n");
    const orderSummary = (orders || []).map(o => `- [${new Date(o.created_at).toLocaleDateString("es-ES")}] ${o.content.substring(0, 150)}`).join("\n");

    const effectiveStartDate = startDate || new Date().toISOString().split("T")[0];

    const prompt = `Eres un experto en planificación de obras de construcción en España. Genera un diagrama de Gantt realista para el siguiente proyecto:

Proyecto: ${project?.name || "Obra de construcción"}
Descripción: ${project?.description || "No especificada"}

Documentos del proyecto:
${docList || "No hay documentos subidos aún."}

Órdenes de obra registradas (progreso real):
${orderSummary || "No hay órdenes registradas aún."}

INSTRUCCIONES:
1. Genera entre 8 y 15 hitos/fases de construcción típicas y realistas.
2. La fecha de inicio del primer hito DEBE SER: ${effectiveStartDate}. Todas las demás fases se calculan a partir de esta fecha.
3. Considera solapamientos técnicos realistas (ej. instalaciones pueden empezar antes de acabar estructura).
4. Si hay órdenes de obra, úsalas para ajustar el progreso y las fechas.
5. Cada fase debe tener una duración realista en días.

Devuelve ÚNICAMENTE un JSON array válido con esta estructura (sin markdown, sin comentarios):
[
  {"title": "Nombre de la fase", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD"},
  ...
]`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Eres un planificador experto de obras de construcción. Devuelve solo JSON válido." },
          { role: "user", content: prompt },
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
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const rawOutput = data.choices?.[0]?.message?.content?.trim() || "[]";

    let milestones: Array<{ title: string; start: string; end: string }>;
    try {
      const cleaned = rawOutput.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      milestones = JSON.parse(cleaned);
    } catch {
      milestones = [];
      const defaultPhases = [
        "Demoliciones y movimiento de tierras", "Cimentación", "Estructura",
        "Cerramientos y fachada", "Instalaciones", "Particiones y albañilería interior",
        "Revestimientos y acabados", "Carpintería y cerrajería", "Urbanización exterior",
        "Limpieza final y recepción",
      ];
      const startD = new Date(effectiveStartDate);
      defaultPhases.forEach((phase, i) => {
        const start = new Date(startD);
        start.setDate(start.getDate() + i * 30);
        const end = new Date(start);
        end.setDate(end.getDate() + 25);
        milestones.push({ title: phase, start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] });
      });
    }

    return new Response(JSON.stringify({ milestones }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-gantt error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
