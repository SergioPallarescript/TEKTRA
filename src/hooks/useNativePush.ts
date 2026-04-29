import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";
import { App as CapApp } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TEKTRA_CHANNEL_ID } from "@/hooks/useNativeNotificationChannel";

/**
 * Registers the device with the OS push service (FCM on Android, APNs on iOS)
 * and stores the resulting token in `native_push_tokens` so the backend can
 * deliver notifications when the app is closed and the phone is locked.
 *
 * Web (browser / PWA) is a no-op — that path uses `usePushSubscription`.
 */
export function useNativePush() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    if (!Capacitor.isNativePlatform()) return;

    let removeRegistration: (() => void) | null = null;
    let removeError: (() => void) | null = null;
    let removeReceived: (() => void) | null = null;
    let removeAction: (() => void) | null = null;

    const platform = Capacitor.getPlatform(); // 'ios' | 'android'

    const ensurePermission = async () => {
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive !== "granted") {
        console.warn("[NativePush] Permission not granted:", perm.receive);
        return false;
      }
      return true;
    };

    const upsertToken = async (token: string) => {
      try {
        await supabase.from("native_push_tokens" as any).upsert(
          {
            user_id: user.id,
            token,
            platform,
            is_active: true,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "user_id,token" }
        );
      } catch (e) {
        console.error("[NativePush] Failed to store token:", e);
      }
    };

    const init = async () => {
      const ok = await ensurePermission();
      if (!ok) return;

      const r1 = await PushNotifications.addListener("registration", async (token) => {
        console.log("[NativePush] Registered with token:", token.value.slice(0, 12) + "…");
        await upsertToken(token.value);
      });
      removeRegistration = () => r1.remove();

      const r2 = await PushNotifications.addListener("registrationError", (err) => {
        console.error("[NativePush] Registration error:", err);
      });
      removeError = () => r2.remove();

      // Foreground delivery — the OS does NOT show a banner when the app is
      // open, but we still want the in-app bell to refresh. The realtime
      // subscription on the notifications table already handles UI updates,
      // so we just acknowledge here.
      const r3 = await PushNotifications.addListener(
        "pushNotificationReceived",
        async (notif) => {
          console.log("[NativePush] Foreground push:", notif.title);
          // Re-emit as a local notification on the high-importance channel so
          // it appears as a heads-up bubble even when the app is in foreground.
          if (platform === "android") {
            try {
              await LocalNotifications.schedule({
                notifications: [
                  {
                    id: Math.floor(Math.random() * 2_147_483_000),
                    title: notif.title || "TEKTRA",
                    body: notif.body || "",
                    channelId: TEKTRA_CHANNEL_ID,
                    extra: notif.data || {},
                  },
                ],
              });
            } catch (e) {
              console.error("[NativePush] Failed to re-emit as local:", e);
            }
          }
        }
      );
      removeReceived = () => r3.remove();

      // User tapped the notification — deep-link into the app.
      const r4 = await PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (action) => {
          const url = action.notification.data?.url;
          if (typeof url === "string" && url.startsWith("/")) {
            window.location.assign(url);
          }
        }
      );
      removeAction = () => r4.remove();

      await PushNotifications.register();
    };

    init();

    // Refresh the token timestamp every time the user reopens the app — keeps
    // the backend able to prune dead devices later.
    const appResume = CapApp.addListener("appStateChange", async ({ isActive }) => {
      if (!isActive) return;
      try {
        const perm = await PushNotifications.getDeliveredNotifications();
        if (perm.notifications.length > 0) {
          await PushNotifications.removeAllDeliveredNotifications();
        }
      } catch {}
    });

    return () => {
      removeRegistration?.();
      removeError?.();
      removeReceived?.();
      removeAction?.();
      appResume.then((h) => h.remove()).catch(() => {});
    };
  }, [user]);
}