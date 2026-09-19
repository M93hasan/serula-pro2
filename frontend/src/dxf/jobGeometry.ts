import type { NestingPart, SerulaCurve } from './dxfTypes';
import { getCurvesForPart } from './partEngine';

export function createJobGeometry(catalogue: NestingPart[], sourceCurves: SerulaCurve[], quantities: Record<string, number>) {
  const owners = new Map<string, string>();
  for (const part of [...catalogue].sort((a, b) => a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height)) {
    for (const curve of getCurvesForPart(part, sourceCurves)) if (!owners.has(curve.id)) owners.set(curve.id, part.id);
  }
  const parts: NestingPart[] = [];
  const curves: SerulaCurve[] = [];
  const curvePartMap = new Map<string, string>();
  for (const part of catalogue) {
    const quantity = quantities[part.id] ?? 1;
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100) throw new Error('Parça adedi 0–100 arasında olmalı.');
    const attached = sourceCurves.filter(curve => owners.get(curve.id) === part.id);
    for (let i = 0; i < quantity; i++) {
      const id = i === 0 ? part.id : `${part.id}:copy-${i}`;
      parts.push({ ...part, id, quantity: 1 });
      for (const curve of attached) {
        const copy = { ...curve, id: `${curve.id}@${id}` };
        curves.push(copy);
        curvePartMap.set(copy.id, id);
      }
    }
  }
  curves.push(...sourceCurves.filter(curve => !owners.has(curve.id)));
  return { parts, curves, curvePartMap };
}
