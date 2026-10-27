"use client";

import { useSyncExternalStore } from "react";
import { useLocale } from "./locale-provider";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function ConnectivityNotice() {
  const { t } = useLocale();
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  return online ? null : <div role="status" className="bg-ink px-6 py-3 text-center text-sm text-white">{t("offline")}</div>;
}
