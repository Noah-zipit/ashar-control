import { NextResponse } from "next/server";
import { readState, writeState } from "@/lib/store";
import { COOKIE_NAME, verifyAdminCookie } from "@/lib/auth";
import { cookies } from "next/headers";
import type { DashboardState } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await readState();
  return NextResponse.json(state, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(req: Request) {
  const jar = await cookies();
  if (!verifyAdminCookie(jar.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const state = body as DashboardState;
  if (
    !state ||
    typeof state !== "object" ||
    !Array.isArray(state.hubs) ||
    !Array.isArray(state.projects) ||
    typeof state.overview !== "object"
  ) {
    return NextResponse.json(
      { error: "Body must be a full dashboard state document." },
      { status: 400 }
    );
  }
  const result = await writeState(state);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
