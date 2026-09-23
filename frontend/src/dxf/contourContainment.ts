import Clipper from 'clipper-lib';
import type { DxfPoint, SerulaContour } from './dxfTypes';

const SCALE = 10000;
const EPS = 1e-9;
function distance(p: DxfPoint, a: DxfPoint, b: DxfPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
const cross = (a: DxfPoint, b: DxfPoint, c: DxfPoint) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);

/** A hole must be wholly inside its parent, not merely have an interior sample.
 * Use the same integer precision as nesting, then reject boundary contact in
 * original coordinates. Neither clipping nor this test changes either contour. */
export function strictlyContainsContour(outer: SerulaContour, inner: SerulaContour): boolean {
  if (outer.id === inner.id || !outer.closed || !inner.closed || outer.points.length < 3 || inner.points.length < 3) return false;
  if (inner.bounds.minX < outer.bounds.minX - EPS || inner.bounds.minY < outer.bounds.minY - EPS ||
      inner.bounds.maxX > outer.bounds.maxX + EPS || inner.bounds.maxY > outer.bounds.maxY + EPS) return false;
  const path = (points: DxfPoint[]) => {
    const ring = points.map(p => ({ X: Math.round(p.x*SCALE), Y: Math.round(p.y*SCALE) }));
    if (!Clipper.Clipper.Orientation(ring)) ring.reverse();
    return ring;
  };
  const outside: Clipper.Paths = [], clipper = new Clipper.Clipper();
  clipper.AddPath(path(inner.points), Clipper.PolyType.ptSubject, true);
  clipper.AddPath(path(outer.points), Clipper.PolyType.ptClip, true);
  clipper.Execute(Clipper.ClipType.ctDifference, outside, Clipper.PolyFillType.pftNonZero, Clipper.PolyFillType.pftNonZero);
  if (outside.some(ring => Math.abs(Clipper.Clipper.Area(ring)) > 1)) return false;
  for (let i=0; i<inner.points.length; i++) for (let j=0; j<outer.points.length; j++) {
    const a=inner.points[i], b=inner.points[(i+1)%inner.points.length], c=outer.points[j], d=outer.points[(j+1)%outer.points.length];
    if (Math.max(a.x,b.x)+EPS<Math.min(c.x,d.x) || Math.max(c.x,d.x)+EPS<Math.min(a.x,b.x) ||
        Math.max(a.y,b.y)+EPS<Math.min(c.y,d.y) || Math.max(c.y,d.y)+EPS<Math.min(a.y,b.y)) continue;
    if (cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) return false;
    if (Math.min(distance(a,c,d),distance(b,c,d),distance(c,a,b),distance(d,a,b)) < EPS) return false;
  }
  return true;
}
