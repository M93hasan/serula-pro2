import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import DxfParser from 'dxf-parser';
import { createDxfExport } from '../../frontend/src/dxf/nestingExport.ts';
const part = { id:'part', bounds:{ minX:0,minY:0,maxX:10,maxY:10,width:10,height:10 } };
const placement = { partId:'part',instanceId:'part-0',x:20,y:30,rotation:0,placed:true };
const color = { aci:1,hex:'#ff0000',source:'entity' };
const items = [
  { entity:{id:'line',type:'LINE',layer:'CUT',color,start:{x:0,y:0},end:{x:10,y:0}}, curve:{points:[{x:0,y:0},{x:10,y:0}] } },
  { entity:{id:'spline',type:'SPLINE',layer:'CUT',color,degreeOfSplineCurve:2,knotValues:[0,0,0,1,1,1],controlPoints:[{x:0,y:0},{x:5,y:10},{x:10,y:0}],fitPoints:[]}, curve:{closed:false,points:[{x:0,y:0},{x:5,y:5},{x:10,y:0}]} },
].map(item => ({ ...item,part,placement }));
const dxf = createDxfExport(items);
const parsed = new DxfParser().parseSync(dxf);
assert.equal(parsed.header.$INSUNITS,4);
assert.equal(parsed.header.$MEASUREMENT,1);
assert.equal(parsed.entities.length,2);
assert.equal(parsed.entities[1].type,'SPLINE');
assert.deepEqual(parsed.header.$EXTMIN,{x:20,y:30,z:0});
assert.deepEqual(parsed.header.$EXTMAX,{x:30,y:35,z:0});
if (process.argv[2]) writeFileSync(process.argv[2],dxf);
console.log('DXF structure OK');
