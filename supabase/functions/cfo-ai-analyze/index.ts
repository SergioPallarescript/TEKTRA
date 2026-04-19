import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Eres un asistente experto en redacción del Libro del Edificio (España, CTE/LOE).
Recibes el texto extraído de la Memoria del Proyecto y otros documentos. Debes:
1. Extraer datos administrativos, registrales y de superficies (Volumen 1).
2. Detectar materiales/sistemas constructivos relevantes y proponer fichas de Mantenimiento (Limpieza, Inspección, Normas de uso, Reparación) ajustadas a normativa vigente.
NO inventes datos: si no aparecen en el texto, deja el campo en null.`;

const TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "extract_lde_data",
    description: "Extrae datos del Volumen 1 y propone fichas L/I/N/R por material",
    parameters: {
      type: "object",
      properties: {
        volume1: {
          type: "object",
          properties: {
            municipio: { type: ["string", "null"] },
            emplazamiento: { type: ["string", "null"] },
            codigo_postal: { type: ["string", "null"] },
            nrc: { type: ["string", "null"], description: "Número de Referencia Catastral (20 caracteres)" },
            registro_numero: { type: ["string", "null"] },
            tomo: { type: ["string", "null"] },
            libro: { type: ["string", "null"] },
            folio: { type: ["string", "null"] },
            finca: { type: ["string", "null"] },
            poliza_decenal_compania: { type: ["string", "null"] },
            poliza_decenal_numero: { type: ["string", "null"] },
            superficie_parcela: { type: ["number", "null"], description: "m²" },
            superficie_construida: { type: ["number", "null"], description: "m²" },
            superficie_util: { type: ["number", "null"], description: "m²" },
            numero_viviendas: { type: ["integer", "null"] },
            numero_plantas: { type: ["integer", "null"] },
            fecha_licencia_obra: { type: ["string", "null"], description: "YYYY-MM-DD" },
            numero_licencia_obra: { type: ["string", "null"] },
            fecha_inicio_obra: { type: ["string", "null"], description: "YYYY-MM-DD" },
            fecha_fin_obra: { type: ["string", "null"], description: "YYYY-MM-DD" },
          },
          required: [],
          additionalProperties: false,
        },
        lir_drafts: {
          type: "array",
          description: "Fichas de mantenimiento por material/sistema constructivo detectado",
          items: {
            type: "object",
            properties: {
              material_key: { type: "string", description: "snake_case, p.ej. carpinteria_aluminio" },
              material_label: { type: "string", description: "Nombre legible del material" },
              category: {
                type: "string",
                enum: ["carpinteria", "estructura", "cubierta", "fachada", "instalaciones", "acabados", "otros"],
              },
              limpieza: { type: "string", description: "Frecuencia y método" },
              inspeccion: { type: "string", description: "Periodicidad y puntos de control" },
              normas_uso: { type: "string", description: "Prohibiciones y recomendaciones" },
              reparacion: { type: "string", description: "Procedimientos comunes" },
            },
            required: ["material_key", "material_label", "category", "limpieza", "inspeccion", "normas_uso", "reparacion"],
            additionalProperties: false,
          },
        },
      },
      required: ["volume1", "lir_drafts"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Backend no configurado");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no configurada");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { projectId } = await req.json();
    if (!projectId || typeof projectId !== "string") {
      return new Response(JSON.stringify({ error: "projectId requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify access
    const [{ data: project }, { data: member }] = await Promise.all([
      supabase.from("projects").select("id, name, address, referencia_catastral, created_by").eq("id", projectId).single(),
      supabase.from("project_members").select("id, role").eq("project_id", projectId).eq("user_id", authData.user.id).eq("status", "accepted").maybeSingle(),
    ]);

    if (!project) {
      return new Response(JSON.stringify({ error: "Proyecto no encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isAdmin = project.created_by === authData.user.id || (member && ["DO", "DEM"].includes(member.role));
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Solo DO/DEM pueden ejecutar el análisis IA" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load existing memory file (built by sync-project-memory) and project documents text content if any
    const memoryPath = `project-memory/${projectId}/memoria_dinamica_${projectId}.txt`;
    const { data: memoryFile } = await supabase.storage.from("plans").download(memoryPath);
    const memoryText = memoryFile ? await memoryFile.text() : "";

    const { data: docs } = await supabase
      .from("project_documents")
      .select("file_name, file_type")
      .eq("project_id", projectId)
      .limit(50);

    const docsList = (docs || []).map((d) => `- ${d.file_name} (${d.file_type || "?"})`).join("\n");

    const userPrompt = `PROYECTO: ${project.name}
