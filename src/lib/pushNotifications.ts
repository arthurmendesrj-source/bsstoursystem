// Helpers para gerenciar permissão e registro de Web Push.
import { savePushSubscription, deletePushSubscription } from "@/server/push.functions";
import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from "./vapid";

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function getPermissionState(): PushPermission {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission as PushPermission;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration("/sw.js");
    if (existing) return existing;
    return await navigator.serviceWorker.register("/sw.js");
  } catch (err) {
    console.error("[push] falha ao registrar SW:", err);
    return null;
  }
}

export async function requestNotificationPermission(): Promise<PushPermission> {
  if (!isPushSupported()) return "unsupported";
  const current = Notification.permission;
  if (current === "granted") return "granted";
  if (current === "denied") return "denied";
  try {
    const result = await Notification.requestPermission();
    return result as PushPermission;
  } catch (err) {
    console.error("[push] erro ao solicitar permissão:", err);
    return "denied";
  }
}

function arrayBufferToBase64(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < bytes.byteLength; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Inscreve no PushManager e envia subscription para o backend. */
export async function subscribeToPush(
  registration: ServiceWorkerRegistration,
): Promise<PushSubscription | null> {
  try {
    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const p256dh = arrayBufferToBase64(sub.getKey("p256dh"));
    const auth = arrayBufferToBase64(sub.getKey("auth"));
    await savePushSubscription({
      data: {
        endpoint: sub.endpoint,
        p256dh,
        auth,
        userAgent: navigator.userAgent.slice(0, 500),
      },
    });
    return sub;
  } catch (err) {
    console.error("[push] subscribeToPush falhou:", err);
    return null;
  }
}

/** Cancela subscription local e remove no backend. */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!reg) return true;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return true;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    try {
      await deletePushSubscription({ data: { endpoint } });
    } catch (err) {
      console.error("[push] deletePushSubscription falhou:", err);
    }
    return true;
  } catch (err) {
    console.error("[push] unsubscribeFromPush falhou:", err);
    return false;
  }
}

/** Fluxo completo: permissão + SW + subscription. */
export async function enablePushNotifications(): Promise<{
  permission: PushPermission;
  registration: ServiceWorkerRegistration | null;
  subscription: PushSubscription | null;
}> {
  const permission = await requestNotificationPermission();
  if (permission !== "granted") {
    return { permission, registration: null, subscription: null };
  }
  const registration = await registerServiceWorker();
  if (!registration) return { permission, registration: null, subscription: null };
  const subscription = await subscribeToPush(registration);
  return { permission, registration, subscription };
}

/** Mostra notificação local (fallback / teste sem rede). */
export async function showLocalNotification(
  title: string,
  options?: NotificationOptions,
): Promise<boolean> {
  if (getPermissionState() !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (reg) {
      await reg.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
    return true;
  } catch (err) {
    console.error("[push] showLocalNotification falhou:", err);
    return false;
  }
}
