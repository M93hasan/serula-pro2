import type { DxfPoint, NestingPart, SerulaCurve, SerulaDxfEntity } from './dxfTypes';
import { polygonsConflict, transformNestingPoint, type NestingPlacement, type NestingResult, type NestingSettings } from '../nesting/nestingEngine';

type ExportCurve = { curve: SerulaCurve; entity: SerulaDxfEntity; part: NestingPart; placement: NestingPlacement };
const number = (value: number) => {
  if (!Number.isFinite(value)) throw new Error('Dışa aktarılacak geometride geçersiz koordinat var.');
  return Number(value.toFixed(10)).toString();
};
const escapeXml = (value: string) => value.replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' })[c]!);

export function prepareExport(result: NestingResult, parts: NestingPart[], curves: SerulaCurve[], owners: Map<string, string>, entities: SerulaDxfEntity[], transforms: Record<string, DxfPoint>, settings: NestingSettings) {
  const partMap = new Map(parts.map(p => [p.id, p]));
  const entityMap = new Map(entities.map(e => [e.id, e]));
  const placements = result.placements.map(p => ({ ...p, x: p.x + (transforms[p.partId]?.x ?? 0), y: p.y + (transforms[p.partId]?.y ?? 0) }));
  const placed = placements.filter(p => p.placed);
  const polygons = placed.map(p => {
    const part = partMap.get(p.partId);
    if (!part) throw new Error('Yerleşim güncel değil. Yeniden hesaplayın.');
    const points = part.outerContour.points.map(point => transformNestingPoint(point, part, p));
    if (points.some(point => point.x < settings.margin - 1e-7 || point.y < settings.margin - 1e-7 || point.x > result.materialWidth - settings.margin + 1e-7 || point.y > result.materialHeight - settings.margin + 1e-7)) throw new Error('Bir parça malzeme sınırı dışında. Taşımayı sıfırlayın veya yeniden yerleştirin.');
    return points;
  });
  for (let i = 0; i < polygons.length; i++) for (let j = i + 1; j < polygons.length; j++) {
    if (polygonsConflict(polygons[i], polygons[j], Math.max(0, settings.spacing - 1e-8))) throw new Error('Parçalar çakışıyor veya parça aralığı yetersiz. Taşımayı sıfırlayın veya yeniden yerleştirin.');
  }
  const exported: ExportCurve[] = [];
  for (const placement of placed) for (const curve of curves) if (owners.get(curve.id) === placement.partId) {
    const entity = entityMap.get(curve.entityId);
    if (!entity) throw new Error('Kaynak DXF geometrisi bulunamadı.');
    exported.push({ curve, entity, placement, part: partMap.get(placement.partId)! });
  }
  const right = settings.startCorner.endsWith('right'), top = settings.startCorner.startsWith('top');
  let usedWidth = 0, usedHeight = 0;
  for (const polygon of polygons) for (const point of polygon) {
    usedWidth = Math.max(usedWidth, right ? result.materialWidth - point.x : point.x);
    usedHeight = Math.max(usedHeight, top ? result.materialHeight - point.y : point.y);
  }
  return { curves: exported, result: { ...result, placements, usedWidth, usedHeight } };
}

