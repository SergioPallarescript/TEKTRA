import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Eres un asistente experto en redacción del Libro del Edificio (España, CTE/LOE).

IDIOMA OBLIGATORIO: Responde SIEMPRE y EXCLUSIVAMENTE en ESPAÑOL DE ESPAÑA (castellano). NUNCA uses portugués, catalán, gallego, inglés ni ningún otro idioma. Toda cadena de texto que generes (fichas L/I/N/R, descripciones, etiquetas de materiales) debe estar en español castellano correcto.

Recibirás:
1. Información básica del proyecto.
2. Documentos del proyecto procedentes de TODOS los módulos: Documentos del Proyecto, Planos Válidos (todas las versiones), Validación Económica (certificaciones, presupuestos, partidas), Documentos y Firma. Incluyen memorias, proyectos de ejecución, escrituras, certificados, planos arquitectónicos y de instalaciones.
3. Historial de órdenes e incidencias.

Tareas:
A. Extraer DATOS ADMINISTRATIVOS, REGISTRALES y DE SUPERFICIES (Volumen 1) de cualquier punto de los documentos.
B. Detectar materiales/sistemas constructivos y proponer fichas de Mantenimiento (Limpieza, Inspección, Normas de uso, Reparación) ajustadas a CTE.

LECTURA DE TABLAS Y PLANOS — CRÍTICO:
- Los datos de SUPERFICIES (parcela, construida, útil), número de viviendas y plantas suelen aparecer en TABLAS dentro de la Memoria del Proyecto de Ejecución o en cuadros de superficies de los planos. DEBES leer e interpretar tablas, sub-tablas y celdas combinadas.
- En planos (alzados, plantas, cuadros de superficies útiles, cuadro general), interpreta visualmente: lee rótulos, leyendas, cuadros de cotas, cajetines y cuadros resumen de superficies. Suma superficies por planta cuando proceda.
- Busca explícitamente secciones tipo "CUADRO DE SUPERFICIES", "SUPERFICIE ÚTIL", "SUPERFICIE CONSTRUIDA", "MEMORIA DESCRIPTIVA", "DATOS URBANÍSTICOS".
- Si el dato aparece en una tabla, EXTRÁELO aunque esté en formato visual complejo.

REGLAS:
- NO inventes datos. Si un dato no aparece literalmente, deja el campo en null.
- Lee con detalle: superficies, agentes, número de viviendas, plantas, fechas de licencia/inicio/fin, póliza decenal, datos registrales (Tomo/Libro/Folio/Finca).
- Si encuentras varios valores contradictorios, prioriza el del documento más reciente o el de la Memoria del Proyecto de Ejecución.
- Las fichas L/I/N/R deben estar redactadas en ESPAÑOL profesional técnico de construcción español.`;

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

// Convierte un Blob a data URI base64 (para multimodal Gemini)
const blobToDataUri = async (blob: Blob, mime: string): Promise<string> => {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(bin)}`;
};

