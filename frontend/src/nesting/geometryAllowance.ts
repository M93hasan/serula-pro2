import type { NestingPart } from '../dxf/dxfTypes';
/** Reserve the declared polygonization error around each native DXF curve.
 * This is NOT another kerf: two outlines each contribute their own error bound. */
export function geometryAllowance(parts:NestingPart[]):number {
  return parts.reduce((maximum,part)=>Math.max(maximum,...[part.outerContour,...part.holes].flatMap(contour=>(contour.curves??[]).map(curve=>curve.approximationTolerance??0))),0);
}
