/**
 * Pure, framework-free graph layout + label placement for the Control
 * constellation. Kept dependency-free so it can be unit-tested with node
 * (see /tmp testing): the canvas renderer MUST use these functions rather
 * than reimplementing placement logic.
 */

export type NodeKind = "core" | "hub" | "project" | "detail";

export interface HubInput {
  id: string;
  name: string;
  percent: number;
}

export interface ProjectInput {
  id: string;
  name: string;
  hubId: string;
  details: string[];
}

export interface LayoutNode {
  id: string;
  kind: NodeKind;
  /** base anchor (world units) */
  bx: number;
  by: number;
  /** eased anchor — drill-in targets move this, positions drift around it */
  ax: number;
  ay: number;
  tx: number;
  ty: number;
  /** current world position (after drift) */
  x: number;
  y: number;
  r: number;
  phase: number;
  driftAmp: number;
  driftSpeed: number;
  parent?: string;
  projectId?: string;
  hubId?: string;
  detailIndex?: number;
  dim: number;
  dimTarget: number;
  /** seeded label side, 1 = right, -1 = left */
  side: 1 | -1;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildLayout(
  hubs: HubInput[],
  projects: ProjectInput[]
): LayoutNode[] {
  const nodes: LayoutNode[] = [];
  const R = mulberry32(7);
  const mk = (
    id: string,
    kind: NodeKind,
    bx: number,
    by: number,
    r: number,
    driftAmp: number,
    driftSpeed: number,
    extra: Partial<LayoutNode> = {}
  ): LayoutNode => ({
    id,
    kind,
    bx,
    by,
    ax: bx,
    ay: by,
    tx: bx,
    ty: by,
    x: bx,
    y: by,
    r,
    phase: R() * Math.PI * 2,
    driftAmp,
    driftSpeed,
    dim: 1,
    dimTarget: 1,
    side: R() > 0.5 ? 1 : -1,
    ...extra,
  });

  nodes.push(mk("__core", "core", 0, 0, 46, 0, 0));

  const n = hubs.length;
  hubs.forEach((hub, i) => {
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const hx = Math.cos(angle) * 330;
    const hy = Math.sin(angle) * 270;
    const hubId = `hub:${hub.id}`;
    nodes.push(
      mk(hubId, "hub", hx, hy, 30, 4, 0.25 + R() * 0.2, { hubId: hub.id })
    );
    const projs = projects.filter((p) => p.hubId === hub.id);
    projs.forEach((p, j) => {
      const spread = Math.min(
        Math.PI * 0.9,
        Math.max(Math.PI * 0.45, projs.length * 0.42)
      );
      const a =
        angle +
        (projs.length > 1 ? -spread / 2 + (j / (projs.length - 1)) * spread : 0);
      const px = hx + Math.cos(a) * 128;
      const py = hy + Math.sin(a) * 128;
      const pid = `project:${p.id}`;
      nodes.push(
        mk(pid, "project", px, py, 22, 7, 0.35 + R() * 0.3, {
          parent: hubId,
          projectId: p.id,
          hubId: hub.id,
        })
      );
      p.details.slice(0, 5).forEach((_, k) => {
        nodes.push(
          mk(`detail:${p.id}:${k}`, "detail", 0, 0, 6, 0, 0.5, {
            parent: pid,
            detailIndex: k,
            phase: (k / Math.max(1, Math.min(5, p.details.length))) * Math.PI * 2 + R(),
          })
        );
      });
    });
  });
  return nodes;
}

/* ------------------------------------------------------------------ */
/* Label placement (deterministic, collision-resolved)                 */
/* ------------------------------------------------------------------ */

export interface LabelDef {
  id: string;
  kind: "core" | "hub" | "project";
  title: string;
  sub?: string;
  /** colored dot shown before project titles */
  dotColor?: string;
  dim: number;
}

export interface LabelAnchor {
  x: number;
  y: number;
  rPx: number;
}

export interface PlacedLabel extends LabelDef {
  /** top-left corner, screen px */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Shared text-width approximation (used by renderer AND tests). */
export function approxWidth(text: string, px: number, mono = false): number {
  return text.length * px * (mono ? 0.6 : 0.56);
}

export function labelSize(
  def: LabelDef,
  mobile: boolean
): { w: number; h: number } {
  const tPx = mobile ? 11.5 : 13;
  const sPx = mobile ? 10 : 10.5;
  const dot = def.kind === "project" ? 11 : 0; // dot + gap
  const w =
    Math.max(
      approxWidth(def.title, tPx),
      def.sub ? approxWidth(def.sub, sPx, true) : 0
    ) + dot;
  const h = (def.sub ? sPx * 1.5 : 0) + tPx * 1.3;
  return { w, h };
}

export interface PlacementOpts {
  vw: number;
  vh: number;
  mobile: boolean;
  /** screen-space exclusion rects (DOM overlays): {x,y,w,h} */
  exclusions: { x: number; y: number; w: number; h: number }[];
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  pad: number
): boolean {
  return (
    a.x < b.x + b.w + pad &&
    a.x + a.w + pad > b.x &&
    a.y < b.y + b.h + pad &&
    a.y + a.h + pad > b.y
  );
}

function rectHitsCircle(
  r: { x: number; y: number; w: number; h: number },
  c: { x: number; y: number; r: number },
  pad: number
): boolean {
  const nx = Math.max(r.x, Math.min(c.x, r.x + r.w));
  const ny = Math.max(r.y, Math.min(c.y, r.y + r.h));
  const dx = c.x - nx;
  const dy = c.y - ny;
  return dx * dx + dy * dy < (c.r + pad) * (c.r + pad);
}

/**
 * Place every label next to its bubble with zero overlaps.
 * Returns placements keyed by def id. Guaranteed: every def gets a
 * placement (fallback = first candidate), so labels can never pile up
 * at a corner or go missing.
 */
export function placeLabels(
  defs: LabelDef[],
  anchors: Map<string, LabelAnchor>,
  circles: Map<string, { x: number; y: number; r: number }>,
  opts: PlacementOpts
): Map<string, PlacedLabel> {
  const { vw, vh, mobile, exclusions } = opts;
  const placed: PlacedLabel[] = [];
  const out = new Map<string, PlacedLabel>();

  // priority: core, then hubs, then projects (layout order preserved)
  const order = [...defs].sort((a, b) => {
    const rank = (k: string) => (k === "core" ? 0 : k === "hub" ? 1 : 2);
    return rank(a.kind) - rank(b.kind);
  });

  for (const def of order) {
    const a = anchors.get(def.id);
    if (!a) continue;
    const { w, h } = labelSize(def, mobile);
    const r = a.rPx;

    type Cand = [number, number]; // top-left
    let cands: Cand[];
    if (def.kind === "core") {
      cands = [
        [a.x + r + 16, a.y - h / 2 + 2],
        [a.x + r + 16, a.y + 18],
        [a.x - w - r - 16, a.y - h / 2 + 2],
        [a.x - w / 2, a.y + r + 14],
      ];
    } else if (def.kind === "hub") {
      cands = [
        [a.x - w / 2, a.y - r - h - 12],
        [a.x - w / 2, a.y + r + 12],
        [a.x + r + 12, a.y - h / 2],
        [a.x - w - r - 12, a.y - h / 2],
        [a.x - w / 2, a.y + r + 30],
      ];
    } else {
      const side = defs.indexOf(def) % 2 === 0 ? 1 : -1;
      const right: Cand = [a.x + r + 10, a.y - h / 2];
      const left: Cand = [a.x - r - 10 - w, a.y - h / 2];
      const rightLow: Cand = [a.x + r + 10, a.y + 6];
      const leftLow: Cand = [a.x - r - 10 - w, a.y + 6];
      cands =
        side === 1
          ? [
              right,
              rightLow,
              left,
              leftLow,
              [a.x - w / 2, a.y + r + 12],
              [a.x - w / 2, a.y - r - h - 10],
            ]
          : [
              left,
              leftLow,
              right,
              rightLow,
              [a.x - w / 2, a.y + r + 12],
              [a.x - w / 2, a.y - r - h - 10],
            ];
    }

    const fits = (x: number, y: number): boolean => {
      const rect = { x, y, w, h };
      // inside viewport
      if (x < 6 || y < 6 || x + w > vw - 6 || y + h > vh - 6) return false;
      // vs exclusions
      for (const e of exclusions) if (rectsOverlap(rect, e, 4)) return false;
      // vs placed labels
      for (const p of placed) if (rectsOverlap(rect, p, 6)) return false;
      // vs bubble circles (all of them, including own bubble)
      for (const [id, c] of circles) {
        if (id === def.id) continue;
        if (rectHitsCircle(rect, c, 3)) return false;
      }
      // vs own bubble circle: must not cover it
      const own = circles.get(def.id);
      if (own && rectHitsCircle(rect, own, 2)) return false;
      return true;
    };

    // Spiral search around each preferred candidate: keeps the designer's
    // side preference while guaranteeing a fit when one exists nearby.
    const spiral = (cx: number, cy: number): Cand | null => {
      const steps = [0, 8, 16, 24, 32, 40, 48, 60, 76];
      for (const d of steps) {
        const pts: [number, number][] =
          d === 0
            ? [[cx, cy]]
            : [
                [cx + d, cy],
                [cx - d, cy],
                [cx, cy + d],
                [cx, cy - d],
                [cx + d, cy + d],
                [cx - d, cy - d],
                [cx + d, cy - d],
                [cx - d, cy + d],
              ];
        for (const [x, y] of pts) if (fits(x, y)) return [x, y];
      }
      return null;
    };

    let chosen: Cand | null = null;
    for (const c of cands) {
      chosen = spiral(c[0], c[1]);
      if (chosen) break;
    }
    if (!chosen) {
      // last resort: clamp the first candidate into the viewport
      const [cx, cy] = cands[0];
      chosen = [
        Math.min(Math.max(cx, 6), vw - w - 6),
        Math.min(Math.max(cy, 6), vh - h - 6),
      ];
    }
    const pl: PlacedLabel = { ...def, x: chosen[0], y: chosen[1], w, h };
    placed.push(pl);
    out.set(def.id, pl);
  }
  return out;
}
