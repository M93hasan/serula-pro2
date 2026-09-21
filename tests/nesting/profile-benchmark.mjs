import {loadParts} from './fixture.mjs';
import {runBeamNesting} from '../../frontend/src/nesting/rasterNestingEngine.ts';
import {compactNesting,DEFAULT_NESTING_SETTINGS} from '../../frontend/src/nesting/nestingEngine.ts';
import {writeFileSync} from 'node:fs';
const parts=loadParts();let best;
for(const [name,metric]of [['area',p=>p.outerContour.absoluteArea],['min',p=>Math.min(p.bounds.width,p.bounds.height)],['width',p=>p.bounds.width]])for(const cell of [2,3]){
const start=performance.now(),r=runBeamNesting([...parts].sort((a,b)=>metric(b)-metric(a)),DEFAULT_NESTING_SETTINGS,cell,8,0.3);const c=compactNesting(parts,r,DEFAULT_NESTING_SETTINGS,true);console.log('profile',name,cell,c.placedCount,c.usedHeight,performance.now()-start);if(c.placedCount===32&&(!best||c.usedHeight<best.usedHeight)){best=c;writeFileSync('storage/profile-best.json',JSON.stringify(c));}}
