import type { SerulaCurve, SerulaDxfEntity } from './dxfTypes';
import { createCurvesFromEntities } from './curveEngine';
import { ringProblem } from '../nesting/validateLayout';

export function prepareGeometry(entities:SerulaDxfEntity[],tolerance=0.1){
  const curves:SerulaCurve[]=[],issues:{entityId:string;message:string;blocking:boolean}[]=[];
  for(const entity of entities){
    try{
      const generated=createCurvesFromEntities([entity],{tolerance});
      if(!generated.length){issues.push({entityId:entity.id,message:'Desteklenmeyen veya boş geometri',blocking:true});continue;}
      for(const curve of generated){
        if(entity.closed&&entity.type.toUpperCase()==='SPLINE'&&Math.hypot(curve.points[0].x-curve.points.at(-1)!.x,curve.points[0].y-curve.points.at(-1)!.y)>0.01)throw new Error('Kapalı işaretli spline uçları birleşmiyor; otomatik kapatılmadı.');
        if(curve.closed){const problem=ringProblem(curve.points);if(problem)throw new Error(problem);}
        else issues.push({entityId:entity.id,message:'Açık eğri: kesim parçası olarak yerleştirilmez',blocking:false});
        curves.push(curve);
      }
    }catch(error){issues.push({entityId:entity.id,message:error instanceof Error?error.message:String(error),blocking:true});}
  }
  return {curves,issues};
}
