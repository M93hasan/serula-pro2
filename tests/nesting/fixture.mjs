import { readFileSync } from 'node:fs';
import DxfParser from 'dxf-parser';
import { normalizeDxfEntities } from '../../frontend/src/dxf/dxfNormalizer.ts';
import { createCurvesFromEntities } from '../../frontend/src/dxf/curveEngine.ts';
import { detectContours } from '../../frontend/src/dxf/contourEngine.ts';
import { createPartsFromContours } from '../../frontend/src/dxf/partEngine.ts';
export function loadParts() {
  return createPartsFromContours(detectContours(createCurvesFromEntities(normalizeDxfEntities(new DxfParser().parseSync(readFileSync('00.dxf', 'utf8'))))));
}
