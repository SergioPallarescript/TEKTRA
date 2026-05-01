import { supabase } from "@/integrations/supabase/client";

/**
 * Trigger push notifications via edge function for given user IDs.
 */
async function triggerPush(
  userIds: string[],
  title: string,
  message: string,
  url?: string,
  meta?: { projectId?: string; senderName?: string; senderRole?: string; id?: string }
) {
  try {
    await supabase.functions.invoke("send-push", {
      body: {
        user_ids: userIds,
        title,
        message,
        url,
        projectId: meta?.projectId,
        senderName: meta?.senderName,
        senderRole: meta?.senderRole,
        id: meta?.id,
      },
    });
  } catch (e) {
    console.error("Push trigger failed:", e);
  }
}

/** Resolve actor display name + project-scoped role for push enrichment. */
async function resolveActor(actorId: string, projectId: string) {
  const [{ data: profile }, { data: member }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("user_id", actorId).maybeSingle(),
    supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", actorId)
      .maybeSingle(),
  ]);
  return {
    senderName: (profile as any)?.full_name || "",
    senderRole: (member as any)?.role || "",
  };
}

/**
 * Send a notification to all project members except the actor.
 */
export async function notifyProjectMembers({
  projectId,
  actorId,
  title,
  message,
  type = "info",
  url,
}: {
  projectId: string;
  actorId: string;
  title: string;
  message: string;
  type?: string;
  url?: string;
}) {
  const { data: members } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("status", "accepted");

  const { data: project } = await supabase
    .from("projects")
    .select("created_by")
    .eq("id", projectId)
    .single();

  const userIds = new Set<string>();
  (members || []).forEach((m) => {
    if (m.user_id && m.user_id !== actorId) userIds.add(m.user_id);
  });
  if (project?.created_by && project.created_by !== actorId) {
    userIds.add(project.created_by);
  }

  if (userIds.size === 0) return;

  const uidArray = Array.from(userIds);
  const notifications = uidArray.map((uid) => ({
    user_id: uid,
    project_id: projectId,
    title,
    message,
    type,
  }));

  await supabase.from("notifications").insert(notifications);

  const pushUrl = url || `/project/${projectId}`;
  const actor = await resolveActor(actorId, projectId);
  triggerPush(uidArray, title, message, pushUrl, {
    projectId,
    senderName: actor.senderName,
    senderRole: actor.senderRole,
  });
}

/**
 * Send a notification to a specific user.
 */
export async function notifyUser({
  userId,
  projectId,
  title,
  message,
  type = "info",
  url,
  actorId,
}: {
  userId: string;
  projectId: string;
  title: string;
  message: string;
  type?: string;
  url?: string;
  actorId?: string;
}) {
  await supabase.from("notifications").insert({
    user_id: userId,
    project_id: projectId,
    title,
    message,
    type,
  });

  const pushUrl = url || `/project/${projectId}`;
  const actor = actorId ? await resolveActor(actorId, projectId) : { senderName: "", senderRole: "" };
  triggerPush([userId], title, message, pushUrl, {
    projectId,
    senderName: actor.senderName,
    senderRole: actor.senderRole,
  });
}

/**
 * Send a notification to all project members that have any of the specified roles
 * (matched against role OR secondary_role). Excludes the actor.
 */
export async function notifyProjectMembersByRole({
  projectId,
  actorId,
  roles,
  title,
  message,
  type = "info",
  url,
}: {
  projectId: string;
  actorId: string;
  roles: string[];
  title: string;
  message: string;
  type?: string;
  url?: string;
}) {
  const { data: members } = await supabase
    .from("project_members")
    .select("user_id, role, secondary_role")
    .eq("project_id", projectId)
    .eq("status", "accepted");

  const userIds = new Set<string>();
  (members || []).forEach((m: any) => {
    if (!m.user_id || m.user_id === actorId) return;
    if (roles.includes(m.role) || (m.secondary_role && roles.includes(m.secondary_role))) {
      userIds.add(m.user_id);
    }
  });

  if (userIds.size === 0) return;

  const uidArray = Array.from(userIds);
  await supabase.from("notifications").insert(
    uidArray.map((uid) => ({ user_id: uid, project_id: projectId, title, message, type }))
  );

  const pushUrl = url || `/project/${projectId}`;
  const actor = await resolveActor(actorId, projectId);
  triggerPush(uidArray, title, message, pushUrl, {
    projectId,
    senderName: actor.senderName,
    senderRole: actor.senderRole,
  });
}

