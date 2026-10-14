"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { AnimatePresence, motion } from "framer-motion";
import type { DashboardState, Project, ProjectStatus } from "@/lib/types";
import {
  buildLayout,
  placeLabels,
  type LabelAnchor,
  type LabelDef,
  type LayoutNode,
} from "@/lib/graph-layout";

/* ------------------------------------------------------------------ */
/* Status                                                               */
/* ------------------------------------------------------------------ */

const STATUS_COLOR: Record<ProjectStatus, string> = {
  live: "#3ddcbb",
  active: "#3ddcbb",
  waiting: "#f0b35c",
  building: "#f0b35c",
  starts: "#f0b35c",
  offline: "#e05c5c",
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
  live: "Live",
  active: "Active",
  waiting: "Waiting",
  building: "Building",
  starts: "Starts soon",
  offline: "Offline",
};

/* ------------------------------------------------------------------ */
/* Canvas palettes                                                      */
/* ------------------------------------------------------------------ */

interface BubblePal {
  hi: string;
  mid: string;
  edge: string;
  glow: string;
}

const PAL: Record<"core" | "hub" | "project" | "detail", BubblePal> = {
  core: { hi: "#ffedc4", mid: "#e8b96a", edge: "#a86f22", glow: "rgba(232,185,106,0.28)" },
  hub: { hi: "#ffd9e6", mid: "#e58aa5", edge: "#9c2f63", glow: "rgba(229,138,165,0.20)" },
  project: { hi: "#d3cbff", mid: "#8b7cf6", edge: "#4538b8", glow: "rgba(139,124,246,0.22)" },
  detail: { hi: "#c9fff2", mid: "#3ddcbb", edge: "#147a68", glow: "rgba(61,220,187,0.18)" },
};

function glossyBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  pal: BubblePal,
  alpha: number
) {
  if (r <= 0 || alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  // outer glow
  const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.3);
  glow.addColorStop(0, pal.glow);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.3, 0, Math.PI * 2);
  ctx.fill();
  // body
  const body = ctx.createRadialGradient(
    x - r * 0.38,
    y - r * 0.42,
    r * 0.08,
    x,
    y,
    r
  );
  body.addColorStop(0, pal.hi);
  body.addColorStop(0.55, pal.mid);
  body.addColorStop(1, pal.edge);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // inner depth (darker lower-right)
  const depth = ctx.createRadialGradient(
    x + r * 0.3,
    y + r * 0.35,
    r * 0.2,
    x,
    y,
    r
  );
  depth.addColorStop(0, "rgba(0,0,0,0)");
  depth.addColorStop(1, "rgba(0,0,0,0.38)");
  ctx.fillStyle = depth;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // specular highlight
  const spec = ctx.createRadialGradient(
    x - r * 0.38,
    y - r * 0.46,
    0,
    x - r * 0.38,
    y - r * 0.46,
    r * 0.42
  );
  spec.addColorStop(0, "rgba(255,255,255,0.85)");
  spec.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = spec;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.38, y - r * 0.46, r * 0.34, r * 0.24, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // rim light (lower-right arc)
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath();
  ctx.arc(x, y, r - ctx.lineWidth / 2, Math.PI * 0.25, Math.PI * 0.75);
  ctx.stroke();
  ctx.restore();
}

