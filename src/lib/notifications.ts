import { supabase } from "@/integrations/supabase/client";

/**
 * Send a notification to all project members except the actor.
 */
export async function notifyProjectMembers({
  projectId,
  actorId,
  title,
  message,
  type = "info",
}: {
  projectId: string;
  actorId: string;
  title: string;
  message: string;
  type?: string;
}) {
  // Get all accepted members
  const { data: members } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("status", "accepted");

  // Get project creator
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

  const notifications = Array.from(userIds).map((uid) => ({
    user_id: uid,
    project_id: projectId,
    title,
    message,
    type,
  }));

  await supabase.from("notifications").insert(notifications);
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
}: {
  userId: string;
  projectId: string;
  title: string;
  message: string;
  type?: string;
}) {
  await supabase.from("notifications").insert({
    user_id: userId,
    project_id: projectId,
    title,
    message,
    type,
  });
}
