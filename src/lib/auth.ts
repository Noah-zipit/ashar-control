// Single-password admin gate. The cookie carries an HMAC of a fixed
// label keyed by ADMIN_PASSWORD, so no secret ever leaves the server.

import { createHmac, timingSafeEqual } from "crypto";

export const COOKIE_NAME = "control_admin";

const LABEL = "ashar-control-admin";

function secret(): string {
  return process.env.ADMIN_PASSWORD || "";
}

export function signAdmin(): string {
  return createHmac("sha256", secret()).update(LABEL).digest("hex");
}

export function verifyAdminCookie(value: string | undefined): boolean {
  const s = secret();
  if (!s || !value) return false;
  const expected = signAdmin();
  try {
    const a = Buffer.from(value, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function passwordOk(candidate: string): boolean {
  const s = secret();
  if (!s || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(s);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function cookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}
