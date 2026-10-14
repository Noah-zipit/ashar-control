import { NextResponse } from "next/server"
import { connection } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";

export async function POST() {
  await connection();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
