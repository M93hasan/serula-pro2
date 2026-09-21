import assert from 'node:assert/strict';
import { ANY_ROTATIONS, DEFAULT_NESTING_SETTINGS, polygon, runNesting, transformNestingPoint } from '../../frontend/src/nesting/nestingEngine.ts';
const rectangle = (id, width, height) => ({
  id, name:id, quantity:1, bounds:{minX:0,minY:0,maxX:width,maxY:height,width,height},
  outerContour:{closed:true,points:[{x:0,y:0},{x:width,y:0},{x:width,y:height},{x:0,y:height}]}, holes:[],
});
const part = rectangle('rect',40,10);
const base = {...DEFAULT_NESTING_SETTINGS,sheetWidth:36,sheetHeight:36,margin:0,spacing:0,startCorner:'bottom-left'};
for (const [name, rotations, expected] of [
  ['0°',[0],false], ['0°–90°',[0,90],false], ['Any',ANY_ROTATIONS,true],
]) {
  const result=runNesting([part],{...base,rotations});
  assert.equal(result.placedCount,expected ? 1 : 0,name);
  if(expected) {
    const placement=result.placements[0];
    assert(![0,90,180,270].includes(placement.rotation),'Any must use a non-orthogonal angle');
    const shape=polygon(part,placement.rotation);
    const preview=part.outerContour.points.map(p=>transformNestingPoint(p,part,placement));
    assert(preview.every(p=>p.x>=-1e-7 && p.x<=36+1e-7 && p.y>=-1e-7 && p.y<=36+1e-7));
    assert(Math.abs(Math.max(...preview.map(p=>p.x))-Math.min(...preview.map(p=>p.x))-shape.width)<1e-7);
    assert(Math.abs(Math.max(...preview.map(p=>p.y))-Math.min(...preview.map(p=>p.y))-shape.height)<1e-7);
  }
  console.log(`${name}: ${result.placedCount} placed, angle ${result.placements[0].rotation}°`);
}
const wide={...base,sheetWidth:50,sheetHeight:50};
const ninetyOnly=runNesting([part],{...base,sheetWidth:20,sheetHeight:50,rotations:[0,90]});
assert.equal(ninetyOnly.placedCount,1);
assert.equal(ninetyOnly.placements[0].rotation,90);
for(const [name,rotations] of [['0°',[0]],['0°–90°',[0,90]],['Any',ANY_ROTATIONS]]) {
 const result=runNesting([part],{...wide,rotations});
 assert.equal(result.placedCount,1);
 assert(rotations.includes(result.placements[0].rotation));
 console.log(`${name}: preview angle ${result.placements[0].rotation}°`);
}
