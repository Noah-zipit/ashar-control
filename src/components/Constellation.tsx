"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { AnimatePresence, motion } from "framer-motion";
import * as THREE from "three";
import type { DashboardState, Project, ProjectStatus } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Shared graph state (mutable refs, never React state, for 60fps)     */
/* ------------------------------------------------------------------ */

interface SharedRefs {
  camera: THREE.OrthographicCamera | null;
  size: { width: number; height: number };
  // world positions of every labeled node, updated each frame
  nodes: Map<string, THREE.Vector3>;
  // per-node opacity targets (dimming)
  dim: Map<string, number>;
  view: "main" | "hub";
  hubId: string | null;
  filter: string;
  reducedMotion: boolean;
  pulseSpeed: number;
}

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

function statusOf(p: Project): string {
  return STATUS_LABEL[p.status];
}

/* ------------------------------------------------------------------ */
/* Deterministic layout                                               */
/* ------------------------------------------------------------------ */

interface LayoutNode {
  id: string;
  kind: "core" | "hub" | "project" | "detail";
  base: THREE.Vector3;
  radius: number;
  driftAmp: number;
  driftSpeed: number;
  phase: number;
  parent?: string;
  projectId?: string;
}

function buildLayout(state: DashboardState): LayoutNode[] {
  const nodes: LayoutNode[] = [];
  const R = mulberry32(7);
  nodes.push({
    id: "__core",
    kind: "core",
    base: new THREE.Vector3(0, 0, 0),
    radius: 46,
    driftAmp: 0,
    driftSpeed: 0,
    phase: 0,
  });
  const hubs = state.hubs;
  const n = hubs.length;
  hubs.forEach((hub, i) => {
    // Start at the top and go clockwise, leaving the top clear for the core
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const hx = Math.cos(angle) * 330;
    const hy = Math.sin(angle) * 270;
    const hubId = `hub:${hub.id}`;
    nodes.push({
      id: hubId,
      kind: "hub",
      base: new THREE.Vector3(hx, hy, 0),
      radius: 30,
      driftAmp: 4,
      driftSpeed: 0.25 + R() * 0.2,
      phase: R() * Math.PI * 2,
    });
    const projects = state.projects.filter((p) => p.hubId === hub.id);
    projects.forEach((p, j) => {
      // Projects fan out on the far side of the hub, away from the core
      const spread = Math.min(Math.PI * 0.9, Math.max(Math.PI * 0.45, projects.length * 0.42));
      const a = angle + (projects.length > 1 ? -spread / 2 + (j / (projects.length - 1)) * spread : 0);
      const px = hx + Math.cos(a) * 128;
      const py = hy + Math.sin(a) * 128;
      const pid = `project:${p.id}`;
      nodes.push({
        id: pid,
        kind: "project",
        base: new THREE.Vector3(px, py, 0),
        radius: 22,
        driftAmp: 7,
        driftSpeed: 0.35 + R() * 0.3,
        phase: R() * Math.PI * 2,
        parent: hubId,
        projectId: p.id,
      });
      p.details.slice(0, 5).forEach((d, k) => {
        const da = (k / Math.max(1, p.details.slice(0, 5).length)) * Math.PI * 2 + R();
        nodes.push({
          id: `detail:${p.id}:${k}`,
          kind: "detail",
          base: new THREE.Vector3(0, 0, 0), // orbits project, set per frame
          radius: 6,
          driftAmp: 0,
          driftSpeed: 0.5,
          phase: da,
          parent: pid,
        });
      });
    });
  });
  return nodes;
}

