import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import Joyride, { CallBackProps, STATUS, Step } from "react-joyride";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const OnboardingGuide = () => {
  const { user, profile } = useAuth();
  const location = useLocation();
  const [steps, setSteps] = useState<Step[]>([]);
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const hasMarkedSeen = useRef(false);

  const normalizeRoute = useCallback((path: string) => {
    return path.replace(/\/project\/[0-9a-f-]{36}/, "/project/:id");
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
        return;
      }

      const joyrideSteps: Step[] = (data as any[]).map(s => ({
        target: s.target_element || "body",
        title: s.title,
        content: s.content,
        disableBeacon: true,
        placement: "auto" as const,
        // If target doesn't exist, show as centered modal
        floaterProps: { disableAnimation: true },
      }));

      setSteps(joyrideSteps);
    };

    loadSteps();
  }, [userRole, pageRoute]);

  // Check first-time visit — auto-start only once
  useEffect(() => {
    if (!user || steps.length === 0) return;
    hasMarkedSeen.current = false;

    const checkFirstTime = async () => {
      const { data } = await supabase
        .from("user_onboarding_status")
        .select("id")
        .eq("user_id", user.id)
        .eq("page_route", pageRoute)
        .maybeSingle();

      if (!data) {
        // Wait for DOM elements to render
        setTimeout(() => {
          setStepIndex(0);
          setRun(true);
        }, 1200);
      }
    };

    checkFirstTime();
  }, [user, steps.length, pageRoute]);

  // Mark page as seen
  const markAsSeen = useCallback(async () => {
    if (!user || hasMarkedSeen.current) return;
    hasMarkedSeen.current = true;
    await supabase.from("user_onboarding_status").upsert(
      { user_id: user.id, page_route: pageRoute },
      { onConflict: "user_id,page_route" }
    );
  }, [user, pageRoute]);

  const handleCallback = async (data: CallBackProps) => {
    const { status, action, index, type } = data;

    // Track step progression
    if (type === "step:after") {
      setStepIndex(index + (action === "prev" ? -1 : 1));
    }

    // Finished or skipped
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false);
      await markAsSeen();
    }

    // User closed via X or clicked overlay — treat as "seen"
    if (action === "close") {
      setRun(false);
      await markAsSeen();
    }
  };

  // Manual start from HelpFAB
  useEffect(() => {
    const handler = () => {
      if (steps.length > 0) {
        setStepIndex(0);
        setRun(true);
      }
    };
    window.addEventListener("start-onboarding-guide", handler);
    return () => window.removeEventListener("start-onboarding-guide", handler);
  }, [steps]);

  if (steps.length === 0) return null;

  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      continuous
      showSkipButton
      showProgress
      scrollToFirstStep
      disableOverlayClose={false}
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
          zIndex: 100000,
          arrowColor: "#fff",
          backgroundColor: "#fff",
          textColor: "#1f1f1f",
        },
        overlay: {
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          zIndex: 99999,
        },
        tooltip: {
          borderRadius: "0.75rem",
          fontSize: "0.875rem",
          padding: "1.25rem",
          zIndex: 100001,
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        },
        tooltipTitle: {
          fontWeight: 700,
          fontSize: "1rem",
        },
        buttonNext: {
          borderRadius: "0.375rem",
          fontSize: "0.8rem",
          padding: "0.5rem 1.25rem",
        },
        buttonBack: {
          color: "#666",
          fontSize: "0.8rem",
        },
        buttonSkip: {
          color: "#999",
          fontSize: "0.75rem",
        },
        spotlight: {
          borderRadius: "0.5rem",
        },
      }}
    />
  );
};

export default OnboardingGuide;
