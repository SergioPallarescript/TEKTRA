import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useParams } from "react-router-dom";
import Joyride, { CallBackProps, STATUS, Step } from "react-joyride";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjectRole } from "@/hooks/useProjectRole";

type GuideStep = Step & {
  data: {
    rawIndex: number;
  };
};

const OnboardingGuide = () => {
  const { user, profile } = useAuth();
  const location = useLocation();
  const { id: projectId } = useParams<{ id: string }>();
  const { projectRole } = useProjectRole(projectId);
  const [steps, setSteps] = useState<GuideStep[]>([]);
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [currentRawIndex, setCurrentRawIndex] = useState(0);
  const hasMarkedSeen = useRef(false);
  const rawStepsRef = useRef<any[]>([]);
  const autoStartedKey = useRef<string | null>(null);
  const pendingManualStart = useRef(false);
  const lastStepSignature = useRef("");

  const normalizeRoute = useCallback((path: string) => {
    return path.replace(/\/project\/[0-9a-f-]{36}/, "/project/:id");
  }, []);

  const pageRoute = normalizeRoute(location.pathname);
  const userRole = (pageRoute.startsWith("/project/:id") ? projectRole : undefined) ?? (profile?.role as string | undefined);

  const syncVisibleSteps = useCallback((sourceSteps: any[]) => {
    const joyrideSteps: GuideStep[] = sourceSteps
      .flatMap((sourceStep, rawIndex) => {
        if (sourceStep.target_element && sourceStep.target_element !== "body" && !document.querySelector(sourceStep.target_element)) {
          return [];
        }

        const isBodyTarget = !sourceStep.target_element || sourceStep.target_element === "body";
        return {
          target: isBodyTarget ? "body" : sourceStep.target_element,
          title: sourceStep.title,
          content: sourceStep.content,
          disableBeacon: true,
          placement: isBodyTarget ? ("center" as const) : ("auto" as const),
          floaterProps: { disableAnimation: true },
          data: { rawIndex },
        };
      });

    const signature = joyrideSteps
      .map((step) => `${step.data.rawIndex}|${String(step.target)}|${String(step.title)}|${typeof step.content === "string" ? step.content : ""}`)
      .join("::");

    if (signature !== lastStepSignature.current) {
      lastStepSignature.current = signature;
      setSteps(joyrideSteps);
    }
  }, []);

  const startGuide = useCallback(() => {
    if (steps.length === 0) {
      pendingManualStart.current = true;
      return;
    }

    pendingManualStart.current = false;
    setCurrentRawIndex(0);
    setStepIndex(0);
    setRun(true);
  }, [steps.length]);

  useEffect(() => {
    if (steps.length === 0) {
      setStepIndex(0);
      return;
    }

    const nextVisibleIndex = steps.findIndex((step) => (step.data?.rawIndex ?? 0) >= currentRawIndex);
    setStepIndex(nextVisibleIndex >= 0 ? nextVisibleIndex : 0);
  }, [currentRawIndex, steps]);

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
        rawStepsRef.current = [];
        lastStepSignature.current = "";
        setCurrentRawIndex(0);
        setSteps([]);
        return;
      }

      rawStepsRef.current = data as any[];
      syncVisibleSteps(rawStepsRef.current);
    };

    loadSteps();
  }, [userRole, pageRoute, syncVisibleSteps]);

  useEffect(() => {
    if (rawStepsRef.current.length === 0) return;

    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => syncVisibleSteps(rawStepsRef.current));
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pageRoute, syncVisibleSteps, userRole]);

  // Check first-time visit — auto-start only once
  useEffect(() => {
    if (!user || steps.length === 0) return;
    hasMarkedSeen.current = false;

    const routeKey = `${user.id}:${pageRoute}`;
    if (autoStartedKey.current === routeKey) return;

    const checkFirstTime = async () => {
      const { data } = await supabase
        .from("user_onboarding_status")
        .select("id")
        .eq("user_id", user.id)
        .eq("page_route", pageRoute)
        .maybeSingle();

      autoStartedKey.current = routeKey;

      if (!data) {
        setTimeout(() => {
          setCurrentRawIndex(0);
          setStepIndex(0);
          setRun(true);
        }, 250);
      }
    };

    checkFirstTime();
  }, [user, steps.length, pageRoute]);

  useEffect(() => {
    if (steps.length > 0 && pendingManualStart.current) {
      startGuide();
    }
  }, [steps.length, startGuide]);

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
      const currentStep = steps[index];
      const rawIndex = currentStep?.data?.rawIndex ?? index;
      setCurrentRawIndex(Math.max(rawIndex + (action === "prev" ? -1 : 1), 0));
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
    const handler = () => startGuide();
    window.addEventListener("start-onboarding-guide", handler);
    return () => window.removeEventListener("start-onboarding-guide", handler);
  }, [startGuide]);

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
      spotlightClicks
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