// Seeded PRNG so the layout is stable between renders.
function mulberry32(seed: number) {
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
/* Scene                                                               */
/* ------------------------------------------------------------------ */

function NodeMeshes({
  shared,
  layout,
  state,
  onProjectClick,
  onHubClick,
  onCoreClick,
}: {
  shared: React.MutableRefObject<SharedRefs>;
  layout: LayoutNode[];
  state: DashboardState;
  onProjectClick: (id: string) => void;
  onHubClick: (id: string) => void;
  onCoreClick: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const mats = useRef(new Map<string, THREE.MeshStandardMaterial>());
  const coreRings = useRef<THREE.Group>(null);

  const projectsById = useMemo(() => {
    const m = new Map<string, Project>();
    state.projects.forEach((p) => m.set(p.id, p));
    return m;
  }, [state]);

  // per-frame drift + position publishing
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const s = shared.current;
    const reduced = s.reducedMotion;
    for (const n of layout) {
      const mat = mats.current.get(n.id);
      const mesh = group.current?.getObjectByName(n.id) as THREE.Mesh | undefined;
      if (!mesh) continue;
      let x = n.base.x;
      let y = n.base.y;
      if (n.kind === "detail" && n.parent) {
        const parentPos = s.nodes.get(n.parent);
        if (parentPos) {
          const r = 46;
          const a = n.phase + (reduced ? 0 : t * n.driftSpeed);
          x = parentPos.x + Math.cos(a) * r;
          y = parentPos.y + Math.sin(a) * r;
        }
      } else if (!reduced && n.driftAmp > 0) {
        x += Math.sin(t * n.driftSpeed + n.phase) * n.driftAmp;
        y += Math.cos(t * n.driftSpeed * 0.8 + n.phase * 1.7) * n.driftAmp;
      }
      // drill-in: hub view eases its projects into an arc (targets set below via shared)
      const tgt = s["arcTargets"] as Map<string, THREE.Vector3> | undefined;
      const arc = tgt?.get(n.id);
      if (arc) {
        x += (arc.x - x) * 0.08;
        y += (arc.y - y) * 0.08;
        // keep publishing the eased position so labels follow
      }
      mesh.position.set(x, y, 0);
      s.nodes.set(n.id, new THREE.Vector3(x, y, 0));
      // opacity dimming
      if (mat) {
        const target = s.dim.get(n.id) ?? 1;
        mat.opacity += (target - mat.opacity) * 0.12;
      }
    }
    if (coreRings.current && !reduced) {
      coreRings.current.rotation.z = t * 0.12;
      const inner = coreRings.current.children[0] as THREE.Mesh;
      if (inner) inner.rotation.z = -t * 0.2;
    }
  });

  const filteredIds = useMemo(() => {
    const q = shared.current.filter.trim().toLowerCase();
    if (!q) return null;
    const set = new Set<string>();
    for (const p of state.projects) {
      if (p.name.toLowerCase().includes(q)) set.add(`project:${p.id}`);
    }
    return set;
  }, [state, shared.current.filter]);

  return (
    <group ref={group}>
      {layout.map((n) => {
        const isCore = n.kind === "core";
        const isHub = n.kind === "hub";
        const isProject = n.kind === "project";
        const isDetail = n.kind === "detail";
        const project = n.projectId ? projectsById.get(n.projectId) : undefined;
        const dimmed =
          filteredIds &&
          (isProject ? !filteredIds.has(n.id) : true) &&
          !isCore;
        if (dimmed && !shared.current.dim.has(n.id)) shared.current.dim.set(n.id, 0.12);
        if (!dimmed) shared.current.dim.set(n.id, 1);

        const color = isCore
          ? "#e8b96a"
          : isHub
            ? "#e58aa5"
            : isProject
              ? "#8b7cf6"
              : "#3ddcbb";
        const emissive = isCore ? "#7a4d12" : isHub ? "#5c2438" : isProject ? "#241f63" : "#0e4f47";
        const size = n.radius / 22;

        return (
          <group key={n.id}>
            <mesh
              name={n.id}
              position={[n.base.x, n.base.y, 0]}
              scale={size}
              onClick={
                isProject
                  ? (e) => {
                      e.stopPropagation();
                      onProjectClick(n.projectId!);
                    }
                  : isHub
                    ? (e) => {
                        e.stopPropagation();
                        onHubClick(n.id.replace("hub:", ""));
                      }
                    : isCore
                      ? (e) => {
                          e.stopPropagation();
                          onCoreClick();
                        }
                      : undefined
              }
              onPointerOver={(e) => {
                if (isProject || isHub || isCore) document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => (document.body.style.cursor = "auto")}
            >
              <sphereGeometry args={[22, 40, 40]} />
              <meshStandardMaterial
                ref={(m) => {
                  if (m) mats.current.set(n.id, m);
                }}
                color={color}
                emissive={emissive}
                emissiveIntensity={0.55}
                roughness={0.28}
                metalness={0.55}
                transparent
                opacity={1}
              />
            </mesh>
            {isCore && (
              <group ref={coreRings} position={[0, 0, 0]}>
                <mesh rotation={[Math.PI / 2.6, 0, 0.4]}>
                  <torusGeometry args={[62, 1.6, 12, 80]} />
                  <meshBasicMaterial color="#e8b96a" transparent opacity={0.5} />
                </mesh>
                <mesh rotation={[Math.PI / 3.2, 0, -0.5]}>
                  <torusGeometry args={[74, 1.1, 12, 80]} />
                  <meshBasicMaterial color="#e8b96a" transparent opacity={0.28} />
                </mesh>
              </group>
            )}
            {isDetail && (
              <mesh position={[n.base.x, n.base.y, 0]}>
                {/* tiny number handled by HTML layer */}
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

function LinkLines({
  shared,
  layout,
  state,
}: {
  shared: React.MutableRefObject<SharedRefs>;
  layout: LayoutNode[];
  state: DashboardState;
}) {
  const spokes = useRef<THREE.LineSegments>(null);
  const teals = useRef<THREE.LineSegments>(null);
  const pulses = useRef<THREE.InstancedMesh>(null);

  const pairs = useMemo(() => {
    const gold: [string, string][] = [];
    const teal: [string, string][] = [];
    const hubOf = new Map<string, string>();
    for (const n of layout) {
      if (n.kind === "hub") {
        gold.push(["__core", n.id]);
        hubOf.set(n.id, n.id);
      }
      if (n.kind === "project" && n.parent) {
        gold.push(["__core", n.id]);
        teal.push([n.parent, n.id]);
      }
      if (n.kind === "detail" && n.parent) {
        teal.push([n.parent, n.id]);
      }
    }
    return { gold, teal };
  }, [layout]);

  const geo = useMemo(() => new THREE.BufferGeometry(), []);
  const geoT = useMemo(() => new THREE.BufferGeometry(), []);

  useFrame(({ clock }) => {
    const s = shared.current;
    const setSeg = (
      geom: THREE.BufferGeometry,
      list: [string, string][],
      colorAttr: boolean
    ) => {
      const pos = new Float32Array(list.length * 6);
      let i = 0;
      for (const [a, b] of list) {
        const pa = s.nodes.get(a);
        const pb = s.nodes.get(b);
        if (!pa || !pb) continue;
        pos[i++] = pa.x; pos[i++] = pa.y; pos[i++] = 0;
        pos[i++] = pb.x; pos[i++] = pb.y; pos[i++] = 0;
      }
      geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    };
    setSeg(geo, pairs.gold, false);
    setSeg(geoT, pairs.teal, false);

    // travelling light pulses along gold spokes
    const mesh = pulses.current;
    if (mesh) {
      const t = clock.getElapsedTime();
      const m = new THREE.Matrix4();
      const v = new THREE.Vector3();
      let k = 0;
      const speed = s.reducedMotion ? 0 : 0.12 * s.pulseSpeed;
      for (const [a, b] of pairs.gold) {
        const pa = s.nodes.get(a);
        const pb = s.nodes.get(b);
        if (!pa || !pb || k >= mesh.count) continue;
        const tt = (t * speed + k * 0.13) % 1;
        v.lerpVectors(pa, pb, tt);
        m.makeTranslation(v.x, v.y, 1);
        mesh.setMatrixAt(k, m);
        k++;
      }
      mesh.count = k;
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <lineSegments ref={spokes} geometry={geo}>
        <lineBasicMaterial color="#d4a254" transparent opacity={0.5} blending={THREE.AdditiveBlending} />
      </lineSegments>
      <lineSegments ref={teals} geometry={geoT}>
        <lineBasicMaterial color="#3fb8a8" transparent opacity={0.28} blending={THREE.AdditiveBlending} />
      </lineSegments>
      <instancedMesh ref={pulses} args={[undefined, undefined, 40]}>
        <sphereGeometry args={[3.4, 12, 12]} />
        <meshBasicMaterial color="#ffd9a0" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}

function Starfield() {
  const { geo } = useMemo(() => {
    const R = mulberry32(21);
    const N = 260;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (R() - 0.5) * 2400;
      pos[i * 3 + 1] = (R() - 0.5) * 1600;
      pos[i * 3 + 2] = -120 - R() * 200;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return { geo: g };
  }, []);
  return (
    <points geometry={geo}>
      <pointsMaterial color="#9fc4bd" size={1.6} sizeAttenuation={false} transparent opacity={0.5} />
    </points>
  );
}

function CameraRig({ shared }: { shared: React.MutableRefObject<SharedRefs> }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const c = camera as THREE.OrthographicCamera;
    shared.current.camera = c;
    shared.current.size = { width: size.width, height: size.height };
    const fit = Math.min(size.width / 1120, size.height / 860);
    c.zoom = fit;
    c.updateProjectionMatrix();
  }, [camera, size, shared]);
  return null;
}

/* ------------------------------------------------------------------ */
/* HTML label layer (manual screen projection, per-frame)              */
/* ------------------------------------------------------------------ */

interface LabelInfo {
  id: string;
  kind: "core" | "hub" | "project" | "detail";
  text: string;
  sub?: string;
  statusColor?: string;
  x: number;
  y: number;
  visible: boolean;
  dim: boolean;
}

function LabelLayer({
  shared,
  state,
  view,
  hubId,
  filter,
}: {
  shared: React.MutableRefObject<SharedRefs>;
  state: DashboardState;
  view: "main" | "hub";
  hubId: string | null;
  filter: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const items = useRef(new Map<string, HTMLDivElement>());

  const defs = useMemo(() => {
    const arr: { id: string; kind: LabelInfo["kind"]; text: string; sub?: string; statusColor?: string; projectId?: string }[] = [
      { id: "__core", kind: "core", text: state.owner.name, sub: state.owner.meta },
    ];
    for (const h of state.hubs) {
      arr.push({ id: `hub:${h.id}`, kind: "hub", text: h.name, sub: `${h.percent}%` });
    }
    for (const p of state.projects) {
      arr.push({
        id: `project:${p.id}`,
        kind: "project",
        text: p.name,
        sub: statusOf(p),
        statusColor: STATUS_COLOR[p.status],
        projectId: p.id,
      });
    }
    return arr;
  }, [state]);

  useEffect(() => {
    const q = filter.trim().toLowerCase();
    let raf = 0;
    const v = new THREE.Vector3();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const s = shared.current;
      const cam = s.camera;
      if (!cam || !root.current) return;
      const W = s.size.width;
      const H = s.size.height;
      const mobile = W < 640;
      const placed: { x: number; y: number; w: number; h: number }[] = [];
      for (const d of defs) {
        let el = items.current.get(d.id);
        if (!el) {
          el = document.createElement("div");
          el.className = "glabel";
          el.innerHTML =
            d.kind === "core"
              ? `<div class="gl-core"><b></b><span></span></div>`
              : d.kind === "hub"
                ? `<div class="gl-hub"><b></b><span></span></div>`
                : `<div class="gl-proj"><i></i><b></b><span></span></div>`;
          root.current.appendChild(el);
          items.current.set(d.id, el);
        }
        const pos = s.nodes.get(d.id);
        let visible = !!pos;
        // view filtering
        if (view === "hub" && hubId) {
          if (d.kind === "hub" && d.id !== `hub:${hubId}`) visible = false;
          if (d.kind === "project") {
            const p = state.projects.find((x) => x.id === (d as { projectId?: string }).projectId);
            if (!p || p.hubId !== hubId) visible = false;
          }
          if (d.kind === "core") visible = false;
        }
        const dim =
          !!q &&
          d.kind === "project" &&
          !d.text.toLowerCase().includes(q);
        if (!visible) {
          el.style.display = "none";
          continue;
        }
        v.copy(pos!).project(cam);
        const x = (v.x * 0.5 + 0.5) * W;
        const y = (-v.y * 0.5 + 0.5) * H;
        // label offset: hubs above bubble, projects to the side (alternating)
        const side = (d.id.charCodeAt(d.id.length - 1) % 2 === 0 ? 1 : -1);
        let lx = x;
        let ly = y;
        if (d.kind === "core") {
          lx = x + 78; ly = y + 6;
        } else if (d.kind === "hub") {
          lx = x; ly = y - 46;
        } else {
          lx = x + side * 44; ly = y - 10;
        }
        // mobile collision pass: push labels apart vertically
        if (mobile) {
          const w = Math.min(150, d.text.length * 8 + 24);
          const h = 30;
          let ly2 = ly;
          for (const r of placed) {
            if (Math.abs(lx - r.x) < (w + r.w) / 2 && Math.abs(ly2 - r.y) < (h + r.h) / 2) {
              ly2 = r.y + (h + r.h) / 2 + 4;
            }
          }
          ly = ly2;
          placed.push({ x: lx, y: ly, w, h });
        }
        el.style.display = "block";
        el.style.opacity = dim ? "0.15" : "1";
        el.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}) translate(-50%, -50%)`;
        const b = el.querySelector("b");
        const sp = el.querySelector("span");
        const ic = el.querySelector("i");
        if (b && b.textContent !== d.text) b.textContent = d.text;
        if (d.kind === "project") {
          const showSub = !mobile; // dots only on mobile
          if (sp) {
            sp.style.display = showSub ? "" : "none";
            if (showSub && sp.textContent !== d.sub) sp.textContent = d.sub ?? "";
            if (!showSub && sp.textContent !== "") sp.textContent = "";
          }
          if (ic) (ic as HTMLElement).style.background = d.statusColor ?? "#999";
        } else if (sp && sp.textContent !== (d.sub ?? "")) {
          sp.textContent = d.sub ?? "";
        }
      }
      // remove stale
      const ids = new Set(defs.map((d) => d.id));
      for (const [id, el] of items.current) {
        if (!ids.has(id)) {
          el.remove();
          items.current.delete(id);
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [defs, state, view, hubId, filter, shared]);

  return (
    <div
      ref={root}
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      aria-hidden
    />
  );
}

/* ------------------------------------------------------------------ */
/* Detail card + overview                                              */
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
      className="pointer-events-auto w-full max-w-[420px] rounded-2xl border border-white/10 bg-[#0a1416]/90 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:absolute sm:bottom-24 sm:right-6"
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
      className="pointer-events-auto w-full max-w-[440px] rounded-2xl border border-white/10 bg-[#0a1416]/90 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:absolute sm:bottom-24 sm:right-6"
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
      className="flex h-9 w-9 items-center justify-center rounded-full text-teal-100/70 transition hover:bg-white/10 hover:text-teal-50"
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
    <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-[#0a1416]/80 px-1.5 py-1 backdrop-blur-lg">
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
        }).format(new Date()) + " PKT"
      );
    f();
    const id = setInterval(f, 15000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-[#0a1416]/80 px-3.5 py-2 backdrop-blur-lg">
      <span className="h-1.5 w-1.5 rounded-full bg-teal-300" />
      <span className="font-mono text-[13px] text-teal-50">{now}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function Constellation({ initial }: { initial: DashboardState }) {
  const [state] = useState(initial);
  const [view, setView] = useState<"main" | "hub">("main");
  const [hubId, setHubId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ type: "project" | "core"; id?: string } | null>(null);
  const [filter, setFilter] = useState("");
  const [visible, setVisible] = useState(true);

  const shared = useRef<SharedRefs>({
    camera: null,
    size: { width: 0, height: 0 },
    nodes: new Map(),
    dim: new Map(),
    view: "main",
    hubId: null,
    filter: "",
    reducedMotion: false,
    pulseSpeed: 1,
  });
  const layout = useMemo(() => buildLayout(state), [state]);

  useEffect(() => {
    shared.current.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // keep shared filter in sync (scene reads it)
  useEffect(() => {
    shared.current.filter = filter;
  }, [filter]);

  const flyCamera = useCallback(
    (x: number, y: number, zoom: number, instant = false) => {
      const cam = shared.current.camera;
      if (!cam) return;
      const reduced = shared.current.reducedMotion;
      if (instant || reduced) {
        cam.position.set(x, y, 100);
        cam.zoom = zoom;
        cam.updateProjectionMatrix();
        return;
      }
      gsap.killTweensOf(cam.position);
      gsap.killTweensOf(cam);
      gsap.to(cam.position, { x, y, duration: 1.1, ease: "power3.inOut" });
      gsap.to(cam, {
        zoom,
        duration: 1.1,
        ease: "power3.inOut",
        onUpdate: () => cam.updateProjectionMatrix(),
      });
    },
    []
  );

  const worldOf = useCallback((id: string) => shared.current.nodes.get(id), []);

  const selectProject = useCallback(
    (id: string) => {
      setSelected({ type: "project", id });
      const p = worldOf(`project:${id}`);
      if (p) {
        const cam = shared.current.camera;
        const z = cam ? Math.min(cam.zoom * 1.6, cam.zoom + 0.9) : 1;
        flyCamera(p.x, p.y, z);
      }
    },
    [flyCamera, worldOf]
  );

  const openHub = useCallback(
    (id: string) => {
      setSelected(null);
      setView("hub");
      setHubId(id);
      shared.current.view = "hub";
      shared.current.hubId = id;
      // build arc targets for this hub's projects
      const projs = state.projects.filter((p) => p.hubId === id);
      const hub = worldOf(`hub:${id}`);
      const targets = new Map<string, THREE.Vector3>();
      const baseAngle = -Math.PI / 2;
      projs.forEach((p, i) => {
        const a = baseAngle + (projs.length > 1 ? -0.9 + (i / (projs.length - 1)) * 1.8 : 0);
        targets.set(`project:${p.id}`, new THREE.Vector3(Math.cos(a) * 210, Math.sin(a) * 210, 0));
      });
      (shared.current as unknown as Record<string, unknown>)["arcTargets"] = targets;
      // dim everything else
      for (const [nid] of shared.current.dim) shared.current.dim.set(nid, 0.08);
      shared.current.dim.set("__core", 0.05);
      shared.current.dim.set(`hub:${id}`, 1);
      projs.forEach((p) => shared.current.dim.set(`project:${p.id}`, 1));
      if (hub) flyCamera(hub.x, hub.y, (shared.current.camera?.zoom ?? 1) * 1.9);
    },
    [flyCamera, state, worldOf]
  );

  const closeToMain = useCallback(() => {
    setSelected(null);
    setView("main");
    setHubId(null);
    shared.current.view = "main";
    shared.current.hubId = null;
    (shared.current as unknown as Record<string, unknown>)["arcTargets"] = undefined;
    for (const [nid] of shared.current.dim) shared.current.dim.set(nid, 1);
    flyCamera(0, 0, fitZoom());
  }, [flyCamera]);

  const fitZoom = useCallback(() => {
    const s = shared.current.size;
    if (!s.width) return 1;
    return Math.min(s.width / 1120, s.height / 880);
  }, []);

  const zoomBy = useCallback(
    (d: number) => {
      const cam = shared.current.camera;
      if (!cam) return;
      const z = Math.min(4, Math.max(0.35, cam.zoom + d));
      flyCamera(cam.position.x, cam.position.y, z);
    },
    [flyCamera]
  );

  const onEmptyClick = useCallback(() => {
    if (view === "hub") {
      closeToMain();
    } else {
      setSelected(null);
    }
  }, [view, closeToMain]);

  const onCoreClick = useCallback(() => {
    setSelected({ type: "core" });
  }, []);

  const hubsById = useMemo(() => {
    const m = new Map<string, string>();
    state.hubs.forEach((h) => m.set(h.id, h.name));
    return m;
  }, [state]);

  const selectedProject = selected?.type === "project" ? state.projects.find((p) => p.id === selected.id) : null;

  const liveCount = state.projects.filter((p) => p.status === "live" || p.status === "active").length;
  const leadsVal = state.projects.find((p) => p.id === "ashar-leads")?.stats.find((s) => s.label.toLowerCase().includes("lead"))?.value ?? "–";

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#05090b] text-[#e8f1ee]">
      {/* teal nebula ambience */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1100px 700px at 50% 42%, rgba(24,92,86,0.34), rgba(24,92,86,0.08) 45%, transparent 70%)",
        }}
      />

      <Canvas
        orthographic
        camera={{ position: [0, 0, 100], zoom: 1, near: 0.1, far: 2000 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        frameloop={visible ? "always" : "never"}
        onPointerMissed={onEmptyClick}
        className="!absolute !inset-0"
      >
        <ambientLight intensity={0.75} />
        <pointLight position={[0, 0, 300]} intensity={1.4} color="#ffd9a0" />
        <pointLight position={[-400, 300, 200]} intensity={0.5} color="#3fb8a8" />
        <Starfield />
        <CameraRig shared={shared} />
        <NodeMeshes
          shared={shared}
          layout={layout}
          state={state}
          onProjectClick={selectProject}
          onHubClick={openHub}
          onCoreClick={onCoreClick}
        />
        <LinkLines shared={shared} layout={layout} state={state} />
      </Canvas>

      <LabelLayer shared={shared} state={state} view={view} hubId={hubId} filter={filter} />

      {/* top bar */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex items-start justify-between gap-2 p-3 sm:p-4">
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-white/10 bg-[#0a1416]/80 py-2 pl-3 pr-4 backdrop-blur-lg">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="4" stroke="#e8b96a" strokeWidth="1.8" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="#e8b96a" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="text-sm font-semibold tracking-wide">Ashar — Control</span>
        </div>
        <div className="hidden sm:block">
          <Toolbar
            onZoomIn={() => zoomBy(0.35)}
            onZoomOut={() => zoomBy(-0.35)}
            onReset={closeToMain}
            onAdmin={() => (window.location.href = "/admin")}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="sm:hidden">
            <Toolbar
              onZoomIn={() => zoomBy(0.35)}
              onZoomOut={() => zoomBy(-0.35)}
              onReset={closeToMain}
              onAdmin={() => (window.location.href = "/admin")}
            />
          </div>
          <Clock />
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full font-display text-sm font-bold text-[#1a1206]"
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
      <div className="absolute bottom-3 left-3 right-3 z-20 sm:bottom-6 sm:left-auto sm:right-6 sm:w-[380px]">
        <div className="pointer-events-auto mb-2 grid grid-cols-4 gap-px overflow-hidden rounded-2xl border border-white/10 bg-[#0a1416]/85 backdrop-blur-lg">
          {[
            { l: state.overview.heroLabel, v: state.overview.heroValue },
            { l: "CRM leads", v: leadsVal },
            { l: "Bots online", v: "2" },
            { l: "Projects live", v: `${liveCount} / ${state.projects.length}` },
          ].map((m) => (
            <div key={m.l} className="px-3 py-2.5">
              <p className="truncate text-[10px] uppercase tracking-wider text-teal-100/50">{m.l}</p>
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

      {/* drill-in back control */}
      {view === "hub" && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={closeToMain}
          className="absolute left-3 top-20 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-[#0a1416]/85 px-4 py-2 text-sm text-teal-50 backdrop-blur-lg hover:bg-white/10 sm:left-4 sm:top-24"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All projects
        </motion.button>
      )}

      {/* detail / overview card */}
      <div className="pointer-events-none absolute inset-x-3 bottom-28 z-30 flex justify-center sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-1/2 sm:w-[440px] sm:-translate-y-1/2 sm:justify-end">
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

      {/* label CSS */}
      <style>{`
        .glabel { position: absolute; left: 0; top: 0; will-change: transform; }
        .gl-core b, .gl-hub b, .gl-proj b { display: block; font-size: 13px; font-weight: 600; color: #eef6f4; text-shadow: 0 1px 8px rgba(0,0,0,.9); white-space: nowrap; }
        .gl-core span, .gl-hub span { display: block; font-size: 10.5px; color: #9fc4bd; font-family: ui-monospace, monospace; text-shadow: 0 1px 6px rgba(0,0,0,.9); white-space: nowrap; }
        .gl-proj { display: flex; align-items: center; gap: 6px; }
        .gl-proj i { width: 7px; height: 7px; border-radius: 9999px; flex-shrink: 0; box-shadow: 0 0 6px currentColor; }
        .gl-proj span { font-size: 10px; color: #9fc4bd; font-family: ui-monospace, monospace; white-space: nowrap; }
        @media (max-width: 640px) {
          .gl-core b, .gl-hub b, .gl-proj b { font-size: 11.5px; }
        }
      `}</style>
    </div>
  );
}
