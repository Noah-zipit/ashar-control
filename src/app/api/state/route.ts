import { NextResponse } from "next/server"
import { connection } from "next/server";
import { readState, writeState } from "@/lib/store";
import { COOKIE_NAME, verifyAdminCookie } from "@/lib/auth";
import { cookies } from "next/headers";
import type { DashboardState } from "@/lib/types";

export async function GET() {
  await connection();
  const state = await readState();
  return NextResponse.json(state, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(req: Request) {
  await connection();
  const jar = await cookies();
  const bearer = req.headers.get("authorization");
  const bearerOk =
    bearer?.startsWith("Bearer ") &&
    verifyAdminCookie(bearer.slice("Bearer ".length).trim());
  // Cookie auth (web) or bearer token (APK, cross-origin where the
  // same-site cookie cannot be used). Both carry the same HMAC.
  if (!verifyAdminCookie(jar.get(COOKIE_NAME)?.value) && !bearerOk) {
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
  const result = await writeState({ ...state, notes: Array.isArray(state.notes) ? state.notes : [] });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