function drawCore(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  alpha: number,
  time: number
) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  // halo
  const halo = ctx.createRadialGradient(x, y, r, x, y, r * 3.1);
  halo.addColorStop(0, "rgba(232,185,106,0.30)");
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 3.1, 0, Math.PI * 2);
  ctx.fill();
  // machined rings
  const rings: [number, number, number][] = [
    [1.28, 0.5, 2],
    [1.52, 0.3, 1.4],
    [1.78, 0.18, 1],
  ];
  for (const [m, a, w] of rings) {
    ctx.strokeStyle = `rgba(232,185,106,${a})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(x, y, r * m, 0, Math.PI * 2);
    ctx.stroke();
  }
  // rotating arc segment on the middle ring
  ctx.strokeStyle = "rgba(255,236,190,0.75)";
  ctx.lineWidth = 2.4;
  const a0 = time * 0.5;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.52, a0, a0 + Math.PI * 0.7);
  ctx.stroke();
  ctx.restore();
  // the golden orb itself
  glossyBubble(ctx, x, y, r, PAL.core, alpha);
}

/* ------------------------------------------------------------------ */
/* Engine types                                                         */
/* ------------------------------------------------------------------ */

interface Cam {
  x: number;
  y: number;
  zoom: number;
}

interface Eng {
  nodes: LayoutNode[];
  cam: Cam;
  stars: { x: number; y: number; r: number; a: number }[];
  dash: number;
  pulse: number;
  time: number;
  driftScale: number;
}

interface Ui {
  filter: string;
  reduced: boolean;
  state: DashboardState;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Detail card + overview (unchanged UI)                                */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider"
      style={{
        color: STATUS_COLOR[status],
        borderColor: `${STATUS_COLOR[status]}55`,
        background: `${STATUS_COLOR[status]}14`,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: STATUS_COLOR[status] }}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

function DetailCard({
  project,
  hubName,
  onClose,
}: {
  project: Project;
  hubName: string;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 26, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className="pointer-events-auto max-h-[62dvh] w-full max-w-[420px] overflow-y-auto rounded-2xl border border-white/10 bg-[#0a1416]/90 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:max-h-full"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-200/70">
            {hubName}
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-[#eef6f4]">
            {project.name}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={project.status} />
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-teal-100/70 hover:bg-white/5"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-[#b9cdc9]">{project.summary}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {project.stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
            <p className="text-[10.5px] uppercase tracking-wider text-teal-100/50">{s.label}</p>
            <p className="mt-1 font-mono text-[13px] text-[#eef6f4]">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-amber-200/15 bg-amber-200/[0.05] p-3">
        <p className="text-[10.5px] uppercase tracking-wider text-amber-100/60">Next action</p>
        <p className="mt-1 text-[13px] text-[#e8e0d0]">{project.nextAction}</p>
      </div>
      {project.link && (
        <a
          href={project.link}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#e8b96a] px-4 py-2.5 text-sm font-semibold text-[#1a1206] hover:bg-[#f0c67e]"
        >
          Open live
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      )}
    </motion.div>
  );
}

function OverviewCard({ state, onClose }: { state: DashboardState; onClose: () => void }) {
  const o = state.overview;
  const max = Math.max(1, ...o.sparkline);
  return (
    <motion.div
      initial={{ opacity: 0, y: 26, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className="pointer-events-auto max-h-[62dvh] w-full max-w-[440px] overflow-y-auto rounded-2xl border border-white/10 bg-[#0a1416]/90 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:max-h-full"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-200/70">
            Mission overview
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-[#eef6f4]">
            {state.owner.name}
          </h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-teal-100/70 hover:bg-white/5"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
        <p className="text-[10.5px] uppercase tracking-wider text-teal-100/50">{o.heroLabel}</p>
        <div className="mt-1 flex items-end justify-between gap-4">
          <p className="font-mono text-4xl text-[#eef6f4]">{o.heroValue}</p>
          <div className="flex h-12 items-end gap-1" aria-label={o.sparklineLabel}>
            {o.sparkline.map((v, i) => (
              <div
                key={i}
                className="w-2.5 rounded-sm bg-[#e8b96a]/80"
                style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
              />
            ))}
          </div>
        </div>
        <p className="mt-1 text-[11px] text-teal-100/50">{o.heroSub} · {o.sparklineLabel}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {o.grid.map((g) => (
          <div key={g.label} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
            <p className="font-mono text-xl text-[#eef6f4]">{g.value}</p>
            <p className="mt-0.5 text-[11px] text-teal-100/50">{g.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
        <p className="text-[10.5px] uppercase tracking-wider text-teal-100/50">Waiting on you</p>
        <ul className="mt-2 space-y-1.5">
          {o.waiting.map((w) => (
            <li key={w} className="flex items-start gap-2 text-[12.5px] text-[#c8d9d5]">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-200/80" />
              {w}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-[12px] text-amber-100/70">{o.deadlineLine}</p>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Toolbar, legend, metrics                                            */
/* ------------------------------------------------------------------ */

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-teal-100/70 transition hover:bg-white/10 hover:text-teal-50 sm:h-9 sm:w-9"
    >
      {children}
    </button>
  );
}

function Toolbar({
  onZoomIn,
  onZoomOut,
  onReset,
  onAdmin,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onAdmin: () => void;
}) {
  return (
    <div className="pointer-events-auto flex min-w-0 items-center gap-0.5 rounded-full border border-white/10 bg-[#0a1416]/80 px-1 py-0.5 backdrop-blur-lg sm:gap-1 sm:px-1.5 sm:py-1">
      <IconBtn label="Reset view" onClick={onReset}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 3" />
        </svg>
      </IconBtn>
      <IconBtn label="Zoom in" onClick={onZoomIn}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </IconBtn>
      <IconBtn label="Zoom out" onClick={onZoomOut}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </IconBtn>
      <IconBtn label="Admin" onClick={onAdmin}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M4 8h10M18 8h2M4 16h2M10 16h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="16" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="8" cy="16" r="2.2" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </IconBtn>
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState("");
  useEffect(() => {
    const f = () =>
      setNow(
        new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Karachi",
        }).format(new Date())
      );
    f();
    const id = setInterval(f, 15000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="pointer-events-auto hidden items-center gap-2 rounded-full border border-white/10 bg-[#0a1416]/80 px-2 py-1.5 backdrop-blur-lg min-[380px]:flex sm:px-3.5 sm:py-2">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-300" />
      <span className="whitespace-nowrap font-mono text-[11px] text-teal-50 sm:text-[13px]">
        {now}
        <span className="max-[420px]:hidden"> PKT</span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function Constellation({ initial }: { initial: DashboardState }) {
  const [state] = useState(initial);
  const [selected, setSelected] = useState<{ type: "project" | "core"; id?: string } | null>(null);
  const [filter, setFilter] = useState("");
  // which pink hub's purple projects are currently popped open (canvas reads the ref)
  const openHubIdRef = useRef<string | null>(null);
  const filterOpenedRef = useRef<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const eng = useRef<Eng | null>(null);
  const ui = useRef<Ui>({ filter: "", reduced: false, state: initial });
  const tapRef = useRef<(cx: number, cy: number) => void>(() => {});

  const layout = useMemo(
    () =>
      buildLayout(
        state.hubs.map((h) => ({ id: h.id, name: h.name, percent: h.percent })),
        state.projects.map((p) => ({ id: p.id, name: p.name, hubId: p.hubId, details: p.details }))
      ),
    [state]
  );

  const byId = useMemo(() => {
    const m = new Map<string, LayoutNode>();
    layout.forEach((n) => m.set(n.id, n));
    return m;
  }, [layout]);
  const byIdRef = useRef(byId);
  byIdRef.current = byId;

  const projectsById = useMemo(() => {
    const m = new Map<string, Project>();
    state.projects.forEach((p) => m.set(p.id, p));
    return m;
  }, [state]);

  /* ---- hit test (needs eng + byIdRef, stable across renders) ------- */
  const hitNode = useCallback((cx: number, cy: number): LayoutNode | null => {
    const canvas = canvasRef.current;
    const e = eng.current;
    if (!canvas || !e) return null;
    const rect = canvas.getBoundingClientRect();
    const fit = Math.min(rect.width / 940, rect.height / 860);
    const px = cx - rect.left;
    const py = cy - rect.top;
    let best: LayoutNode | null = null;
    let bestScore = Infinity;
    for (const n of e.nodes) {
      if (n.kind === "detail" || n.dimTarget < 0.2) continue;
      const sx = (n.x - e.cam.x) * e.cam.zoom * fit + rect.width / 2;
      const sy = (n.y - e.cam.y) * e.cam.zoom * fit + rect.height / 2;
      const rPx = Math.max(24, n.r * e.cam.zoom * fit);
      const d = Math.hypot(px - sx, py - sy) - rPx;
      if (d < 0 && d < bestScore) {
        bestScore = d;
        best = n;
      }
    }
    return best;
  }, []);

  /* ---- engine ------------------------------------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const R = mulberry(21);
    const stars = Array.from({ length: 240 }, () => ({
      x: (R() - 0.5) * 1800,
      y: (R() - 0.5) * 1300,
      r: 0.5 + R() * 1.3,
      a: 0.15 + R() * 0.45,
    }));

    const e: Eng = {
      nodes: layout,
      cam: { x: 0, y: 0, zoom: 1 },
      stars,
      dash: 0,
      pulse: 0,
      time: R() * 10,
      driftScale: 1,
    };
    eng.current = e;
    ui.current.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0;
    let H = 0;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const SANS = `600 FONTpx system-ui, -apple-system, "Segoe UI", sans-serif`;
    const MONO = `500 FONTpx ui-monospace, SFMono-Regular, Menlo, monospace`;
    // fit with real margins: world extent is ~±460 x, ~±400 y; the extra
    // denominator keeps bubbles AND their labels inside a phone viewport
    const fitOf = () => Math.min(W / 1040, H / 940);
    const w2s = (x: number, y: number) => {
      const fit = fitOf();
      return {
        x: (x - e.cam.x) * e.cam.zoom * fit + W / 2,
        y: (y - e.cam.y) * e.cam.zoom * fit + H / 2,
        s: e.cam.zoom * fit,
      };
    };

    const drawBackground = () => {
      ctx.fillStyle = "#05090b";
      ctx.fillRect(0, 0, W, H);
      const neb = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.75);
      neb.addColorStop(0, "rgba(24,92,86,0.30)");
      neb.addColorStop(0.5, "rgba(24,92,86,0.08)");
      neb.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = neb;
      ctx.fillRect(0, 0, W, H);
      const v1 = ctx.createRadialGradient(W * 0.12, H * 0.1, 0, W * 0.12, H * 0.1, W * 0.4);
      v1.addColorStop(0, "rgba(120,90,220,0.06)");
      v1.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = v1;
      ctx.fillRect(0, 0, W, H);
      const fit = fitOf();
      for (const st of stars) {
        const sx = st.x * fit + W / 2 - e.cam.x * fit * 0.06;
        const sy = st.y * fit + H / 2 - e.cam.y * fit * 0.06;
        if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) continue;
        ctx.globalAlpha = st.a;
        ctx.fillStyle = "#9fc4bd";
        ctx.beginPath();
        ctx.arc(sx, sy, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const step = (dt: number) => {
      const u = ui.current;
      const frozen = u.reduced;
      if (!frozen) {
        e.time += dt;
        e.dash -= dt * 26;
        e.pulse += dt;
      }
      const target = 1;
      e.driftScale += (target - e.driftScale) * 0.06;
      const T = frozen ? 0 : e.time;
      for (const n of e.nodes) {
        n.ax += (n.tx - n.ax) * 0.08;
        n.ay += (n.ty - n.ay) * 0.08;
        const ds = e.driftScale * n.driftAmp * (frozen ? 0 : 1);
        if (n.kind === "detail") {
          const p = byIdRef.current.get(n.parent!);
          if (p) {
            const a = n.phase + (frozen ? 0 : T * n.driftSpeed);
            n.x = p.x + Math.cos(a) * 46;
            n.y = p.y + Math.sin(a) * 46;
          }
        } else {
          n.x = n.ax + Math.sin(T * n.driftSpeed + n.phase) * ds;
          n.y = n.ay + Math.cos(T * n.driftSpeed * 0.8 + n.phase * 1.7) * ds;
        }
        if (n.kind === "project") {
          // springy pop scale for the hub-tap pop-up
          if (!frozen) {
            if (n.popDelay > 0) n.popDelay -= dt;
            else {
              n.popV += ((n.popTarget - n.pop) * 200 - n.popV * 13) * dt;
              n.pop += n.popV * dt;
            }
          } else {
            n.pop = n.popTarget;
            n.popV = 0;
            n.popDelay = 0;
          }
          n.dim += (n.dimTarget - n.dim) * 0.32;
        } else {
          n.dim += (n.dimTarget - n.dim) * 0.12;
        }
      }
    };

    const drawLinks = () => {
      const u = ui.current;
      const frozen = u.reduced;
      interface Seg {
        x1: number; y1: number; x2: number; y2: number; d: number; ph: number;
      }
      const gold: Seg[] = [];
      const teal: Seg[] = [];
      const core = e.nodes[0];
      for (const n of e.nodes) {
        const add = (
          arr: Seg[],
          a: LayoutNode,
          b: LayoutNode,
          tealLine: boolean
        ) => {
          const pa = w2s(a.x, a.y);
          const pb = w2s(b.x, b.y);
          let d = Math.min(a.dim, b.dim);
          // connector lines grow/shrink with the project's pop animation
          if (a.kind === "project") d *= Math.min(1, Math.max(0, a.pop));
          if (b.kind === "project") d *= Math.min(1, Math.max(0, b.pop));
          if (d < 0.12) return;
          arr.push({ x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, d, ph: tealLine ? 0 : a.phase + b.phase });
        };
        if (n.kind === "hub") add(gold, core, n, false);
        if (n.kind === "project") {
          add(gold, core, n, false);
          const hub = byIdRef.current.get(n.parent!);
          if (hub) add(teal, hub, n, true);
        }
        if (n.kind === "detail") {
          const p = byIdRef.current.get(n.parent!);
          if (p) add(teal, p, n, true);
        }
      }
      for (const s of teal) {
        ctx.strokeStyle = `rgba(63,184,168,${0.26 * s.d})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const s of gold) {
        ctx.strokeStyle = `rgba(212,162,84,${0.3 * s.d})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
        if (!frozen) {
          ctx.strokeStyle = `rgba(240,200,130,${0.55 * s.d})`;
          ctx.setLineDash([7, 11]);
          ctx.lineDashOffset = e.dash;
          ctx.beginPath();
          ctx.moveTo(s.x1, s.y1);
          ctx.lineTo(s.x2, s.y2);
          ctx.stroke();
          ctx.setLineDash([]);
          const t = (e.pulse * 0.14 + s.ph) % 1;
          const px = s.x1 + (s.x2 - s.x1) * t;
          const py = s.y1 + (s.y2 - s.y1) * t;
          const g = ctx.createRadialGradient(px, py, 0, px, py, 7);
          g.addColorStop(0, `rgba(255,224,170,${0.95 * s.d})`);
          g.addColorStop(1, "rgba(255,224,170,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(px, py, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const drawNodes = () => {
      const u = ui.current;
      const T = u.reduced ? 0 : e.time;
      for (const n of e.nodes) {
        const s = w2s(n.x, n.y);
        if (s.x < -90 || s.x > W + 90 || s.y < -90 || s.y > H + 90) continue;
        const r = Math.max(2, n.r * s.s);
        const a = n.dim;
        if (n.kind === "core") {
          drawCore(ctx, s.x, s.y, r, a, T);
        } else if (n.kind === "detail") {
          const rr = Math.max(4, r);
          glossyBubble(ctx, s.x, s.y, rr, PAL.detail, a);
          ctx.globalAlpha = a;
          ctx.font = MONO.replace("FONT", "7.5");
          ctx.fillStyle = "#bfeee2";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(String((n.detailIndex ?? 0) + 1), s.x + rr + 2, s.y);
          ctx.globalAlpha = 1;
        } else if (n.kind === "project") {
          // pop-up spring scale: grows from the hub with a slight overshoot
          const pc = Math.min(1.14, Math.max(0, n.pop));
          glossyBubble(ctx, s.x, s.y, r * pc, PAL[n.kind], a);
        } else {
          glossyBubble(ctx, s.x, s.y, r, PAL[n.kind], a);
        }
      }
    };

    const drawLabels = () => {
      const u = ui.current;
      const mobile = W < 640;
      const tPx = mobile ? 11.5 : 13;
      const sPx = mobile ? 10 : 10.5;
      const anchors = new Map<string, LabelAnchor>();
      const circles = new Map<string, { x: number; y: number; r: number }>();
      const defs: LabelDef[] = [];
      const seen = new Set<string>();

      for (const n of e.nodes) {
        if (n.kind === "detail") continue;
        if (n.dimTarget < 0.2) continue;
        const s = w2s(n.x, n.y);
        const rPx = Math.max(2, n.r * s.s);
        anchors.set(n.id, { x: s.x, y: s.y, rPx });
        circles.set(n.id, { x: s.x, y: s.y, r: rPx });
      }

      const st = u.state;
      const add = (d: LabelDef) => {
        if (anchors.has(d.id) && !seen.has(d.id)) {
          seen.add(d.id);
          defs.push(d);
        }
      };
      add({ id: "__core", kind: "core", title: st.owner.name, sub: st.owner.meta, dim: 1 });
      for (const h of st.hubs)
        add({ id: `hub:${h.id}`, kind: "hub", title: h.name, sub: `${h.percent}%`, dim: 1 });
      for (const p of st.projects) {
        const pn = byIdRef.current.get(`project:${p.id}`);
        add({
          id: `project:${p.id}`,
          kind: "project",
          title: p.name,
          dotColor: STATUS_COLOR[p.status],
          // labels fade in with the pop animation
          dim: (pn?.dim ?? 1) * Math.min(1, pn?.pop ?? 1),
        });
      }

      const exclusions = mobile
        ? [
            { x: 0, y: 0, w: W, h: 84 },
            { x: 0, y: H - 175, w: W, h: 175 },
          ]
        : [
            { x: 0, y: 0, w: W, h: 76 },
            { x: 0, y: H - 185, w: 240, h: 185 },
            { x: W - 410, y: H - 185, w: 410, h: 185 },
          ];

      const placed = placeLabels(defs, anchors, circles, { vw: W, vh: H, mobile, exclusions });

      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      for (const d of defs) {
        const pl = placed.get(d.id);
        if (!pl) continue; // placeLabels always places; guard anyway
        ctx.save();
        ctx.globalAlpha = Math.max(0.18, d.dim);
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur = 8;
        let tx = pl.x;
        if (d.kind === "project" && d.dotColor) {
          ctx.fillStyle = d.dotColor;
          ctx.beginPath();
          ctx.arc(tx + 3.5, pl.y + tPx * 0.55, 3.4, 0, Math.PI * 2);
          ctx.fill();
          tx += 11;
        }
        ctx.fillStyle = "#eef6f4";
        ctx.font = SANS.replace("FONT", String(tPx));
        ctx.fillText(d.title, tx, pl.y + tPx * 1.05);
        if (d.sub) {
          ctx.font = MONO.replace("FONT", String(sPx));
          ctx.fillStyle = "#9fc4bd";
          ctx.fillText(d.sub, tx, pl.y + tPx * 1.3 + sPx * 1.05);
        }
        ctx.restore();
      }
    };

    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) {
        last = now;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      step(dt);
      drawBackground();
      drawLinks();
      drawNodes();
      drawLabels();
    };
    raf = requestAnimationFrame(frame);

    /* tap / click + hover */
    let down: { x: number; y: number; t: number } | null = null;
    const onDown = (ev: PointerEvent) => {
      down = { x: ev.clientX, y: ev.clientY, t: performance.now() };
    };
    const onUp = (ev: PointerEvent) => {
      if (!down) return;
      const dx = ev.clientX - down.x;
      const dy = ev.clientY - down.y;
      const quick = performance.now() - down.t < 500;
      down = null;
      if (dx * dx + dy * dy > 100 || !quick) return;
      tapRef.current(ev.clientX, ev.clientY);
    };
    const onMove = (ev: PointerEvent) => {
      canvas.style.cursor = hitNode(ev.clientX, ev.clientY) ? "pointer" : "default";
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointermove", onMove);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointermove", onMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitNode]);

  /* ---- callbacks ---------------------------------------------------- */
  const flyCamera = useCallback((x: number, y: number, zoom: number, instant = false) => {
    const e = eng.current;
    if (!e) return;
    if (instant || ui.current.reduced) {
      e.cam.x = x;
      e.cam.y = y;
      e.cam.zoom = zoom;
      return;
    }
    gsap.killTweensOf(e.cam);
    gsap.to(e.cam, { x, y, zoom, duration: 1.1, ease: "power3.inOut" });
  }, []);

  const selectProject = useCallback(
    (id: string) => {
      setSelected({ type: "project", id });
      const n = byId.get(`project:${id}`);
      const e = eng.current;
      if (n && e) flyCamera(n.ax, n.ay, Math.min(e.cam.zoom * 1.6, e.cam.zoom + 0.9));
    },
    [byId, flyCamera]
  );

  /* Popping a hub's purple projects open: springy scale-in, staggered. */
  const openCluster = useCallback((id: string) => {
    setSelected(null);
    openHubIdRef.current = id;
    const e = eng.current;
    if (!e) return;
    const reduced = ui.current.reduced;
    const projs = e.nodes.filter((n) => n.kind === "project" && n.hubId === id);
    projs.forEach((p, i) => {
      const already = p.popTarget === 1 && p.pop > 0.5;
      p.dimTarget = 1;
      if (reduced) {
        p.pop = 1;
        p.popV = 0;
        p.popDelay = 0;
      } else if (!already) {
        p.pop = 0;
        p.popV = 0;
        p.popDelay = 0.04 + i * 0.06;
      }
      p.popTarget = 1;
    });
    for (const n of e.nodes) {
      if (n.kind === "hub") n.dimTarget = n.hubId === id ? 1 : 0.5;
      else if (n.kind === "core") n.dimTarget = 0.8;
      else if (n.kind === "project" && n.hubId !== id) {
        n.dimTarget = 0;
        n.popTarget = 0;
        if (reduced) {
          n.pop = 0;
          n.popV = 0;
        }
      }
    }
  }, []);

  const closeCluster = useCallback(() => {
    openHubIdRef.current = null;
    const e = eng.current;
    if (!e) return;
    const reduced = ui.current.reduced;
    const projs = e.nodes.filter((n) => n.kind === "project");
    projs.forEach((p, i) => {
      p.dimTarget = 0;
      p.popTarget = 0;
      if (reduced) {
        p.pop = 0;
        p.popV = 0;
        p.popDelay = 0;
      } else {
        p.popDelay = (projs.length - 1 - i) * 0.03;
      }
    });
    for (const n of e.nodes) {
      if (n.kind === "hub" || n.kind === "core") n.dimTarget = 1;
    }
  }, []);

  const closeToMain = useCallback(() => {
    setSelected(null);
    closeCluster();
    flyCamera(0, 0, 1);
  }, [flyCamera, closeCluster]);

  const handleTap = useCallback(
    (cx: number, cy: number) => {
      const n = hitNode(cx, cy);
      if (!n) {
        // empty space: tuck the open cluster away, or just close the card
        if (openHubIdRef.current) closeCluster();
        else setSelected(null);
        return;
      }
      if (n.kind === "core") setSelected({ type: "core" });
      else if (n.kind === "hub")
        openHubIdRef.current === n.hubId ? closeCluster() : openCluster(n.hubId!);
      else if (n.kind === "project") selectProject(n.projectId!);
    },
    [hitNode, openCluster, closeCluster, selectProject]
  );
  tapRef.current = handleTap;

  const zoomBy = useCallback(
    (d: number) => {
      const e = eng.current;
      if (!e) return;
      flyCamera(e.cam.x, e.cam.y, Math.min(4, Math.max(0.35, e.cam.zoom + d)));
    },
    [flyCamera]
  );

  /* ---- ui sync ------------------------------------------------------ */
  useEffect(() => {
    ui.current.state = state;
  }, [state]);
  useEffect(() => {
    ui.current.filter = filter;
    const q = filter.trim().toLowerCase();
    const nodes = eng.current?.nodes ?? [];
    if (!q) {
      // restore cluster visibility
      for (const n of nodes) {
        if (n.kind === "project") n.dimTarget = openHubIdRef.current === n.hubId ? 1 : 0;
      }
      if (filterOpenedRef.current) {
        closeCluster();
        filterOpenedRef.current = null;
      }
      return;
    }
    // matches pop into view even inside a closed hub: open that hub automatically
    let needOpen: string | null = null;
    for (const n of nodes) {
      if (n.kind !== "project") continue;
      const p = projectsById.get(n.projectId!);
      const match = !!p && p.name.toLowerCase().includes(q);
      if (match) {
        n.dimTarget = 1;
        if (openHubIdRef.current !== n.hubId) needOpen = n.hubId!;
      } else {
        n.dimTarget = 0;
      }
    }
    if (needOpen) {
      openCluster(needOpen);
      filterOpenedRef.current = needOpen;
    }
  }, [filter, projectsById, openCluster, closeCluster]);

  const hubsById = useMemo(() => {
    const m = new Map<string, string>();
    state.hubs.forEach((h) => m.set(h.id, h.name));
    return m;
  }, [state]);

  const selectedProject =
    selected?.type === "project" ? state.projects.find((p) => p.id === selected.id) : null;

  const liveCount = state.projects.filter((p) => p.status === "live" || p.status === "active").length;
  const leadsVal =
    state.projects.find((p) => p.id === "ashar-leads")?.stats.find((s) => s.label.toLowerCase().includes("lead"))?.value ?? "–";

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#05090b] text-[#e8f1ee]">
      <div ref={wrapRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="block h-full w-full touch-none" />
      </div>

      {/* top bar */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex max-w-[100vw] items-center justify-between gap-1.5 overflow-hidden p-2 sm:gap-2 sm:p-4">
        <div className="pointer-events-auto flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-[#0a1416]/80 py-1.5 pl-2 pr-2.5 backdrop-blur-lg sm:gap-2.5 sm:py-2 sm:pl-3 sm:pr-4">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="sm:h-[18px] sm:w-[18px]">
            <circle cx="12" cy="12" r="4" stroke="#e8b96a" strokeWidth="1.8" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="#e8b96a" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="whitespace-nowrap text-[11px] font-semibold tracking-wide sm:text-sm">Ashar — Control</span>
        </div>
        <Toolbar
          onZoomIn={() => zoomBy(0.35)}
          onZoomOut={() => zoomBy(-0.35)}
          onReset={closeToMain}
          onAdmin={() => (window.location.href = "/admin")}
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <Clock />
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-[11px] font-bold text-[#1a1206] sm:h-10 sm:w-10 sm:text-sm"
            style={{ background: "radial-gradient(circle at 32% 30%, #f4d49a, #c8913f)" }}
            aria-hidden
          >
            AQ
          </div>
        </div>
      </div>

      {/* legend */}
      <div className="absolute bottom-24 left-3 z-20 hidden rounded-2xl border border-white/10 bg-[#0a1416]/80 p-3.5 backdrop-blur-lg sm:bottom-6 sm:left-4 sm:block">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-100/50">Legend</p>
        <ul className="mt-2 space-y-1.5 text-[12px] text-[#b9cdc9]">
          <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: "#e8b96a" }} /> Core — {state.owner.name}</li>
          <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: "#e58aa5" }} /> Hubs — categories</li>
          <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: "#8b7cf6" }} /> Projects</li>
          <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: "#3ddcbb" }} /> Details</li>
        </ul>
        <div className="mt-3 border-t border-white/[0.07] pt-2 text-[11px] text-teal-100/45">
          {state.footer}
        </div>
      </div>

      {/* bottom-right metrics + filter */}
      <div className="absolute bottom-3 left-3 right-3 z-20 sm:bottom-6 sm:left-auto sm:right-6 sm:w-[400px]">
        <div className="pointer-events-auto mb-2 grid grid-cols-4 gap-px overflow-hidden rounded-2xl border border-white/10 bg-[#0a1416]/85 backdrop-blur-lg">
          {[
            { l: state.overview.heroLabel, v: state.overview.heroValue },
            { l: "CRM leads", v: leadsVal },
            { l: "Bots online", v: "2" },
            { l: "Projects live", v: `${liveCount} / ${state.projects.length}` },
          ].map((m) => (
            <div key={m.l} className="min-w-0 px-2 py-2 sm:px-3 sm:py-2.5">
              <p className="break-words text-[8.5px] uppercase leading-snug tracking-wide text-teal-100/50">{m.l}</p>
              <p className="mt-0.5 font-mono text-lg text-[#eef6f4]">{m.v}</p>
            </div>
          ))}
        </div>
        <form
          className="pointer-events-auto flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const q = filter.trim().toLowerCase();
            const hit = state.projects.find((p) => p.name.toLowerCase().includes(q));
            if (hit) selectProject(hit.id);
          }}
        >
          <div className="relative flex-1">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter projects..."
              className="w-full rounded-full border border-white/10 bg-[#eef6f4] px-4 py-2.5 text-sm text-[#0a1416] placeholder:text-[#0a1416]/45 focus:outline-none focus:ring-2 focus:ring-[#e8b96a]/60"
            />
          </div>
          <button
            type="submit"
            aria-label="Go to match"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e8b96a] text-[#1a1206] hover:bg-[#f0c67e]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </div>

      {/* detail / overview card */}
      <div className="pointer-events-none absolute inset-x-3 bottom-28 z-30 flex justify-center sm:inset-x-auto sm:bottom-24 sm:right-6 sm:top-[76px] sm:w-[440px] sm:items-start sm:justify-end">
        <AnimatePresence mode="wait">
          {selected?.type === "project" && selectedProject && (
            <DetailCard
              key={`p-${selectedProject.id}`}
              project={selectedProject}
              hubName={hubsById.get(selectedProject.hubId) ?? ""}
              onClose={() => setSelected(null)}
            />
          )}
          {selected?.type === "core" && (
            <OverviewCard key="overview" state={state} onClose={() => setSelected(null)} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
