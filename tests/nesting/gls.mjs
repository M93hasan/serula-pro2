import assert from 'node:assert/strict';
import Clipper from 'clipper-lib';
import {NfpCache,innerFit,SCALE} from '../../frontend/src/nesting/nfpGeometry.ts';
import {runGlsNesting,compareLayouts} from '../../frontend/src/nesting/glsNestingEngine.ts';
import {polygon,shapesConflict,DEFAULT_NESTING_SETTINGS,ANY_ROTATIONS} from '../../frontend/src/nesting/nestingEngine.ts';
import {validateLayout,ringProblem} from '../../frontend/src/nesting/validateLayout.ts';
import {prepareGeometry} from '../../frontend/src/dxf/geometryDiagnostics.ts';
import {adaptiveEntity} from '../../frontend/src/dxf/adaptiveGeometry.ts';
import {selectSheet} from '../../frontend/src/nesting/sheetResult.ts';
import {prepareExport} from '../../frontend/src/dxf/nestingExport.ts';
const part=(id,points,extra={})=>{const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return {id,name:id,quantity:1,bounds:{minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)},outerContour:{closed:true,points:points.map(([x,y])=>({x,y}))},holes:[],...extra};};
const rect=(id,w,h,extra={})=>part(id,[[0,0],[w,0],[w,h],[0,h]],extra);
const cfg={...DEFAULT_NESTING_SETTINGS,sheetWidth:102,sheetHeight:102,margin:1,spacing:1,rotations:[0,90]};
const l=part('L',[[0,0],[80,0],[80,20],[20,20],[20,80],[0,80]],{lockDirection:true});
const small=rect('small',30,50,{allowedRotations:[90]});
const cache=new NfpCache();const a=polygon(l,0),b=polygon(small,90);
const forbidden=await cache.get(a,b,0,async()=>{});
const inNfp=(x,y)=>{let winding=0;for(const ring of forbidden){const inside=Clipper.Clipper.PointInPolygon({X:x*SCALE,Y:y*SCALE},ring);if(inside===-1)return null;if(inside===1)winding+=Math.sign(Clipper.Clipper.Area(ring));}return winding!==0;};
for(let x=-55;x<90;x+=7.13)for(let y=-55;y<90;y+=6.71){const expected=shapesConflict(a,{...b,points:b.points.map(p=>({x:p.x+x,y:p.y+y}))},0);const actual=inNfp(x,y);if(actual!==null)assert.equal(actual,expected,`NFP ${x},${y}`);}
await cache.get(a,b,0,async()=>{});assert.equal(cache.hits,1);await cache.get(a,b,1,async()=>{});assert.equal(cache.misses,2);
assert.deepEqual(innerFit(b,102,102,1),{minX:1,maxX:51,minY:1,maxY:71});
for(const startCorner of ['bottom-left','bottom-right','top-left','top-right']){
 const pieces=[rect('r',20,10,{quantity:3})],settings={...cfg,startCorner};
 const run=await runGlsNesting(pieces,settings,{maxIterations:3,timeBudgetMs:3000});
 assert.equal(run.result.placedCount,3);validateLayout(pieces,settings,run.result);
 const p=run.result.placements[0];assert.equal(p.x,startCorner.endsWith('right')?81:1);assert.equal(p.y,startCorner.startsWith('top')?91:1);
}
const cavity=await runGlsNesting([l,small],{...cfg,startCorner:'bottom-left'},{timeBudgetMs:3000,maxIterations:4});
assert.equal(cavity.result.placedCount,2);assert.equal(cavity.result.sheetCount,1);assert(cavity.result.placements[1].y<80);assert.equal(cavity.result.placements[1].rotation,90);
const frame=rect('frame',80,80,{holes:[{closed:true,points:[{x:10,y:10},{x:70,y:10},{x:70,y:70},{x:10,y:70}]}]});
const holed=await runGlsNesting([frame,rect('insert',40,40)],cfg,{timeBudgetMs:3000,maxIterations:3});
assert.equal(holed.result.sheetCount,1);assert.equal(holed.result.placedCount,2);
const sheets=await runGlsNesting([rect('large',70,70,{quantity:3})],cfg,{timeBudgetMs:3000,maxIterations:4});
assert.equal(sheets.result.sheetCount,3);assert.equal(sheets.result.placedCount,3);assert.equal(selectSheet(sheets.result,1).placements.length,1);
const rollSettings={...cfg,materialType:'roll',rollWidth:102,startCorner:'top-right'};
const roll=await runGlsNesting([rect('r',20,10,{quantity:3})],rollSettings,{timeBudgetMs:3000,maxIterations:15});
assert.equal(roll.result.placedCount,3);assert.equal(roll.result.materialHeight,12);
assert(roll.penaltyUpdates>0,'GLS must actually penalize a local minimum');
const restricted=await runGlsNesting([rect('locked',120,20,{lockDirection:true})],cfg,{timeBudgetMs:500,maxIterations:4});assert.equal(restricted.result.unplacedCount,1);
const any=await runGlsNesting([rect('diagonal',40,10)],{...cfg,sheetWidth:36,sheetHeight:36,margin:0,spacing:0,rotations:ANY_ROTATIONS},{timeBudgetMs:2000,maxIterations:4});assert.equal(any.result.placedCount,1);assert(![0,90,180,270].includes(any.result.placements[0].rotation));
const signal={aborted:false};let snapshot;
const stopped=await runGlsNesting([rect('stop',10,10,{quantity:30})],cfg,{signal,timeBudgetMs:10000,onProgress:p=>{if(p.result.placedCount>0){snapshot=p.result;signal.aborted=true;}}});
assert(stopped.stopped);assert(stopped.result.placedCount>=snapshot.placedCount);validateLayout([rect('stop',10,10,{quantity:30})],cfg,stopped.result);
const circle={id:'c',type:'CIRCLE',center:{x:0,y:0},radius:100,layer:'CUT',color:{}};
for(const tolerance of [1,0.1,0.01]){const points=adaptiveEntity(circle,tolerance);for(let i=1;i<points.length;i++){const mid={x:(points[i-1].x+points[i].x)/2,y:(points[i-1].y+points[i].y)/2};assert(100-Math.hypot(mid.x,mid.y)<=tolerance+1e-8);}}
const open=prepareGeometry([{id:'open',type:'LINE',start:{x:0,y:0},end:{x:10,y:0},layer:'CUT',color:{}}]);assert(open.issues.some(i=>!i.blocking));
assert(ringProblem([{x:0,y:0},{x:10,y:10},{x:0,y:10},{x:10,y:0}]));
const invalid=part('bad',[[0,0],[10,10],[0,10],[10,0]]);await assert.rejects(()=>runGlsNesting([invalid],cfg));
const broken=structuredClone(cavity.result);broken.placements[1].x=broken.placements[0].x;broken.placements[1].y=broken.placements[0].y;assert.throws(()=>validateLayout([l,small],{...cfg,startCorner:'bottom-left'},broken));
assert(compareLayouts({...roll.result,unplacedCount:1,usedHeight:1},roll.result,rollSettings)>0);
assert.doesNotThrow(()=>prepareExport(holed.result,[frame,rect('insert',40,40)],[],new Map(),[],{},cfg));
console.log('PASS NFP nonconvex grid, IFP, cache, four corners, holes, rotation constraints, multi-sheet, roll, GLS penalties, cancellation, tolerance, independent validation');
import {createCurvesFromEntities} from '../../frontend/src/dxf/curveEngine.ts';
const quadratic={id:'quadratic',type:'SPLINE',controlPoints:[{x:0,y:0},{x:50,y:130},{x:100,y:0}],degreeOfSplineCurve:2,knotValues:[0,0,0,1,1,1],layer:'CUT',color:{}};
function pd(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
for(const tolerance of [0.001,0.1,1]){
 const points=createCurvesFromEntities([quadratic],{tolerance})[0].points;
 for(let i=0;i<=2000;i++){const t=i/2000,p={x:100*t,y:260*t*(1-t)};let error=Infinity;for(let j=1;j<points.length;j++)error=Math.min(error,pd(p,points[j-1],points[j]));assert(error<=tolerance+1e-6,`Spline chord error ${error} > ${tolerance}`);}
}
const nearOpen={id:'near-open',type:'LWPOLYLINE',vertices:[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:0.005}],closed:false,layer:'CUT',color:{}};
assert.equal(prepareGeometry([nearOpen],0.001).curves[0].closed,false,'Do not silently close small open gaps');
const malformed={...quadratic,closed:true};assert(prepareGeometry([malformed]).issues.some(i=>i.blocking));
const exactAnglePart=rect('grain',20,10,{allowedRotations:[22.5]});
const exactAngle=await runGlsNesting([exactAnglePart],{...cfg,rotations:ANY_ROTATIONS},{timeBudgetMs:500,maxIterations:6});assert.equal(exactAngle.result.placements[0].rotation,22.5);
const frameShape=polygon(frame,0),insertShape=polygon(rect('i',40,40),0),holeNfp=await cache.get(frameShape,insertShape,0,async()=>{});
for(let x=-45;x<90;x+=6.7)for(let y=-45;y<90;y+=7.1){let winding=0,onEdge=false;for(const ring of holeNfp){const v=Clipper.Clipper.PointInPolygon({X:x*SCALE,Y:y*SCALE},ring);if(v===-1)onEdge=true;if(v===1)winding+=Math.sign(Clipper.Clipper.Area(ring));}if(!onEdge)assert.equal(winding!==0,shapesConflict(frameShape,{...insertShape,points:insertShape.points.map(p=>({x:p.x+x,y:p.y+y}))},0),'NFP must preserve holes');}
assert.throws(()=>prepareExport(sheets.result,[rect('large',70,70,{quantity:3})],[],new Map(),[],{},cfg),'Never merge separate sheets into one DXF');
console.log('PASS dense spline tolerance, open gaps, exact per-part angles, holed NFP and multi-sheet export guard');
const envelopePart=rect('approx',20,10,{quantity:2});envelopePart.outerContour.curves=[{approximationTolerance:0.1}];
const envelopeRun=await runGlsNesting([envelopePart],cfg,{timeBudgetMs:500,maxIterations:8});
const envelopeValidation=validateLayout([envelopePart],cfg,envelopeRun.result);assert(envelopeValidation.minimumGap>=1.2-1e-7);assert(envelopeRun.result.placements.every(p=>p.x>=1.1-1e-7&&p.y>=1.1-1e-7));
console.log('PASS native-curve tolerance envelope without double kerf');
// Mixed sizes previously repeated grouped seeds and occupied 220 mm.
// Exercise the production engine, with GLS disabled to isolate seed/settling quality.
const mixedSizes=[[67,41],[61,55],[25,57],[49,44],[17,31],[26,51],[66,21],[29,40],[36,49],[35,41]];
const mixedParts=mixedSizes.map(([w,h],i)=>rect(`mixed-${i}`,w,h));
for(const materialType of ['roll','sheet'])for(const startCorner of ['bottom-left','bottom-right','top-left','top-right']){
 const settings={...cfg,materialType,rollWidth:100,sheetWidth:100,sheetHeight:230,rotations:[0],startCorner};
 const packed=await runGlsNesting(mixedParts,settings,{maxIterations:0,timeBudgetMs:3000});
 assert.equal(packed.result.placedCount,mixedParts.length);
 assert.equal(packed.result.sheetCount,1);
 assert(packed.result.usedHeight<=217.001,`Mixed-size packing remains too long: ${packed.result.usedHeight}`);
 validateLayout(mixedParts,settings,packed.result);
}
console.log('PASS mixed-size compact packing in four corners on sheets and rolls');
