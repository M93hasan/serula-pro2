import {loadParts} from './fixture.mjs';
import {squeezeNesting} from '../../frontend/src/nesting/squeezeNestingEngine.ts';
import {compactNesting,DEFAULT_NESTING_SETTINGS} from '../../frontend/src/nesting/nestingEngine.ts';
import {readFileSync,writeFileSync} from 'node:fs';
const parts=loadParts(),source=JSON.parse(readFileSync('storage/profile-best.json','utf8'));
for(const target of [800,780,760]){const start=performance.now(),r=squeezeNesting(parts,source,DEFAULT_NESTING_SETTINGS,target,42,150);const c=r?compactNesting(parts,r,DEFAULT_NESTING_SETTINGS,true):null;console.log('squeeze',target,c?.usedHeight,performance.now()-start);if(c)writeFileSync(`storage/squeeze-${target}.json`,JSON.stringify(c));}
