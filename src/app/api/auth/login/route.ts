import { NextResponse } from "next/server";
import { COOKIE_NAME, cookieOptions, passwordOk, signAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const password =
    typeof body === "object" && body !== null && "password" in body
      ? String((body as { password: unknown }).password ?? "")
      : "";
  if (!passwordOk(password)) {
    // Small constant-time cost is fine; do not reveal whether a password is set.
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, signAdmin(), cookieOptions());
  return res;
}
