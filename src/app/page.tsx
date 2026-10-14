import { Suspense } from "react";
import { connection } from "next/server";
import { readState } from "@/lib/store";
import Constellation from "@/components/Constellation";
import AppBoot from "@/components/AppBoot";

export const metadata = {
  title: "Control — Ashar's Projects",
  description: "Live constellation of every project, application and deadline.",
};

// The APK build (CAPACITOR_BUILD=1) is a static export: no server, so no
// server state fetch. The client boot path reads the device cache instead.
const IS_APP = process.env.CAPACITOR_BUILD === "1";

async function DashboardBody() {
  await connection();
  const state = await readState();
  return <Constellation initial={state} />;
}

function LoadingShell() {
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

export default function Page() {
  if (IS_APP) return <AppBoot />;
  return (
    <Suspense fallback={<LoadingShell />}>
      <DashboardBody />
    </Suspense>
  );
}
