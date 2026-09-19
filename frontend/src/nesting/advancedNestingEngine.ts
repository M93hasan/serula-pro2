import { runNesting, type NestingResult, type NestingSettings } from './nestingEngine';
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
  const requested = options.maxTrials ?? 8;
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(metrics.length, Math.floor(requested))) : 8;
  let best: NestingResult | undefined, bestTrialIndex = 0;
  for (let i = 0; i < limit; i++) {
    const metric = metrics[i % metrics.length];
    const ordered = [...parts].sort((a, b) => metric(b) - metric(a));
    const result = runNesting(ordered, settings, { preserveOrder: true, searchStep: i === 0 ? undefined : 40 });
    if (!best || isBetterResult(result, best)) { best = result; bestTrialIndex = i; }
  }
  return { result: best!, trials: limit, durationMs: performance.now() - start, bestTrialIndex };
}
