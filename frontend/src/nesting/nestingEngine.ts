import type { DxfPoint, NestingPart } from '../dxf/dxfTypes';
import { calculateAbsoluteArea, pointInPolygon } from '../dxf/contourEngine';

export type StartCorner = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
export const ANY_ROTATIONS = Array.from({ length: 72 }, (_, index) => index * 5);
export interface NestingSettings {
  materialType: 'sheet' | 'roll';
  sheetWidth: number; sheetHeight: number; rollWidth: number;
  margin: number; spacing: number; rotations: number[]; startCorner: StartCorner;
  curveTolerance?: number; timeBudgetMs?: number;
}
export interface NestingPlacement {
  partId: string; instanceId: string; x: number; y: number; rotation: number; placed: boolean;
  sheetIndex?: number;
}
export interface NestingResult {
  placements: NestingPlacement[];
  placedCount: number; unplacedCount: number; totalCount: number;
  usedWidth: number; usedHeight: number; usedArea: number;
  materialWidth: number; materialHeight: number; materialArea: number;
  efficiency: number; margin: number;
  sheetCount?: number;
  sheets?: { index: number; usedHeight: number; usedArea: number; placedCount: number }[];
}
export const DEFAULT_NESTING_SETTINGS: NestingSettings = {
  materialType: 'sheet', sheetWidth: 1400, sheetHeight: 1000, rollWidth: 1400,
  margin: 1, spacing: 0.3, rotations: [0, 90], startCorner: 'bottom-right',
};
export type NestingPolygon = { points: DxfPoint[]; holes: DxfPoint[][]; width: number; height: number };
type Polygon = NestingPolygon;
type Positioned = Omit<Polygon, 'holes'> & { holes?: DxfPoint[][]; x: number; y: number };
const EPS = 1e-8;
function rotate(p: DxfPoint, rotation: number): DxfPoint {
  switch (rotation) {
    case 90: return { x: -p.y, y: p.x };
    case 180: return { x: -p.x, y: -p.y };
    case 270: return { x: p.y, y: -p.x };
    case 0: return { x: p.x, y: p.y };
    default: {
      const radians = rotation * Math.PI / 180;
      const cos = Math.cos(radians), sin = Math.sin(radians);
      return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
    }
  }
}
const rotatedBoundsCache = new WeakMap<NestingPart, Map<number, { minX: number; minY: number; width: number; height: number }>>();
function rotatedBounds(part: NestingPart, rotation: number) {
  let cache = rotatedBoundsCache.get(part);
  if (!cache) { cache = new Map(); rotatedBoundsCache.set(part, cache); }
  const cached = cache.get(rotation);
  if (cached) return cached;
  const corners = part.outerContour.points.map(p => rotate({ x: p.x - part.bounds.minX, y: p.y - part.bounds.minY }, rotation));
  const minX = Math.min(...corners.map(p => p.x)), minY = Math.min(...corners.map(p => p.y));
  const result = { minX, minY, width: Math.max(...corners.map(p => p.x)) - minX, height: Math.max(...corners.map(p => p.y)) - minY };
  cache.set(rotation, result);
  return result;
}
export function transformNestingPoint(point: DxfPoint, part: NestingPart, placement: NestingPlacement): DxfPoint {
  const local = rotate({ x: point.x - part.bounds.minX, y: point.y - part.bounds.minY }, placement.rotation);
  const bounds = rotatedBounds(part, placement.rotation);
  return {
    x: local.x - bounds.minX + placement.x,
    y: local.y - bounds.minY + placement.y,
  };
}
export function polygon(part: NestingPart, rotation: number): Polygon {
  const bounds = rotatedBounds(part, rotation);
  const placement = { partId: part.id, instanceId: '', x: 0, y: 0, rotation, placed: true };
  return {
    points: part.outerContour.points.map(p => transformNestingPoint(p, part, placement)),
    holes: part.holes.map(hole => hole.points.map(p => transformNestingPoint(p, part, placement))),
    width: bounds.width,
    height: bounds.height,
  };
}
function cross(a: DxfPoint, b: DxfPoint, c: DxfPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function distanceSq(p: DxfPoint, a: DxfPoint, b: DxfPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
}
type EdgeTree = { minX: number; maxX: number; minY: number; maxY: number; indices?: number[]; left?: EdgeTree; right?: EdgeTree };
const edgeTrees = new WeakMap<DxfPoint[], EdgeTree>();
function edgeTree(points: DxfPoint[], indices = points.map((_, i) => i)): EdgeTree {
  const node: EdgeTree = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const i of indices) for (const p of [points[i], points[(i + 1) % points.length]]) {
    node.minX = Math.min(node.minX, p.x); node.maxX = Math.max(node.maxX, p.x);
    node.minY = Math.min(node.minY, p.y); node.maxY = Math.max(node.maxY, p.y);
  }
  if (indices.length <= 8) node.indices = indices;
  else {
    const axis = node.maxX - node.minX > node.maxY - node.minY ? 'x' : 'y';
    indices.sort((i, j) => points[i][axis] + points[(i + 1) % points.length][axis] - points[j][axis] - points[(j + 1) % points.length][axis]);
    const half = Math.floor(indices.length / 2);
    node.left = edgeTree(points, indices.slice(0, half)); node.right = edgeTree(points, indices.slice(half));
  }
  return node;
}
// A spatial tree rejects distant edges without simplifying the collision polygon.
export function polygonsConflict(a: DxfPoint[], b: DxfPoint[], spacing: number): boolean {
  const gap = Math.max(spacing, EPS), gapSq = gap * gap;
  let tree = edgeTrees.get(b);
  if (!tree) { tree = edgeTree(b); edgeTrees.set(b, tree); }
  for (let i = 0; i < a.length; i++) {
    const p = a[i], q = a[(i + 1) % a.length];
    const minX = Math.min(p.x, q.x) - gap, maxX = Math.max(p.x, q.x) + gap;
    const minY = Math.min(p.y, q.y) - gap, maxY = Math.max(p.y, q.y) + gap;
    const stack = [tree];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.maxX < minX || node.minX > maxX || node.maxY < minY || node.minY > maxY) continue;
      if (!node.indices) { stack.push(node.left!, node.right!); continue; }
      for (const j of node.indices) {
      const r = b[j], s = b[(j + 1) % b.length];
      if (Math.max(r.x, s.x) < minX || Math.min(r.x, s.x) > maxX ||
          Math.max(r.y, s.y) < minY || Math.min(r.y, s.y) > maxY) continue;
      const c1 = cross(p, q, r), c2 = cross(p, q, s), c3 = cross(r, s, p), c4 = cross(r, s, q);
      if (((c1 > 0 && c2 < 0) || (c1 < 0 && c2 > 0)) &&
          ((c3 > 0 && c4 < 0) || (c3 < 0 && c4 > 0))) return true;
      if (spacing > 0 && Math.min(distanceSq(p, r, s), distanceSq(q, r, s), distanceSq(r, p, q), distanceSq(s, p, q)) < gapSq) return true;
      }
    }
  }
  if (spacing > 0) return pointInPolygon(a[0], b) || pointInPolygon(b[0], a);
  return interiorPointIn(a, b) || interiorPointIn(b, a);
}
function interiorPointIn(a: DxfPoint[], b: DxfPoint[]): boolean {
  const direction = Math.sign(a.reduce((sum, p, i) => sum + p.x * a[(i + 1) % a.length].y - a[(i + 1) % a.length].x * p.y, 0));
  for (let i = 0; i < a.length; i++) {
    const p = a[i], q = a[(i + 1) % a.length], dx = q.x - p.x, dy = q.y - p.y;
    const length = Math.hypot(dx, dy);
    if (length < EPS) continue;
    const sample = { x: (p.x + q.x) / 2 - direction * dy / length * 1e-6, y: (p.y + q.y) / 2 + direction * dx / length * 1e-6 };
    if (pointInPolygon(sample, b)) return true;
  }
  return false;
}
function insideHole(inner: DxfPoint[], holes: DxfPoint[][], spacing: number): boolean {
  return holes.some(hole => inner.every(point => pointInPolygon(point, hole) || (spacing === 0 && hole.some((edge, i) => distanceSq(point, edge, hole[(i + 1) % hole.length]) < 1e-12))) &&
    inner.every((p, i) => hole.every((r, j) => {
      const q = inner[(i + 1) % inner.length], s = hole[(j + 1) % hole.length];
      const c1 = cross(p, q, r), c2 = cross(p, q, s), c3 = cross(r, s, p), c4 = cross(r, s, q);
      if (c1 * c2 < -EPS && c3 * c4 < -EPS) return false;
      return spacing === 0 || Math.min(distanceSq(p,r,s), distanceSq(q,r,s), distanceSq(r,p,q), distanceSq(s,p,q)) >= spacing * spacing - EPS;
    })));
}
export function shapesConflict(a: NestingPolygon, b: NestingPolygon, spacing: number): boolean {
  if (insideHole(a.points, b.holes, spacing) || insideHole(b.points, a.holes, spacing)) return false;
  return polygonsConflict(a.points, b.points, spacing);
}
export function fits(shape: Polygon, x: number, y: number, placed: Positioned[], width: number, height: number, settings: NestingSettings): boolean {
  const { margin, spacing } = settings;
  if (x < margin - EPS || y < margin - EPS || x + shape.width > width - margin + EPS || y + shape.height > height - margin + EPS) return false;
  let positioned: NestingPolygon | undefined;
  for (const other of placed) {
    if (x > other.x + other.width + spacing || x + shape.width + spacing < other.x ||
        y > other.y + other.height + spacing || y + shape.height + spacing < other.y) continue;
    positioned ??= { ...shape, points: shape.points.map(p => ({ x: p.x + x, y: p.y + y })), holes: shape.holes.map(hole => hole.map(p => ({ x: p.x + x, y: p.y + y }))) };
    if (shapesConflict(positioned, { ...other, holes: other.holes ?? [] }, spacing)) return false;
  }
  return true;
}
export function validateSettings(settings: NestingSettings): void {
  if (!['sheet', 'roll'].includes(settings.materialType) || !['bottom-left', 'bottom-right', 'top-left', 'top-right'].includes(settings.startCorner)) throw new Error('Geçersiz malzeme veya başlangıç köşesi.');
  for (const value of [settings.sheetWidth, settings.sheetHeight, settings.rollWidth]) {
    if (!Number.isFinite(value) || value <= 0) throw new Error('Malzeme ölçüleri pozitif olmalı.');
  }
  if (![settings.margin, settings.spacing].every(v => Number.isFinite(v) && v >= 0)) throw new Error('Aralık ve kenar payı negatif olamaz.');
  if (!settings.rotations.length || settings.rotations.some(r => !Number.isFinite(r) || r < 0 || r >= 360)) throw new Error('Geçerli bir dönüş açısı seçin.');
  if ((settings.materialType === 'roll' ? settings.rollWidth : settings.sheetWidth) <= 2 * settings.margin || settings.sheetHeight <= 2 * settings.margin) throw new Error('Kenar payı malzeme ölçüsünden büyük.');
}
// Ordering is explicit: strategies never overwrite the actual contour area.
export function createPartInstances(parts: NestingPart[], preserveOrder = false) {
  const ordered = preserveOrder ? [...parts] : [...parts].sort((a, b) => calculateAbsoluteArea(b.outerContour.points) - calculateAbsoluteArea(a.outerContour.points));
  return ordered.flatMap(part => {
    if (!Number.isSafeInteger(part.quantity) || part.quantity < 0 || part.quantity > 10000) throw new Error('Geçersiz parça adedi.');
    if (!Object.values(part.bounds).every(Number.isFinite) || part.bounds.width <= 0 || part.bounds.height <= 0) throw new Error(`${part.name}: geçersiz parça ölçüleri.`);
    if (part.outerContour.points.length < 3 || !part.outerContour.closed ||
      !part.outerContour.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)) ||
      calculateAbsoluteArea(part.outerContour.points) <= EPS) throw new Error(`${part.name}: geçersiz kapalı kontur.`);
    return Array.from({ length: part.quantity }, (_, i) => ({ part, instanceId: `${part.id}-${i}` }));
  });
}
export function runNesting(parts: NestingPart[], settings: NestingSettings = DEFAULT_NESTING_SETTINGS, options: { preserveOrder?: boolean; searchStep?: number; candidateLimit?: number } = {}): NestingResult {
  validateSettings(settings);
  if (options.searchStep !== undefined && (!Number.isFinite(options.searchStep) || options.searchStep <= 0)) throw new Error('Arama adımı pozitif olmalı.');
  const instances = createPartInstances(parts, options.preserveOrder);
  const width = settings.materialType === 'roll' ? settings.rollWidth : settings.sheetWidth;
  const height = settings.materialType === 'roll' ? instances.reduce((sum, { part }) => sum + Math.max(part.bounds.width, part.bounds.height) + settings.spacing, settings.margin * 2) : settings.sheetHeight;
  const placed: Positioned[] = [], placements: NestingPlacement[] = [];
  const cache = new Map<string, Polygon>();
  const fromRight = settings.startCorner.endsWith('right');
  const fromTop = settings.startCorner.startsWith('top');
  let usedHeight = 0, usedWidth = 0, usedArea = 0;
  const findPlacement = (part: NestingPart, ceiling = height - settings.margin) => {
    const rotations = settings.rotations.filter(r => (!part.lockDirection || r === 0) && (!part.allowedRotations || part.allowedRotations.includes(r)));
    let best: { shape: Polygon; x: number; y: number; rotation: number; score: number } | undefined;
    for (const rotation of rotations) {
      const key = `${part.id}:${rotation}`;
      let shape = cache.get(key);
      if (!shape) {
        shape = polygon(part, rotation);
        cache.set(key, shape);
      }
      if (shape.width > width - 2 * settings.margin || shape.height > height - 2 * settings.margin) continue;
      const gap = settings.spacing + 1e-6;
      const xs = new Set([settings.margin, width - settings.margin - shape.width]);
      const ys = new Set([settings.margin, height - settings.margin - shape.height]);
      // Pair contour contacts instead of taking a quadratic product of sampled vertices.
      const contacts = new Map<number, Set<number>>();
      for (const other of placed) for (const ring of [other.points, ...(other.holes ?? [])]) {
        const stride = Math.max(1, Math.ceil(ring.length / 32));
        for (let i = 0; i < ring.length; i += stride) {
          for (const y of [ring[i].y + gap, ring[i].y - shape.height - gap]) {
            const row = contacts.get(y) ?? new Set<number>();
            for (const x of [ring[i].x + gap, ring[i].x - shape.width - gap]) row.add(x);
            contacts.set(y, row);
          }
        }
      }
      if (options.searchStep) {
        for (let x = settings.margin; x <= width - settings.margin - shape.width; x += options.searchStep) xs.add(x);
      }
      for (const p of placed) {
        for (const x of [p.x, p.x + p.width + gap, p.x - shape.width - gap, p.x + p.width - shape.width]) xs.add(x);
        for (const y of [p.y, p.y + p.height + gap, p.y - shape.height - gap, p.y + p.height - shape.height]) ys.add(y);
      }
      let candidate: { x: number; y: number } | undefined;
      const candidates: { x: number; y: number }[] = [];
      const sortedXs = [...xs].filter(x => x >= settings.margin && x <= width - settings.margin - shape.width).sort((a, b) => fromRight ? b - a : a - b);
      for (const y of [...new Set([...ys, ...contacts.keys()])].filter(y => y >= settings.margin && y <= height - settings.margin - shape.height && (fromTop ? height - y <= ceiling + EPS : y + shape.height <= ceiling + EPS)).sort((a, b) => fromTop ? b - a : a - b)) {
        const rowXs = [...new Set([...(ys.has(y) ? sortedXs : []), ...(contacts.get(y) ?? [])])].sort((a, b) => fromRight ? b - a : a - b);
        for (const x of rowXs) {
          if (fits(shape, x, y, placed, width, height, settings)) {
            candidates.push({ x, y });
            if (candidates.length >= (options.candidateLimit ?? 1)) break;
          }
        }
        if (candidates.length) break;
      }
      for (const position of candidates) {
        if (options.searchStep) {
          for (let pass = 0; pass < 2; pass++) for (const step of [10, 2, 0.25, 0.02]) {
            while (fits(shape, position.x, position.y + (fromTop ? step : -step), placed, width, height, settings)) position.y += fromTop ? step : -step;
            while (fits(shape, position.x + (fromRight ? step : -step), position.y, placed, width, height, settings)) position.x += fromRight ? step : -step;
          }
        }
        if (!candidate || (fromTop ? position.y > candidate.y + EPS : position.y < candidate.y - EPS) || (Math.abs(position.y - candidate.y) < EPS && (fromRight ? position.x > candidate.x : position.x < candidate.x))) candidate = position;
      }
      if (!candidate) continue;
      const score = (fromTop ? height - candidate.y : candidate.y + shape.height) * width + (fromRight ? width - candidate.x : candidate.x) / width;
      if (!best || score < best.score) best = { ...candidate, shape, rotation, score };
    }
    return best;
  };
  const pending = [...instances];
  while (pending.length) {
    let index = 0;
    let best = findPlacement(pending[0].part);
    const occupiedHeight = placed.reduce((max, p) => Math.max(max, fromTop ? height - p.y : p.y + p.height), settings.margin);
    if (placed.length && (!best || (fromTop ? height - best.y : best.y + best.shape.height) > occupiedHeight + EPS)) {
      const smallFirst = pending.map((item, i) => ({ ...item, i })).slice(1)
        .sort((a, b) => calculateAbsoluteArea(a.part.outerContour.points) - calculateAbsoluteArea(b.part.outerContour.points));
      const checked = new Set<string>();
      for (const item of smallFirst) {
        if (checked.has(item.part.id)) continue;
        checked.add(item.part.id);
        const cavity = findPlacement(item.part, occupiedHeight);
        if (cavity) { index = item.i; best = cavity; break; }
      }
    }
    const { part, instanceId } = pending.splice(index, 1)[0];
    if (!best) { placements.push({ partId: part.id, instanceId, placed: false, x: 0, y: 0, rotation: 0 }); continue; }
    placed.push({ ...best.shape, x: best.x, y: best.y, points: best.shape.points.map(p => ({ x: p.x + best.x, y: p.y + best.y })), holes: best.shape.holes.map(hole => hole.map(p => ({ x: p.x + best.x, y: p.y + best.y }))) });
    placements.push({ partId: part.id, instanceId, placed: true, x: best.x, y: best.y, rotation: best.rotation });
    usedHeight = Math.max(usedHeight, fromTop ? height - best.y : best.y + best.shape.height);
    usedWidth = Math.max(usedWidth, fromRight ? width - best.x : best.x + best.shape.width);
    usedArea += calculateAbsoluteArea(part.outerContour.points) - part.holes.reduce((sum, hole) => sum + calculateAbsoluteArea(hole.points), 0);
  }
  const materialHeight = settings.materialType === 'roll' ? usedHeight + settings.margin : height;
  if (fromTop && settings.materialType === 'roll') {
    for (const placement of placements) if (placement.placed) placement.y -= height - materialHeight;
  }
  const materialArea = width * materialHeight;
  return { placements, placedCount: placed.length, unplacedCount: instances.length - placed.length, totalCount: instances.length,
    usedWidth, usedHeight, usedArea, materialWidth: width, materialHeight, materialArea,
    efficiency: materialArea ? usedArea / materialArea * 100 : 0, margin: settings.margin };
}

