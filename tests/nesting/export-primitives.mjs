import assert from 'node:assert/strict';
import DxfParser from 'dxf-parser';
import {createDxfExport} from '../../frontend/src/dxf/nestingExport.ts';
import {createCurvesFromEntities} from '../../frontend/src/dxf/curveEngine.ts';
import {normalizeDxfEntities} from '../../frontend/src/dxf/dxfNormalizer.ts';
import {transformNestingPoint} from '../../frontend/src/nesting/nestingEngine.ts';
const color={hex:'#336699',source:'entity'};
const entities=[
{id:'line',type:'LINE',start:{x:0,y:0},end:{x:10,y:5}},
{id:'arc',type:'ARC',center:{x:0,y:0},radius:8,startAngle:0.2,endAngle:2.7},
{id:'circle',type:'CIRCLE',center:{x:0,y:0},radius:8},
{id:'ellipse',type:'ELLIPSE',center:{x:0,y:0},majorAxisEndPoint:{x:10,y:3},axisRatio:0.5,startParameter:0.2,endParameter:5},
{id:'poly',type:'LWPOLYLINE',vertices:[{x:0,y:0},{x:10,y:0},{x:10,y:10}],bulges:[0.5,0,0],closed:true},
].map(e=>({...e,layer:'CUT',color}));
const curves=createCurvesFromEntities(entities);
const part={id:'part',bounds:{minX:-20,minY:-20,maxX:20,maxY:20,width:40,height:40}};
for(const rotation of [0,45,90,180,270]){
 const placement={partId:'part',instanceId:'part-0',placed:true,x:50,y:50,rotation};
 const items=entities.map((entity,i)=>({entity,part,placement,curve:curves[i]}));
 const text=createDxfExport(items),parsed=new DxfParser().parseSync(text);
 assert.equal(parsed.entities.length,entities.length);
 const restored=createCurvesFromEntities(normalizeDxfEntities(parsed));
 for(let i=0;i<curves.length;i++){
   // A rotated full circle may start at a different parameter; compare center/radius instead.
   if(entities[i].type==='CIRCLE'){const expected=transformNestingPoint(entities[i].center,part,placement);assert(Math.hypot(parsed.entities[i].center.x-expected.x,parsed.entities[i].center.y-expected.y)<1e-7);assert.equal(parsed.entities[i].radius,8);continue;}
   assert.equal(restored[i].points.length,curves[i].points.length);
   for(let j=0;j<curves[i].points.length;j++){const p=transformNestingPoint(curves[i].points[j],part,placement),q=restored[i].points[j];assert(Math.hypot(p.x-q.x,p.y-q.y)<1e-6,entities[i].type+' rotation '+rotation);}
 }
}
console.log('PASS native LINE/ARC/CIRCLE/ELLIPSE/bulged POLYLINE export at 0/45/90/180/270 degrees.');
