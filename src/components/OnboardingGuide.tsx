import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import Joyride, { CallBackProps, STATUS, Step } from "react-joyride";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const OnboardingGuide = () => {
  const { user, profile } = useAuth();
  const location = useLocation();
  const [steps, setSteps] = useState<Step[]>([]);
  const [run, setRun] = useState(false);
  const [ready, setReady] = useState(false);

  // Normalize route: replace UUIDs with :id
  const normalizeRoute = useCallback((path: string) => {
    return path.replace(
      /\/project\/[0-9a-f-]{36}/,
      "/project/:id"
    );
  }, []);

  const pageRoute = normalizeRoute(location.pathname);
  const userRole = profile?.role as string | undefined;

  // Load steps from DB
  useEffect(() => {
    if (!userRole) return;

    const loadSteps = async () => {
      const { data } = await supabase
        .from("onboarding_steps")
        .select("*")
        .eq("role", userRole)
        .eq("page_route", pageRoute)
        .eq("is_active", true)
        .order("step_order");

      if (!data || data.length === 0) {
        setSteps([]);
        setReady(false);
        return;
      }

      const joyrideSteps: Step[] = (data as any[]).map(s => ({
        target: s.target_element || "body",
        title: s.title,
        content: s.content,
        disableBeacon: true,
        placement: "auto" as const,
      }));

      setSteps(joyrideSteps);
      setReady(true);
    };

    loadSteps();
  }, [userRole, pageRoute]);

  // Check first-time
  useEffect(() => {
    if (!user || !ready || steps.length === 0) return;

    const checkFirstTime = async () => {
      const { data } = await supabase
        .from("user_onboarding_status")
        .select("id")
        .eq("user_id", user.id)
        .eq("page_route", pageRoute)
        .maybeSingle();

      if (!data) {
        // Small delay to let page render targets
        setTimeout(() => setRun(true), 800);
      }
    };

    checkFirstTime();
  }, [user, ready, steps.length, pageRoute]);

  const handleCallback = async (data: CallBackProps) => {
    const { status } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false);
      if (user) {
        await supabase.from("user_onboarding_status").upsert(
          { user_id: user.id, page_route: pageRoute },
          { onConflict: "user_id,page_route" }
        );
      }
    }
  };

  // Expose a way to start the guide manually
  useEffect(() => {
    const handler = () => {
      if (steps.length > 0) setRun(true);
    };
    window.addEventListener("start-onboarding-guide", handler);
    return () => window.removeEventListener("start-onboarding-guide", handler);
  }, [steps]);

  if (steps.length === 0) return null;

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showSkipButton
      showProgress
      scrollToFirstStep
      disableOverlayClose
      callback={handleCallback}
      locale={{
        back: "Anterior",
        close: "Cerrar",
        last: "Finalizar",
        next: "Siguiente",
        skip: "Saltar guía",
      }}
      styles={{
        options: {
          primaryColor: "hsl(150, 45%, 40%)",
          zIndex: 10000,
          arrowColor: "#fff",
          backgroundColor: "#fff",
          textColor: "#1f1f1f",
        },
        tooltip: {
          borderRadius: "0.5rem",
          fontSize: "0.875rem",
          padding: "1rem",
        },
        tooltipTitle: {
          fontWeight: 700,
          fontSize: "1rem",
        },
        buttonNext: {
          borderRadius: "0.25rem",
          fontSize: "0.8rem",
          padding: "0.5rem 1rem",
        },
        buttonBack: {
          color: "#666",
          fontSize: "0.8rem",
        },
        buttonSkip: {
          color: "#999",
          fontSize: "0.75rem",
        },
      }}
    />
  );
};

export default OnboardingGuide;