// Revisit earlier placements after all pieces are present. Unlike initial placement,
// these sweeps can reclaim gaps left behind by a later piece's orientation.
export function compactNesting(parts: NestingPart[], result: NestingResult, settings: NestingSettings, relocate = false): NestingResult {
  const partMap = new Map(parts.map(p => [p.id, p]));
  const right = settings.startCorner.endsWith('right');
  const top = settings.startCorner.startsWith('top');
  const placements = result.placements.map(p => ({ ...p }));
  const positions = placements.filter(p => p.placed).map(placement => {
    const shape = polygon(partMap.get(placement.partId)!, placement.rotation);
    shape.points = shape.points.map(p => ({ x: right ? shape.width - p.x : p.x, y: top ? shape.height - p.y : p.y }));
    shape.holes = shape.holes.map(hole => hole.map(p => ({ x: right ? shape.width - p.x : p.x, y: top ? shape.height - p.y : p.y })));
    const x = right ? result.materialWidth - placement.x - shape.width : placement.x;
    const y = top ? result.materialHeight - placement.y - shape.height : placement.y;
    return { placement, shape, x, y, width: shape.width, height: shape.height,
      points: shape.points.map(p => ({ x: p.x + x, y: p.y + y })), holes: shape.holes.map(hole => hole.map(p => ({ x: p.x + x, y: p.y + y }))) };
  });
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    const order = [...positions].sort((a, b) => pass % 2 ? b.y - a.y : a.y - b.y);
    for (const p of order) {
      const others = positions.filter(other => other !== p);
      const oldX = p.x, oldY = p.y;
      for (const step of [20, 5, 1, 0.1, 0.01]) {
        while (fits(p.shape, p.x, p.y - step, others, result.materialWidth, result.materialHeight, settings)) p.y -= step;
        while (fits(p.shape, p.x - step, p.y, others, result.materialWidth, result.materialHeight, settings)) p.x -= step;
      }
      if (oldX !== p.x || oldY !== p.y) {
        moved = true;
        p.holes = p.shape.holes.map(hole => hole.map(point => ({ x: point.x + p.x, y: point.y + p.y })));
        p.points = p.shape.points.map(point => ({ x: point.x + p.x, y: point.y + p.y }));
      }
    }
    if (!moved) break;
  }
  if (relocate) {
    // Bounded repair: remove the highest pieces and search lower cavities with
    // every permitted rotation. Other pieces remain fixed throughout each move.
    const highest = [...positions].sort((a,b) => b.y+b.height-a.y-a.height).slice(0,12);
    for (const p of highest) {
      const part = partMap.get(p.placement.partId)!;
      const others = positions.filter(other => other !== p);
      let best: { shape: Polygon; x: number; y: number; rotation: number } | undefined;
      let bestTop = p.y + p.height;
      for (const rotation of settings.rotations.filter(r => (!part.lockDirection || r === 0) && (!part.allowedRotations || part.allowedRotations.includes(r)))) {
        const shape = polygon(part,rotation);
        shape.points = shape.points.map(point => ({x:right ? shape.width-point.x : point.x,y:top ? shape.height-point.y : point.y}));
        shape.holes = shape.holes.map(hole => hole.map(point => ({x:right ? shape.width-point.x : point.x,y:top ? shape.height-point.y : point.y})));
        const xs = new Set([settings.margin,p.x]);
        const ys = new Set([settings.margin]);
        for (let x=settings.margin;x<=result.materialWidth-settings.margin-shape.width;x+=20) xs.add(x);
        for (let y=settings.margin;y+shape.height<bestTop-0.02;y+=20) ys.add(y);
        for (const other of others) {
          xs.add(other.x+other.width+settings.spacing+1e-6);
          xs.add(other.x-shape.width-settings.spacing-1e-6);
          ys.add(other.y+other.height+settings.spacing+1e-6);
        }
        let found = false;
        for (const y of [...ys].filter(y => y+shape.height<bestTop-0.02).sort((a,b)=>a-b)) {
          for (const x of [...xs].sort((a,b)=>a-b)) {
            if (!fits(shape,x,y,others,result.materialWidth,result.materialHeight,settings)) continue;
            best={shape,x,y,rotation}; bestTop=y+shape.height; found=true; break;
          }
          if(found) break;
        }
      }
      if (best) {
        p.shape=best.shape; p.width=best.shape.width; p.height=best.shape.height; p.x=best.x; p.y=best.y; p.placement.rotation=best.rotation;
        p.holes=p.shape.holes.map(hole=>hole.map(point=>({x:point.x+p.x,y:point.y+p.y})));
        p.points=p.shape.points.map(point=>({x:point.x+p.x,y:point.y+p.y}));
      }
    }
  }
  const usedWidth = positions.reduce((max, p) => Math.max(max, p.x + p.width), 0);
  const usedHeight = positions.reduce((max, p) => Math.max(max, p.y + p.height), 0);
  const materialHeight = settings.materialType === 'roll' ? usedHeight + settings.margin : result.materialHeight;
  for (const p of positions) {
    p.placement.x = right ? result.materialWidth - p.x - p.width : p.x;
    p.placement.y = top ? materialHeight - p.y - p.height : p.y;
  }
  const materialArea = result.materialWidth * materialHeight;
  return { ...result, placements, usedWidth, usedHeight, materialHeight, materialArea,
    efficiency: materialArea ? result.usedArea / materialArea * 100 : 0 };
}