/* ───── Module-specific push helpers ───── */

export async function pushNewOrder({
  projectId,
  actorId,
  actorName,
  orderNumber,
  asunto,
}: {
  projectId: string;
  actorId: string;
  actorName: string;
  orderNumber: number;
  asunto?: string;
}) {
  const title = `📝 Nueva Orden de Dirección #${orderNumber}`;
  const message = `${actorName} ha registrado una instrucción técnica en el Libro de Órdenes.${asunto ? ` Asunto: ${asunto}` : ""}`;
  await notifyProjectMembers({
    projectId,
    actorId,
    title,
    message,
    type: "order",
    url: `/project/${projectId}/orders?item=latest`,
  });
}

export async function pushNewPlan({
  projectId,
  actorId,
  planName,
  version,
}: {
  projectId: string;
  actorId: string;
  planName: string;
  version: number;
}) {
  const title = "📐 Revisión de Plano Válido";
  const message = `Se requiere tu conformidad para la Versión ${version} de ${planName}.`;
  await notifyProjectMembers({
    projectId,
    actorId,
    title,
    message,
    type: "plan",
    url: `/project/${projectId}/plans?item=latest`,
  });
}

export async function pushCostSubmission({
  projectId,
  actorId,
  actorName,
  docType,
  amount,
}: {
  projectId: string;
  actorId: string;
  actorName: string;
  docType: string;
  amount: number;
}) {
  const title = "💸 Validación Económica";
  const message = `${actorName} ha enviado una ${docType} para su firma. Importe: ${amount.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €`;
  await notifyProjectMembers({
    projectId,
    actorId,
    title,
    message,
    type: "cost",
    url: `/project/${projectId}/costs?item=latest`,
  });
}

export async function pushSignatureRequest({
  projectId,
  recipientId,
  senderName,
  docName,
  isInfoOnly,
  docId,
  actorId,
}: {
  projectId: string;
  recipientId: string;
  senderName: string;
  docName: string;
  isInfoOnly: boolean;
  docId: string;
  actorId?: string;
}) {
  const title = isInfoOnly ? "📂 Archivo Recibido" : "✍️ Firma Pendiente";
  const message = isInfoOnly
    ? `${senderName} ha compartido un documento contigo en tu archivo.`
    : `Has recibido un documento que requiere tu firma electrónica: ${docName}`;
  await notifyUser({
    userId: recipientId,
    projectId,
    title,
    message,
    type: "signature",
    url: `/project/${projectId}/signatures?item=${docId}`,
    actorId,
  });
}

/**
 * Auto-mark a user's unread notifications as read when they open the related item.
 * Matches by project + (optional) types + title substring contained in the message.
 */
export async function markRelatedNotificationsRead({
  userId,
  projectId,
  title,
  types,
}: {
  userId: string;
  projectId: string;
  title?: string | null;
  types?: string[];
}) {
  if (!userId || !projectId) return;
  try {
    let q: any = supabase
      .from("notifications")
      .update({ is_read: true, acknowledged_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .eq("is_read", false);
    if (types && types.length > 0) q = q.in("type", types);
    if (title && title.trim().length > 0) q = q.ilike("message", `%${title.trim()}%`);
    await q;
  } catch (e) {
    console.error("markRelatedNotificationsRead failed:", e);
  }
}
