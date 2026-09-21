import {loadParts} from './fixture.mjs';
import {runBeamNesting} from '../../frontend/src/nesting/rasterNestingEngine.ts';
import {compactNesting,DEFAULT_NESTING_SETTINGS} from '../../frontend/src/nesting/nestingEngine.ts';
import {writeFileSync} from 'node:fs';
const parts=loadParts();
for(const [name,metric]of [['area',p=>p.outerContour.absoluteArea],['min',p=>Math.min(p.bounds.width,p.bounds.height)],['width',p=>p.bounds.width]]){
const start=performance.now(),r=runBeamNesting([...parts].sort((a,b)=>metric(b)-metric(a)),DEFAULT_NESTING_SETTINGS,3,4);const c=compactNesting(parts,r,DEFAULT_NESTING_SETTINGS,true);console.log('beam',name,c.placedCount,c.usedHeight,performance.now()-start);writeFileSync(`storage/beam-${name}.json`,JSON.stringify(c));}
