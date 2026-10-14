// APK boot: no server state exists at build time. Read the device cache
// (or the baked seed on first run) as the first paint, then let the
// Constellation hook refresh from the live API when reachable.
"use client";

import { useEffect, useState } from "react";
import Constellation from "@/components/Constellation";
import { bootState } from "@/lib/dashboard-data";
import type { DashboardState } from "@/lib/types";

function BootShell() {
  return (
    <div className="flex h-[100dvh] w-full items-center justify-center bg-[#05090b]">
      <div className="flex items-center gap-3 text-teal-100/60">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="animate-spin">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" strokeDasharray="40 20" strokeLinecap="round" />
        </svg>
        <span className="text-sm">Loading constellation…</span>
      </div>
    </div>
  );
}

export default function AppBoot() {
  const [boot, setBoot] = useState<DashboardState | null>(null);
  useEffect(() => {
    setBoot(bootState());
  }, []);
  if (!boot) return <BootShell />;
  return <Constellation initial={boot} />;
}
