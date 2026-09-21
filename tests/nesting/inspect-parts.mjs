import {loadParts} from './fixture.mjs';
const parts=loadParts();console.log(JSON.stringify(parts.map(p=>({id:p.id,w:p.bounds.width,h:p.bounds.height,area:p.outerContour.absoluteArea,holes:p.holes.reduce((s,h)=>s+h.absoluteArea,0)}))));console.log('outerArea',parts.reduce((s,p)=>s+p.outerContour.absoluteArea,0));
