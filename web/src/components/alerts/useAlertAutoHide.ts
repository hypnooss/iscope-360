import { useEffect } from "react";
import { getAlertAgeMs, getAlertLifetimeMs } from "./alertLifetime";

type AutoHideAlert = {
  id: string;
  alert_type: string;
  created_at: string;
};

export function useAlertAutoHide(
  alert: AutoHideAlert | null | undefined,
  onExpire: (alertId: string) => void
) {
  useEffect(() => {
    if (!alert?.id) return;

    const ageMs = getAlertAgeMs(alert.created_at);
    const lifetimeMs = getAlertLifetimeMs(alert.alert_type);
    const remainingMs = lifetimeMs - ageMs;

    if (remainingMs <= 0) {
      onExpire(alert.id);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      onExpire(alert.id);
    }, remainingMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [alert?.id, alert?.created_at, alert?.alert_type, onExpire]);
}
