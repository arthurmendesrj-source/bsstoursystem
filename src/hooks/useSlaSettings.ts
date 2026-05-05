import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureSlaSettingsLoaded, invalidateSlaSettingsCache, DEFAULT_SLA_HOURS } from "@/lib/leadSla";

export type SlaSettingRow = {
  stage: string;
  warning_hours: number;
  overdue_hours: number;
};

/** Loads SLA settings once per session and exposes them. */
export function useSlaSettings() {
  const [settings, setSettings] = useState<SlaSettingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    invalidateSlaSettingsCache();
    await ensureSlaSettingsLoaded();
    const { data } = await supabase
      .from("sla_settings")
      .select("stage,warning_hours,overdue_hours")
      .order("stage");
    setSettings((data ?? []) as SlaSettingRow[]);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  return { settings, loading, reload, defaults: DEFAULT_SLA_HOURS };
}
