import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Unauthorized");

    const { projectId } = await req.json();
    if (!projectId) throw new Error("projectId required");

    // Verify caller is a project member or creator
    const { data: projectCheck } = await supabase.from("projects").select("created_by").eq("id", projectId).single();
    if (!projectCheck) throw new Error("Project not found");
    if (projectCheck.created_by !== user.id) {
      const { data: memberCheck } = await supabase
        .from("project_members")
        .select("id")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .eq("status", "accepted")
        .maybeSingle();
      if (!memberCheck) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const [
      { data: project },
      { data: cover },
      { data: orders },
      { data: members },
    ] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase.from("book_covers").select("*").eq("project_id", projectId).eq("book_type", "orders").maybeSingle(),
      supabase.from("orders").select("*").eq("project_id", projectId).order("created_at", { ascending: true }),
      supabase.from("project_members").select("*").eq("project_id", projectId).eq("status", "accepted"),
    ]);

    if (!project) throw new Error("Project not found");

    // Fetch order validations
    const orderIds = (orders || []).map((o: any) => o.id);
    const { data: validations } = orderIds.length > 0
      ? await supabase.from("order_validations").select("*").in("order_id", orderIds)
      : { data: [] };
    const validationsByOrder: Record<string, any[]> = {};
    (validations || []).forEach((v: any) => {
      if (!validationsByOrder[v.order_id]) validationsByOrder[v.order_id] = [];
      validationsByOrder[v.order_id].push(v);
    });

    // Fetch profiles
    const creatorIds = [...new Set((orders || []).map((o: any) => o.created_by))];
    const recipientSignerIds = (orders || []).map((o: any) => o.recipient_signed_by).filter(Boolean);
    const memberIds = (members || []).map((m: any) => m.user_id).filter(Boolean);
    const validatorIds = (validations || []).map((v: any) => v.user_id);
    const allIds = [...new Set([...creatorIds, ...recipientSignerIds, ...memberIds, ...validatorIds])];
    const { data: profiles } = allIds.length > 0
      ? await supabase.from("profiles").select("user_id, full_name, role, dni_cif").in("user_id", allIds)
      : { data: [] };
    const profileMap: Record<string, any> = {};
    (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p; });

    // Fetch logo
    let logoBase64 = "";
    try {
      const { data: logoData } = await supabase.storage.from("plans").download("tectra-logo.png");
      if (logoData) {
        const buf = await logoData.arrayBuffer();
        logoBase64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      }
    } catch {}

    const today = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
    const c = cover as any;
    const directores = (c?.directores_obra || []) as { nombre: string; colegiado: string }[];

    const totalPages = 1 + (orders || []).length + ((orders || []).length > 0 ? 1 : 0);

    // === STYLES ===
    const styles = `
      @media print {
        .page-footer { position: fixed; bottom: 0; left: 0; right: 0; }
      }
      .stamp-box {
        display: inline-block;
        width: 48%;
        border: 2px solid #FF0000;
        background: rgba(200, 200, 200, 0.80);
        font-size: 9px;
        line-height: 1.4;
        color: #111;
        margin: 4px 1%;
        vertical-align: top;
        box-sizing: border-box;
      }
      .stamp-inner {
        display: flex;
        flex-direction: row;
      }
      .stamp-col1 {
        width: 35%;
        padding: 6px 8px;
        border-right: 1px solid #ccc;
      }
      .stamp-col2 {
        width: 30%;
        padding: 6px 8px;
        border-right: 1px solid #ccc;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .stamp-col3 {
        width: 35%;
        padding: 6px 8px;
      }
      .stamp-label {
        color: #6b7280;
        font-size: 8px;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .stamp-value {
        font-weight: 600;
        font-size: 9px;
      }
      .stamps-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0;
        margin-top: 12px;
      }
      .page-number {
        text-align: center;
        font-size: 10px;
        color: #6b7280;
        padding: 16px 0 8px;
        border-top: 1px solid #e5e7eb;
        margin-top: auto;
      }
      .annex-table {
        width: 100%;
        border-collapse: collapse;
      }
      .annex-table th,
      .annex-table td {
        padding: 4px 8px;
        border: 1px solid #ddd;
        vertical-align: middle;
        line-height: 1.1;
      }
      .annex-table th {
        background: #f9fafb;
        font-size: 9px;
        font-weight: 700;
        text-align: center;
      }
      .annex-table td {
        font-size: 10px;
      }
      .annex-hash {
        font-family: monospace;
        font-size: 8px;
        word-break: break-all;
      }
    `;

    // Helper to render a signature stamp (3-column layout)
    const renderStamp = (type: string, name: string, dniCif: string, date: string, geo: string, hash: string, role: string, signatureImage?: string) => {
      const typeLabel = type === "p12" ? "✅ CERTIFICADO DIGITAL" : "✍️ FIRMA MANUAL";

      const col1 = `
        <div class="stamp-col1">
          <div class="stamp-value" style="margin-bottom:4px;">${typeLabel}</div>
          <div><span class="stamp-label">Por:</span> <span class="stamp-value">${name}</span></div>
          <div><span class="stamp-label">DNI/NIF:</span> <span class="stamp-value">${dniCif || "—"}</span></div>
          <div><span class="stamp-label">Rol:</span> <span class="stamp-value">${role || "—"}</span></div>
        </div>`;

      const rubricaHtml = signatureImage && type !== "p12"
        ? `<img src="${signatureImage}" style="max-width:90%;max-height:50px;border:1px solid #ccc;background:#fff;padding:1px;" />`
        : (type === "p12" ? '<div style="font-size:8px;color:#059669;font-weight:bold;">FIRMA DIGITAL</div>' : '<div style="font-size:8px;color:#999;">Sin rúbrica</div>');

      const col2 = `
        <div class="stamp-col2">
          ${rubricaHtml}
        </div>`;

      const hashShort = hash ? (hash.length > 32 ? hash.substring(0, 32) + "…" : hash) : "—";
      const col3 = `
        <div class="stamp-col3">
          <div><span class="stamp-label">Fecha:</span> <span class="stamp-value">${date}</span></div>
          <div><span class="stamp-label">Geo:</span> <span class="stamp-value">${geo || "—"}</span></div>
          <div><span class="stamp-label">Hash:</span> <span style="font-family:monospace;font-size:7px;word-break:break-all;">${hashShort}</span></div>
        </div>`;

      return `<div class="stamp-box"><div class="stamp-inner">${col1}${col2}${col3}</div></div>`;
    };

    // === COVER PAGE ===
    const coverPageHtml = `
      <div style="page-break-after:always;min-height:90vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:60px 40px;">
        ${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" style="height:30px;margin-bottom:24px;opacity:0.5;" />` : '<p style="font-size:18px;font-weight:bold;margin-bottom:24px;opacity:0.5;">TEKTRA</p>'}
        <h1 style="font-size:28px;font-weight:bold;letter-spacing:-0.02em;margin:0 0 8px;">LIBRO DE ÓRDENES Y ASISTENCIAS</h1>
        ${c?.libro_numero ? `<p style="font-size:16px;color:#6b7280;margin:0 0 32px;">Libro Nº ${c.libro_numero}</p>` : ""}
        
        <table style="width:100%;max-width:500px;border-collapse:collapse;text-align:left;margin:24px 0;">
          <tr><td style="padding:8px 12px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;width:160px;">Obra:</td><td style="padding:8px 12px;font-size:13px;font-weight:600;border-bottom:1px solid #e5e7eb;">${project.name}</td></tr>
          <tr><td style="padding:8px 12px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Situación:</td><td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #e5e7eb;">${project.address || "—"}</td></tr>
          ${project.referencia_catastral ? `<tr><td style="padding:8px 12px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;font-weight:bold;">Ref. Catastral:</td><td style="padding:8px 12px;font-size:13px;font-weight:bold;border-bottom:1px solid #e5e7eb;letter-spacing:0.05em;">${project.referencia_catastral}</td></tr>` : ""}
          ${c?.colegio_oficial ? `<tr><td style="padding:8px 12px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Colegio Oficial:</td><td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #e5e7eb;">${c.colegio_oficial}</td></tr>` : ""}
          ${c?.propietario_promotor ? `<tr><td style="padding:8px 12px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Promotor:</td><td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #e5e7eb;">${c.propietario_promotor}</td></tr>` : ""}
          ${directores.map((d, i) => `<tr><td style="padding:8px 12px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Director${directores.length > 1 ? ` ${i + 1}` : ""} de Obra:</td><td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #e5e7eb;">${d.nombre}${d.colegiado ? ` — Col. ${d.colegiado}` : ""}</td></tr>`).join("")}
          ${c?.director_ejecucion_nombre ? `<tr><td style="padding:8px 12px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Dir. Ejecución:</td><td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #e5e7eb;">${c.director_ejecucion_nombre}${c.director_ejecucion_colegiado ? ` — Col. ${c.director_ejecucion_colegiado}` : ""}</td></tr>` : ""}
          ${c?.fecha_comienzo ? `<tr><td style="padding:8px 12px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Fecha Comienzo:</td><td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #e5e7eb;">${new Date(c.fecha_comienzo).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</td></tr>` : ""}
          <tr><td style="padding:8px 12px;font-size:12px;color:#6b7280;">Total Órdenes:</td><td style="padding:8px 12px;font-size:13px;font-weight:600;">${(orders || []).length}</td></tr>
        </table>

        <p style="font-size:10px;color:#9ca3af;margin-top:40px;">Documento generado por TEKTRA — ${today}</p>
        <div class="page-number">Página 1 de ${totalPages}</div>
      </div>
    `;

    // === ORDER PAGES ===
    const orderPages = (orders || []).map((order: any, idx: number) => {
      const author = profileMap[order.created_by];
      const date = new Date(order.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
      const signedDate = order.signed_at
        ? new Date(order.signed_at).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
        : date;

      const contentHtml = order.content
        .replace(/\*\*ESTADO DE LA OBRA:\*\*/g, '<strong style="color:#059669;">ESTADO DE LA OBRA:</strong>')
        .replace(/\*\*INSTRUCCIONES Y ÓRDENES:\*\*/g, '<strong style="color:#2563eb;">INSTRUCCIONES Y ÓRDENES:</strong>')
        .replace(/\*\*PENDIENTES:\*\*/g, '<strong style="color:#d97706;">PENDIENTES:</strong>')
        .replace(/\n/g, "<br>");

      // Build stamps
      const stamps: string[] = [];
      stamps.push(renderStamp(
        order.signature_type || "manual",
        author?.full_name || "—",
        author?.dni_cif || "—",
        signedDate,
        order.signature_geo || "",
        order.signature_hash || "",
        author?.role || "—",
        order.signature_type !== "p12" ? (order.signature_image || undefined) : undefined
      ));

      // Add recipient counter-signature stamp
      if (order.recipient_signed_by && order.recipient_signed_at) {
        const recipientProfile = profileMap[order.recipient_signed_by];
        const recipientDate = new Date(order.recipient_signed_at).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
        stamps.push(renderStamp(
          order.recipient_signature_type || "manual",
          recipientProfile?.full_name || "—",
          recipientProfile?.dni_cif || "—",
          recipientDate,
          order.recipient_signature_geo || "",
          order.recipient_signature_hash || "",
          recipientProfile?.role || "DESTINATARIO",
          order.recipient_signature_type !== "p12" ? (order.recipient_signature_image || undefined) : undefined
        ));
      }

      // Add validation stamps
      const orderValidations = validationsByOrder[order.id] || [];
      orderValidations.forEach((v: any) => {
        const vProfile = profileMap[v.user_id];
        const vDate = new Date(v.validated_at).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
        stamps.push(renderStamp(
          "manual",
          vProfile?.full_name || "—",
          vProfile?.dni_cif || "—",
          vDate,
          v.geo_location || "",
          "",
          v.role || vProfile?.role || "—"
        ));
      });

      const pageNum = idx + 2;

      return `
        <div style="page-break-before:always;padding:40px 20px;min-height:90vh;display:flex;flex-direction:column;">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:20px;">
            <div>
              ${c?.libro_numero ? `<p style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;margin:0;">Libro de órdenes y asistencias nº ${c.libro_numero}</p>` : ""}
              <p style="font-size:16px;font-weight:bold;margin:4px 0 0;">Orden nº ${order.order_number}</p>
            </div>
            <span style="font-size:11px;color:#6b7280;">${date}</span>
          </div>

          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
            ${order.dirigida_a ? `<tr><td style="padding:4px 8px;font-size:11px;color:#6b7280;width:100px;">Dirigida a:</td><td style="padding:4px 8px;font-size:11px;font-weight:600;">${order.dirigida_a}</td></tr>` : ""}
            ${order.escrita_por ? `<tr><td style="padding:4px 8px;font-size:11px;color:#6b7280;">Escrita por:</td><td style="padding:4px 8px;font-size:11px;">${order.escrita_por}</td></tr>` : ""}
            ${order.asunto ? `<tr><td style="padding:4px 8px;font-size:11px;color:#6b7280;">Asunto:</td><td style="padding:4px 8px;font-size:11px;font-weight:600;">${order.asunto}</td></tr>` : ""}
          </table>

          <div style="font-size:12px;line-height:1.7;margin-bottom:24px;flex:1;">${contentHtml}</div>

          <div style="border-top:1px solid #e5e7eb;padding-top:16px;">
            <p style="font-size:9px;color:#6b7280;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.05em;">Firmas y Sellos de Integridad</p>
            <div class="stamps-row">
              ${stamps.join("")}
            </div>
          </div>
          <div class="page-number">Página ${pageNum} de ${totalPages}</div>
        </div>
      `;
    }).join("");

    // === HASH INDEX ANNEX ===
    const annexPageNum = 1 + (orders || []).length + 1;
    const hashRows = (orders || []).map((order: any) => {
      const author = profileMap[order.created_by];
      return `<tr>
        <td style="text-align:center;">${order.order_number}</td>
        <td>${order.asunto || "—"}</td>
        <td>${author?.full_name || "—"}</td>
        <td class="annex-hash">${order.signature_hash || "—"}</td>
        <td style="text-align:center;">${order.signature_type === "p12" ? "Cert." : "Manual"}</td>
      </tr>`;
    }).join("");

    const annexHtml = (orders || []).length > 0 ? `
      <div style="page-break-before:always;padding:40px 20px;">
        <h2 style="font-size:16px;font-weight:bold;margin:0 0 8px;">ANEXO TÉCNICO — Índice de Trazabilidad</h2>
        <p style="font-size:10px;color:#6b7280;margin:0 0 16px;">Hashes SHA-256 de integridad para verificación pericial</p>
        <table class="annex-table">
          <tr>
            <th>Nº</th>
            <th style="text-align:left;">Asunto</th>
            <th style="text-align:left;">Firmante</th>
            <th style="text-align:left;">Hash SHA-256</th>
            <th>Tipo</th>
          </tr>
          ${hashRows}
        </table>
        <p style="font-size:8px;color:#9ca3af;margin-top:16px;text-align:center;">
          Generado por TEKTRA — ${today}. Este anexo forma parte del expediente de trazabilidad del Libro de Órdenes.
        </p>
        <div class="page-number">Página ${annexPageNum} de ${totalPages}</div>
      </div>
    ` : "";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Libro de Órdenes — ${project.name}</title>
  <style>${styles}</style>
</head>
<body style="font-family:'Montserrat',Arial,sans-serif;max-width:800px;margin:0 auto;padding:0;color:#1f2937;">
  ${coverPageHtml}
  ${orderPages}
  ${annexHtml}
</body>
</html>`;

    return new Response(JSON.stringify({ html, fileName: `Libro_Ordenes_${project.name.replace(/\s+/g, "_")}.html` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
