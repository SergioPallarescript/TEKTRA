import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };
Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase.functions.invoke("send-push", {
    body: {
      user_ids: ["9d117975-d302-4290-a66a-527f896adfe0"],
      title: "TEKTRA",
      message: "Prueba técnica nativa",
      url: "/",
      senderName: "Sistema",
      senderRole: "DO",
      id: "test-native",
    },
  });
  return new Response(JSON.stringify({ data, error }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
