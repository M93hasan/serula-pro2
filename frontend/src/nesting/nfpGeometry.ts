import Clipper from 'clipper-lib';
import earcut, { deviation } from 'earcut';
import type { DxfPoint } from '../dxf/dxfTypes';
import type { NestingPolygon } from './nestingEngine';

export const SCALE=10000; // 0.0001 mm integer grid; never used to simplify a contour.
export const toPath=(ring:DxfPoint[]):Clipper.Path=>ring.map(p=>({X:Math.round(p.x*SCALE),Y:Math.round(p.y*SCALE)}));
export const fromPath=(ring:Clipper.Path):DxfPoint[]=>ring.map(p=>({x:p.X/SCALE,y:p.Y/SCALE}));
export function booleanPaths(subject:Clipper.Paths,clip:Clipper.Paths,operation:Clipper.ClipType):Clipper.Paths {
  const engine=new Clipper.Clipper(),result:Clipper.Paths=[];
  engine.AddPaths(subject,Clipper.PolyType.ptSubject,true);
  engine.AddPaths(clip,Clipper.PolyType.ptClip,true);
  engine.Execute(operation,result,Clipper.PolyFillType.pftNonZero,Clipper.PolyFillType.pftNonZero);
  return result;
}
function cross(a:DxfPoint,b:DxfPoint,c:DxfPoint){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
const area=(p:DxfPoint[])=>Math.abs(p.reduce((v,a,i)=>v+a.x*p[(i+1)%p.length].y-a.y*p[(i+1)%p.length].x,0))/2;
function hull(points:DxfPoint[]) {
  const sorted=[...new Map(points.map(p=>[`${p.x},${p.y}`,p])).values()].sort((a,b)=>a.x-b.x||a.y-b.y);
  const lower:DxfPoint[]=[],upper:DxfPoint[]=[];
  for(const p of sorted){while(lower.length>1&&cross(lower.at(-2)!,lower.at(-1)!,p)<=1e-10)lower.pop();lower.push(p);}
  for(const p of sorted.reverse()){while(upper.length>1&&cross(upper.at(-2)!,upper.at(-1)!,p)<=1e-10)upper.pop();upper.push(p);}
  return [...lower.slice(0,-1),...upper.slice(0,-1)];
}
export function shapePaths(shape:NestingPolygon):Clipper.Paths {
  return [shape.points,...shape.holes].map((ring,i)=>{const p=toPath(ring);if(Clipper.Clipper.Orientation(p)!==(i===0))p.reverse();return p;});
}
/** Convex decomposition preserves the solid, including holes. Hulls are taken ONLY
 * of already convex cells or an area-checked union of adjacent cells. */
function decompose(shape:NestingPolygon):DxfPoint[][] {
  const rings=[shape.points,...shape.holes],points=rings.flat(),holes:number[]=[];
  let count=rings[0].length;for(const ring of rings.slice(1)){holes.push(count);count+=ring.length;}
  const data=points.flatMap(p=>[p.x,p.y]),indices=earcut(data,holes,2);
  if(!indices.length||deviation(data,holes,2,indices)>1e-7)throw new Error('Kontur üçgenleştirilemedi; geometriyi kontrol edin.');
  const cells:DxfPoint[][]=[];for(let i=0;i<indices.length;i+=3)cells.push(indices.slice(i,i+3).map(j=>points[j]));
  // Merge only edge-neighbours whose union is convex; never replace a concavity.
  for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++) {
    if(cells[i].filter(p=>cells[j].includes(p)).length<2)continue;
    const merged=hull([...cells[i],...cells[j]]);
    if(Math.abs(area(merged)-area(cells[i])-area(cells[j]))<1e-7){cells[i]=merged;cells.splice(j,1);i--;break;}
  }
  return cells;
}
export function geometryKey(shape:NestingPolygon):string {
  // Full geometry (not part ID) prevents collisions and shares identical copies.
  return JSON.stringify([shape.points,...shape.holes].map(r=>r.map(p=>[Math.round(p.x*SCALE),Math.round(p.y*SCALE)])));
}
export class NfpCache {
  private cells=new Map<string,DxfPoint[][]>();
  private cache=new Map<string,Clipper.Paths>();
  hits=0; misses=0;
  private readonly capacity:number;
  constructor(capacity=256){this.capacity=capacity;}
  clear(){this.cache.clear();this.cells.clear();}
  async get(a:NestingPolygon,b:NestingPolygon,spacing:number,checkpoint:()=>Promise<void>):Promise<Clipper.Paths> {
    const ak=geometryKey(a),bk=geometryKey(b),key=JSON.stringify([ak,bk,spacing,SCALE]);
    const cached=this.cache.get(key);if(cached){this.hits++;this.cache.delete(key);this.cache.set(key,cached);return cached;}
    this.misses++;
    const cells=(shape:NestingPolygon,k:string)=>{let value=this.cells.get(k);if(!value){value=decompose(shape);if(this.cells.size>=128)this.cells.delete(this.cells.keys().next().value!);this.cells.set(k,value);}return value;};
    const ac=cells(a,ak),bc=cells(b,bk);
    let sum:Clipper.Paths=[],batch:Clipper.Paths=[];
    // (union Ai) + (-union Bj) = union (Ai + -Bj).
    for(const ca of ac)for(const cb of bc){
      const cell=hull(ca.flatMap(p=>cb.map(q=>({x:p.x-q.x,y:p.y-q.y}))));
      const path=toPath(cell);if(!Clipper.Clipper.Orientation(path))path.reverse();batch.push(path);
      if(batch.length>=64){sum=booleanPaths([...sum,...batch],[],Clipper.ClipType.ctUnion);batch=[];await checkpoint();}
    }
    sum=booleanPaths([...sum,...batch],[],Clipper.ClipType.ctUnion);
    if(spacing>0){
      // Offset the NFP ONCE by the complete edge-to-edge gap. Round joins model
      // Euclidean separation. Guard covers integer rounding and offset sagitta.
      const arcTolerance=0.001*SCALE,offset=new Clipper.ClipperOffset(2,arcTolerance),inflated:Clipper.Paths=[];
      offset.AddPaths(sum,Clipper.JoinType.jtRound,Clipper.EndType.etClosedPolygon);
      offset.Execute(inflated,(spacing+0.0015)*SCALE);sum=inflated;
    }
    await checkpoint();
    if(this.cache.size>=this.capacity)this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key,sum);return sum;
  }
}
/** Exact IFP for a rectangular sheet/strip and a translated true rotated shape. */
export function innerFit(shape:NestingPolygon,width:number,height:number,margin:number) {
  const minX=Math.min(...shape.points.map(p=>p.x)),maxX=Math.max(...shape.points.map(p=>p.x));
  const minY=Math.min(...shape.points.map(p=>p.y)),maxY=Math.max(...shape.points.map(p=>p.y));
  return {minX:margin-minX,maxX:width-margin-maxX,minY:margin-minY,maxY:height-margin-maxY};
}
export function translatedPaths(paths:Clipper.Paths,x:number,y:number):Clipper.Paths {
  const dx=Math.round(x*SCALE),dy=Math.round(y*SCALE);return paths.map(r=>r.map(p=>({X:p.X+dx,Y:p.Y+dy})));
}
