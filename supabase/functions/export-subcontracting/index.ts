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
      { data: book },
      { data: members },
    ] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase.from("subcontracting_books").select("*").eq("project_id", projectId).maybeSingle(),
      supabase.from("project_members").select("*").eq("project_id", projectId).eq("status", "accepted"),
    ]);

    if (!project) throw new Error("Project not found");
    if (!book) throw new Error("No subcontracting book found");

    const { data: entries } = await supabase
      .from("subcontracting_entries")
      .select("*")
      .eq("book_id", book.id)
      .order("entry_number", { ascending: true });

    // Fetch profiles
    const memberIds = (members || []).map((m: any) => m.user_id).filter(Boolean);
    const entryCreators = (entries || []).map((e: any) => e.created_by).filter(Boolean);
    const allIds = [...new Set([...memberIds, ...entryCreators])];
    const { data: profiles } = allIds.length > 0
      ? await supabase.from("profiles").select("user_id, full_name, role, dni_cif").in("user_id", allIds)
      : { data: [] };
    const profileMap: Record<string, any> = {};
    (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p; });

    // Member helpers
    const getMemberByRole = (role: string) => {
      const m = (members || []).find((m: any) => m.role === role);
      if (!m) return { name: "—", nif: "—" };
      const p = m.user_id ? profileMap[m.user_id] : null;
      return { name: p?.full_name || m.invited_email || "—", nif: p?.dni_cif || "—" };
    };

    const promotor = getMemberByRole("PRO");
    const con = getMemberByRole("CON");
    const df = getMemberByRole("DO").name !== "—" ? getMemberByRole("DO") : getMemberByRole("DEM");
    const cssM = (members || []).find((m: any) => m.role === "CSS" || m.secondary_role === "CSS");
    const css = cssM && cssM.user_id ? { name: profileMap[cssM.user_id]?.full_name || "—", nif: profileMap[cssM.user_id]?.dni_cif || "—" } : { name: "—", nif: "—" };

    const today = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
    const totalPages = 1 + Math.max(1, Math.ceil((entries || []).length / 3));

    // Sealed file info
    const sealedNote = book.sealed_file_name
      ? `<p style="font-size:10px;color:#059669;margin-top:8px;">✅ Hoja habilitada: ${book.sealed_file_name}</p>`
      : "";

    // Cover page (Diligencia)
    const coverHtml = `
      <div style="page-break-after:always;min-height:90vh;padding:40px 30px;font-family:'Times New Roman',serif;">
        <p style="text-align:center;font-size:11px;color:#666;">COMUNIDAD AUTÓNOMA DE _______________</p>
        <h1 style="text-align:center;font-size:20px;margin:8px 0 20px;">LIBRO DE SUBCONTRATACIÓN</h1>
        <h2 style="font-size:13px;border-bottom:1px solid #333;padding-bottom:4px;">DATOS IDENTIFICATIVOS DE LA OBRA</h2>
        <table style="width:100%;border-collapse:collapse;margin:10px 0;font-size:11px;">
          <tr><td style="padding:4px 6px;border:1px solid #999;background:#f5f5f5;font-weight:bold;width:35%;">Promotor</td><td style="padding:4px 6px;border:1px solid #999;">${promotor.name}</td><td style="padding:4px 6px;border:1px solid #999;width:60px;">NIF</td><td style="padding:4px 6px;border:1px solid #999;">${promotor.nif}</td></tr>
          <tr><td style="padding:4px 6px;border:1px solid #999;background:#f5f5f5;font-weight:bold;">Contratista</td><td style="padding:4px 6px;border:1px solid #999;">${con.name}</td><td style="padding:4px 6px;border:1px solid #999;">NIF</td><td style="padding:4px 6px;border:1px solid #999;">${con.nif}</td></tr>
          <tr><td style="padding:4px 6px;border:1px solid #999;background:#f5f5f5;font-weight:bold;">Dirección Facultativa</td><td style="padding:4px 6px;border:1px solid #999;">${df.name}</td><td style="padding:4px 6px;border:1px solid #999;">NIF</td><td style="padding:4px 6px;border:1px solid #999;">${df.nif}</td></tr>
          <tr><td style="padding:4px 6px;border:1px solid #999;background:#f5f5f5;font-weight:bold;">Coord. Seg. y Salud</td><td style="padding:4px 6px;border:1px solid #999;">${css.name}</td><td style="padding:4px 6px;border:1px solid #999;">NIF</td><td style="padding:4px 6px;border:1px solid #999;">${css.nif}</td></tr>
          <tr><td style="padding:4px 6px;border:1px solid #999;background:#f5f5f5;font-weight:bold;">Domicilio de la obra</td><td style="padding:4px 6px;border:1px solid #999;">${project.address || "—"}</td><td style="padding:4px 6px;border:1px solid #999;">REA</td><td style="padding:4px 6px;border:1px solid #999;">${book.rea_number}</td></tr>
          <tr><td style="padding:4px 6px;border:1px solid #999;background:#f5f5f5;font-weight:bold;">Nº Reg. Apertura</td><td style="padding:4px 6px;border:1px solid #999;">${book.apertura_number}</td><td style="padding:4px 6px;border:1px solid #999;" colspan="2">Localidad: ${project.address || "—"}</td></tr>
        </table>
        <h2 style="font-size:13px;border-bottom:1px solid #333;padding-bottom:4px;margin-top:24px;">DILIGENCIA DE HABILITACIÓN</h2>
        <p style="font-size:12px;line-height:1.6;">D. ........................................................., en su condición de autoridad laboral competente.</p>
        <p style="font-size:12px;line-height:1.6;"><strong>CERTIFICO:</strong> que en el día de la fecha he procedido a habilitar este Libro de Subcontratación.</p>
        <div style="border:2px dashed #999;min-height:80px;margin:16px 0;display:flex;align-items:center;justify-content:center;color:#999;font-style:italic;">SELLO AUTORIDAD LABORAL</div>
        ${sealedNote}
        <div style="text-align:center;font-size:10px;color:#9ca3af;margin-top:auto;padding-top:20px;border-top:1px solid #e5e7eb;">Página 1 de ${totalPages}</div>
      </div>`;

    // Entry pages
    const entryRows = (entries || []).map((entry: any) => {
      const signDate = entry.signed_at ? new Date(entry.signed_at).toLocaleDateString("es-ES") : "—";
      const hashShort = entry.signature_hash ? entry.signature_hash.substring(0, 20) + "…" : "—";
      const sigType = entry.signature_type === "p12" ? "✅ Cert." : "✍️ Manual";

      return `<tr>
        <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;font-size:10px;line-height:1.1;">${entry.entry_number}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:10px;line-height:1.1;"><strong>${entry.empresa_nombre}</strong><br/>NIF: ${entry.empresa_nif}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;font-size:10px;line-height:1.1;">${entry.nivel_subcontratacion}º</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:10px;line-height:1.1;">${entry.objeto_contrato}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;font-size:10px;line-height:1.1;">${new Date(entry.fecha_comienzo).toLocaleDateString("es-ES")}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:10px;line-height:1.1;">${entry.responsable_nombre}<br/>DNI: ${entry.responsable_dni}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;font-size:10px;line-height:1.1;">${entry.fecha_plan_seguridad ? new Date(entry.fecha_plan_seguridad).toLocaleDateString("es-ES") : "—"}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;font-size:10px;line-height:1.1;">
          <div>${sigType}</div>
          <div style="font-size:8px;color:#666;">${signDate}</div>
          <div style="font-family:monospace;font-size:8px;word-break:break-all;">${hashShort}</div>
          ${entry.signature_geo ? `<div style="font-size:8px;color:#888;">📍 ${entry.signature_geo}</div>` : ""}
        </td>
      </tr>`;
    }).join("");

    const entriesPageHtml = (entries || []).length > 0 ? `
      <div style="page-break-before:always;padding:30px 20px;font-family:'Times New Roman',serif;">
        <h2 style="font-size:14px;margin:0 0 4px;">REGISTRO DE SUBCONTRATACIONES</h2>
        <p style="font-size:10px;color:#666;margin:0 0 12px;">Obra: ${project.name} — ${project.address || ""}</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <th style="padding:4px 8px;border:1px solid #ddd;font-size:9px;background:#f9fafb;">Nº</th>
            <th style="padding:4px 8px;border:1px solid #ddd;font-size:9px;background:#f9fafb;text-align:left;">Empresa / NIF</th>
            <th style="padding:4px 8px;border:1px solid #ddd;font-size:9px;background:#f9fafb;">Nivel</th>
            <th style="padding:4px 8px;border:1px solid #ddd;font-size:9px;background:#f9fafb;text-align:left;">Objeto</th>
            <th style="padding:4px 8px;border:1px solid #ddd;font-size:9px;background:#f9fafb;">Inicio</th>
            <th style="padding:4px 8px;border:1px solid #ddd;font-size:9px;background:#f9fafb;text-align:left;">Responsable</th>
            <th style="padding:4px 8px;border:1px solid #ddd;font-size:9px;background:#f9fafb;">PSS</th>
            <th style="padding:4px 8px;border:1px solid #ddd;font-size:9px;background:#f9fafb;">Firma</th>
          </tr>
          ${entryRows}
        </table>
        <p style="font-size:10px;color:#666;margin-top:16px;text-align:center;">FIRMA Y SELLO DE LA EMPRESA CONTRATISTA</p>
        <div style="border:2px solid #FF0000;background:rgba(200,200,200,0.8);padding:8px 12px;margin:8px auto;max-width:300px;text-align:center;font-size:10px;">
          <div style="font-weight:bold;">${con.name}</div>
          <div>NIF: ${con.nif}</div>
        </div>
        <p style="text-align:center;font-size:10px;color:#9ca3af;margin-top:auto;padding-top:16px;border-top:1px solid #e5e7eb;">Página 2 de ${totalPages}</p>
      </div>
    ` : "";

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Libro de Subcontratación — ${project.name}</title>
<style>@media print { .page-break { page-break-before: always; } }</style>
</head><body style="font-family:'Montserrat',Arial,sans-serif;max-width:800px;margin:0 auto;padding:0;color:#1f2937;">
${coverHtml}
${entriesPageHtml}
</body></html>`;

    return new Response(JSON.stringify({ html, fileName: `Libro_Subcontratacion_${project.name.replace(/\s+/g, "_")}.html` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
