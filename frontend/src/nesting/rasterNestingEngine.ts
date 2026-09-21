import type { DxfPoint, NestingPart } from '../dxf/dxfTypes';
import { calculateAbsoluteArea } from '../dxf/contourEngine';
import { createPartInstances, polygon, polygonsConflict, fits, validateSettings, type NestingPolygon, type NestingPlacement, type NestingResult, type NestingSettings } from './nestingEngine';

type Raster = { rows: Uint32Array[]; width: number; height: number; words: number; shape: NestingPolygon; rotation: number; skyline: Int32Array };

// Cells touched by any edge are occupied, including cells missed by a scanline
// through the row center. This is a conservative search mask, not export geometry.
export function rasterize(shape: NestingPolygon, rotation: number, cell: number): Raster {
  const width = Math.ceil(shape.width / cell) + 1, height = Math.ceil(shape.height / cell) + 1;
  const words = Math.ceil(width / 32);
  const rows = Array.from({ length: height }, () => new Uint32Array(words));
  const span = (row: number, left: number, right: number) => {
    for (let x = Math.max(0, Math.floor(left / cell)); x <= Math.min(width - 1, Math.floor(right / cell)); x++) rows[row][x >>> 5] |= 1 << (x & 31);
  };
  for (let row = 0; row < height; row++) {
    const low = row * cell, high = low + cell, mid = low + cell / 2;
    const crossings: number[] = [];
    for (let i = 0; i < shape.points.length; i++) {
      const a = shape.points[i], b = shape.points[(i + 1) % shape.points.length];
      if ((a.y > mid) !== (b.y > mid)) crossings.push(a.x + (mid - a.y) * (b.x - a.x) / (b.y - a.y));
      if (Math.max(a.y, b.y) < low || Math.min(a.y, b.y) > high) continue;
      if (Math.abs(a.y - b.y) < 1e-10) { span(row, Math.min(a.x,b.x), Math.max(a.x,b.x)); continue; }
      const t1 = Math.max(0, Math.min(1, (low - a.y) / (b.y - a.y)));
      const t2 = Math.max(0, Math.min(1, (high - a.y) / (b.y - a.y)));
      const x1 = a.x + t1 * (b.x-a.x), x2 = a.x + t2 * (b.x-a.x);
      span(row, Math.min(x1,x2), Math.max(x1,x2));
    }
    crossings.sort((a,b) => a-b);
    for (let i=0;i+1<crossings.length;i+=2) span(row,crossings[i],crossings[i+1]);
  }
  const skyline=new Int32Array(width);
  for(let col=0;col<width;col++)for(let row=height-1;row>=0;row--)if(rows[row][col>>>5]&(1<<(col&31))){skyline[col]=row+1;break;}
  return { rows, width, height, words, shape, rotation, skyline };
}

function overlaps(mask: Raster, grid: Uint32Array, stride: number, x: number, y: number): boolean {
  const shift = x & 31, wordX = x >>> 5;
  for (let row=0;row<mask.height;row++) {
    const base = (y+row)*stride+wordX, bits = mask.rows[row];
    for (let w=0;w<mask.words;w++) {
      const value=bits[w];
      if ((grid[base+w] & (value << shift)) !== 0 || (shift && (grid[base+w+1] & (value >>> (32-shift))) !== 0)) return true;
    }
  }
  return false;
}

function occupy(mask: Raster, grid: Uint32Array, stride: number, columns: number, rows: number, x: number, y: number, clearance: number): void {
  // Dilation belongs only to the occupied sheet; it is not applied twice.
  for (let row=0;row<mask.height;row++) for (let col=0;col<mask.width;col++) {
    if (!(mask.rows[row][col>>>5] & (1<<(col&31)))) continue;
    for (let dy=-clearance;dy<=clearance;dy++) {
      const gy=y+row+dy;
      if (gy<0 || gy>=rows) continue;
      for (let dx=-clearance;dx<=clearance;dx++) {
        const gx=x+col+dx;
        if (gx>=0 && gx<columns) grid[gy*stride+(gx>>>5)] |= 1<<(gx&31);
      }
    }
  }
}

