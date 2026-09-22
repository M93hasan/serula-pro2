import {prepareExport} from '../../frontend/src/dxf/nestingExport.ts';
﻿import assert from 'node:assert/strict';
import {runNesting, polygon, compactNesting, DEFAULT_NESTING_SETTINGS, shapesConflict} from '../../frontend/src/nesting/nestingEngine.ts';
const part=(id,points,extra={})=>{const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return {id,name:id,quantity:1,bounds:{minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)},outerContour:{closed:true,points:points.map(([x,y])=>({x,y}))},holes:[],...extra};};
const rect=(id,w,h,extra={})=>part(id,[[0,0],[w,0],[w,h],[0,h]],extra);
const settings={...DEFAULT_NESTING_SETTINGS,sheetWidth:102,sheetHeight:102,margin:1,spacing:1,rotations:[0,90]};
const large=part('L',[[0,0],[80,0],[80,20],[20,20],[20,80],[0,80]],{lockDirection:true});
const medium=rect('medium',70,65);
const small=rect('small',30,50,{allowedRotations:[90]});
const result=runNesting([large,medium,small],{...settings,sheetHeight:180,startCorner:'bottom-left'},{preserveOrder:true});
assert.equal(result.placedCount,3);
assert.equal(result.placements[1].partId,'small','Fill concave pocket before opening a new row');
assert.equal(result.placements[1].rotation,90);
assert(result.placements[1].y<80);
for(const corner of ['bottom-left','bottom-right','top-left','top-right']) {
 const cfg={...settings,startCorner:corner};
 const r=runNesting([rect('r',20,10,{quantity:3})],cfg,{searchStep:10});
 const first=r.placements[0];
 assert.equal(first.x,corner.endsWith('right')?81:1);
 assert.equal(first.y,corner.startsWith('top')?91:1);
 assert.equal(r.placements[1].y,first.y);
 assert(corner.endsWith('right')?r.placements[1].x<first.x:r.placements[1].x>first.x);
}
const triangle=part('triangle',[[0,0],[40,0],[0,40]]);
assert(Math.abs(polygon(triangle,45).height-40/Math.sqrt(2))<1e-7,'Bounds must follow rotated contour');
const frame=rect('frame',80,80,{holes:[{closed:true,points:[{x:10,y:10},{x:70,y:10},{x:70,y:70},{x:10,y:70}]}]});
for(const startCorner of ['bottom-left','bottom-right','top-left','top-right']) {
 const cfg={...settings,startCorner};
 const parts=[frame,rect('insert',45,30)];
 const nested=runNesting(parts,cfg,{preserveOrder:true});
 assert.equal(nested.placedCount,2);
 for(const r of [nested,compactNesting(parts,nested,cfg,true)]) {
  assert.doesNotThrow(()=>prepareExport(r,parts,[],new Map(),[],{},cfg));
  const shapes=r.placements.map(p=>{const s=polygon(parts.find(q=>q.id===p.partId),p.rotation);return {...s,points:s.points.map(q=>({x:q.x+p.x,y:q.y+p.y})),holes:s.holes.map(h=>h.map(q=>({x:q.x+p.x,y:q.y+p.y})))};});
  assert(!shapesConflict(shapes[0],shapes[1],cfg.spacing));
  for(const s of shapes) for(const p of s.points) assert(p.x>=1-1e-7&&p.y>=1-1e-7&&p.x<=101+1e-7&&p.y<=101+1e-7);
 }
}
console.log('PASS contour bounds, rotated cavity priority, four corners, translated holes and compaction');

const roll=runNesting([rect('roll',20,10,{quantity:3})],{...settings,materialType:'roll',startCorner:'top-right'});
assert.equal(roll.materialHeight,12,'Top-origin roll must trim unused length');
assert(roll.placements.every(p=>Math.abs(p.y-1)<1e-7));
console.log('PASS top-right roll trim');
