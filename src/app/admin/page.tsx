"use client";

import { useState } from "react";
import { SEED } from "@/lib/seed";
import type { DashboardState, Project, ProjectStatus } from "@/lib/types";
import { apiGetState, apiLogin, apiLogout, apiPutState } from "@/lib/api";

const STATUSES: ProjectStatus[] = ["live", "active", "building", "waiting", "starts", "offline"];

const field =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-[#eef6f4] placeholder:text-white/30 focus:border-[#e8b96a]/60 focus:outline-none";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [state, setState] = useState<DashboardState | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [openProject, setOpenProject] = useState<string | null>(null);

  const loadState = async () => {
    try {
      setState(await apiGetState());
    } catch {
      setFeedback({ ok: false, msg: "Could not reach the state server. Are you offline?" });
    }
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    const r = await apiLogin(password);
    if (r.ok) {
      setAuthed(true);
      setPassword("");
      await loadState();
    } else {
      setLoginError(r.error ?? "Wrong password.");
    }
  };

  const logout = async () => {
    await apiLogout();
    setAuthed(false);
    setState(null);
  };

  const save = async () => {
    if (!state) return;
    setSaving(true);
    setFeedback(null);
    const payload: DashboardState = {
      ...state,
      notes: Array.isArray(state.notes) ? state.notes : [],
      updatedAt: new Date().toISOString(),
    };
    const r = await apiPutState(payload);
    setSaving(false);
    if (r.ok) {
      setFeedback({ ok: true, msg: `Saved. Live within a minute.` });
      setState(payload);
      // keep the dashboard's local cache fresh on this device
      try {
        localStorage.setItem("ac_state_cache_v1", JSON.stringify(payload));
        localStorage.removeItem("ac_pending_state_v1");
      } catch { /* storage unavailable */ }
    } else if (r.unauthorized) {
      setFeedback({ ok: false, msg: "Session expired. Log in again." });
      setAuthed(false);
    } else {
      setFeedback({ ok: false, msg: r.error ?? "Save failed." });
    }
  };

  const update = (fn: (s: DashboardState) => DashboardState) =>
    setState((prev) => (prev ? fn(structuredClone(prev)) : prev));

  if (!authed) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#05090b] p-6">
        <form
          onSubmit={login}
          className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a1416]/90 p-6"
        >
          <h1 className="font-display text-xl font-semibold text-[#eef6f4]">
            Control — Admin
          </h1>
          <p className="mt-1 text-sm text-white/50">Password protected. Content only, no layout editing.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className={`${field} mt-4`}
          />
          {loginError && <p className="mt-2 text-sm text-red-400">{loginError}</p>}
          <button
            type="submit"
            className="mt-4 w-full rounded-xl bg-[#e8b96a] px-4 py-2.5 text-sm font-semibold text-[#1a1206] hover:bg-[#f0c67e]"
          >
            Unlock
          </button>
          <a href="/" className="mt-4 block text-center text-sm text-teal-200/60 hover:text-teal-100">
            Back to dashboard
          </a>
        </form>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#05090b] text-white/60">
        Loading state…
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#05090b] p-4 pb-24 text-[#eef6f4] sm:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold">Control — Admin</h1>
            <p className="text-sm text-white/50">Edit every hub and project. Layout stays automatic.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (confirm("Reset everything to the original seed data?")) update(() => structuredClone(SEED));
              }}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
            >
              Reset to seed
            </button>
            <button onClick={logout} className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5">
              Log out
            </button>
          </div>
        </div>

        {feedback && (
          <div
            className={`mt-4 rounded-xl border p-3 text-sm ${
              feedback.ok ? "border-teal-400/30 bg-teal-400/10 text-teal-100" : "border-red-400/30 bg-red-400/10 text-red-200"
            }`}
          >
            {feedback.msg}
          </div>
        )}

        {/* Hubs */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-200/70">Hubs</h2>
          <div className="mt-3 space-y-2">
            {state.hubs.map((h, i) => {
              const used = state.projects.some((p) => p.hubId === h.id);
              return (
                <div key={h.id} className="flex items-center gap-2">
                  <input
                    value={h.name}
                    onChange={(e) =>
                      update((s) => {
                        s.hubs[i].name = e.target.value;
                        return s;
                      })
                    }
                    className={field}
                    aria-label="Hub name"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={h.percent}
                    onChange={(e) =>
                      update((s) => {
                        s.hubs[i].percent = Number(e.target.value) || 0;
                        return s;
                      })
                    }
                    className={`${field} w-24`}
                    aria-label="Hub percent"
                  />
                  <button
                    onClick={() => {
                      if (used) return alert("Move its projects to another hub first.");
                      update((s) => {
                        s.hubs.splice(i, 1);
                        return s;
                      });
                    }}
                    className="rounded-lg border border-white/10 px-3 py-2 text-sm text-red-300 hover:bg-red-400/10"
                    aria-label={`Delete hub ${h.name}`}
                  >
                    Delete
                  </button>
                </div>
              );
            })}
            <button
              onClick={() =>
                update((s) => {
                  const id = `hub-${Date.now()}`;
                  s.hubs.push({ id, name: "New hub", percent: 5 });
                  return s;
                })
              }
              className="rounded-xl border border-dashed border-white/20 px-4 py-2 text-sm text-white/70 hover:bg-white/5"
            >
              + Add hub
            </button>
          </div>
        </section>

        {/* Projects */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-200/70">Projects</h2>
          <div className="mt-3 space-y-2">
            {state.projects.map((p, i) => (
              <div key={p.id} className="rounded-xl border border-white/10 bg-white/[0.02]">
                <button
                  onClick={() => setOpenProject(openProject === p.id ? null : p.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-white/40">{p.status}</span>
                </button>
                {openProject === p.id && (
                  <div className="space-y-3 border-t border-white/[0.07] p-4">
                    <input
                      value={p.name}
                      onChange={(e) => update((s) => { s.projects[i].name = e.target.value; return s; })}
                      className={field}
                      aria-label="Project name"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={p.hubId}
                        onChange={(e) => update((s) => { s.projects[i].hubId = e.target.value; return s; })}
                        className={`${field} bg-[#0a1416]`}
                        aria-label="Hub"
                      >
                        {state.hubs.map((h) => (
                          <option key={h.id} value={h.id}>{h.name}</option>
                        ))}
                      </select>
                      <select
                        value={p.status}
                        onChange={(e) => update((s) => { s.projects[i].status = e.target.value as ProjectStatus; return s; })}
                        className={`${field} bg-[#0a1416]`}
                        aria-label="Status"
                      >
                        {STATUSES.map((st) => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      value={p.summary}
                      onChange={(e) => update((s) => { s.projects[i].summary = e.target.value; return s; })}
                      rows={3}
                      className={field}
                      aria-label="Summary"
                    />
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-wider text-white/40">Stats (label / value)</p>
                      {p.stats.map((st, j) => (
                        <div key={j} className="mb-1.5 flex gap-2">
                          <input
                            value={st.label}
                            onChange={(e) => update((s) => { s.projects[i].stats[j].label = e.target.value; return s; })}
                            className={field}
                            aria-label="Stat label"
                          />
                          <input
                            value={st.value}
                            onChange={(e) => update((s) => { s.projects[i].stats[j].value = e.target.value; return s; })}
                            className={field}
                            aria-label="Stat value"
                          />
                          <button
                            onClick={() => update((s) => { s.projects[i].stats.splice(j, 1); return s; })}
                            className="rounded-lg border border-white/10 px-2 text-red-300"
                            aria-label="Remove stat"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => update((s) => { s.projects[i].stats.push({ label: "Label", value: "Value" }); return s; })}
                        className="text-sm text-teal-200/70 hover:text-teal-100"
                      >
                        + Add stat
                      </button>
                    </div>
                    <textarea
                      value={p.nextAction}
                      onChange={(e) => update((s) => { s.projects[i].nextAction = e.target.value; return s; })}
                      rows={2}
                      className={field}
                      aria-label="Next action"
                      placeholder="Next action"
                    />
                    <input
                      value={p.link ?? ""}
                      onChange={(e) => update((s) => { s.projects[i].link = e.target.value || undefined; return s; })}
                      className={field}
                      placeholder="Live link (optional)"
                      aria-label="Live link"
                    />
                    <textarea
                      value={p.details.join("\n")}
                      onChange={(e) => update((s) => { s.projects[i].details = e.target.value.split("\n").map((x) => x.trim()).filter(Boolean); return s; })}
                      rows={3}
                      className={field}
                      aria-label="Detail dots, one per line"
                      placeholder="Detail dots, one per line"
                    />
                    <button
                      onClick={() => {
                        if (confirm(`Delete project "${p.name}"?`))
                          update((s) => { s.projects.splice(i, 1); return s; });
                      }}
                      className="rounded-lg border border-red-400/30 px-3 py-1.5 text-sm text-red-300 hover:bg-red-400/10"
                    >
                      Delete project
                    </button>
                  </div>
                )}
              </div>
            ))}
            <button
              onClick={() =>
                update((s) => {
                  s.projects.push({
                    id: `project-${Date.now()}`,
                    name: "New project",
                    hubId: s.hubs[0]?.id ?? "",
                    status: "live",
                    summary: "",
                    stats: [],
                    nextAction: "",
                    details: [],
                  });
                  return s;
                })
              }
              className="rounded-xl border border-dashed border-white/20 px-4 py-2 text-sm text-white/70 hover:bg-white/5"
            >
              + Add project
            </button>
          </div>
        </section>

        {/* Overview */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-200/70">Overview</h2>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <input value={state.overview.heroLabel} onChange={(e) => update((s) => { s.overview.heroLabel = e.target.value; return s; })} className={field} aria-label="Hero label" />
              <input value={state.overview.heroValue} onChange={(e) => update((s) => { s.overview.heroValue = e.target.value; return s; })} className={field} aria-label="Hero value" />
              <input value={state.overview.heroSub} onChange={(e) => update((s) => { s.overview.heroSub = e.target.value; return s; })} className={field} aria-label="Hero sub" />
            </div>
            <input
              value={state.overview.sparkline.join(",")}
              onChange={(e) => update((s) => { s.overview.sparkline = e.target.value.split(",").map((x) => Number(x.trim()) || 0); return s; })}
              className={field}
              aria-label="Sparkline values, comma separated"
            />
            {state.overview.grid.map((g, j) => (
              <div key={j} className="flex gap-2">
                <input value={g.label} onChange={(e) => update((s) => { s.overview.grid[j].label = e.target.value; return s; })} className={field} aria-label="Grid label" />
                <input value={g.value} onChange={(e) => update((s) => { s.overview.grid[j].value = e.target.value; return s; })} className={`${field} w-28`} aria-label="Grid value" />
              </div>
            ))}
            <textarea
              value={state.overview.waiting.join("\n")}
              onChange={(e) => update((s) => { s.overview.waiting = e.target.value.split("\n").map((x) => x.trim()).filter(Boolean); return s; })}
              rows={5}
              className={field}
              aria-label="Waiting on you, one per line"
            />
            <input
              value={state.overview.deadlineLine}
              onChange={(e) => update((s) => { s.overview.deadlineLine = e.target.value; return s; })}
              className={field}
              aria-label="Deadline line"
            />
            <input
              value={state.footer}
              onChange={(e) => update((s) => { s.footer = e.target.value; return s; })}
              className={field}
              aria-label="Footer"
            />
          </div>
        </section>

        <button
          onClick={save}
          disabled={saving}
          className="mt-8 w-full rounded-xl bg-[#e8b96a] px-4 py-3 font-semibold text-[#1a1206] hover:bg-[#f0c67e] disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save — goes live within a minute"}
        </button>
        <a href="/" className="mt-4 block text-center text-sm text-teal-200/60 hover:text-teal-100">
          Back to dashboard
        </a>
      </div>
    </div>
  );
}
