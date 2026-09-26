import { isFreeRotation } from './rotationPolicy';
import Clipper from 'clipper-lib';
import type { DxfPoint, NestingPart } from '../dxf/dxfTypes';
import type { NestingResult, NestingSettings } from './nestingEngine';
import { booleanPaths, shapePaths, SCALE } from './nfpGeometry';
import { geometryAllowance } from './geometryAllowance';

const cross=(a:DxfPoint,b:DxfPoint,c:DxfPoint)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function distance(p:DxfPoint,a:DxfPoint,b:DxfPoint){const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function intersects(a:DxfPoint,b:DxfPoint,c:DxfPoint,d:DxfPoint){
  if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return true;
  return Math.min(distance(a,c,d),distance(b,c,d),distance(c,a,b),distance(d,a,b))<1e-9;
}
export function ringProblem(input:DxfPoint[]):string|null {
  const points=input.slice();if(points.length>1&&Math.hypot(points[0].x-points.at(-1)!.x,points[0].y-points.at(-1)!.y)<1e-8)points.pop();
  if(points.length<3||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return 'eksik/geçersiz nokta';
  if(points.some(p=>Math.max(Math.abs(p.x),Math.abs(p.y))>1e7))return 'koordinat sayısal güvenlik aralığı dışında';
  const edges=points.map((a,i)=>{const b=points[(i+1)%points.length];return {a,b,i,minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y)};}).sort((a,b)=>a.minX-b.minX);
  let active:typeof edges=[];
  for(const edge of edges){
    if(Math.hypot(edge.a.x-edge.b.x,edge.a.y-edge.b.y)<1e-9)return 'sıfır uzunluklu kenar';
    active=active.filter(other=>other.maxX>=edge.minX-1e-9);
    for(const other of active){
      const delta=Math.abs(edge.i-other.i);if(delta===1||delta===points.length-1||other.maxY<edge.minY-1e-9||other.minY>edge.maxY+1e-9)continue;
      if(intersects(edge.a,edge.b,other.a,other.b))return 'kendiyle kesişen kontur';
    }
    active.push(edge);
  }
  const area=points.reduce((sum,p,i)=>sum+p.x*points[(i+1)%points.length].y-p.y*points[(i+1)%points.length].x,0);
  return Math.abs(area)<1e-7?'sıfır alan':null;
}
export function validateParts(parts:NestingPart[]) {
  const ids=new Set<string>();
  for(const p of parts){
    if(ids.has(p.id))throw new Error(`Tekrarlanan parça kimliği: ${p.id}`);ids.add(p.id);
    if(!Number.isSafeInteger(p.quantity)||p.quantity<0||p.quantity>10000)throw new Error(`${p.name}: geçersiz adet.`);
    if(p.allowedRotations?.some(r=>!Number.isFinite(r)||r<0||r>=360))throw new Error(`${p.name}: geçersiz dönüş kısıtı.`);
    for(const ring of [p.outerContour,...p.holes]){
      const issue=ring.closed?ringProblem(ring.points):'açık kontur';if(issue)throw new Error(`${p.name}: ${issue}.`);
    }
    const outer=shapePaths({points:p.outerContour.points,holes:[],width:0,height:0});
    for(let i=0;i<p.holes.length;i++){
      const hole=shapePaths({points:p.holes[i].points,holes:[],width:0,height:0});
      if(booleanPaths(hole,outer,Clipper.ClipType.ctDifference).some(r=>Math.abs(Clipper.Clipper.Area(r))>1))throw new Error(`${p.name}: iç kontur dış sınırın dışında.`);
      const ring=p.holes[i].points,edge=p.outerContour.points;
      for(let a=0;a<ring.length;a++)for(let b=0;b<edge.length;b++)if(intersects(ring[a],ring[(a+1)%ring.length],edge[b],edge[(b+1)%edge.length]))throw new Error(`${p.name}: iç kontur dış sınıra değiyor/kesişiyor.`);
      for(let j=0;j<i;j++)if(booleanPaths(hole,shapePaths({points:p.holes[j].points,holes:[],width:0,height:0}),Clipper.ClipType.ctIntersection).length)throw new Error(`${p.name}: iç konturlar kesişiyor.`);
    }
  }
}

/** Separate implementation from the search's fits/shapesConflict and transforms:
 * Boolean solid intersection + exhaustive segment distances, including hole edges. */
export function validateLayout(parts:NestingPart[],requestedSettings:NestingSettings,result:NestingResult) {
  const allowance=geometryAllowance(parts),settings={...requestedSettings,spacing:requestedSettings.spacing+2*allowance,margin:requestedSettings.margin+allowance};
  const map=new Map(parts.map(p=>[p.id,p])),counts=new Map<string,number>(),seen=new Set<string>();
  const actual=result.placements.filter(p=>p.placed);
  if(result.totalCount!==parts.reduce((s,p)=>s+p.quantity,0)||result.placements.length!==result.totalCount||actual.length!==result.placedCount||result.unplacedCount!==result.totalCount-actual.length)throw new Error('Sonuç adetleri tutarsız.');
  const shapes=actual.map(placement=>{
    const part=map.get(placement.partId);if(!part)throw new Error('Bilinmeyen parça.');
    const angle=placement.rotation;
    const free=isFreeRotation(settings.rotations);
    if(!Number.isFinite(angle)||angle<0||angle>=360||(!free&&!settings.rotations.includes(angle))||(free&&!part.allowedRotations&&Math.abs(angle-Math.round(angle))>1e-8)||(part.lockDirection&&angle!==0)||(part.allowedRotations&&!part.allowedRotations.includes(angle)))throw new Error('Dönüş kısıtı ihlali.');
    const c=Math.cos(angle*Math.PI/180),s=Math.sin(angle*Math.PI/180);
    const rotate=(p:DxfPoint)=>({x:(p.x-part.bounds.minX)*c-(p.y-part.bounds.minY)*s,y:(p.x-part.bounds.minX)*s+(p.y-part.bounds.minY)*c});
    const outer=part.outerContour.points.map(rotate),minX=Math.min(...outer.map(p=>p.x)),minY=Math.min(...outer.map(p=>p.y));
    const move=(p:DxfPoint)=>({x:p.x-minX+placement.x,y:p.y-minY+placement.y});
    const points=outer.map(move),holes=part.holes.map(h=>h.points.map(rotate).map(move));
    if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<settings.margin-1e-7||p.y<settings.margin-1e-7||p.x>result.materialWidth-settings.margin+1e-7||p.y>result.materialHeight-settings.margin+1e-7))throw new Error('Malzeme sınırı/kenar payı ihlali.');
    const sheet=placement.sheetIndex??0;
    if(!Number.isInteger(sheet)||sheet<0||sheet>=(result.sheetCount??1))throw new Error('Geçersiz plaka numarası.');
    return {points,holes,width:0,height:0,sheet,minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))};
  });
  for(const placement of result.placements){if(!map.has(placement.partId)||seen.has(placement.instanceId))throw new Error('Eksik/tekrarlanan parça kimliği.');seen.add(placement.instanceId);counts.set(placement.partId,(counts.get(placement.partId)??0)+1);}
  for(const part of parts)if((counts.get(part.id)??0)!==part.quantity)throw new Error(`${part.name}: istenen adet korunmadı.`);
  let minimumGap=Infinity;
  for(let i=0;i<shapes.length;i++)for(let j=0;j<i;j++){
    const a=shapes[i],b=shapes[j];if(a.sheet!==b.sheet)continue;
    const boxDistance=Math.hypot(Math.max(0,a.minX-b.maxX,b.minX-a.maxX),Math.max(0,a.minY-b.maxY,b.minY-a.maxY));
    if(boxDistance>Math.max(settings.spacing,minimumGap))continue;
    const overlap=booleanPaths(shapePaths(a),shapePaths(b),Clipper.ClipType.ctIntersection);
    if(Math.abs(overlap.reduce((sum,p)=>sum+Clipper.Clipper.Area(p),0))/(SCALE*SCALE)>1e-7)throw new Error('Parçalar çakışıyor.');
    for(const ar of [a.points,...a.holes])for(const br of [b.points,...b.holes])for(let k=0;k<ar.length;k++)for(let l=0;l<br.length;l++){
      const p=ar[k],q=ar[(k+1)%ar.length],r=br[l],s=br[(l+1)%br.length];
      const d=Math.min(distance(p,r,s),distance(q,r,s),distance(r,p,q),distance(s,p,q));minimumGap=Math.min(minimumGap,d);
      if(d+1e-7<settings.spacing)throw new Error('Kesim aralığı yetersiz.');
    }
  }
  return {valid:true as const,complete:result.unplacedCount===0,minimumGap:Number.isFinite(minimumGap)?minimumGap:null};
}
