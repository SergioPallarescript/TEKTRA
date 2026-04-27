import { useState, useEffect, Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import LegalGateModal from "@/components/LegalGateModal";
import PushPermissionModal from "@/components/PushPermissionModal";
import TektraSplash from "@/components/TektraSplash";
import TektraLoader from "@/components/TektraLoader";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import ProjectDetail from "./pages/ProjectDetail";
import PlansModule from "./pages/PlansModule";
import OrdersModule from "./pages/OrdersModule";
import IncidentsModule from "./pages/IncidentsModule";
import CostsModule from "./pages/CostsModule";
import DWGViewer from "./pages/DWGViewer";
import CFOModule from "./pages/CFOModule";
import BrainModule from "./pages/BrainModule";
import ProjectDocs from "./pages/ProjectDocs";
import GanttModule from "./pages/GanttModule";
import Settings from "./pages/Settings";
import AdminPanel from "./pages/AdminPanel";
import GlobalAdmin from "./pages/GlobalAdmin";
import SignatureDocuments from "./pages/SignatureDocuments";
import SubcontractingModule from "./pages/SubcontractingModule";
import NotificationsHistory from "./pages/NotificationsHistory";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";
import Unsubscribe from "./pages/Unsubscribe";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, user, loading } = useAuth();
  const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) { setTermsAccepted(null); return; }
    supabase
      .from("profiles")
      .select("terms_accepted_at")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        setTermsAccepted(!!(data as any)?.terms_accepted_at);
      });
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background concrete-bg relative">
        <div className="relative z-10">
          <TektraLoader size={70} />
        </div>
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;

  if (termsAccepted === false) {
    return (
      <>
        <LegalGateModal open onAccept={() => setTermsAccepted(true)} />
        <div className="min-h-screen flex items-center justify-center bg-background concrete-bg relative">
          <div className="relative z-10 text-center">
            <img src="/tectra-logo.png" alt="TEKTRA" className="h-8 mx-auto" />
          </div>
        </div>
      </>
    );
  }

  if (termsAccepted === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background concrete-bg relative">
        <div className="relative z-10">
          <TektraLoader size={70} />
        </div>
      </div>
    );
  }

  return (
    <>
      <PushPermissionModal />
      {children}
    </>
  );
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  if (loading) return null;
  return session ? <Navigate to="/" replace /> : <>{children}</>;
};

const ModuleLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <TektraLoader size={70} />
  </div>
);

const App = () => {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <>
      {!splashDone && <TektraSplash onFinish={() => setSplashDone(true)} />}
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <Suspense fallback={<ModuleLoader />}>
                <Routes>
                  <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
                  <Route path="/unsubscribe" element={<Unsubscribe />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="/project/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
                  <Route path="/project/:id/plans" element={<ProtectedRoute><PlansModule /></ProtectedRoute>} />
                  <Route path="/project/:id/orders" element={<ProtectedRoute><OrdersModule /></ProtectedRoute>} />
                  <Route path="/project/:id/incidents" element={<ProtectedRoute><IncidentsModule /></ProtectedRoute>} />
                  <Route path="/project/:id/costs" element={<ProtectedRoute><CostsModule /></ProtectedRoute>} />
                  <Route path="/project/:id/dwg" element={<ProtectedRoute><DWGViewer /></ProtectedRoute>} />
                  <Route path="/project/:id/cfo" element={<ProtectedRoute><CFOModule /></ProtectedRoute>} />
                  <Route path="/project/:id/brain" element={<ProtectedRoute><BrainModule /></ProtectedRoute>} />
                  <Route path="/project/:id/docs" element={<ProtectedRoute><ProjectDocs /></ProtectedRoute>} />
                  <Route path="/project/:id/gantt" element={<ProtectedRoute><GanttModule /></ProtectedRoute>} />
                  <Route path="/project/:id/signatures" element={<ProtectedRoute><SignatureDocuments /></ProtectedRoute>} />
                  <Route path="/project/:id/subcontracting" element={<ProtectedRoute><SubcontractingModule /></ProtectedRoute>} />
                  <Route path="/project/:id/admin" element={<ProtectedRoute><AdminPanel /></ProtectedRoute>} />
                  <Route path="/notifications" element={<ProtectedRoute><NotificationsHistory /></ProtectedRoute>} />
                  <Route path="/admin" element={<ProtectedRoute><GlobalAdmin /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </>
  );
};

export default App;
