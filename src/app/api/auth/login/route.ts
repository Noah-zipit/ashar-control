import { NextResponse } from "next/server"
import { connection } from "next/server";
import { COOKIE_NAME, cookieOptions, passwordOk, signAdmin } from "@/lib/auth";

export async function POST(req: Request) {
  await connection();
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
  const wantsToken =
    typeof body === "object" &&
    body !== null &&
    "requestToken" in body &&
    (body as { requestToken: unknown }).requestToken === true;
  const res = NextResponse.json(
    wantsToken ? { ok: true, token: signAdmin() } : { ok: true }
  );
  res.cookies.set(COOKIE_NAME, signAdmin(), cookieOptions());
  return res;
}
