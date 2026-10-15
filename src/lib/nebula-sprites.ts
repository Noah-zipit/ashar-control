// Nebula Glass node sprites — ported from the orb-style samples
// (~/workspace/orb-samples/index.html, style "D — Nebula Glass").
//
// The board animates and pans/zooms every frame, so the full gradient
// painter never runs in the frame loop: each sphere is prerendered once
// to an offscreen canvas per (color, radius bucket, dpr) and the loop
// only does drawImage.

export type RGB = [number, number, number];

export const NEBULA_COLORS: Record<string, RGB> = {
  core: [232, 185, 106], // gold
  hub: [229, 138, 165], // pink
  project: [139, 124, 246], // violet
  detail: [61, 220, 187], // teal
};

const rgba = (c: RGB, a: number) =>
  `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// number target, e.g. mix(c, 255, 0.5)
const mix = (c: RGB, t: number, a: number): RGB => [
  Math.round(c[0] + (t - c[0]) * a),
  Math.round(c[1] + (t - c[1]) * a),
  Math.round(c[2] + (t - c[2]) * a),
];

// per-channel target — a shared "mix" on an ARRAY target produces NaN
// colors and a blank canvas; keep these two helpers separate.
const mixc = (c: RGB, t: RGB, a: number): RGB => [
  Math.round(c[0] + (t[0] - c[0]) * a),
  Math.round(c[1] + (t[1] - c[1]) * a),
  Math.round(c[2] + (t[2] - c[2]) * a),
];

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

function clipCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
}

/** Full fidelity painter — runs only at prerender time, never per frame. */
function paintNebula(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  c: RGB,
  seed: number
) {
  const rand = mulberry(seed);
  ctx.save();
  // halo
  const halo = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 1.9);
  halo.addColorStop(0, rgba(c, 0.15));
  halo.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.9, 0, Math.PI * 2);
  ctx.fill();
  // dark glass body, tinted with the node color so it reads against the void
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, rgba(mixc(c, [16, 20, 34], 0.62), 1));
  g.addColorStop(0.7, rgba(mixc(c, [6, 8, 14], 0.82), 1));
  g.addColorStop(1, rgba(mixc(c, [2, 3, 6], 0.9), 1));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  clipCircle(ctx, x, y, r);
  // inner nebula clouds
  ctx.globalCompositeOperation = "lighter";
  const cols: RGB[] = [c, mix(c, 255, 0.25), mixc(c, [70, 40, 140], 0.5)];
  // one strong heart cloud so the sphere has a visible core of color
  const heart = ctx.createRadialGradient(x, y, 0, x, y, r * 0.78);
  heart.addColorStop(0, rgba(c, 0.5));
  heart.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = heart;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    const bx = x + (rand() - 0.5) * r * 1.05;
    const by = y + (rand() - 0.5) * r * 1.05;
    const br = r * (0.34 + rand() * 0.5);
    const b = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    b.addColorStop(0, rgba(cols[i % 3], 0.52));
    b.addColorStop(1, rgba(cols[i % 3], 0));
    ctx.fillStyle = b;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  // inner stars
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * r * 0.9;
    ctx.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.65})`;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.5 + rand() * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  // deepening toward edge (vignette keeps it spherical)
  const v = ctx.createRadialGradient(x, y, r * 0.45, x, y, r);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = v;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
  // glass highlight
  ctx.save();
  ctx.translate(x - r * 0.36, y - r * 0.44);
  ctx.rotate(-0.55);
  const sp = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.4);
  sp.addColorStop(0, "rgba(255,255,255,0.34)");
  sp.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sp;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.4, r * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // rim: one bright pass, one soft outer pass
  ctx.strokeStyle = rgba(mix(c, 255, 0.3), 0.75);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, r - 0.7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(c, 0.28);
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.arc(x, y, r + 1.4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

const spriteCache = new Map<string, { cv: HTMLCanvasElement; cx: number; cy: number; size: number }>();
const MAX_CACHE = 72;

function bucket(r: number): number {
  return Math.min(160, Math.max(6, Math.round(r / 2) * 2));
}

function getSprite(key: keyof typeof NEBULA_COLORS | string, c: RGB, r: number, dpr: number) {
  const b = bucket(r);
  const ck = `${key}:${b}:${dpr}`;
  const hit = spriteCache.get(ck);
  if (hit) return hit;
  // margin covers halo (r*1.9) and the soft outer rim pass (r + 1.4 + 1.7)
  const margin = Math.ceil(b * 1.95) + 8;
  const size = Math.ceil((margin * 2 + b * 2) * dpr);
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const sctx = cv.getContext("2d");
  if (!sctx) throw new Error("no 2d context");
  sctx.scale(dpr, dpr);
  const cx = margin + b;
  const cy = margin + b;
  paintNebula(sctx, cx, cy, b, c, 7700 + b * 13);
  const entry = { cv, cx, cy, size };
  if (spriteCache.size >= MAX_CACHE) {
    const oldest = spriteCache.keys().next();
    if (!oldest.done) spriteCache.delete(oldest.value);
  }
  spriteCache.set(ck, entry);
  return entry;
}

/**
 * Draw a nebula-glass node. `r` is the CSS-pixel screen radius.
 * Fractional radii are handled by scaling the bucketed sprite.
 */
export function drawNebulaNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  colorKey: keyof typeof NEBULA_COLORS,
  alpha: number,
  dpr: number
) {
  if (r <= 0 || alpha <= 0.01) return;
  const c = NEBULA_COLORS[colorKey];
  const b = bucket(r);
  const s = getSprite(colorKey, c, b, dpr);
  const k = r / b;
  const dw = (s.size / dpr) * k;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(s.cv, x - (s.cx / dpr) * k, y - (s.cy / dpr) * k, dw, dw);
  ctx.restore();
}

/** Clear the sprite cache (e.g. on DPR change); next frames rebuild lazily. */
export function clearNebulaSprites() {
  spriteCache.clear();
}
