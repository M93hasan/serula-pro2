import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {loadFixtureText} from './fixture.mjs';
import DxfParser from 'dxf-parser';
import {normalizeDxfEntities} from '../../frontend/src/dxf/dxfNormalizer.ts';
import {createCurvesFromEntities} from '../../frontend/src/dxf/curveEngine.ts';
import {detectContours} from '../../frontend/src/dxf/contourEngine.ts';
import {createPartsFromContours} from '../../frontend/src/dxf/partEngine.ts';
import {createJobGeometry} from '../../frontend/src/dxf/jobGeometry.ts';
import {prepareExport,createDxfExport,createSvgExport} from '../../frontend/src/dxf/nestingExport.ts';
import {runNesting,DEFAULT_NESTING_SETTINGS,transformNestingPoint} from '../../frontend/src/nesting/nestingEngine.ts';
const entities=normalizeDxfEntities(new DxfParser().parseSync(loadFixtureText()));
const curves=createCurvesFromEntities(entities), catalogue=createPartsFromContours(detectContours(curves));
const settings={...DEFAULT_NESTING_SETTINGS,materialType:'roll'};
for(const quantities of [{},{'part-0':3,'part-1':0}]) {
 const job=createJobGeometry(catalogue,curves,quantities);
 assert.equal(job.parts.length,Object.keys(quantities).length ? 33 : 32);
 assert.equal(new Set(job.parts.map(p=>p.id)).size,job.parts.length);
 const result=runNesting(job.parts,settings);assert.equal(result.placedCount,job.parts.length);
 const prepared=prepareExport(result,job.parts,job.curves,job.curvePartMap,entities,{},settings);
 assert.equal(prepared.curves.length,job.curvePartMap.size);
 const dxf=createDxfExport(prepared.curves);
 const parsed=new DxfParser().parseSync(dxf);
 assert.equal(parsed.header.$INSUNITS,4);
 assert.equal(parsed.entities.length,prepared.curves.length);
 assert(parsed.entities.every(e=>e.type==='SPLINE'));
 const roundtrip=createCurvesFromEntities(normalizeDxfEntities(parsed));
 for(let i=0;i<roundtrip.length;i++) {
   const item=prepared.curves[i], output=roundtrip[i];
   assert.equal(output.points.length,item.curve.points.length);
   assert.equal(output.color.hex.toLowerCase(),item.curve.color.hex.toLowerCase());
   for(let j=0;j<output.points.length;j++) {
     const expected=transformNestingPoint(item.curve.points[j],item.part,item.placement);
     assert(Math.hypot(output.points[j].x-expected.x,output.points[j].y-expected.y)<1e-6,'DXF curve geometry drift');
   }
 }
 assert.equal((createSvgExport(prepared.curves,prepared.result).match(/<path /g)||[]).length,prepared.curves.length);
 assert.throws(()=>prepareExport(result,job.parts,job.curves,job.curvePartMap,entities,{[job.parts[0].id]:{x:9999,y:0}},settings));
 writeFileSync(`storage/export-test-${job.parts.length}.dxf`,dxf);
 console.log('PASS: quantities, all copies, native spline DXF roundtrip, colors, units, SVG, export boundary guard',job.parts.length);
}