DIRECCIÓN: ${project.address || "N/D"}
REF. CATASTRAL: ${project.referencia_catastral || "N/D"}

DOCUMENTOS DEL PROYECTO DISPONIBLES:
${docsList || "(ninguno)"}

HISTORIAL Y MEMORIA SINCRONIZADA:
${memoryText.slice(0, 12000) || "(sin historial)"}

Extrae los datos del Volumen 1 y propone fichas de mantenimiento para los materiales detectados.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [TOOL_DEFINITION],
        tool_choice: { type: "function", function: { name: "extract_lde_data" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Demasiadas consultas. Inténtalo de nuevo en unos segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos agotados. Contacta con el administrador." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Error del servicio de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call returned", JSON.stringify(aiJson).slice(0, 500));
      return new Response(JSON.stringify({ error: "La IA no devolvió datos estructurados" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      return new Response(JSON.stringify({ error: "Respuesta IA malformada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vol1 = parsed.volume1 || {};
    const drafts = Array.isArray(parsed.lir_drafts) ? parsed.lir_drafts : [];

    // Load existing volume1 row to preserve manually validated fields
    const { data: existing } = await supabase
      .from("cfo_volume1_data")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();

    const fields = [
      "municipio", "emplazamiento", "codigo_postal", "nrc",
      "registro_numero", "tomo", "libro", "folio", "finca",
      "poliza_decenal_compania", "poliza_decenal_numero",
      "superficie_parcela", "superficie_construida", "superficie_util",
      "numero_viviendas", "numero_plantas",
      "fecha_licencia_obra", "numero_licencia_obra", "fecha_inicio_obra", "fecha_fin_obra",
    ];

    const upsertPayload: Record<string, any> = {
      project_id: projectId,
      last_ai_scan_at: new Date().toISOString(),
      last_ai_scan_by: authData.user.id,
    };

    let suggestionsApplied = 0;
    for (const f of fields) {
      const aiValue = vol1[f];
      const existingValue = existing?.[f];
      const existingAi = existing?.[`${f}_ai`];

      // Solo sobrescribimos si: (a) no hay valor existente, o (b) el existente venía de IA sin validar
      const shouldOverride = aiValue !== null && aiValue !== undefined &&
        (existingValue === null || existingValue === undefined || existingValue === "" || existingAi === true);

      if (shouldOverride) {
        upsertPayload[f] = aiValue;
        upsertPayload[`${f}_ai`] = true;
        suggestionsApplied++;
      } else if (existing) {
        upsertPayload[f] = existingValue;
        upsertPayload[`${f}_ai`] = existingAi || false;
      }
    }

    const { error: upsertErr } = await supabase
      .from("cfo_volume1_data")
      .upsert(upsertPayload, { onConflict: "project_id" });

    if (upsertErr) {
      console.error("upsert volume1 error", upsertErr);
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // L/I/N/R drafts
    let draftsCreated = 0;
    for (const d of drafts) {
      if (!d.material_key) continue;
      const { data: existingDraft } = await supabase
        .from("cfo_lir_drafts")
        .select("id, is_validated")
        .eq("project_id", projectId)
        .eq("material_key", d.material_key)
        .maybeSingle();

      if (existingDraft?.is_validated) continue; // no tocar fichas validadas

      const payload = {
        project_id: projectId,
        material_key: d.material_key,
        material_label: d.material_label,
        category: d.category || "otros",
        limpieza: d.limpieza || "",
        inspeccion: d.inspeccion || "",
        normas_uso: d.normas_uso || "",
        reparacion: d.reparacion || "",
        is_validated: false,
        generated_by: authData.user.id,
        generated_at: new Date().toISOString(),
      };

      if (existingDraft) {
        await supabase.from("cfo_lir_drafts").update(payload).eq("id", existingDraft.id);
      } else {
        await supabase.from("cfo_lir_drafts").insert(payload);
        draftsCreated++;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      suggestionsApplied,
      draftsCreated,
      totalDrafts: drafts.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("cfo-ai-analyze error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
