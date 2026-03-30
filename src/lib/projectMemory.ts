import { supabase } from "@/integrations/supabase/client";

export const syncProjectMemory = async (projectId: string) => {
  const { data, error } = await supabase.functions.invoke("sync-project-memory", {
    body: { projectId },
  });

  if (error) throw error;
  return data as { path: string; content: string; ordersCount: number; incidentsCount: number };
};