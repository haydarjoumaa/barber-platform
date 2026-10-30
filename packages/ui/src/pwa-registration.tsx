"use client";
import { useEffect } from "react";

/** The worker supplies an offline notice only; it never caches account data. */
export function PwaRegistration({ script, scope }: { script: string; scope: string }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(script, { scope, updateViaCache: "none" }).catch(() => { /* Normal online navigation remains available. */ });
  }, [script, scope]);
  return null;
}
