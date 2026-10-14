// Offline-first dashboard store.
// - Loads server state when reachable, falls back to the local cache.
// - Every edit applies locally immediately, is queued in localStorage,
//   and is pushed when online + authenticated.
// - Conflict rule: last-write-wins for LOCAL edits (pending state is never
//   overwritten by a server fetch); when there are no pending local edits,
//   a fresh server fetch wins outright.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SEED } from "./seed";
import type { DashboardState } from "./types";
import { apiGetState, apiPutState } from "./api";

const CACHE_KEY = "ac_state_cache_v1";
const PENDING_KEY = "ac_pending_state_v1";

export type SyncStatus =
  | "synced"
  | "syncing"
  | "pending"
  | "offline"
  | "needs-login";

function readLocal(key: string): DashboardState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const doc = JSON.parse(raw) as DashboardState;
    if (!doc || !Array.isArray(doc.projects)) return null;
    if (!Array.isArray(doc.notes)) doc.notes = [];
    return doc;
  } catch {
    return null;
  }
}

function writeLocal(key: string, doc: DashboardState | null) {
  try {
    if (doc) localStorage.setItem(key, JSON.stringify(doc));
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

export interface DashboardApi {
  state: DashboardState;
  sync: SyncStatus;
  /** Apply a local edit; it is queued and synced when possible. */
  push: (fn: (s: DashboardState) => DashboardState) => void;
  /** Try to push any queued state right now. */
  retrySync: () => void;
  /** Refresh from the server (no pending edits: server wins). */
  refresh: () => void;
}

export function useDashboard(initial: DashboardState): DashboardApi {
  const [state, setState] = useState<DashboardState>(initial);
  const [sync, setSync] = useState<SyncStatus>("synced");
  const stateRef = useRef(state);
  stateRef.current = state;
  const syncingRef = useRef(false);

  const attemptSync = useCallback(async () => {
    if (syncingRef.current) return;
    const pending = readLocal(PENDING_KEY);
    if (!pending) {
      setSync((s) => (s === "pending" || s === "offline" ? "synced" : s));
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSync("offline");
      return;
    }
    syncingRef.current = true;
    setSync("syncing");
    try {
      const r = await apiPutState(pending);
      if (r.ok) {
        writeLocal(PENDING_KEY, null);
        writeLocal(CACHE_KEY, pending);
        setState(pending);
        setSync("synced");
      } else if (r.unauthorized) {
        setSync("needs-login");
      } else if (typeof navigator !== "undefined" && !navigator.onLine) {
        setSync("offline");
      } else {
        // server/network error — keep queued, mark offline-ish so the user
        // knows it is still on the device
        setSync("offline");
      }
    } finally {
      syncingRef.current = false;
    }
  }, []);

  const refresh = useCallback(async () => {
    const pending = readLocal(PENDING_KEY);
    if (pending) {
      // Local edits in flight: they win; still try to push them.
      setState(pending);
      setSync(
        typeof navigator !== "undefined" && !navigator.onLine
          ? "offline"
          : "pending"
      );
      void attemptSync();
      return;
    }
    try {
      const server = await apiGetState();
      writeLocal(CACHE_KEY, server);
      setState(server);
      setSync("synced");
    } catch {
      const cached = readLocal(CACHE_KEY);
      if (cached) {
        setState(cached);
        setSync("offline");
      } else {
        setSync(
          typeof navigator !== "undefined" && navigator.onLine === false
            ? "offline"
            : "synced"
        );
      }
    }
  }, [attemptSync]);

  const push = useCallback(
    (fn: (s: DashboardState) => DashboardState) => {
      const next = fn(structuredClone(stateRef.current));
      next.updatedAt = new Date().toISOString();
      if (!Array.isArray(next.notes)) next.notes = [];
      setState(next);
      writeLocal(PENDING_KEY, next);
      setSync(
        typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "pending"
      );
      void attemptSync();
    },
    [attemptSync]
  );

  const retrySync = useCallback(() => {
    void attemptSync();
  }, [attemptSync]);

  // On mount: prefer the local cache when the network/API is unreachable.
  // On the web build `initial` is already the server state; in the APK it is
  // the baked seed, so the cache is the real first paint.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pending = readLocal(PENDING_KEY);
      if (pending) {
        if (!cancelled) {
          setState(pending);
          setSync(
            typeof navigator !== "undefined" && !navigator.onLine
              ? "offline"
              : "pending"
          );
          void attemptSync();
        }
        return;
      }
      try {
        const server = await apiGetState();
        if (cancelled) return;
        writeLocal(CACHE_KEY, server);
        setState(server);
        setSync("synced");
      } catch {
        if (cancelled) return;
        const cached = readLocal(CACHE_KEY);
        if (cached) {
          setState(cached);
          setSync("offline");
        }
      }
    })();
    const onOnline = () => void attemptSync();
    const onOffline = () => setSync("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [attemptSync]);

  return { state, sync, push, retrySync, refresh };
}

/** Fallback first-paint state for the APK shell (no server available). */
export function bootState(): DashboardState {
  return (
    readLocal("ac_pending_state_v1") ?? readLocal("ac_state_cache_v1") ?? SEED
  );
}
