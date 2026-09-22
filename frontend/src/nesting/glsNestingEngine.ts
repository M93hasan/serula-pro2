import Clipper from 'clipper-lib';
import type { NestingPart } from '../dxf/dxfTypes';
import { calculateAbsoluteArea } from '../dxf/contourEngine';
import { polygon, fits, createPartInstances, validateSettings, type NestingPolygon, type NestingPlacement, type NestingResult, type NestingSettings } from './nestingEngine';
import { booleanPaths, fromPath, innerFit, NfpCache, SCALE, translatedPaths } from './nfpGeometry';
import { validateLayout, validateParts } from './validateLayout';
import { geometryAllowance } from './geometryAllowance';

type Instance=ReturnType<typeof createPartInstances>[number];
type Position={instance:Instance;shape:NestingPolygon;x:number;y:number;rotation:number;sheet:number};
export type SearchProgress={result:NestingResult;elapsedMs:number;iterations:number;penaltyUpdates:number;phase:string;cacheHits:number;cacheMisses:number};
export type SearchOptions={timeBudgetMs?:number;signal?:{aborted:boolean};onProgress?:(progress:SearchProgress)=>void;maxIterations?:number;cache?:NfpCache};
export type SearchOutcome=SearchProgress & {stopped:boolean;validation:ReturnType<typeof validateLayout>};
class SearchStopped extends Error {}
class PhaseExpired extends Error {}
const area=(p:NestingPart)=>calculateAbsoluteArea(p.outerContour.points)-p.holes.reduce((s,h)=>s+calculateAbsoluteArea(h.points),0);
const isFree=(settings:NestingSettings)=>settings.rotations.length===72&&settings.rotations.every((a,i)=>a===i*5);
function allowed(part:NestingPart,settings:NestingSettings){const angles=isFree(settings)&&part.allowedRotations?part.allowedRotations:settings.rotations;return angles.filter(r=>(!part.lockDirection||r===0)&&(!part.allowedRotations||part.allowedRotations.includes(r)));}
const positioned=(p:Position)=>({...p.shape,x:p.x,y:p.y,points:p.shape.points.map(q=>({x:q.x+p.x,y:q.y+p.y})),holes:p.shape.holes.map(h=>h.map(q=>({x:q.x+p.x,y:q.y+p.y})))});

/** Lexicographic material objective: never exchange missing pieces for efficiency. */
export function compareLayouts(a:NestingResult,b:NestingResult,settings:NestingSettings):number {
  if(a.unplacedCount!==b.unplacedCount)return a.unplacedCount-b.unplacedCount;
  if(settings.materialType==='sheet'&&(a.sheetCount??1)!==(b.sheetCount??1))return (a.sheetCount??1)-(b.sheetCount??1);
  const ah=settings.materialType==='sheet'?a.sheets?.at(-1)?.usedHeight??a.usedHeight:a.usedHeight;
  const bh=settings.materialType==='sheet'?b.sheets?.at(-1)?.usedHeight??b.usedHeight:b.usedHeight;
  return ah-bh;
}

