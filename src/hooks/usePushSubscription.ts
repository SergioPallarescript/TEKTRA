import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const VAPID_PUBLIC_KEY =
  "BNKqCnIeLk2naunWgUNTLqOVPtBmK7qFWCHxQitetMnR3Kgdg5tPakKFZjTGYDg_z15fAZuLcXG6Q7M0h_ORu08";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function usePushSubscription() {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
      // Check existing subscription
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub);
        });
      });
    }
  }, []);

  // Keep `permission` in sync if the user toggles it from the OS / browser
  // settings while the app is open. Uses the Permissions API where available
  // and falls back to refreshing on focus / visibility changes.
  useEffect(() => {
    if (!isSupported) return;

    const refresh = () => setPermission(Notification.permission);

    let permStatus: PermissionStatus | undefined;
    const nav = navigator as Navigator & {
      permissions?: { query: (d: { name: PermissionName }) => Promise<PermissionStatus> };
    };
    if (nav.permissions?.query) {
      nav.permissions
        .query({ name: "notifications" as PermissionName })
        .then((status) => {
          permStatus = status;
          status.onchange = refresh;
          refresh();
        })
        .catch(() => {});
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refresh);
    return () => {
      if (permStatus) permStatus.onchange = null;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refresh);
    };
  }, [isSupported]);

  // Register SW on mount
  useEffect(() => {
    if (!isSupported) return;
    // Don't register in iframes or preview hosts
    const isInIframe = (() => {
      try { return window.self !== window.top; } catch { return true; }
    })();
    const isPreview =
      window.location.hostname.includes("id-preview--") ||
      window.location.hostname.includes("lovableproject.com");

    if (isInIframe || isPreview) return;

    navigator.serviceWorker.register("/sw-push.js").catch(console.error);
  }, [isSupported]);

  // Sync state: clear delivered system notifications and reset app badge when
  // the app gains focus or becomes visible.
  useEffect(() => {
    if (!isSupported) return;

    const clearDelivered = () => {
      // Reset PWA app badge if available
      const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
      if (nav.clearAppBadge) nav.clearAppBadge().catch(() => {});
      // Ask the service worker to close any visible notifications
      navigator.serviceWorker?.ready
        .then((reg) => reg.active?.postMessage({ type: "CLEAR_NOTIFICATIONS" }))
        .catch(() => {});
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") clearDelivered();
    };

    clearDelivered();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", clearDelivered);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", clearDelivered);
    };
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!user || !isSupported) return false;

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return false;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
      });

      const json = sub.toJSON();
      await supabase.from("push_subscriptions" as any).upsert(
        {
          user_id: user.id,
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        },
        { onConflict: "user_id,endpoint" }
      );

      setIsSubscribed(true);
      return true;
    } catch (e) {
      console.error("Push subscribe error:", e);
      return false;
    }
  }, [user, isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!user) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await (supabase.from("push_subscriptions" as any) as any)
          .delete()
          .eq("user_id", user.id)
          .eq("endpoint", endpoint);
      }
      setIsSubscribed(false);
    } catch (e) {
      console.error("Push unsubscribe error:", e);
    }
  }, [user]);

  return { isSupported, isSubscribed, permission, subscribe, unsubscribe };
}