const guessMime = (name: string, fallback?: string | null): string => {
  if (fallback && fallback !== "application/octet-stream") return fallback;
  const ext = name.toLowerCase().split(".").pop() || "";
  if (ext === "pdf") return "application/pdf";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return `image/${ext === "jpg" ? "jpeg" : ext}`;
  if (ext === "txt") return "text/plain";
  return fallback || "application/octet-stream";
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

    const [{ data: project }, { data: member }] = await Promise.all([
      supabase.from("projects").select("id, name, address, referencia_catastral, description, created_by").eq("id", projectId).single(),
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

    // 1. Memoria sincronizada (órdenes/incidencias)
    const memoryPath = `project-memory/${projectId}/memoria_dinamica_${projectId}.txt`;
    const { data: memoryFile } = await supabase.storage.from("plans").download(memoryPath);
    const memoryText = memoryFile ? await memoryFile.text() : "";

    // 2. Documentos de TODOS los módulos relevantes
    type DocSource = { source: string; file_name: string; file_type: string | null; file_url: string; file_size: number | null; priority: number };
    const allDocs: DocSource[] = [];

    // 2.a Documentos del Proyecto
    const { data: projDocs } = await supabase
      .from("project_documents")
      .select("file_name, file_type, file_url, file_size, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    for (const d of projDocs || []) {
      const isMemoria = /memoria|proyecto|ejecuc/i.test(d.file_name);
      allDocs.push({ source: "Documentos Proyecto", file_name: d.file_name, file_type: d.file_type, file_url: d.file_url, file_size: d.file_size, priority: isMemoria ? 1 : 3 });
    }

    // 2.b Planos Válidos (versión vigente de cada plano)
    const { data: plansList } = await supabase
      .from("plans")
      .select("id, name, current_version")
      .eq("project_id", projectId);
    if (plansList && plansList.length) {
      const planIds = plansList.map((p: any) => p.id);
      const { data: planVers } = await supabase
        .from("plan_versions")
        .select("plan_id, file_name, file_url, file_size, version_number")
        .in("plan_id", planIds);
      for (const pl of plansList) {
        const vers = (planVers || []).filter((v: any) => v.plan_id === pl.id && v.version_number === pl.current_version);
        for (const v of vers) {
          allDocs.push({ source: "Planos Válidos", file_name: `[Plano] ${pl.name} - ${v.file_name}`, file_type: null, file_url: v.file_url, file_size: v.file_size, priority: 2 });
        }
      }
    }

    // 2.c Validación Económica (cost_claims con archivo)
    const { data: claims } = await supabase
      .from("cost_claims")
      .select("title, file_name, file_url, doc_type")
      .eq("project_id", projectId)
      .not("file_url", "is", null);
    for (const c of claims || []) {
      if (!c.file_url || !c.file_name) continue;
      allDocs.push({ source: "Validación Económica", file_name: `[Económico] ${c.title} - ${c.file_name}`, file_type: null, file_url: c.file_url, file_size: null, priority: 4 });
    }

    // 2.d Documentos y Firma (signature_documents)
    const { data: sigDocs } = await supabase
      .from("signature_documents")
      .select("title, original_file_name, original_file_path, mime_type, file_size")
      .eq("project_id", projectId);
    for (const s of sigDocs || []) {
      allDocs.push({ source: "Documentos y Firma", file_name: `[Firma] ${s.title} - ${s.original_file_name}`, file_type: s.mime_type, file_url: s.original_file_path, file_size: s.file_size, priority: 4 });
    }

    // Ordenar por prioridad (memorias y planos primero)
    allDocs.sort((a, b) => a.priority - b.priority);

    // 3. Texto libre de slots tipo "text" del CFO ya rellenados
    const { data: cfoTextSlots } = await supabase
      .from("cfo_items")
      .select("title, text_content")
      .eq("project_id", projectId)
      .eq("slot_type", "text")
      .not("text_content", "is", null);

    const cfoTextBlock = (cfoTextSlots || [])
      .filter((s: any) => (s.text_content || "").trim().length > 0)
      .map((s: any) => `### ${s.title}\n${s.text_content}`)
      .join("\n\n");

    // 4. Construir contenido multimodal: descargamos hasta 12 PDFs/imágenes (límite ~18MB)
    const MAX_FILES = 12;
    const MAX_TOTAL_BYTES = 18 * 1024 * 1024;
    let totalBytes = 0;
    const attachments: { name: string; source: string; dataUri: string; mime: string }[] = [];
    const skipped: string[] = [];

    for (const d of allDocs) {
      if (attachments.length >= MAX_FILES) { skipped.push(`${d.file_name} (límite de archivos)`); continue; }
      const mime = guessMime(d.file_name, d.file_type);
      const isPdf = mime === "application/pdf";
      const isImg = mime.startsWith("image/");
      if (!isPdf && !isImg) {
        skipped.push(`${d.file_name} (formato no soportado)`);
        continue;
      }
      const size = Number(d.file_size || 0);
      if (size > 0 && totalBytes + size > MAX_TOTAL_BYTES) {
        skipped.push(`${d.file_name} (excede tamaño)`);
        continue;
      }
      try {
        const { data: blob, error: dlErr } = await supabase.storage.from("plans").download(d.file_url);
        if (dlErr || !blob) {
          skipped.push(`${d.file_name} (no descargable)`);
          continue;
        }
        if (totalBytes + blob.size > MAX_TOTAL_BYTES) {
          skipped.push(`${d.file_name} (excede tamaño tras descarga)`);
          continue;
        }
        const dataUri = await blobToDataUri(blob, mime);
        attachments.push({ name: d.file_name, source: d.source, dataUri, mime });
        totalBytes += blob.size;
      } catch (e) {
        console.error("download error", d.file_name, e);
        skipped.push(`${d.file_name} (error de descarga)`);
      }
    }

    console.log(`cfo-ai-analyze: ${attachments.length}/${allDocs.length} adjuntos cargados (${(totalBytes / 1024).toFixed(0)}KB), ${skipped.length} omitidos`);

    const docList = attachments.map((a) => `- [${a.source}] ${a.name}`).join("\n") || "(ninguno)";

    const userTextHeader = `PROYECTO: ${project.name}
DIRECCIÓN: ${project.address || "N/D"}
REF. CATASTRAL: ${project.referencia_catastral || "N/D"}
DESCRIPCIÓN: ${project.description || "N/D"}

DOCUMENTOS ADJUNTOS (${attachments.length} de ${allDocs.length} disponibles):
${docList}
${skipped.length ? `\nOMITIDOS: ${skipped.slice(0, 10).join("; ")}` : ""}

CONTENIDO DE SLOTS DE TEXTO YA RELLENADOS EN EL LDE:
${cfoTextBlock || "(vacío)"}

HISTORIAL (Órdenes/Incidencias):
${memoryText.slice(0, 8000) || "(sin historial)"}

INSTRUCCIONES CRÍTICAS:
1. RESPONDE EXCLUSIVAMENTE EN ESPAÑOL CASTELLANO. Nunca portugués, nunca otro idioma.
2. Lee el contenido COMPLETO de cada documento adjunto, incluyendo TABLAS, sub-tablas, cuadros de superficies, leyendas de planos y cajetines.
3. Para SUPERFICIES (parcela, construida, útil): busca "CUADRO DE SUPERFICIES", "SUPERFICIE ÚTIL", "SUPERFICIE CONSTRUIDA" en memorias y planos. Suma por planta si es necesario.
4. Para datos REGISTRALES (Tomo/Libro/Folio/Finca/NRC): revisa escrituras y nota simple registral.
5. Para PÓLIZA DECENAL: revisa certificados de seguro y escrituras de obra nueva.
6. Para FECHAS de licencia/inicio/fin: revisa licencia municipal, acta de replanteo y certificado final de obra.
7. Para FICHAS L/I/N/R: detecta materiales en memoria constructiva y planos de detalle. Redacta en español profesional.
8. Devuelve null SOLO cuando no exista evidencia documental.`;

    // Mensaje multimodal: texto + cada documento como image_url (Gemini acepta PDFs vía data URI)
    const userContent: any[] = [{ type: "text", text: userTextHeader }];
    for (const att of attachments) {
      userContent.push({
        type: "image_url",
        image_url: { url: att.dataUri },
      });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        tools: [TOOL_DEFINITION],
        tool_choice: { type: "function", function: { name: "extract_lde_data" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText.slice(0, 500));
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

    let draftsCreated = 0;
    for (const d of drafts) {
      if (!d.material_key) continue;
      const { data: existingDraft } = await supabase
        .from("cfo_lir_drafts")
        .select("id, is_validated")
        .eq("project_id", projectId)
        .eq("material_key", d.material_key)
        .maybeSingle();

      if (existingDraft?.is_validated) continue;

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
      documentsAnalyzed: attachments.length,
      documentsSkipped: skipped.length,
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