export function createDxfExport(items: ExportCurve[]): string {
  const lines: string[] = [];
  const add = (code: number, value: string | number) => lines.push(String(code), typeof value === 'number' ? number(value) : value.replace(/[\r\n]/g, ' '));
  const point = (code: number, p: DxfPoint) => { add(code, p.x); add(code + 10, p.y); add(code + 20, 0); };
  add(0,'SECTION'); add(2,'HEADER'); add(9,'$ACADVER'); add(1,'AC1027'); add(9,'$INSUNITS'); add(70,4); add(0,'ENDSEC');
  add(0,'SECTION'); add(2,'TABLES'); add(0,'TABLE'); add(2,'LAYER');
  const layers = [...new Set(items.map(item => item.entity.layer || '0'))]; add(70,layers.length);
  for (const layer of layers) { add(0,'LAYER'); add(100,'AcDbSymbolTableRecord'); add(100,'AcDbLayerTableRecord'); add(2,layer); add(70,0); add(62,7); add(6,'CONTINUOUS'); }
  add(0,'ENDTAB'); add(0,'ENDSEC'); add(0,'SECTION'); add(2,'ENTITIES');
  for (const { entity:e, part, placement, curve } of items) {
    const type = e.type === 'POLYLINE' ? 'LWPOLYLINE' : e.type;
    const transform = (p: DxfPoint) => transformNestingPoint(p, part, placement);
    const vector = (p: DxfPoint) => {
      const origin = transform({x:0,y:0}), end = transform(p);
      return { x:end.x-origin.x, y:end.y-origin.y };
    };
    add(0,type); add(100,'AcDbEntity'); add(8,e.layer || '0');
    if (e.color.aci && e.color.aci > 0 && e.color.aci < 256) add(62,e.color.aci);
    if (e.color.hex && /^#[0-9a-f]{6}$/i.test(e.color.hex)) add(420,parseInt(e.color.hex.slice(1),16));
    switch (type) {
      case 'SPLINE': {
        // Autodesk SPLINE DXF reference: flags 70, degree 71, counts 72–74.
        const raw = e.raw as { periodic?: boolean; rational?: boolean } | undefined;
        add(100,'AcDbSpline'); add(70,(curve.closed ? 1 : 0) | (raw?.periodic ? 2 : 0) | (e.weights?.length || raw?.rational ? 4 : 0) | 8);
        add(71,e.degreeOfSplineCurve ?? 3); add(72,e.knotValues?.length ?? 0); add(73,e.controlPoints?.length ?? 0); add(74,e.fitPoints?.length ?? 0);
        for (const knot of e.knotValues ?? []) add(40,knot);
        for (const weight of e.weights ?? []) add(41,weight);
        for (const p of e.controlPoints ?? []) point(10,transform(p));
        for (const p of e.fitPoints ?? []) point(11,transform(p));
        break;
      }
      case 'LINE':
        add(100,'AcDbLine'); point(10,transform(e.start ?? e.vertices![0])); point(11,transform(e.end ?? e.vertices![1])); break;
      case 'CIRCLE': case 'ARC': {
        add(100,'AcDbCircle'); point(10,transform(e.center!)); add(40,e.radius!);
        if (type === 'ARC') {
          const degrees = (r: number) => Math.abs(r) > 2*Math.PI+0.001 ? r : r*180/Math.PI;
          add(100,'AcDbArc'); add(50,(degrees(e.startAngle ?? 0)+placement.rotation+360)%360); add(51,(degrees(e.endAngle ?? Math.PI*2)+placement.rotation+360)%360);
        }
        break;
      }
      case 'ELLIPSE':
        add(100,'AcDbEllipse'); point(10,transform(e.center!)); point(11,vector(e.majorAxisEndPoint!)); add(40,e.axisRatio ?? 1); add(41,e.startParameter ?? 0); add(42,e.endParameter ?? Math.PI*2); break;
      case 'LWPOLYLINE':
        add(100,'AcDbPolyline'); add(90,e.vertices?.length ?? 0); add(70,e.closed ? 1 : 0);
        for (const [i,p] of (e.vertices ?? []).entries()) { const q=transform(p); add(10,q.x); add(20,q.y); if (e.bulges?.[i]) add(42,e.bulges[i]); }
        break;
      default: throw new Error(`${type} DXF dışa aktarımı desteklenmiyor.`);
    }
  }
  add(0,'ENDSEC'); add(0,'EOF');
  return lines.join('\r\n')+'\r\n';
}

export function createSvgExport(items: ExportCurve[], result: NestingResult): string {
  const paths = items.map(({curve,part,placement}) => {
    const points=curve.points.map(p => transformNestingPoint(p,part,placement));
    const d=points.map((p,i) => `${i ? 'L' : 'M'}${number(p.x)},${number(p.y)}`).join(' ') + (curve.closed ? ' Z' : '');
    return `<path d="${d}" fill="none" stroke="${escapeXml(curve.color.hex ?? '#222222')}" stroke-width="0.2"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${number(result.materialWidth)}mm" height="${number(result.materialHeight)}mm" viewBox="0 0 ${number(result.materialWidth)} ${number(result.materialHeight)}"><g transform="translate(0 ${number(result.materialHeight)}) scale(1 -1)">${paths.join('')}</g></svg>`;
}

export function exportLayout(format: 'dxf'|'svg'|'json', result: NestingResult, parts: NestingPart[], curves: SerulaCurve[], owners: Map<string,string>, entities: SerulaDxfEntity[], transforms: Record<string,DxfPoint>, settings: NestingSettings): void {
  const prepared=prepareExport(result,parts,curves,owners,entities,transforms,settings);
  const content=format === 'dxf' ? createDxfExport(prepared.curves) : format === 'svg' ? createSvgExport(prepared.curves,prepared.result) : JSON.stringify({ units:'mm',settings,result:prepared.result,parts:parts.map(p => ({id:p.id,name:p.name})) },null,2);
  const mime={dxf:'application/dxf',svg:'image/svg+xml',json:'application/json'}[format];
  const url=URL.createObjectURL(new Blob([content],{type:mime}));
  const link=document.createElement('a'); link.href=url; link.download=`serula-nesting.${format}`; document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url),10000);
}
