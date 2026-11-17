import type { Rect, Segment } from './ranchScenery';

/**
 * Where the dog and the cat may walk: the farm's cobblestone paths (they run between the pens, so
 * walking along them never crosses a fence) plus a few short spurs to resting spots. Pure layout.
 */

export interface Pt { x: number; y: number }

/** A resting spot and the point on a path it is reached from (the two may be the same). */
export interface RestSpot { spot: Pt; via: Pt }

export interface RoamGraph {
  nodes: Pt[];
  /** Neighbour node indices of each node. */
  adj: number[][];
  /** Node indices of the resting spots. */
  rest: number[];
}

const EPS = 0.5;

function onSeg(s: Segment, p: Pt): boolean {
  const minX = Math.min(s.x0, s.x1) - EPS;
  const maxX = Math.max(s.x0, s.x1) + EPS;
  const minY = Math.min(s.y0, s.y1) - EPS;
  const maxY = Math.max(s.y0, s.y1) + EPS;
  if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) return false;
  // axis-aligned segments only (the farm's paths and spurs)
  return s.x0 === s.x1 ? Math.abs(p.x - s.x0) <= EPS : Math.abs(p.y - s.y0) <= EPS;
}

function clip(s: Segment, b: Rect): Segment | null {
  const c = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  const out = {
    x0: c(s.x0, b.x, b.x + b.w), y0: c(s.y0, b.y, b.y + b.h),
    x1: c(s.x1, b.x, b.x + b.w), y1: c(s.y1, b.y, b.y + b.h),
  };
  return out.x0 === out.x1 && out.y0 === out.y1 ? null : out;
}

/** Builds the walking network from axis-aligned path segments clipped to `bounds`. */
export function buildRoamGraph(paths: readonly Segment[], bounds: Rect, rest: readonly RestSpot[]): RoamGraph {
  const segs: Segment[] = [];
  for (const s of paths) {
    if (s.x0 !== s.x1 && s.y0 !== s.y1) continue; // not expected; never walk a slanted line
    const c = clip(s, bounds);
    if (c) segs.push(c);
  }
  for (const r of rest) {
    if (r.spot.x !== r.via.x || r.spot.y !== r.via.y) segs.push({ x0: r.via.x, y0: r.via.y, x1: r.spot.x, y1: r.spot.y });
  }

  const nodes: Pt[] = [];
  const find = (p: Pt): number => {
    const i = nodes.findIndex(n => Math.abs(n.x - p.x) <= EPS && Math.abs(n.y - p.y) <= EPS);
    if (i >= 0) return i;
    nodes.push({ x: p.x, y: p.y });
    return nodes.length - 1;
  };
  // endpoints, crossings, and rest spots (a spot on a path splits it)
  const pts: Pt[] = [];
  for (const s of segs) pts.push({ x: s.x0, y: s.y0 }, { x: s.x1, y: s.y1 });
  for (const a of segs) {
    for (const b of segs) {
      if (a === b) continue;
      const v = a.x0 === a.x1 ? a : b.x0 === b.x1 ? b : null;
      const h = a.y0 === a.y1 ? a : b.y0 === b.y1 ? b : null;
      if (!v || !h || v === h) continue;
      const p = { x: v.x0, y: h.y0 };
      if (onSeg(v, p) && onSeg(h, p)) pts.push(p);
    }
  }
  for (const r of rest) pts.push(r.spot, r.via);

  const adj: number[][] = [];
  const link = (i: number, j: number): void => {
    while (adj.length < nodes.length) adj.push([]);
    if (i === j || adj[i].includes(j)) return;
    adj[i].push(j);
    adj[j].push(i);
  };
  for (const s of segs) {
    const along = pts.filter(p => onSeg(s, p))
      .map(p => ({ p, t: s.x0 === s.x1 ? (p.y - s.y0) * Math.sign(s.y1 - s.y0 || 1) : (p.x - s.x0) * Math.sign(s.x1 - s.x0 || 1) }))
      .sort((a, b) => a.t - b.t)
      .map(e => find(e.p));
    for (let i = 1; i < along.length; i++) link(along[i - 1], along[i]);
  }
  while (adj.length < nodes.length) adj.push([]);
  return { nodes, adj, rest: rest.map(r => find(r.spot)) };
}

/** Shortest hop route from node `from` to node `to` (both included), or [from] if unreachable. */
export function route(g: RoamGraph, from: number, to: number): number[] {
  const prev = new Array<number>(g.nodes.length).fill(-1);
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const n = queue.shift()!;
    if (n === to) break;
    for (const m of g.adj[n]) {
      if (seen.has(m)) continue;
      seen.add(m);
      prev[m] = n;
      queue.push(m);
    }
  }
  if (!seen.has(to)) return [from];
  const out = [to];
  while (out[0] !== from) out.unshift(prev[out[0]]);
  return out;
}

/** The node nearest to (x, y), among those `ok` accepts (all by default). */
export function nearestNode(g: RoamGraph, x: number, y: number, ok: (i: number) => boolean = () => true): number {
  let best = 0;
  let bd = Infinity;
  g.nodes.forEach((n, i) => {
    if (!ok(i)) return;
    const d = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
