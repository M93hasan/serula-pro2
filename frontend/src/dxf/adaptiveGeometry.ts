import type { DxfPoint, SerulaDxfEntity } from './dxfTypes';

const TAU = Math.PI * 2;
const distance = (a: DxfPoint, b: DxfPoint) => Math.hypot(a.x-b.x,a.y-b.y);
function deviation(p: DxfPoint, a: DxfPoint, b: DxfPoint) {
  const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;
  const t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
/** RDP spends half the tolerance budget removing oversampling within knot spans.
 * The evaluator spends the other half; bends above the budget are retained. */
export function simplifyCurve(points:DxfPoint[],tolerance:number):DxfPoint[] {
  if(points.length<=2)return points;
  const kept=new Set([0,points.length-1]),stack:[number,number][]=[[0,points.length-1]];
  while(stack.length){const [a,b]=stack.pop()!;let largest=tolerance,index=-1;
    for(let i=a+1;i<b;i++){const error=deviation(points[i],points[a],points[b]);if(error>largest){largest=error;index=i;}}
    if(index>=0){kept.add(index);stack.push([a,index],[index,b]);}
  }
  return [...kept].sort((a,b)=>a-b).map(i=>points[i]);
}
function sample(fn:(t:number)=>DxfPoint, breaks:number[], tolerance:number):DxfPoint[] {
  const output:DxfPoint[]=[fn(breaks[0])];
  function split(a:number,b:number,p:DxfPoint,q:DxfPoint,depth:number) {
    const ts=[a+(b-a)/4,(a+b)/2,a+3*(b-a)/4], ps=ts.map(fn);
    if (![p,q,...ps].every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y))) throw new Error('Eğri üzerinde geçersiz koordinat.');
    if (Math.max(...ps.map(v=>deviation(v,p,q)))>tolerance) {
      if(depth>=24 || output.length>20000) throw new Error('Eğri toleransı sağlanamadı; toleransı veya kaynak DXF geometrisini kontrol edin.');
      split(a,ts[1],p,ps[1],depth+1);split(ts[1],b,ps[1],q,depth+1);
    } else output.push(q);
  }
  for(let i=1;i<breaks.length;i++) split(breaks[i-1],breaks[i],output.at(-1)!,fn(breaks[i]),0);
  return output;
}
function arc(center:DxfPoint,r:number,start:number,sweep:number,tol:number) {
  if(!Number.isFinite(r)||r<=0||!Number.isFinite(sweep)) throw new Error('Geçersiz yay yarıçapı/açısı.');
  const step=2*Math.acos(Math.max(-1,1-Math.min(tol,r)/r));
  const count=Math.max(4,Math.ceil(Math.abs(sweep)/Math.min(Math.PI/2,step)));
  if(count>20000) throw new Error('Yay için tolerans çok küçük.');
  return Array.from({length:count+1},(_,i)=>({x:center.x+r*Math.cos(start+sweep*i/count),y:center.y+r*Math.sin(start+sweep*i/count)}));
}