export function runRasterNesting(parts: NestingPart[], settings: NestingSettings, cell=3, bottomLeft=false, settle=true): NestingResult {
  validateSettings(settings);
  if (!Number.isFinite(cell) || cell < 1) throw new Error('Geçersiz yerleşim çözünürlüğü.');
  const instances=createPartInstances(parts,true);
  const width=settings.materialType==='roll' ? settings.rollWidth : settings.sheetWidth;
  const height=settings.materialType==='roll' ? instances.reduce((sum,{part})=>sum+Math.max(part.bounds.width,part.bounds.height)+settings.spacing,2*settings.margin) : settings.sheetHeight;
  const columns=Math.ceil((width-2*settings.margin)/cell)+2;
  const rows=Math.ceil((height-2*settings.margin)/cell)+2;
  const stride=Math.ceil(columns/32)+1;
  const grid=new Uint32Array(rows*stride);
  const right=settings.startCorner.endsWith('right'), top=settings.startCorner.startsWith('top');
  const placements:NestingPlacement[]=[];
  const masks=new Map<string,Raster>();
  const accepted:{points:DxfPoint[];x:number;y:number;width:number;height:number}[]=[];
  let usedHeight=0,usedWidth=0,usedArea=0;
  for(const {part,instanceId} of instances) {
    let best:{mask:Raster;x:number;y:number;score:number}|undefined;
    for(const rotation of settings.rotations.filter(r=>(!part.lockDirection||r===0)&&(!part.allowedRotations||part.allowedRotations.includes(r)))) {
      const key=`${part.id}:${rotation}`;
      let mask=masks.get(key);
      if(!mask) {
        const shape=polygon(part,rotation);
        shape.points=shape.points.map(p=>({x:right?shape.width-p.x:p.x,y:top?shape.height-p.y:p.y}));
        mask=rasterize(shape,rotation,cell);masks.set(key,mask);
      }
      const maxX=Math.floor((width-2*settings.margin-mask.shape.width)/cell);
      const maxY=Math.floor((height-2*settings.margin-mask.shape.height)/cell);
      let found=false;
      for(let y=0;y<=maxY;y++) {
        const worldY=settings.margin+y*cell;
        if(best && !bottomLeft && Math.max(usedHeight,worldY+mask.shape.height)*width+worldY > best.score+1e-8) break;
        for(let x=0;x<=maxX;x++) {
          if(overlaps(mask,grid,stride,x,y))continue;
          let worldX=settings.margin+x*cell, settledY=worldY;
          const points=mask.shape.points.map(p=>({x:p.x+worldX,y:p.y+worldY}));
          // Exact final gate keeps spacing safe even if the mask implementation changes.
          if(accepted.some(p=> !(worldX>p.x+p.width+settings.spacing || worldX+mask!.shape.width+settings.spacing<p.x || worldY>p.y+p.height+settings.spacing || worldY+mask!.shape.height+settings.spacing<p.y) && polygonsConflict(points,p.points,settings.spacing)))continue;
          if(settle) for(const step of [10,2,0.25,0.02]) {
            while(fits(mask.shape,worldX,settledY-step,accepted,width,height,settings))settledY-=step;
            while(fits(mask.shape,worldX-step,settledY,accepted,width,height,settings))worldX-=step;
          }
          const score=bottomLeft ? settledY*width+worldX : Math.max(usedHeight,settledY+mask.shape.height)*width+settledY+worldX/width;
          if(!best || score<best.score)best={mask,x:worldX,y:settledY,score};
          found=true;break;
        }
        if(found)break;
      }
    }
    if(!best){placements.push({partId:part.id,instanceId,x:0,y:0,rotation:0,placed:false});continue;}
    const x=best.x,y=best.y,shape=best.mask.shape;
    const gx=Math.floor((x-settings.margin)/cell),gy=Math.floor((y-settings.margin)/cell);
    const dx=x-settings.margin-gx*cell,dy=y-settings.margin-gy*cell;
    const placedMask=rasterize({points:shape.points.map(p=>({x:p.x+dx,y:p.y+dy})),width:shape.width+dx,height:shape.height+dy},best.mask.rotation,cell);
    occupy(placedMask,grid,stride,columns,rows,gx,gy,Math.ceil(settings.spacing/cell));
    accepted.push({...shape,x,y,points:shape.points.map(p=>({x:p.x+x,y:p.y+y}))});
    placements.push({partId:part.id,instanceId,x,y,rotation:best.mask.rotation,placed:true});
    usedWidth=Math.max(usedWidth,x+shape.width);usedHeight=Math.max(usedHeight,y+shape.height);
    usedArea+=calculateAbsoluteArea(part.outerContour.points)-part.holes.reduce((sum,hole)=>sum+calculateAbsoluteArea(hole.points),0);
  }
  const materialHeight=settings.materialType==='roll'?usedHeight+settings.margin:height;
  for(const placement of placements)if(placement.placed){const shape=masks.get(`${placement.partId}:${placement.rotation}`)!.shape;if(right)placement.x=width-placement.x-shape.width;if(top)placement.y=materialHeight-placement.y-shape.height;}
  const materialArea=width*materialHeight;
  return {placements,totalCount:instances.length,placedCount:accepted.length,unplacedCount:instances.length-accepted.length,usedWidth,usedHeight,usedArea,materialWidth:width,materialHeight,materialArea,efficiency:materialArea?usedArea/materialArea*100:0,margin:settings.margin};
}

