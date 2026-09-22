import type { NestingResult } from './nestingEngine';
/** One sheet in local coordinates for the existing viewer and DXF exporter. */
export function selectSheet(result:NestingResult,index:number):NestingResult {
  if((result.sheetCount??1)<=1)return result;
  const sheet=result.sheets![Math.max(0,Math.min(index,result.sheets!.length-1))];
  const placements=result.placements.filter(p=>p.placed&&(p.sheetIndex??0)===sheet.index).map(p=>({...p,sheetIndex:0}));
  const materialArea=result.materialWidth*result.materialHeight;
  return {...result,placements,placedCount:placements.length,totalCount:placements.length,unplacedCount:0,usedHeight:sheet.usedHeight,usedArea:sheet.usedArea,materialArea,efficiency:100*sheet.usedArea/materialArea,sheetCount:1,sheets:[{...sheet,index:0}]};
}
