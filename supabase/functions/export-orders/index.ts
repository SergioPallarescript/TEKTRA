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
    const memberIds = (members || []).map((m: any) => m.user_id).filter(Boolean);
    const validatorIds = (validations || []).map((v: any) => v.user_id);
    const allIds = [...new Set([...creatorIds, ...memberIds, ...validatorIds])];
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

    // === STAMP STYLES ===
    const stampStyles = `
      .stamp-digital {
        display: inline-block;
        border: 2px solid #FF0000;
        background: rgba(200, 200, 200, 0.80);
        padding: 8px 12px;
        font-size: 9px;
        line-height: 1.5;
        color: #111;
        margin: 4px;
        max-width: 280px;
        vertical-align: top;
      }
      .stamp-manual {
        display: inline-block;
        border: 2px solid #FF0000;
        background: rgba(200, 200, 200, 0.80);
        padding: 8px 12px;
        font-size: 9px;
        line-height: 1.5;
        color: #111;
        margin: 4px;
        max-width: 280px;
        vertical-align: top;
      }
      .stamps-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }
    `;

    // Helper to render a signature stamp
    const renderStamp = (type: string, name: string, dniCif: string, date: string, geo: string, hash: string, role: string) => {
      if (type === "p12") {
        return `<div class="stamp-digital">
          <div style="font-weight:bold;font-size:10px;margin-bottom:2px;">✅ FIRMADO DIGITALMENTE</div>
          <div>Por: <strong>${name}</strong></div>
          <div>DNI/NIE: <strong>${dniCif || "—"}</strong></div>
          <div>Rol: ${role || "—"}</div>
          <div>Fecha: ${date}</div>
          <div>Geo: ${geo || "—"}</div>
          ${hash ? `<div style="font-family:monospace;font-size:7px;word-break:break-all;margin-top:2px;">Hash: ${hash}</div>` : ""}
        </div>`;
      }
      return `<div class="stamp-manual">
        <div style="font-weight:bold;font-size:10px;margin-bottom:2px;">✍️ FIRMA MANUAL</div>
        <div>Por: <strong>${name}</strong></div>
        <div>DNI/NIE: <strong>${dniCif || "—"}</strong></div>
        <div>Rol: ${role || "—"}</div>
        <div>Fecha: ${date}</div>
        <div>Geo: ${geo || "—"}</div>
        ${hash ? `<div style="font-family:monospace;font-size:7px;word-break:break-all;margin-top:2px;">Hash SHA-256: ${hash}</div>` : ""}
      </div>`;
    };

    // === COVER PAGE ===
    const coverPageHtml = `
      <div style="page-break-after:always;min-height:90vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:60px 40px;">
        ${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" style="height:50px;margin-bottom:24px;" />` : '<p style="font-size:24px;font-weight:bold;margin-bottom:24px;">TEKTRA</p>'}
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
      </div>
    `;

    // === ORDER PAGES ===
    const orderPages = (orders || []).map((order: any) => {
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

      // Build stamps: author stamp + validation stamps
      const stamps: string[] = [];
      stamps.push(renderStamp(
        order.signature_type || "manual",
        author?.full_name || "—",
        author?.dni_cif || "—",
        signedDate,
        order.signature_geo || "",
        order.signature_hash || "",
        author?.role || "—"
      ));

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

      return `
        <div style="page-break-before:always;padding:40px 20px;min-height:90vh;">
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

          <div style="font-size:12px;line-height:1.7;margin-bottom:24px;">${contentHtml}</div>

          <div style="border-top:1px solid #e5e7eb;padding-top:16px;">
            <p style="font-size:9px;color:#6b7280;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.05em;">Firmas y Sellos de Integridad</p>
            <div class="stamps-row">
              ${stamps.join("")}
            </div>
          </div>
        </div>
      `;
    }).join("");

    // === HASH INDEX ANNEX ===
    const hashRows = (orders || []).map((order: any) => {
      const author = profileMap[order.created_by];
      return `<tr>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:10px;text-align:center;">${order.order_number}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:10px;">${order.asunto || "—"}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:10px;">${author?.full_name || "—"}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:8px;font-family:monospace;word-break:break-all;">${order.signature_hash || "—"}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:10px;text-align:center;">${order.signature_type === "p12" ? "Cert. Digital" : "Manual"}</td>
      </tr>`;
    }).join("");

    const annexHtml = (orders || []).length > 0 ? `
      <div style="page-break-before:always;padding:40px 20px;">
        <h2 style="font-size:16px;font-weight:bold;margin:0 0 8px;">ANEXO TÉCNICO — Índice de Trazabilidad</h2>
        <p style="font-size:10px;color:#6b7280;margin:0 0 16px;">Hashes SHA-256 de integridad para verificación pericial</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <th style="padding:4px 8px;border:1px solid #ddd;font-size:9px;text-align:center;background:#f9fafb;">Nº</th>
            <th style="padding:4px 8px;border:1px solid #ddd;font-size:9px;text-align:left;background:#f9fafb;">Asunto</th>
            <th style="padding:4px 8px;border:1px solid #ddd;font-size:9px;text-align:left;background:#f9fafb;">Firmante</th>
            <th style="padding:4px 8px;border:1px solid #ddd;font-size:9px;text-align:left;background:#f9fafb;">Hash SHA-256</th>
            <th style="padding:4px 8px;border:1px solid #ddd;font-size:9px;text-align:center;background:#f9fafb;">Tipo</th>
          </tr>
          ${hashRows}
        </table>
        <p style="font-size:8px;color:#9ca3af;margin-top:16px;text-align:center;">
          Generado por TEKTRA — ${today}. Este anexo forma parte del expediente de trazabilidad del Libro de Órdenes.
        </p>
      </div>
    ` : "";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Libro de Órdenes — ${project.name}</title>
  <style>${stampStyles}</style>
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
