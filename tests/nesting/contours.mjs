import assert from 'node:assert/strict';
import { detectContours } from '../../frontend/src/dxf/contourEngine.ts';
import { createPartsFromContours, getCurvesForPart } from '../../frontend/src/dxf/partEngine.ts';
import { createJobGeometry } from '../../frontend/src/dxf/jobGeometry.ts';
import { validateParts, validateLayout } from '../../frontend/src/nesting/validateLayout.ts';
import { runGlsNesting } from '../../frontend/src/nesting/glsNestingEngine.ts';
import { DEFAULT_NESTING_SETTINGS } from '../../frontend/src/nesting/nestingEngine.ts';

const curve = (id, points) => ({ id, closed: true, points: points.map(([x,y]) => ({x,y})), layer: 'Layer 1', color: {} });
const square = (id, lo, hi) => curve(id, [[lo,lo],[hi,lo],[hi,hi],[lo,hi]]);
// Every triangle vertex is inside the L, but its diagonal crosses the notch.
const crossing = [curve('L', [[0,0],[100,0],[100,30],[30,30],[30,100],[0,100]]), curve('triangle', [[10,10],[80,10],[10,80]])];
const contours = detectContours(crossing);
assert.deepEqual(contours.map(c => c.role), ['outer','outer']);
const parts = createPartsFromContours(contours);
assert.equal(parts.length, 2);
assert(parts.every(p => p.holes.length === 0));
assert.doesNotThrow(() => validateParts(parts));
for (const part of parts) assert.deepEqual(getCurvesForPart(part,crossing).map(c=>c.id), part.outerContour.curves.map(c=>c.id));
const job = createJobGeometry(parts,crossing,{});
assert.equal(job.curvePartMap.size,2);
assert.equal(new Set(job.curvePartMap.values()).size,2);
for (const quantity of [0,101,1000]) {
  const copies = createJobGeometry([parts[0]],[crossing[0]],{[parts[0].id]:quantity});
  assert.equal(copies.parts.length,quantity);
  assert.equal(new Set(copies.parts.map(p=>p.id)).size,quantity);
  assert.equal(copies.curvePartMap.size,quantity);
}
for (const quantity of [-1,0.5,1001,NaN]) assert.throws(()=>createJobGeometry(parts,crossing,{[parts[0].id]:quantity}));
const settings = {...DEFAULT_NESTING_SETTINGS,sheetWidth:220,sheetHeight:220,margin:1,spacing:1,rotations:[0]};
const run = await runGlsNesting(job.parts,settings,{timeBudgetMs:1000,maxIterations:3});
assert.equal(run.result.placedCount,2);
validateLayout(job.parts,settings,run.result);
// Nested holes and islands must retain their immediate parent and native curves.
const nested = [square('outer',0,100),square('hole',10,90),square('island',20,80),square('island-hole',30,70)];
assert.deepEqual(detectContours(nested).map(c=>c.role),['outer','hole','outer','hole']);
const nestedParts = createPartsFromContours(detectContours(nested));
assert.deepEqual(nestedParts.map(p=>p.holes.length),[1,1]);
assert.deepEqual(nestedParts.map(p=>getCurvesForPart(p,nested).map(c=>c.id)),[['outer','hole'],['island','island-hole']]);
validateParts(nestedParts);
const touching = [square('outer',0,100),curve('touch',[[0,10],[20,10],[20,20],[0,20]])];
assert.deepEqual(detectContours(touching).map(c=>c.role),['outer','outer']);
assert.throws(()=>validateParts([{...parts[0],holes:[contours[1]]}]), /iç kontur/);
console.log('PASS concave boundary crossing, independent curve ownership, complete nesting, nested holes/islands, touching boundaries and invalid-hole guard');
