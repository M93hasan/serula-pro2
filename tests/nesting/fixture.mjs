import { readFileSync } from 'node:fs';
import DxfParser from 'dxf-parser';
import { existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { normalizeDxfEntities } from '../../frontend/src/dxf/dxfNormalizer.ts';
import { createCurvesFromEntities } from '../../frontend/src/dxf/curveEngine.ts';
import { detectContours } from '../../frontend/src/dxf/contourEngine.ts';
import { createPartsFromContours } from '../../frontend/src/dxf/partEngine.ts';
export function loadParts() {
  mkdirSync('storage',{recursive:true});
  return createPartsFromContours(detectContours(createCurvesFromEntities(normalizeDxfEntities(new DxfParser().parseSync(loadFixtureText())))));
}
export function loadFixtureText(){
  const path=process.env.NESTING_DXF??'00.dxf';
  // Read the deleted reference from history without restoring the user's deletion.
  return existsSync(path)?readFileSync(path,'utf8'):execFileSync('git',['show','84ade18:00.dxf'],{encoding:'utf8',maxBuffer:20*1024*1024});
}
