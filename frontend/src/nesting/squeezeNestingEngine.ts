import type { NestingPart } from '../dxf/dxfTypes';
import { fits, polygon, type NestingResult, type NestingSettings } from './nestingEngine';
import { rasterize } from './rasterNestingEngine';

type Mask={offsets:Int32Array;width:number;height:number;rotation:number};
type Piece={part:NestingPart;placementIndex:number;masks:Mask[];mask:Mask;x:number;y:number};

/** Repair a slightly shorter strip by moving several pieces together. Search may
 * temporarily overlap masks, but only a fully collision-free result can escape. */
export function squeezeNesting(parts:NestingPart[], source:NestingResult, settings:NestingSettings, targetHeight:number, seed=1, maxSweeps=100):NestingResult|null {
  if(source.unplacedCount||!source.placedCount||source.placedCount>80)return null;
  const cell=3,padding=Math.max(1,Math.ceil(settings.spacing/(2*cell)));
  const columns=Math.floor((source.materialWidth-2*settings.margin)/cell);
  const rows=Math.floor((targetHeight-2*settings.margin)/cell);
  if(columns<=0||rows<=0)return null;
  const right=settings.startCorner.endsWith('right'),top=settings.startCorner.startsWith('top');
  const partMap=new Map(parts.map(p=>[p.id,p]));
  let randomState=seed>>>0;
  const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
  const pieces:Piece[]=[];
  for(const [placementIndex,placement]of source.placements.entries()){
    if(!placement.placed)continue;
    const part=partMap.get(placement.partId)!;
    const masks:Mask[]=[];
    for(const rotation of settings.rotations.filter(r=>(!part.lockDirection||r===0)&&(!part.allowedRotations||part.allowedRotations.includes(r)))){
      const shape=polygon(part,rotation);
      shape.points=shape.points.map(p=>({x:right?shape.width-p.x:p.x,y:top?shape.height-p.y:p.y}));
      const raster=rasterize(shape,rotation,cell);
      const width=raster.width+2*padding,height=raster.height+2*padding;
      if(width>columns||height>rows)continue;
      const cells=new Set<number>();
      for(let y=0;y<raster.height;y++)for(let x=0;x<raster.width;x++){
        if(!(raster.rows[y][x>>>5]&(1<<(x&31))))continue;
        for(let dy=0;dy<=padding*2;dy++)for(let dx=0;dx<=padding*2;dx++)cells.add((y+dy)*columns+x+dx);
      }
      masks.push({offsets:Int32Array.from(cells),width,height,rotation});
    }
    const mask=masks.find(m=>m.rotation===placement.rotation);
    if(!mask)return null;
    const shape=polygon(part,placement.rotation);
    const px=right?source.materialWidth-placement.x-shape.width:placement.x;
    const py=top?source.materialHeight-placement.y-shape.height:placement.y;
    const x=Math.max(0,Math.min(columns-mask.width,Math.round((px-settings.margin)/cell)-padding));
    const y=Math.max(0,Math.min(rows-mask.height,Math.round((py-settings.margin)*targetHeight/(source.usedHeight+settings.margin)/cell)-padding));
    pieces.push({part,placementIndex,masks,mask,x,y});
  }
  const counts=new Uint16Array(columns*rows);
  let energy=0;
  const change=(piece:Piece,delta:1|-1)=>{
    const base=piece.y*columns+piece.x;
    for(const offset of piece.mask.offsets){const index=base+offset;if(delta===1){energy+=counts[index];counts[index]++;}else{counts[index]--;energy-=counts[index];}}
  };
  const cost=(mask:Mask,x:number,y:number,limit=Infinity)=>{
    const base=y*columns+x;let score=0;
    for(const offset of mask.offsets){score+=counts[base+offset];if(score>limit)break;}
    return score;
  };
  for(const p of pieces)change(p,1);
  let bestEnergy=energy,stalled=0;
  for(let sweep=0;sweep<maxSweeps&&energy>0;sweep++){
    const order=[...pieces];
    for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    for(const p of order){
      change(p,-1);
      const current=cost(p.mask,p.x,p.y);
      let choice={mask:p.mask,x:p.x,y:p.y,score:current};
      const step=[1,2,4,8,16][sweep%5];
      const propose=(mask:Mask,x:number,y:number)=>{
        x=Math.max(0,Math.min(columns-mask.width,x));y=Math.max(0,Math.min(rows-mask.height,y));
        const score=cost(mask,x,y,choice.score);
        if(score<choice.score||(score===choice.score&&random()<0.15))choice={mask,x,y,score};
      };
      for(const [dx,dy]of [[-step,0],[step,0],[0,-step],[0,step],[-step,-step],[step,-step],[-step,step],[step,step]])propose(p.mask,p.x+dx,p.y+dy);
      if(current>0||sweep%5===0){
        for(const mask of p.masks)propose(mask,p.x,p.y);
        for(let trial=0;trial<5;trial++){
          const mask=p.masks[Math.floor(random()*p.masks.length)];
          propose(mask,Math.floor(random()*(columns-mask.width+1)),Math.floor(random()*(rows-mask.height+1)));
        }
      }
      // Small uphill moves let a trapped neighbor create space for another piece.
      if(choice.score===current&&stalled>3&&random()<0.35){
        const x=Math.max(0,Math.min(columns-p.mask.width,p.x+(random()<0.5?-1:1)*step));
        const y=Math.max(0,Math.min(rows-p.mask.height,p.y+(random()<0.5?-1:1)*step));
        const score=cost(p.mask,x,y);
        const temperature=40*(1-sweep/maxSweeps)+2;
        if(random()<Math.exp((current-score)/temperature))choice={mask:p.mask,x,y,score};
      }
      p.mask=choice.mask;p.x=choice.x;p.y=choice.y;change(p,1);
    }
    if(energy<bestEnergy){bestEnergy=energy;stalled=0;}else stalled++;
  }
  if(energy!==0)return null;
  const placements=source.placements.map(p=>({...p}));
  const accepted:ReturnType<typeof polygon>[] & {x:number;y:number}[]=[];
  let usedHeight=0,usedWidth=0;
  for(const p of pieces){
    const shape=polygon(p.part,p.mask.rotation);shape.points=shape.points.map(point=>({x:right?shape.width-point.x:point.x,y:top?shape.height-point.y:point.y}));
    const x=settings.margin+(p.x+padding)*cell,y=settings.margin+(p.y+padding)*cell;
    if(!fits(shape,x,y,accepted,source.materialWidth,targetHeight,settings))return null;
    accepted.push({...shape,x,y,points:shape.points.map(point=>({x:point.x+x,y:point.y+y}))});
    usedHeight=Math.max(usedHeight,y+shape.height);usedWidth=Math.max(usedWidth,x+shape.width);
    placements[p.placementIndex]={...placements[p.placementIndex],x,y,rotation:p.mask.rotation};
  }
  const materialHeight=settings.materialType==='roll'?usedHeight+settings.margin:source.materialHeight;
  for(const p of pieces){const placement=placements[p.placementIndex],shape=polygon(p.part,placement.rotation);if(right)placement.x=source.materialWidth-placement.x-shape.width;if(top)placement.y=materialHeight-placement.y-shape.height;}
  const materialArea=source.materialWidth*materialHeight;
  return {...source,placements,usedHeight,usedWidth,materialHeight,materialArea,efficiency:source.usedArea/materialArea*100};
}