export function runBeamNesting(parts: NestingPart[], settings: NestingSettings, cell=3, beamWidth=4, skylineWeight=0): NestingResult {
  validateSettings(settings);
  if(!Number.isFinite(cell)||cell<1||!Number.isInteger(beamWidth)||beamWidth<1||beamWidth>8)throw new Error('Geçersiz arama ayarı.');
  const instances=createPartInstances(parts,true);
  const width=settings.materialType==='roll'?settings.rollWidth:settings.sheetWidth;
  const height=settings.materialType==='roll'?instances.reduce((sum,{part})=>sum+Math.max(part.bounds.width,part.bounds.height)+settings.spacing,settings.margin*2):settings.sheetHeight;
  const columns=Math.ceil((width-settings.margin*2)/cell)+2,rows=Math.ceil((height-settings.margin*2)/cell)+2,stride=Math.ceil(columns/32)+1;
  const right=settings.startCorner.endsWith('right'),top=settings.startCorner.startsWith('top');
  const masks=new Map<string,Raster>();
  type State={grid:Uint32Array;placements:NestingPlacement[];shapes:{points:DxfPoint[];x:number;y:number;width:number;height:number}[];usedHeight:number;usedWidth:number;usedArea:number;skyline:Int32Array;profileArea:number};
  let states:State[]=[{grid:new Uint32Array(rows*stride),placements:[],shapes:[],usedHeight:0,usedWidth:0,usedArea:0,skyline:new Int32Array(columns),profileArea:0}];
  for(const {part,instanceId} of instances){
    const variations:Raster[]=[];
    for(const rotation of settings.rotations.filter(r=>(!part.lockDirection||r===0)&&(!part.allowedRotations||part.allowedRotations.includes(r)))){
      const key=`${part.id}:${rotation}`;let mask=masks.get(key);
      if(!mask){const shape=polygon(part,rotation);shape.points=shape.points.map(p=>({x:right?shape.width-p.x:p.x,y:top?shape.height-p.y:p.y}));mask=rasterize(shape,rotation,cell);masks.set(key,mask);}
      variations.push(mask);
    }
    type Proposal={state:State;mask?:Raster;x:number;y:number;usedHeight:number;usedWidth:number;placed:number;profileArea:number};
    const proposals:Proposal[]=[];
    for(const state of states){
      let foundForState=false;
      for(const mask of variations){
        const maxX=Math.floor((width-settings.margin*2-mask.shape.width)/cell),maxY=Math.floor((height-settings.margin*2-mask.shape.height)/cell);
        let found=false;
        for(let y=0;y<=maxY;y++){
          for(let x=0;x<=maxX;x++){
            if(overlaps(mask,state.grid,stride,x,y))continue;
            const worldX=settings.margin+x*cell,worldY=settings.margin+y*cell;
            if(!fits(mask.shape,worldX,worldY,state.shapes,width,height,settings))continue;
            let profileArea=state.profileArea;
            for(let col=0;col<mask.width;col++)if(mask.skyline[col])profileArea+=Math.max(0,y+mask.skyline[col]-state.skyline[x+col]);
            proposals.push({state,mask,x,y,usedHeight:Math.max(state.usedHeight,worldY+mask.shape.height),usedWidth:Math.max(state.usedWidth,worldX+mask.shape.width),placed:state.shapes.length+1,profileArea});
            found=true;foundForState=true;break;
          }
          if(found)break;
        }
      }
      if(!foundForState)proposals.push({state,x:0,y:0,usedHeight:state.usedHeight,usedWidth:state.usedWidth,placed:state.shapes.length,profileArea:state.profileArea});
    }
    proposals.sort((a,b)=>b.placed-a.placed||((a.usedHeight-b.usedHeight)*width+(a.profileArea-b.profileArea)*cell*cell*skylineWeight)||a.usedWidth-b.usedWidth||a.y-b.y||a.x-b.x);
    states=proposals.slice(0,beamWidth).map(p=>{
      const grid=p.state.grid.slice(),placements=[...p.state.placements],shapes=[...p.state.shapes],skyline=p.state.skyline.slice();
      let usedArea=p.state.usedArea;
      if(p.mask){
        const x=settings.margin+p.x*cell,y=settings.margin+p.y*cell;
        occupy(p.mask,grid,stride,columns,rows,p.x,p.y,Math.ceil(settings.spacing/cell));
        for(let col=0;col<p.mask.width;col++)if(p.mask.skyline[col])skyline[p.x+col]=Math.max(skyline[p.x+col],p.y+p.mask.skyline[col]);
        placements.push({partId:part.id,instanceId,x,y,rotation:p.mask.rotation,placed:true});
        shapes.push({...p.mask.shape,x,y,points:p.mask.shape.points.map(point=>({x:point.x+x,y:point.y+y}))});
        usedArea+=calculateAbsoluteArea(part.outerContour.points)-part.holes.reduce((sum,h)=>sum+calculateAbsoluteArea(h.points),0);
      }else placements.push({partId:part.id,instanceId,x:0,y:0,rotation:0,placed:false});
      return {grid,placements,shapes,usedArea,usedWidth:p.usedWidth,usedHeight:p.usedHeight,skyline,profileArea:p.profileArea};
    });
  }
  const best=states.sort((a,b)=>b.shapes.length-a.shapes.length||a.usedHeight-b.usedHeight||a.usedWidth-b.usedWidth)[0];
  const materialHeight=settings.materialType==='roll'?best.usedHeight+settings.margin:height,materialArea=width*materialHeight;
  for(const placement of best.placements)if(placement.placed){const shape=masks.get(`${placement.partId}:${placement.rotation}`)!.shape;if(right)placement.x=width-placement.x-shape.width;if(top)placement.y=materialHeight-placement.y-shape.height;}
  return {placements:best.placements,totalCount:instances.length,placedCount:best.shapes.length,unplacedCount:instances.length-best.shapes.length,usedWidth:best.usedWidth,usedHeight:best.usedHeight,usedArea:best.usedArea,materialWidth:width,materialHeight,materialArea,efficiency:materialArea?best.usedArea/materialArea*100:0,margin:settings.margin};
}
