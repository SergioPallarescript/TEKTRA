import { useState, useEffect } from "react";
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

  useEffect(() => {
    if (!user || !projectId) {
      setProjectRole(null);
      setSecondaryRole(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const fetchRole = async () => {
      try {
        // 1. Try by user_id first
        const { data: membership } = await supabase
          .from("project_members")
          .select("role, secondary_role, status")
          .eq("project_id", projectId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (membership) {
          // Auto-activate: if status is not "accepted", update it
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

        // 2. Fallback: check by invited_email (user may have registered but
        //    the handle_new_user trigger may not have linked user_id yet)
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
            // Auto-link user_id for future lookups
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

        // 3. Check if creator
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
