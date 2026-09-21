import { evaluate, close } from './cdp.mjs';
import { loadParts } from './fixture.mjs';
import { pointInPolygon } from '../../frontend/src/dxf/contourEngine.ts';
import assert from 'node:assert/strict';
const parts=loadParts();
const part=parts[0];
const point={x:(part.bounds.minX+part.bounds.maxX)/2,y:(part.bounds.minY+part.bounds.maxY)/2};
assert(pointInPolygon(point,part.outerContour.points));
const bounds={minX:Math.min(...parts.map(p=>p.bounds.minX)),maxX:Math.max(...parts.map(p=>p.bounds.maxX)),minY:Math.min(...parts.map(p=>p.bounds.minY)),maxY:Math.max(...parts.map(p=>p.bounds.maxY))};
async function value(expression){const r=await evaluate(expression);if(r.exceptionDetails)throw new Error(JSON.stringify(r));return r.result.value;}
async function settle(){await value('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');}
const before=await value(`document.querySelector('canvas').toDataURL()`);
const screen=await value(`(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect(),b=${JSON.stringify(bounds)},p=${JSON.stringify(point)};const s=Math.min((c.width-140)/(b.maxX-b.minX),(c.height-140)/(b.maxY-b.minY));return {x:r.left+(c.width/2+(p.x-(b.minX+b.maxX)/2)*s)*r.width/c.width,y:r.top+(c.height/2-(p.y-(b.minY+b.maxY)/2)*s)*r.height/c.height};})()`);
async function mouse(type,x,y){await value(`document.querySelector('canvas').dispatchEvent(new MouseEvent('${type}',{bubbles:true,button:0,buttons:1,clientX:${x},clientY:${y}}))`);await settle();}
await mouse('mousedown',screen.x,screen.y);await mouse('mousemove',screen.x+25,screen.y+15);await mouse('mouseup',screen.x+25,screen.y+15);
assert.notEqual(await value(`document.querySelector('canvas').toDataURL()`),before);
await value(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Taşımayı Sıfırla')).click()`);await settle();
assert.equal(await value(`document.querySelector('canvas').toDataURL()`),before,'Drag reset failed');
await value(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='+').click()`);await settle();
assert.notEqual(await value(`document.querySelector('canvas').toDataURL()`),before);
await value(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Ekrana Sığdır')).click()`);await settle();
assert.equal(await value(`document.querySelector('canvas').toDataURL()`),before);
const corner=await value(`(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return{x:r.left+5,y:r.top+5}})()`);
await mouse('mousedown',corner.x,corner.y);await mouse('mousemove',corner.x+30,corner.y+20);await mouse('mouseup',corner.x+30,corner.y+20);
assert.notEqual(await value(`document.querySelector('canvas').toDataURL()`),before);
await value(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Ekrana Sığdır')).click()`);await settle();
assert.equal(await value(`document.querySelector('canvas').toDataURL()`),before);
console.log('Canvas passed: select/drag/reset, zoom/fit, pan/fit.');close();
