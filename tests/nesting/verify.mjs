import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { loadParts } from './fixture.mjs';
import { runNesting, DEFAULT_NESTING_SETTINGS, polygonsConflict, transformNestingPoint } from '../../frontend/src/nesting/nestingEngine.ts';
import { runAdvancedNesting, isBetterResult } from '../../frontend/src/nesting/advancedNestingEngine.ts';
const parts = loadParts();
assert.equal(parts.length, 32);
const original = JSON.stringify(parts);
const reports = [];
// Independent exhaustive segment distances: no production spatial tree or collision helper.
function pointDistance(p, a, b) {
  const dx=b.x-a.x, dy=b.y-a.y, length=dx*dx+dy*dy;
  const t=length ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)) : 0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
function cross(a,b,c) {return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function contains(p, points) {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[i],b=points[j];
    if((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
function validate(result, settings, source=parts) {
  const placed=result.placements.filter(p=>p.placed);
  assert.equal(result.placedCount,placed.length);
  assert.equal(result.totalCount,result.placedCount+result.unplacedCount);
  assert.equal(new Set(result.placements.map(p=>p.instanceId)).size,result.totalCount);
  const polygons=placed.map(p=>{
    const part=source.find(part=>part.id===p.partId);
    assert(settings.rotations.includes(p.rotation));
    if(part.lockDirection) assert.equal(p.rotation,0);
    if(part.allowedRotations) assert(part.allowedRotations.includes(p.rotation));
    const points=part.outerContour.points.map(point=>transformNestingPoint(point,part,p));
    for(const point of points) {
      assert(point.x>=settings.margin-1e-7 && point.x<=result.materialWidth-settings.margin+1e-7);
      assert(point.y>=settings.margin-1e-7 && point.y<=result.materialHeight-settings.margin+1e-7);
    }
    return points;
  });
  let minimum=Infinity;
  for(let i=0;i<polygons.length;i++) for(let j=i+1;j<polygons.length;j++) {
    const a=polygons[i],b=polygons[j];
    assert(!contains(a[0],b) && !contains(b[0],a),'Polygon containment');
    for(let k=0;k<a.length;k++) for(let l=0;l<b.length;l++) {
      const p=a[k],q=a[(k+1)%a.length],r=b[l],s=b[(l+1)%b.length];
      assert(!(cross(p,q,r)*cross(p,q,s)<0 && cross(r,s,p)*cross(r,s,q)<0),'Crossing edges');
      minimum=Math.min(minimum,pointDistance(p,r,s),pointDistance(q,r,s),pointDistance(r,p,q),pointDistance(s,p,q));
    }
  }
  assert(minimum+1e-7>=settings.spacing,`Minimum gap ${minimum} < ${settings.spacing}`);
  assert(result.efficiency>=0 && result.efficiency<=100);
  return minimum;
}
for(const spacing of [0.3,0.5,1]) {
  const settings={...DEFAULT_NESTING_SETTINGS,spacing};
  const advanced=runAdvancedNesting(parts,settings);
  const minimum=validate(advanced.result,settings);
  assert.equal(advanced.result.placedCount,32);
  reports.push({test:`sheet spacing ${spacing}`, ...advanced, result:{...advanced.result,placements:undefined},minimum});
  console.log(JSON.stringify(reports.at(-1)));
}
for(const startCorner of ['bottom-left','bottom-right','top-left','top-right']) {
  const settings={...DEFAULT_NESTING_SETTINGS,startCorner};
  const result=runNesting(parts,settings);
  const minimum=validate(result,settings);
  console.log('Corner passed',startCorner,result.placedCount,minimum);
}
for(const settings of [
  {...DEFAULT_NESTING_SETTINGS,rotations:[0]},
  {...DEFAULT_NESTING_SETTINGS,materialType:'roll',rollWidth:1000,startCorner:'top-right'},
]) {
  const result=runNesting(parts,settings);
  validate(result,settings);
  if(settings.materialType==='roll') assert.equal(result.placedCount,32);
  console.log('Mode passed',settings.materialType,settings.rotations,result.placedCount,result.usedHeight);
}
const locked=parts.slice(0,3).map(p=>({...p,lockDirection:true,quantity:2}));
const result=runNesting(locked,DEFAULT_NESTING_SETTINGS);
validate(result,DEFAULT_NESTING_SETTINGS,locked);
assert.equal(result.totalCount,6);
const restricted=parts.slice(0,2).map(p=>({...p,allowedRotations:[90]}));
assert.equal(runNesting(restricted,{...DEFAULT_NESTING_SETTINGS,rotations:[0]}).placedCount,0);
assert.throws(()=>runNesting(parts,{...DEFAULT_NESTING_SETTINGS,spacing:-1}));
assert.throws(()=>runNesting(parts,{...DEFAULT_NESTING_SETTINGS,rotations:[]}));
const square=[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}];
assert(polygonsConflict(square,square.map(p=>({x:p.x+10,y:p.y})),0));
assert(polygonsConflict(square,square.map(p=>({x:p.x+10.29,y:p.y})),0.3));
assert(!polygonsConflict(square,square.map(p=>({x:p.x+10.31,y:p.y})),0.3));
assert(isBetterResult({...result,placedCount:32,usedHeight:999},{...result,placedCount:31,usedHeight:100}));
assert.equal(JSON.stringify(parts),original,'Input geometry mutated');
writeFileSync('storage/nesting-test-report.json',JSON.stringify(reports,null,2));
console.log('All nesting checks passed.');
