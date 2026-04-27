import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildPushHTTPRequest } from "npm:@pushforge/builder";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VAPID_PUBLIC_KEY_FALLBACK =
  "BCZM86VhvCpT2YGg_JmWNu9_sp-QvyVC7DyvYanfgQRZTAPrjqwnChaXHGbNS2pJAg5OaLG5iVYvm71FavqmC0g";

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/* ─────────────────────────────────────────────────────────────────────────
 *  FCM HTTP v1 helper — signs an OAuth2 JWT with the service account and
 *  exchanges it for an access_token, then POSTs the message to the device.
 *  Caches the access_token in-memory until ~60s before expiry.
 * ───────────────────────────────────────────────────────────────────────── */

let cachedFcmToken: { token: string; expiresAt: number } | null = null;

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getFcmAccessToken(serviceAccountJson: string): Promise<{ token: string; projectId: string }> {
  const sa = JSON.parse(serviceAccountJson);
  const projectId: string = sa.project_id;

  if (cachedFcmToken && cachedFcmToken.expiresAt > Date.now() + 60_000) {
    return { token: cachedFcmToken.token, projectId };
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const unsigned = `${enc(header)}.${enc(claim)}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned))
  );
  const jwt = `${unsigned}.${bytesToBase64Url(signature)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`FCM OAuth failed: ${tokenRes.status} ${text}`);
  }
  const tokenData = await tokenRes.json();
  cachedFcmToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
  };
  return { token: cachedFcmToken.token, projectId };
}

async function sendFcmNative(
  serviceAccountJson: string,
  deviceToken: string,
  payload: { title: string; body: string; url?: string; projectId?: string | null; id?: string | null }
): Promise<{ ok: boolean; status: number; invalidToken: boolean }> {
  const { token, projectId } = await getFcmAccessToken(serviceAccountJson);

  const body = {
    message: {
      token: deviceToken,
      notification: { title: payload.title, body: payload.body },
      data: {
        url: payload.url ?? "/",
        projectId: payload.projectId ?? "",
        id: payload.id ?? "",
      },
      android: {
        priority: "HIGH",
        notification: {
          sound: "default",
          channel_id: "tektra_default",
          notification_priority: "PRIORITY_MAX",
          default_vibrate_timings: true,
        },
      },
      apns: {
        headers: { "apns-priority": "10" },
        payload: {
          aps: { sound: "default", "content-available": 1, "mutable-content": 1 },
        },
      },
    },
  };

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  const text = await res.text();
  const invalidToken =
    res.status === 404 ||
    res.status === 400 ||
    /UNREGISTERED|INVALID_ARGUMENT|Requested entity was not found/i.test(text);
  return { ok: res.ok, status: res.status, invalidToken };
}

function toVapidJwk(vapidPublicKey: string, vapidPrivateKey: string): JsonWebKey {
  const trimmedPrivateKey = vapidPrivateKey.trim();
  if (trimmedPrivateKey.startsWith("{")) return JSON.parse(trimmedPrivateKey);

  const publicBytes = base64UrlToBytes(vapidPublicKey);
  const privateBytes = base64UrlToBytes(trimmedPrivateKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
    throw new Error("Invalid VAPID key format");
  }

  return {
    kty: "EC",
    crv: "P-256",
    x: bytesToBase64Url(publicBytes.slice(1, 33)),
    y: bytesToBase64Url(publicBytes.slice(33, 65)),
    d: bytesToBase64Url(privateBytes),
  };
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: Record<string, string | null>,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<Response> {
  const { endpoint, headers, body } = await buildPushHTTPRequest({
    privateJWK: toVapidJwk(vapidPublicKey, vapidPrivateKey),
    subscription: {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    message: {
      payload,
      adminContact: vapidSubject,
      options: { ttl: 86400, urgency: "high" },
    },
  });

  return fetch(endpoint, {
    method: "POST",
    headers,
    body,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate: require a valid JWT or the service role key
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const token = authHeader.replace("Bearer ", "");

    // Allow service role calls (from other edge functions)
    const isServiceRole = token === serviceRoleKey;

    if (!isServiceRole) {
      // Validate user JWT
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data, error } = await userClient.auth.getUser(token);
      if (error || !data?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { user_ids, title, message, url, projectId, senderName, senderRole, id } =
      await req.json();

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return new Response(JSON.stringify({ error: "user_ids required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || VAPID_PUBLIC_KEY_FALLBACK;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get web push subscriptions and native device tokens for all targets
    const [subsRes, tokensRes] = await Promise.all([
      supabase
      .from("push_subscriptions")
      .select("*")
        .in("user_id", user_ids),
      supabase
        .from("native_push_tokens")
        .select("token")
        .in("user_id", user_ids)
        .eq("is_active", true),
    ]);
    const subscriptions = subsRes.data ?? [];
    const nativeTokens: { token: string }[] = tokensRes.data ?? [];

    const payload = {
      title,
      body: message,
      url,
      projectId: projectId || null,
      senderName: senderName || null,
      senderRole: senderRole || null,
      id: id || null,
    };
    let sent = 0;
    let sentNative = 0;
    const staleEndpoints: string[] = [];
    const staleTokens: string[] = [];

    for (const sub of subscriptions) {
      try {
        const res = await sendWebPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload,
          vapidPublicKey,
          vapidPrivateKey,
          "mailto:admin@tektra.es"
        );
        if (res.status === 201 || res.status === 200) {
          sent++;
        } else if (res.status === 404 || res.status === 410) {
          staleEndpoints.push(sub.endpoint);
        }
        // Consume response
        await res.text();
      } catch (e) {
        console.error("Push failed for endpoint:", sub.endpoint, e);
      }
    }

    // Native delivery (FCM HTTP v1) — Android always, iOS once APNs is set up
    // in the Firebase project. Skips silently if the secret is not configured.
    const fcmServiceAccount = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
    if (fcmServiceAccount && nativeTokens.length > 0) {
      try {
        // Validate the secret is a real JSON before iterating, otherwise we
        // would log one error per device.
        JSON.parse(fcmServiceAccount);
        for (const t of nativeTokens) {
          try {
            const res = await sendFcmNative(fcmServiceAccount, t.token, {
              title,
              body: message,
              url,
              projectId: projectId || null,
              id: id || null,
            });
            if (res.ok) sentNative++;
            else if (res.invalidToken) staleTokens.push(t.token);
            else console.warn(`FCM native delivery non-ok: ${res.status}`);
          } catch (e) {
            console.error("FCM native push failed:", e);
          }
        }
      } catch (e) {
        console.error("FCM_SERVICE_ACCOUNT_JSON is not valid JSON — native push skipped:", e);
      }
    }

    // Clean up stale subscriptions
    if (staleEndpoints.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", staleEndpoints);
    }
    if (staleTokens.length > 0) {
      await supabase
        .from("native_push_tokens")
        .update({ is_active: false })
        .in("token", staleTokens);
    }

    return new Response(
      JSON.stringify({
        sent,
        sentNative,
        cleaned: staleEndpoints.length,
        cleanedNative: staleTokens.length,
      }),
      {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("send-push error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
