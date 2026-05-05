// Helpers para gerenciar permissão e registro de Web Push.
// Trata os 3 estados: "default" (ainda não pediu), "granted", "denied".

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
    // Reaproveita registro existente se houver
    const existing = await navigator.serviceWorker.getRegistration("/sw.js");
    if (existing) return existing;
    return await navigator.serviceWorker.register("/sw.js");
  } catch (err) {
    console.error("[push] falha ao registrar SW:", err);
    return null;
  }
}

/**
 * Solicita permissão. Retorna o estado final.
 * Não chama se já foi negada (browsers exigem reset manual).
 */
export async function requestNotificationPermission(): Promise<PushPermission> {
  if (!isPushSupported()) return "unsupported";

  const current = Notification.permission;
  if (current === "granted") return "granted";
  if (current === "denied") return "denied"; // usuário precisa reabilitar manualmente

  try {
    const result = await Notification.requestPermission();
    return result as PushPermission;
  } catch (err) {
    console.error("[push] erro ao solicitar permissão:", err);
    return "denied";
  }
}

/**
 * Fluxo completo: pede permissão e (se concedida) registra o SW.
 * Retorna o estado final + registro (quando aplicável).
 */
export async function enablePushNotifications(): Promise<{
  permission: PushPermission;
  registration: ServiceWorkerRegistration | null;
}> {
  const permission = await requestNotificationPermission();
  if (permission !== "granted") {
    return { permission, registration: null };
  }
  const registration = await registerServiceWorker();
  return { permission, registration };
}

/** Mostra notificação local (teste / fallback quando push real não está configurado). */
export async function showLocalNotification(
  title: string,
  options?: NotificationOptions
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
