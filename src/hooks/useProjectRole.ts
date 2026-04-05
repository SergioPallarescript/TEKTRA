import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type AppRole = "DO" | "DEM" | "CON" | "PRO" | "CSS";

interface ProjectRoleResult {
  projectRole: AppRole | null;
  secondaryRole: AppRole | null;
  isAdmin: boolean;
  isDO: boolean;
  isDEM: boolean;
  isCON: boolean;
  isPRO: boolean;
  isCSS: boolean;
  hasDualCSS: boolean;
  loading: boolean;
}

export function useProjectRole(projectId: string | undefined): ProjectRoleResult {
  const { user } = useAuth();
  const [projectRole, setProjectRole] = useState<AppRole | null>(null);
  const [secondaryRole, setSecondaryRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = useCallback(async () => {
    if (!user || !projectId) {
      setProjectRole(null);
      setSecondaryRole(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // 1. Try by user_id first
      const { data: membership } = await supabase
        .from("project_members")
        .select("role, secondary_role, status")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membership) {
        if (membership.status && membership.status !== "accepted") {
          await supabase
            .from("project_members")
            .update({ status: "accepted", accepted_at: new Date().toISOString() })
            .eq("project_id", projectId)
            .eq("user_id", user.id);
        }

        setProjectRole(membership.role as AppRole);
        setSecondaryRole((membership.secondary_role as AppRole) || null);
        setLoading(false);
        return;
      }

      // 2. Fallback by invited_email
      const userEmail = user.email;
      if (userEmail) {
        const { data: emailMembership } = await supabase
          .from("project_members")
          .select("id, role, secondary_role")
          .eq("project_id", projectId)
          .eq("invited_email", userEmail)
          .is("user_id", null)
          .maybeSingle();

        if (emailMembership) {
          await supabase
            .from("project_members")
            .update({ user_id: user.id, status: "accepted", accepted_at: new Date().toISOString() })
            .eq("id", emailMembership.id);

          setProjectRole(emailMembership.role as AppRole);
          setSecondaryRole((emailMembership.secondary_role as AppRole) || null);
          setLoading(false);
          return;
        }
      }

      // 3. Fallback creator profile
      const { data: project } = await supabase
        .from("projects")
        .select("created_by")
        .eq("id", projectId)
        .single();

      if (project?.created_by === user.id) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", user.id)
          .single();

        setProjectRole((profileData?.role as AppRole) || null);
        setSecondaryRole(null);
      } else {
        setProjectRole(null);
        setSecondaryRole(null);
      }
    } catch (err) {
      console.error("Error fetching project role:", err);
      setProjectRole(null);
      setSecondaryRole(null);
    }

    setLoading(false);
  }, [user, projectId]);

  useEffect(() => {
    fetchRole();
  }, [fetchRole]);

  useEffect(() => {
    if (!projectId) return;

    const handleRoleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      if (!detail?.projectId || detail.projectId === projectId) {
        void fetchRole();
      }
    };

    const handleStorageRefresh = (event: StorageEvent) => {
      if (event.key !== "tektra_role_refresh" || !event.newValue) return;

      try {
        const payload = JSON.parse(event.newValue) as { projectId?: string };
        if (!payload.projectId || payload.projectId === projectId) {
          void fetchRole();
        }
      } catch {
        void fetchRole();
      }
    };

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === "visible") {
        void fetchRole();
      }
    };

    window.addEventListener("tektra-role-updated", handleRoleRefresh as EventListener);
    window.addEventListener("storage", handleStorageRefresh);
    document.addEventListener("visibilitychange", handleVisibilityRefresh);

    return () => {
      window.removeEventListener("tektra-role-updated", handleRoleRefresh as EventListener);
      window.removeEventListener("storage", handleStorageRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
    };
  }, [fetchRole, projectId]);

  const isDO = projectRole === "DO";
  const isDEM = projectRole === "DEM";
  const isCON = projectRole === "CON";
  const isPRO = projectRole === "PRO";
  const isCSS = projectRole === "CSS" || secondaryRole === "CSS";
  const hasDualCSS = secondaryRole === "CSS";

  return {
    projectRole,
    secondaryRole,
    isAdmin: isDO || isDEM,
    isDO,
    isDEM,
    isCON,
    isPRO,
    isCSS,
    hasDualCSS,
    loading,
  };
}
