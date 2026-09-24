import { runNesting, compactNesting, groupSimilarParts, type NestingResult, type NestingSettings } from './nestingEngine';
import type { NestingPart } from '../dxf/dxfTypes';
import { calculateAbsoluteArea } from '../dxf/contourEngine';
export interface AdvancedNestingOptions { maxTrials?: number }
export interface AdvancedNestingResult { result: NestingResult; trials: number; durationMs: number; bestTrialIndex: number }
const metrics: ((p: NestingPart) => number)[] = [
  p => calculateAbsoluteArea(p.outerContour.points),
  p => p.bounds.height,
  p => p.bounds.width,
  p => Math.max(p.bounds.width, p.bounds.height),
  p => Math.max(p.bounds.width, p.bounds.height) / Math.max(0.001, Math.min(p.bounds.width, p.bounds.height)),
  p => calculateAbsoluteArea(p.outerContour.points) / (p.bounds.width * p.bounds.height),
  p => p.bounds.width + p.bounds.height,
  p => Math.min(p.bounds.width, p.bounds.height),
];
export function isBetterResult(a: NestingResult, b: NestingResult): boolean {
  if (a.placedCount !== b.placedCount) return a.placedCount > b.placedCount;
  if (Math.abs(a.usedHeight - b.usedHeight) > 0.001) return a.usedHeight < b.usedHeight;
  if (Math.abs(a.usedWidth - b.usedWidth) > 0.001) return a.usedWidth < b.usedWidth;
  return a.efficiency > b.efficiency;
}
export function runAdvancedNesting(parts: NestingPart[], settings: NestingSettings, options: AdvancedNestingOptions = {}): AdvancedNestingResult {
  const start = performance.now();
  const requested = options.maxTrials ?? 5;
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(10, Math.floor(requested))) : 10;
  let best: NestingResult | undefined, bestTrialIndex = 0;
  for (let i = 0; i < limit; i++) {
    const metric = metrics[i < metrics.length ? i : 7];
    // Metric sweeps happen inside similarity groups so alike parts stay neighbours.
    const ordered = groupSimilarParts(parts, (a, b) => metric(b) - metric(a));
    const result = runNesting(ordered, settings, { preserveOrder: true, searchStep: i === 0 ? undefined : i === 8 ? 20 : 40, candidateLimit: i === 8 ? 4 : i === 9 ? 8 : 1 });
    if (!best || isBetterResult(result, best)) { best = result; bestTrialIndex = i; }
  }
  if (settings.startCorner === 'bottom-left' && parts.reduce((sum, part) => sum + part.quantity, 0) <= 100) {
    const compacted = compactNesting(parts, best!, settings, true);
    if (isBetterResult(compacted, best!)) best = compacted;
  }
  return { result: best!, trials: limit, durationMs: performance.now() - start, bestTrialIndex };
}
