import {loadParts} from './fixture.mjs';
import {runRasterNesting} from '../../frontend/src/nesting/rasterNestingEngine.ts';
import {compactNesting,DEFAULT_NESTING_SETTINGS} from '../../frontend/src/nesting/nestingEngine.ts';
import {writeFileSync} from 'node:fs';
const parts=loadParts();
const metrics=[['area',p=>p.outerContour.absoluteArea],['height',p=>p.bounds.height],['width',p=>p.bounds.width],['min',p=>Math.min(p.bounds.width,p.bounds.height)]];
let best;
for(const [name,metric] of metrics)for(const bottom of [false,true]) {
 const start=performance.now();const result=runRasterNesting([...parts].sort((a,b)=>metric(b)-metric(a)),DEFAULT_NESTING_SETTINGS,3,bottom);const compact=compactNesting(parts,result,DEFAULT_NESTING_SETTINGS,true);
 console.log(name,bottom,compact.placedCount,compact.usedHeight,performance.now()-start);
 if(compact.placedCount===32&&(!best||compact.usedHeight<best.usedHeight)){best=compact;writeFileSync('storage/raster-best.json',JSON.stringify(compact));}
}
