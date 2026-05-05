import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  enablePushNotifications,
  getPermissionState,
  isPushSupported,
  showLocalNotification,
  type PushPermission,
} from "@/lib/pushNotifications";
import { useI18n } from "@/lib/i18n";

interface Props {
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function EnableNotificationsButton({
  variant = "outline",
  size = "sm",
  className,
}: Props) {
  const { t } = useI18n();
  const [permission, setPermission] = useState<PushPermission>("default");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPermission(getPermissionState());
  }, []);

  if (!isPushSupported()) return null;

  const handleClick = async () => {
    if (permission === "granted") {
      // Já habilitado → envia notificação de teste
      const ok = await showLocalNotification(
        t("notifTestTitle") || "Notificações ativas",
        { body: t("notifTestBody") || "Você receberá alertas aqui." }
      );
      if (!ok) toast.error(t("notifTestFailed") || "Falha ao exibir notificação");
      return;
    }

    if (permission === "denied") {
      toast.error(
        t("notifDeniedHelp") ||
          "Notificações bloqueadas. Habilite manualmente nas configurações do navegador (cadeado da URL)."
      );
      return;
    }

    setLoading(true);
    try {
      const { permission: result } = await enablePushNotifications();
      setPermission(result);
      if (result === "granted") {
        toast.success(t("notifEnabled") || "Notificações ativadas");
        await showLocalNotification(
          t("notifTestTitle") || "Notificações ativas",
          { body: t("notifTestBody") || "Você receberá alertas aqui." }
        );
      } else if (result === "denied") {
        toast.error(t("notifDeniedHelp") || "Permissão negada. Reabilite no navegador.");
      } else {
        toast.message(t("notifDismissed") || "Permissão não concedida.");
      }
    } finally {
      setLoading(false);
    }
  };

  const Icon =
    permission === "granted" ? BellRing : permission === "denied" ? BellOff : Bell;

  const label =
    permission === "granted"
      ? t("notifTest") || "Testar notificação"
      : permission === "denied"
      ? t("notifBlocked") || "Notificações bloqueadas"
      : t("notifEnable") || "Ativar notificações";

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={loading}
      className={className}
    >
      <Icon className="h-4 w-4 mr-2" />
      {label}
    </Button>
  );
}
