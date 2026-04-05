import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const uniquePaths = (paths: (string | null | undefined)[]) => [...new Set(paths.filter(Boolean) as string[])];

const chunk = <T,>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

const isProjectAdmin = async (supabase: any, userId: string, projectId: string) => {
  const { data: project } = await supabase.from("projects").select("created_by").eq("id", projectId).single();
  if (project?.created_by === userId) return true;

  const { data: member } = await supabase
    .from("project_members")
    .select("role, secondary_role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("status", "accepted")
    .maybeSingle();

  return member?.role === "DO" || member?.role === "DEM" || member?.secondary_role === "DO" || member?.secondary_role === "DEM";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) throw new Error("Backend no configurado correctamente");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";
    const projectId = typeof body.projectId === "string" ? body.projectId : "";

    if (!action || !projectId) {
      return new Response(JSON.stringify({ error: "action y projectId son obligatorios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hasAccess = await isProjectAdmin(supabase, authData.user.id, projectId);
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "Acceso denegado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const payload: any = {
        name: typeof body.name === "string" ? body.name.trim() : "",
        description: typeof body.description === "string" && body.description.trim() ? body.description.trim() : null,
        address: typeof body.address === "string" && body.address.trim() ? body.address.trim() : null,
        status: typeof body.status === "string" && body.status.trim() ? body.status.trim() : "active",
      };

      if (body.cover_image_url !== undefined) {
        payload.cover_image_url = typeof body.cover_image_url === "string" && body.cover_image_url.trim() ? body.cover_image_url.trim() : null;
      }

      if (body.referencia_catastral !== undefined) {
        payload.referencia_catastral = typeof body.referencia_catastral === "string" && body.referencia_catastral.trim() ? body.referencia_catastral.trim() : null;
      }

      if (!payload.name) {
        return new Response(JSON.stringify({ error: "El nombre del proyecto es obligatorio" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabase.from("projects").update(payload).eq("id", projectId);
      if (error) throw error;

      await supabase.from("audit_logs").insert({
        user_id: authData.user.id,
        project_id: projectId,
        action: "project_updated",
        details: payload,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const [
        { data: orders },
        { data: incidents },
        { data: versions },
        { data: docs },
        { data: dwgFiles },
        { data: signatureDocs },
      ] = await Promise.all([
        supabase.from("orders").select("id, photos").eq("project_id", projectId),
        supabase.from("incidents").select("id, photos").eq("project_id", projectId),
        supabase.from("plan_versions").select("id, file_url, plan_id").in("plan_id", (await supabase.from("plans").select("id").eq("project_id", projectId)).data?.map((plan: any) => plan.id) || []),
        supabase.from("project_documents").select("file_url").eq("project_id", projectId),
        supabase.from("dwg_files").select("file_url").eq("project_id", projectId),
        supabase.from("signature_documents").select("original_file_path, signed_file_path").eq("project_id", projectId),
      ]);

      const planIds = ((await supabase.from("plans").select("id").eq("project_id", projectId)).data || []).map((plan: any) => plan.id);
      const versionIds = (versions || []).map((version: any) => version.id);
      const orderIds = (orders || []).map((order: any) => order.id);

      const storagePaths = uniquePaths([
        ...(docs || []).map((doc: any) => doc.file_url),
        ...(dwgFiles || []).map((file: any) => file.file_url),
        ...(versions || []).map((version: any) => version.file_url),
        ...(signatureDocs || []).flatMap((doc: any) => [doc.original_file_path, doc.signed_file_path]),
        ...(orders || []).flatMap((order: any) => order.photos || []),
        ...(incidents || []).flatMap((incident: any) => incident.photos || []),
        `project-memory/${projectId}/memoria_dinamica_${projectId}.txt`,
      ]);

      for (const paths of chunk(storagePaths, 100)) {
        await supabase.storage.from("plans").remove(paths);
      }

      if (orderIds.length > 0) {
        await supabase.from("order_validations").delete().in("order_id", orderIds);
      }
      if (versionIds.length > 0) {
        await supabase.from("plan_conformities").delete().in("plan_version_id", versionIds);
        await supabase.from("plan_versions").delete().in("id", versionIds);
      }
      if (planIds.length > 0) {
        await supabase.from("plans").delete().in("id", planIds);
      }

      await Promise.all([
        supabase.from("signature_documents").delete().eq("project_id", projectId),
        supabase.from("project_documents").delete().eq("project_id", projectId),
        supabase.from("dwg_files").delete().eq("project_id", projectId),
        supabase.from("orders").delete().eq("project_id", projectId),
        supabase.from("incidents").delete().eq("project_id", projectId),
        supabase.from("notifications").delete().eq("project_id", projectId),
        supabase.from("brain_messages").delete().eq("project_id", projectId),
        supabase.from("gantt_milestones").delete().eq("project_id", projectId),
        supabase.from("cfo_items").delete().eq("project_id", projectId),
        supabase.from("cost_claims").delete().eq("project_id", projectId),
        supabase.from("audit_logs").delete().eq("project_id", projectId),
        supabase.from("project_members").delete().eq("project_id", projectId),
      ]);

      const { error } = await supabase.from("projects").delete().eq("id", projectId);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "send_invite_email") {
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const role = typeof body.role === "string" ? body.role : "";
      const projectName = typeof body.projectName === "string" ? body.projectName : "";

      if (!email) {
        return new Response(JSON.stringify({ error: "Email obligatorio" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if user exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("email", email)
        .maybeSingle();

      // Use Supabase Auth invite for new users (triggers auth-email-hook with invite template)
      if (!existingProfile) {
        const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
          data: { invited_role: role, project_name: projectName },
          redirectTo: `https://tektra.es/auth`,
        });

        if (inviteError) {
          console.error("Invite error:", inviteError);
          // If user already exists in auth but no profile, still ok
          if (!inviteError.message.includes("already been registered")) {
            return new Response(JSON.stringify({ error: inviteError.message }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }

      return new Response(JSON.stringify({ success: true, userExists: !!existingProfile }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Acción no soportada" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("manage-project error", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Error desconocido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});