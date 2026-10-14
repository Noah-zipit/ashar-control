// Client-side data helpers shared by the dashboard, notes, and admin.
// On the web build API_BASE is "" (same-origin, cookie auth).
// In the APK build (CAPACITOR_BUILD=1) NEXT_PUBLIC_API_BASE points at the
// live web app and auth falls back to a bearer token obtained at login.

import type { DashboardState } from "./types";

export function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE || "";
}

/** True when running inside the APK (no same-origin cookie). */
export function isAppMode(): boolean {
  return apiBase().length > 0;
}

const TOKEN_KEY = "ac_admin_token_v1";

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

function authHeaders(): Record<string, string> {
  const t = getAdminToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function apiGetState(timeoutMs = 9000): Promise<DashboardState> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase()}/api/state`, {
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`state GET ${res.status}`);
    const json = (await res.json()) as DashboardState;
    if (!json || !Array.isArray(json.projects)) throw new Error("bad state doc");
    if (!Array.isArray(json.notes)) json.notes = [];
    return json;
  } finally {
    clearTimeout(id);
  }
}

export async function apiPutState(
  state: DashboardState
): Promise<{ ok: boolean; unauthorized?: boolean; error?: string }> {
  try {
    const res = await fetch(`${apiBase()}/api/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(state),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, unauthorized: true };
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: j.error ?? `PUT ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }
}

export async function apiLogin(
  password: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${apiBase()}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // In app mode the cookie is useless cross-origin; ask the server
      // for the token in the JSON body instead (web flow is unchanged).
      body: JSON.stringify(
        isAppMode() ? { password, requestToken: true } : { password }
      ),
    });
    if (!res.ok) return { ok: false, error: "Wrong password." };
    if (isAppMode()) {
      const j = (await res.json()) as { ok?: boolean; token?: string };
      if (j.token) setAdminToken(j.token);
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error." };
  }
}

export async function apiLogout(): Promise<void> {
  setAdminToken(null);
  try {
    await fetch(`${apiBase()}/api/auth/logout`, { method: "POST" });
  } catch {
    /* best effort */
  }
}