/** Input entities have already been normalized to mm. No further unit scaling. */
export function adaptiveEntity(entity:SerulaDxfEntity,tolerance:number):DxfPoint[]|null {
  if(!Number.isFinite(tolerance)||tolerance<0.0005||tolerance>5) throw new Error('Eğri toleransı 0,001–5 mm arasında olmalı.');
  const type=entity.type.toUpperCase();
  if(type==='CIRCLE'||type==='ARC') {
    if(!entity.center||!entity.radius) throw new Error('Yay merkezi/yarıçapı eksik.');
    const start=type==='CIRCLE'?0:entity.startAngle??0;
    let end=type==='CIRCLE'?TAU:entity.endAngle??TAU;while(end<start)end+=TAU;
    return arc(entity.center,entity.radius,start,end-start,tolerance);
  }
  if(type==='ELLIPSE') {
    if(!entity.center||!entity.majorAxisEndPoint) throw new Error('Elips ekseni/merkezi eksik.');
    const {center,majorAxisEndPoint:axis}=entity,ratio=entity.axisRatio??1;
    if(ratio<=0||ratio>1||!Number.isFinite(ratio))throw new Error('Geçersiz elips oranı.');
    const start=entity.startParameter??0;let end=entity.endParameter??TAU;while(end<start)end+=TAU;
    const radius=Math.hypot(axis.x,axis.y);
    const count=Math.max(8,Math.ceil((end-start)/(2*Math.acos(Math.max(-1,1-Math.min(tolerance,radius)/radius)))));
    if(!Number.isFinite(count)||count>20000)throw new Error('Geçersiz elips veya tolerans.');
    return Array.from({length:count+1},(_,i)=>{const t=start+(end-start)*i/count;return {x:center.x+axis.x*Math.cos(t)-axis.y*ratio*Math.sin(t),y:center.y+axis.y*Math.cos(t)+axis.x*ratio*Math.sin(t)};});
  }
  if(type==='SPLINE') {
    const cp=entity.controlPoints,k=entity.knotValues,d=entity.degreeOfSplineCurve??3;
    if(!cp||!k||d<1||d>=cp.length||k.length!==cp.length+d+1||k.some((v,i)=>!Number.isFinite(v)||(i>0&&v<k[i-1])))throw new Error('Geçersiz spline kontrol noktası/derece/knot dizisi.');
    const weights=entity.weights??cp.map(()=>1);
    if(weights.length!==cp.length||weights.some(w=>!Number.isFinite(w)||w<=0))throw new Error('Geçersiz spline ağırlıkları.');
    const start=k[d],end=k[cp.length];if(end<=start)throw new Error('Boş spline parametre aralığı.');
    const evaluate=(parameter:number):DxfPoint=>{
      const t=Math.min(parameter,end);let span=d;
      while(span<cp.length-1&&t>=k[span+1])span++;
      const v=Array.from({length:d+1},(_,j)=>{const i=span-d+j,w=weights[i];return {x:cp[i].x*w,y:cp[i].y*w,w};});
      for(let r=1;r<=d;r++)for(let j=d;j>=r;j--){const i=span-d+j,den=k[i+d-r+1]-k[i],alpha=den?(t-k[i])/den:0;v[j]={x:(1-alpha)*v[j-1].x+alpha*v[j].x,y:(1-alpha)*v[j-1].y+alpha*v[j].y,w:(1-alpha)*v[j-1].w+alpha*v[j].w};}
      return {x:v[d].x/v[d].w,y:v[d].y/v[d].w};
    };
    const spans=[...new Set(k.filter(t=>t>=start&&t<=end))];
    const breaks=spans.flatMap((a,i)=>i===spans.length-1?[a]:Array.from({length:8},(_,j)=>a+(spans[i+1]-a)*j/8));
    return sample(evaluate,breaks,tolerance);
  }
  if(type==='POLYLINE'||type==='LWPOLYLINE') {
    const vertices=entity.vertices;if(!vertices||vertices.length<2)throw new Error('Polyline noktaları eksik.');
    const out:DxfPoint[]=[];const count=entity.closed?vertices.length:vertices.length-1;
    for(let i=0;i<count;i++) {
      const a=vertices[i],b=vertices[(i+1)%vertices.length],bulge=entity.bulges?.[i]??0;
      let segment:DxfPoint[];
      if(Math.abs(bulge)<1e-12)segment=[a,b];
      else {
        const chord=distance(a,b);if(chord<1e-10)throw new Error('Sıfır uzunluklu bulge kenarı.');
        const factor=(1-bulge*bulge)/(4*bulge);
        const center={x:(a.x+b.x)/2-(b.y-a.y)*factor,y:(a.y+b.y)/2+(b.x-a.x)*factor};
        segment=arc(center,chord*(1+bulge*bulge)/(4*Math.abs(bulge)),Math.atan2(a.y-center.y,a.x-center.x),4*Math.atan(bulge),tolerance);
        segment[0]=a;segment[segment.length-1]=b;
      }
      out.push(...(i?segment.slice(1):segment));
    }
    return out;
  }
  return null;
}
