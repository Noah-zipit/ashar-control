"use client";

import { useEffect } from "react";

/** Registers the PWA service worker. Production only — never in dev. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* registration is best-effort */
    });
  }, []);
  return null;
}