export async function runGlsNesting(parts:NestingPart[],requestedSettings:NestingSettings,options:SearchOptions={}):Promise<SearchOutcome> {
  const start=performance.now(),allowance=geometryAllowance(parts);
  const settings={...requestedSettings,spacing:requestedSettings.spacing+2*allowance,margin:requestedSettings.margin+allowance};
  const budget=options.timeBudgetMs??settings.timeBudgetMs??10000;
  if(!Number.isFinite(budget)||budget<1||budget>300000)throw new Error('Süre bütçesi 1–300000 ms arasında olmalı.');
  validateSettings(requestedSettings);validateSettings(settings);validateParts(parts);
  const instances=createPartInstances(parts),width=settings.materialType==='roll'?settings.rollWidth:settings.sheetWidth;
  const height=settings.materialType==='roll'?Math.max(settings.margin*2+1,instances.reduce((v,{part})=>v+Math.hypot(part.bounds.width,part.bounds.height)+settings.spacing,settings.margin*2)):settings.sheetHeight;
  const right=settings.startCorner.endsWith('right'),top=settings.startCorner.startsWith('top');
  const cache=options.cache??new NfpCache(),shapes=new Map<string,NestingPolygon>();
  let iterations=0,penaltyUpdates=0,lastYield=start,lastPublish=-Infinity,phase='Başlangıç',stopped=false,phaseDeadline=Infinity,seedStep=0;
  const checkpoint=async()=>{
    if(options.signal?.aborted||performance.now()-start>=budget)throw new SearchStopped();
    if(performance.now()>phaseDeadline)throw new PhaseExpired();
    if(performance.now()-lastYield>12){await new Promise<void>(resolve=>setTimeout(resolve,0));lastYield=performance.now();if(options.signal?.aborted||lastYield-start>=budget)throw new SearchStopped();}
  };
  const shapeFor=(part:NestingPart,rotation:number)=>{
    const key=`${part.id}:${rotation}`;let shape=shapes.get(key);
    if(!shape){const original=polygon(part,rotation);const reflect=(p:{x:number;y:number})=>({x:right?original.width-p.x:p.x,y:top?original.height-p.y:p.y});shape={...original,points:original.points.map(reflect),holes:original.holes.map(h=>h.map(reflect))};shapes.set(key,shape);}return shape;
  };
  const resultOf=(positions:Position[]):NestingResult=>{
    const placedMap=new Map(positions.map(p=>[p.instance.instanceId,p])),sheetCount=positions.length?Math.max(...positions.map(p=>p.sheet))+1:0;
    const sheets=Array.from({length:sheetCount},(_,index)=>{const ps=positions.filter(p=>p.sheet===index);return {index,usedHeight:ps.reduce((v,p)=>Math.max(v,p.y+p.shape.height),0),usedArea:ps.reduce((v,p)=>v+area(p.instance.part),0),placedCount:ps.length};});
    const usedHeight=sheets.at(-1)?.usedHeight??0,materialHeight=settings.materialType==='roll'?Math.max(settings.margin*2,usedHeight+settings.margin):height;
    const placements:NestingPlacement[]=instances.map(instance=>{const p=placedMap.get(instance.instanceId);return p?{partId:instance.part.id,instanceId:instance.instanceId,placed:true,x:right?width-p.x-p.shape.width:p.x,y:top?materialHeight-p.y-p.shape.height:p.y,rotation:p.rotation,sheetIndex:p.sheet}:{partId:instance.part.id,instanceId:instance.instanceId,placed:false,x:0,y:0,rotation:0};});
    const usedArea=positions.reduce((v,p)=>v+area(p.instance.part),0),materialArea=width*materialHeight*(settings.materialType==='sheet'?sheetCount:1);
    return {placements,placedCount:positions.length,unplacedCount:instances.length-positions.length,totalCount:instances.length,usedHeight,usedWidth:positions.reduce((v,p)=>Math.max(v,p.x+p.shape.width),0),usedArea,materialWidth:width,materialHeight,materialArea,efficiency:materialArea?100*usedArea/materialArea:0,margin:requestedSettings.margin,sheetCount,sheets};
  };
  let bestPositions:Position[]=[],best=resultOf([]);
  const publish=(force=false)=>{if(!force&&performance.now()-lastPublish<200)return;lastPublish=performance.now();options.onProgress?.({result:best,elapsedMs:performance.now()-start,iterations,penaltyUpdates,phase,cacheHits:cache.hits,cacheMisses:cache.misses});};
  const keep=(positions:Position[])=>{
    const result=resultOf(positions);
    if(compareLayouts(result,best,settings)<-1e-7){validateLayout(parts,requestedSettings,result);best=result;bestPositions=[...positions];publish();}
  };
  const find=async(instance:Instance,positions:Position[],sheet:number,ceiling=height,angles=allowed(instance.part,settings),quick=false):Promise<Position|undefined>=>{
    const others=positions.filter(p=>p.sheet===sheet),world=others.map(positioned);
    let bestPosition:Position|undefined,bestHeight=Infinity;
    for(const rotation of angles){
      await checkpoint();const shape=shapeFor(instance.part,rotation),ifp=innerFit(shape,width,Math.min(height,ceiling),settings.margin);
      if(ifp.maxX<ifp.minX-1e-8||ifp.maxY<ifp.minY-1e-8)continue;
      const rectangle=[{X:Math.ceil(ifp.minX*SCALE),Y:Math.ceil(ifp.minY*SCALE)},{X:Math.floor(ifp.maxX*SCALE),Y:Math.ceil(ifp.minY*SCALE)},{X:Math.floor(ifp.maxX*SCALE),Y:Math.floor(ifp.maxY*SCALE)},{X:Math.ceil(ifp.minX*SCALE),Y:Math.floor(ifp.maxY*SCALE)}];
      const forbidden:Clipper.Paths=[];
      if(!quick)for(const other of others){const nfp=await cache.get(other.shape,shape,settings.spacing,checkpoint);forbidden.push(...translatedPaths(nfp,other.x,other.y));}
      const free=forbidden.length?booleanPaths([rectangle],forbidden,Clipper.ClipType.ctDifference):[rectangle];
      const candidates=free.flatMap(fromPath);
      // Degenerate IFP (exact fit in one dimension) has no polygon area.
      candidates.push(...fromPath(rectangle));
      if(quick){
        const gap=settings.spacing+0.000001,xs=new Set([ifp.minX,ifp.maxX]),ys=new Set([ifp.minY,ifp.maxY]);
        if(seedStep)for(let x=ifp.minX;x<=ifp.maxX;x+=seedStep)xs.add(x);
        for(const other of others){
          for(const x of [other.x,other.x+other.shape.width+gap,other.x-shape.width-gap,other.x+other.shape.width-shape.width])xs.add(x);
          for(const y of [other.y,other.y+other.shape.height+gap,other.y-shape.height-gap,other.y+other.shape.height-shape.height])ys.add(y);
          for(const ring of [other.shape.points,...other.shape.holes])for(let i=0;i<ring.length;i+=Math.max(1,Math.ceil(ring.length/32))){
            for(const x of [other.x+ring[i].x+gap,other.x+ring[i].x-shape.width-gap])for(const y of [other.y+ring[i].y+gap,other.y+ring[i].y-shape.height-gap])candidates.push({x,y});
          }
        }
        for(const y of ys)for(const x of xs)if(x>=ifp.minX&&x<=ifp.maxX&&y>=ifp.minY&&y<=ifp.maxY)candidates.push({x,y});
      }
      if(ifp.maxX-ifp.minX<1e-7||ifp.maxY-ifp.minY<1e-7){
        for(const ring of forbidden)for(let i=0;i<ring.length;i++){
          const a=ring[i],b=ring[(i+1)%ring.length];
          for(const x of [ifp.minX,ifp.maxX])if(b.X!==a.X){const t=(x*SCALE-a.X)/(b.X-a.X);if(t>=0&&t<=1)candidates.push({x,y:(a.Y+t*(b.Y-a.Y))/SCALE});}
          for(const y of [ifp.minY,ifp.maxY])if(b.Y!==a.Y){const t=(y*SCALE-a.Y)/(b.Y-a.Y);if(t>=0&&t<=1)candidates.push({x:(a.X+t*(b.X-a.X))/SCALE,y});}
        }
      }
      candidates.sort((a,b)=>a.y-b.y||a.x-b.x);
      for(const candidate of candidates){
        await checkpoint();
        if(candidate.y+shape.height>ceiling-settings.margin+1e-7)continue;
        if(!fits(shape,candidate.x,candidate.y,world,width,height,settings))continue;
        if(quick&&seedStep)for(let pass=0;pass<2;pass++)for(const step of [10,2,0.25,0.02]){
          while(fits(shape,candidate.x,candidate.y-step,world,width,height,settings)){candidate.y-=step;await checkpoint();}
          while(fits(shape,candidate.x-step,candidate.y,world,width,height,settings)){candidate.x-=step;await checkpoint();}
        }
        const extent=quick?candidate.y+shape.height:Math.max(...others.map(p=>p.y+p.shape.height),candidate.y+shape.height);
        if(!bestPosition||extent<bestHeight-1e-7||(Math.abs(extent-bestHeight)<1e-7&&(candidate.y<bestPosition.y-1e-7||(Math.abs(candidate.y-bestPosition.y)<1e-7&&candidate.x<bestPosition.x)))){bestPosition={instance,shape,...candidate,rotation,sheet};bestHeight=extent;}
        break; // Bottom-left feasible boundary point for this orientation.
      }
    }
    return bestPosition;
  };
  const pack=async(order:Instance[],fixed:Position[]=[],preferred=new Map<string,number>(),quick=false):Promise<Position[]>=>{
    const positions=[...fixed],pending=[...order];
    while(pending.length){
      await checkpoint();const instance=pending[0];let chosen:Position|undefined,index=0;
      const allAngles=allowed(instance.part,settings),preferredAngle=preferred.get(instance.instanceId);
      let angles=preferredAngle===undefined?allAngles:[preferredAngle];
      if(isFree(settings)&&preferredAngle===undefined&&allAngles.length>4)angles=allAngles.filter(r=>r%90===0);
      if(!angles.length)angles=allAngles;
      const last=positions.length?Math.max(...positions.map(p=>p.sheet)):0;
      for(let sheet=0;sheet<=last;sheet++){
        chosen=await find(instance,positions,sheet,height,angles,quick);
        if(!chosen&&angles.length!==allAngles.length)chosen=await find(instance,positions,sheet,height,allAngles,quick);
        const occupied=positions.filter(p=>p.sheet===sheet).reduce((v,p)=>Math.max(v,p.y+p.shape.height),settings.margin);
        if(!quick&&occupied>settings.margin&&(!chosen||chosen.y+chosen.shape.height>occupied+1e-7)){
          const small=pending.map((item,i)=>({item,i})).slice(1).sort((a,b)=>area(a.item.part)-area(b.item.part));
          for(const candidate of small){const cavity=await find(candidate.item,positions,sheet,occupied+settings.margin);if(cavity){chosen=cavity;index=candidate.i;break;}}
        }
        if(chosen)break;
      }
      if(!chosen&&settings.materialType==='sheet')chosen=await find(instance,positions,last+1,height,angles,quick);
      pending.splice(index,1);
      if(chosen){positions.push(chosen);keep(positions);}
    }
    // Compact empty sheet indices after remove/reinsert moves.
    const used=[...new Set(positions.map(p=>p.sheet))].sort((a,b)=>a-b);
    return positions.map(p=>({...p,sheet:used.indexOf(p.sheet)}));
  };
  // A feature is a part's occupied sheet/orientation/spatial bin. High frontier
  // cost features are penalized at local minima: utility=c_i/(1+p_i).
  const penalties=new Map<string,number>();
  const features=(positions:Position[])=>positions.map(p=>({key:`${p.instance.instanceId}:${p.sheet}:${p.rotation}:${Math.floor(p.x/20)}:${Math.floor(p.y/20)}`,cost:1+p.sheet+(p.y+p.shape.height)/Math.max(1,height),position:p}));
  const scalar=(positions:Position[])=>{const r=resultOf(positions);return settings.materialType==='sheet'?(r.sheetCount??0)+(r.sheets?.at(-1)?.usedHeight??0)/(height+1):r.usedHeight/height;};
  const augmented=(positions:Position[])=>scalar(positions)+0.15/Math.max(1,instances.length)*features(positions).reduce((s,f)=>s+(penalties.get(f.key)??0),0);
  publish(true);
  try {
    // Cheap feasible incumbent is insurance for short budgets/cancellation. It is
    // not called NFP: every contact is checked on the real solid before accepting.
    phase='Güvenli başlangıç';let current=await pack(instances,[],new Map(),true);keep(current);publish(true);
    const orders=[instances,[...instances].sort((a,b)=>b.part.bounds.height-a.part.bounds.height),[...instances].sort((a,b)=>b.part.bounds.width-a.part.bounds.width)];
    phase='Temas başlangıçları';seedStep=40;
    for(const order of orders.slice(1)){
      if(performance.now()-start>budget*0.3)break;
      const seed=await pack(order,[],new Map(),true);iterations++;keep(seed);
    }
    seedStep=0;
    // Reserve most time for GLS rather than spending the entire budget on seeds.
    for(const order of orders){
      phase='NFP / BLF başlangıcı';phaseDeadline=Math.min(start+budget*0.45,performance.now()+budget*0.12);
      try{const seed=await pack(order);iterations++;keep(seed);if(compareLayouts(resultOf(seed),resultOf(current),settings)<0)current=seed;}
      catch(error){if(!(error instanceof PhaseExpired))throw error;}
      finally{phaseDeadline=Infinity;}
      if(performance.now()-start>budget*0.45)break;
    }
    current=[...bestPositions];
    phase='GLS';
    while(iterations<(options.maxIterations??100000)){
      await checkpoint();iterations++;
      const ordered=[...current].sort((a,b)=>b.sheet-a.sheet||(b.y+b.shape.height)-(a.y+a.shape.height));
      let neighbour:Position[]|undefined,neighbourScore=augmented(current);
      // Translation and rotation neighbourhood, then bounded remove/reinsert.
      for(const target of ordered.length?[ordered[(iterations-1)%ordered.length]]:[]){
        const remaining=current.filter(p=>p!==target);
        const shifted={...target},world=remaining.filter(p=>p.sheet===target.sheet).map(positioned);
        for(const step of [10,2,0.25,0.05]){
          while(fits(shifted.shape,shifted.x,shifted.y-step,world,width,height,settings)){shifted.y-=step;await checkpoint();}
          while(fits(shifted.shape,shifted.x-step,shifted.y,world,width,height,settings)){shifted.x-=step;await checkpoint();}
        }
        const shiftTrial=[...remaining,shifted],shiftScore=augmented(shiftTrial);keep(shiftTrial);
        if(shiftScore<neighbourScore-1e-9){neighbour=shiftTrial;neighbourScore=shiftScore;}
        let angles=allowed(target.instance.part,settings);
        if(isFree(settings)&&!target.instance.part.lockDirection&&!target.instance.part.allowedRotations){
          const coarse=(iterations*5)%360;
          angles=[target.rotation,coarse,...[-2,-1,1,2].map(d=>(target.rotation+d+360)%360)];
        }
        phaseDeadline=performance.now()+Math.max(50,budget*0.05);
        try{for(let sheet=0;sheet<=target.sheet;sheet++){
          const moved=await find(target.instance,remaining,sheet,height,angles);
          if(!moved)continue;
          const trial=[...remaining,moved],score=augmented(trial);keep(trial);
          if(score<neighbourScore-1e-9){neighbour=trial;neighbourScore=score;}
        }}catch(error){if(!(error instanceof PhaseExpired))throw error;}finally{phaseDeadline=Infinity;}
      }
      // Ordering swap and ruin/recreate use the same penalized acceptance rule.
      if(ordered.length>1){
        const count=Math.min(ordered.length,2+(iterations%4)),removed=ordered.slice(0,count),fixed=current.filter(p=>!removed.includes(p));
        const reinsertion=removed.map(p=>p.instance);if(iterations%2)reinsertion.reverse();else [reinsertion[0],reinsertion[1]]=[reinsertion[1],reinsertion[0]];
        const trial=await pack(reinsertion,fixed,new Map(),true),score=augmented(trial);keep(trial);
        if(trial.length===current.length&&score<neighbourScore-1e-9){neighbour=trial;neighbourScore=score;}
      }
      if(neighbour){current=neighbour;publish();continue;}
      const fs=features(current),utility=Math.max(...fs.map(f=>f.cost/(1+(penalties.get(f.key)??0))));
      for(const f of fs)if(Math.abs(f.cost/(1+(penalties.get(f.key)??0))-utility)<1e-9)penalties.set(f.key,(penalties.get(f.key)??0)+1);
      penaltyUpdates++;publish();
      // Controlled escape after repeated penalized local minima. Best is immutable.
      if(penaltyUpdates%3===0&&current.length){
        const ranked=features(current).sort((a,b)=>(penalties.get(b.key)??0)-(penalties.get(a.key)??0)||b.cost-a.cost);
        const removed=ranked.slice(0,Math.max(2,Math.ceil(current.length/4))).map(f=>f.position);
        const trial=await pack(removed.map(p=>p.instance).reverse(),current.filter(p=>!removed.includes(p)),new Map(),true);
        if(trial.length===current.length&&scalar(trial)<=scalar(current)+0.25)current=trial;
        keep(trial);
      }
      if(!current.length)break;
    }
  } catch(error){if(!(error instanceof SearchStopped))throw error;stopped=true;}
  // Restore the best feasible layout, never the last penalized/perturbed state.
  best=resultOf(bestPositions);const validation=validateLayout(parts,requestedSettings,best);phase=options.signal?.aborted?'Durduruldu':stopped?'Süre doldu':'Tamamlandı';publish(true);
  return {result:best,elapsedMs:performance.now()-start,iterations,penaltyUpdates,phase,cacheHits:cache.hits,cacheMisses:cache.misses,stopped,validation};
}
