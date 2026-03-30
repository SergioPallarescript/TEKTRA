import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<
    "loading" | "valid" | "already" | "invalid" | "success" | "error"
  >("loading");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }

    const validate = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const res = await fetch(
          `${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${token}`,
          { headers: { apikey: anonKey } }
        );
        const data = await res.json();
        if (data.valid === true) {
          setStatus("valid");
        } else if (data.reason === "already_unsubscribed") {
          setStatus("already");
        } else {
          setStatus("invalid");
        }
      } catch {
        setStatus("invalid");
      }
    };
    validate();
  }, [token]);

  const handleUnsubscribe = async () => {
    if (!token) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "handle-email-unsubscribe",
        { body: { token } }
      );
      if (error) throw error;
      if (data?.success) {
        setStatus("success");
      } else if (data?.reason === "already_unsubscribed") {
        setStatus("already");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-card rounded-xl shadow-lg p-8 text-center space-y-4">
        <h1 className="text-2xl font-bold text-foreground">TEKTRA</h1>

        {status === "loading" && (
          <p className="text-muted-foreground">Verificando...</p>
        )}

        {status === "valid" && (
          <>
            <p className="text-muted-foreground">
              ¿Deseas cancelar la suscripción a los correos de notificación de
              TEKTRA?
            </p>
            <button
              onClick={handleUnsubscribe}
              disabled={processing}
              className="w-full bg-primary text-primary-foreground rounded-lg py-3 px-4 font-medium hover:opacity-90 disabled:opacity-50"
            >
              {processing ? "Procesando..." : "Confirmar cancelación"}
            </button>
          </>
        )}

        {status === "success" && (
          <p className="text-green-600">
            Te has dado de baja correctamente. Ya no recibirás correos de
            notificación.
          </p>
        )}

        {status === "already" && (
          <p className="text-muted-foreground">
            Ya te habías dado de baja anteriormente.
          </p>
        )}

        {status === "invalid" && (
          <p className="text-destructive">
            El enlace no es válido o ha expirado.
          </p>
        )}

        {status === "error" && (
          <p className="text-destructive">
            Ha ocurrido un error. Inténtalo de nuevo más tarde.
          </p>
        )}
      </div>
    </div>
  );
};

export default Unsubscribe;
