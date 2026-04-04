import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import Joyride, { CallBackProps, STATUS, Step } from "react-joyride";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface DbStep {
  id: string;
  target_element: string | null;
  title: string;
  content: string;
  step_order: number;
}

const OnboardingGuide = () => {
  const { user, profile } = useAuth();
  const location = useLocation();
  const [allSteps, setAllSteps] = useState<DbStep[]>([]);
  const [visibleSteps, setVisibleSteps] = useState<Step[]>([]);
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const hasMarkedSeen = useRef(false);
  const observerRef = useRef<MutationObserver | null>(null);
  const autoStarted = useRef(false);

  const normalizeRoute = useCallback((path: string) => {
    return path.replace(/\/project\/[0-9a-f-]{36}/, "/project/:id");
  }, []);

  const pageRoute = normalizeRoute(location.pathname);
  const userRole = profile?.role as string | undefined;

  // Compute which steps can be shown based on DOM availability
  const computeVisibleSteps = useCallback((steps: DbStep[]): Step[] => {
    return steps
      .filter(s => {
        if (!s.target_element || s.target_element === "body") return true;
        return document.querySelector(s.target_element) !== null;
      })
      .map(s => {
        const isBodyTarget = !s.target_element || s.target_element === "body";
        return {
          target: isBodyTarget ? "body" : s.target_element!,
          title: s.title,
          content: s.content,
          disableBeacon: true,
          placement: isBodyTarget ? ("center" as const) : ("auto" as const),
          floaterProps: { disableAnimation: true },
        };
      });
  }, []);

  // Load steps from DB
  useEffect(() => {
    if (!userRole) return;
    autoStarted.current = false;

    const loadSteps = async () => {
      const { data } = await supabase
        .from("onboarding_steps")
        .select("*")
        .eq("role", userRole)
        .eq("page_route", pageRoute)
        .eq("is_active", true)
        .order("step_order");

      if (!data || data.length === 0) {
        setAllSteps([]);
        setVisibleSteps([]);
        return;
      }

      setAllSteps(data as DbStep[]);
      const visible = computeVisibleSteps(data as DbStep[]);
      setVisibleSteps(visible);
    };

    loadSteps();
  }, [userRole, pageRoute, computeVisibleSteps]);

  // Observe DOM mutations to discover new elements and update visible steps
  useEffect(() => {
    if (allSteps.length === 0) return;

    const updateVisible = () => {
      const next = computeVisibleSteps(allSteps);
      setVisibleSteps(prev => {
        if (prev.length !== next.length) return next;
        // Check if targets changed
        const changed = prev.some((p, i) => (p.target as string) !== (next[i]?.target as string));
        return changed ? next : prev;
      });
    };

    observerRef.current = new MutationObserver(() => {
      updateVisible();
    });

    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-tour"],
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [allSteps, computeVisibleSteps]);

  // Check first-time visit — auto-start only once
  useEffect(() => {
    if (!user || visibleSteps.length === 0 || autoStarted.current) return;

    const checkFirstTime = async () => {
      const { data } = await supabase
        .from("user_onboarding_status")
        .select("id")
        .eq("user_id", user.id)
        .eq("page_route", pageRoute)
        .maybeSingle();

      if (!data) {
        autoStarted.current = true;
        hasMarkedSeen.current = false;
        setTimeout(() => {
          setStepIndex(0);
          setRun(true);
        }, 1200);
      }
    };

    checkFirstTime();
  }, [user, visibleSteps.length, pageRoute]);

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

    if (type === "step:after") {
      setStepIndex(index + (action === "prev" ? -1 : 1));
    }

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false);
      await markAsSeen();
    }

    if (action === "close") {
      setRun(false);
      await markAsSeen();
    }
  };

  // Manual start from HelpFAB
  useEffect(() => {
    const handler = () => {
      if (visibleSteps.length > 0) {
        hasMarkedSeen.current = false;
        setStepIndex(0);
        setRun(true);
      }
    };
    window.addEventListener("start-onboarding-guide", handler);
    return () => window.removeEventListener("start-onboarding-guide", handler);
  }, [visibleSteps]);

  if (visibleSteps.length === 0) return null;

  return (
    <Joyride
      steps={visibleSteps}
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
