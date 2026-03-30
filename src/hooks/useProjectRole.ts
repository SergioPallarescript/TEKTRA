import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type AppRole = "DO" | "DEM" | "CON" | "PRO" | "CSS";

interface ProjectRoleResult {
  /** Primary role in this project */
  projectRole: AppRole | null;
  /** Secondary (dual) role in this project */
  secondaryRole: AppRole | null;
  /** Whether the user is DO or DEM in this project */
  isAdmin: boolean;
  /** Convenience booleans */
  isDO: boolean;
  isDEM: boolean;
  isCON: boolean;
  isPRO: boolean;
  isCSS: boolean;
  /** True if user has CSS as primary or secondary role */
  hasDualCSS: boolean;
  /** Loading state */
  loading: boolean;
}

/**
 * Fetches the user's role from `project_members` for a specific project.
 * This is the single source of truth for permissions — never use profile.role
 * for project-scoped decisions.
 */
export function useProjectRole(projectId: string | undefined): ProjectRoleResult {
  const { user } = useAuth();
  const [projectRole, setProjectRole] = useState<AppRole | null>(null);
  const [secondaryRole, setSecondaryRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !projectId) {
      setProjectRole(null);
      setSecondaryRole(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const fetchRole = async () => {
      // First check if user is the project creator
      const { data: project } = await supabase
        .from("projects")
        .select("created_by")
        .eq("id", projectId)
        .single();

      // Fetch from project_members
      const { data: membership } = await supabase
        .from("project_members")
        .select("role, secondary_role")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membership) {
        setProjectRole(membership.role as AppRole);
        setSecondaryRole((membership.secondary_role as AppRole) || null);
      } else if (project?.created_by === user.id) {
        // Creator might not have a project_members row — check their profile
        // as fallback for the creator who auto-inserted themselves
        const { data: creatorMember } = await supabase
          .from("project_members")
          .select("role, secondary_role")
          .eq("project_id", projectId)
          .eq("user_id", user.id)
          .maybeSingle();
        
        if (creatorMember) {
          setProjectRole(creatorMember.role as AppRole);
          setSecondaryRole((creatorMember.secondary_role as AppRole) || null);
        } else {
          // Absolute fallback: use profile role for creator
          const { data: profileData } = await supabase
            .from("profiles")
            .select("role")
            .eq("user_id", user.id)
            .single();
          setProjectRole((profileData?.role as AppRole) || null);
          setSecondaryRole(null);
        }
      } else {
        setProjectRole(null);
        setSecondaryRole(null);
      }

      setLoading(false);
    };

    fetchRole();
  }, [user, projectId]);

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
