import {send,evaluate,close} from './cdp.mjs';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
async function value(s){const r=await evaluate(s);if(r.exceptionDetails)throw Error(JSON.stringify(r));return r.result.value;}
const delay=()=>new Promise(r=>setTimeout(r,180));
async function click(s){await value(s);await delay();}
await send('Page.navigate',{url:'http://localhost:5173/'});await new Promise(r=>setTimeout(r,1000));
await click(`document.querySelectorAll('.nav-item')[2].click()`);
assert(await value(`document.querySelector('#panel-parts')!==null`));
await click(`document.querySelector('[aria-label="P1 artır"]').click()`);
assert.equal(await value(`document.querySelector('[aria-label="P1 adet"]').value`),'2');
assert(await value(`document.querySelector('.job-badge').textContent.includes('33')`));
await click(`document.querySelector('[aria-label="P2 azalt"]').click()`);
assert(await value(`document.querySelector('.job-badge').textContent.includes('32')`));
const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});writeFileSync('storage/ui-parts.png',Buffer.from(screenshot.result.data,'base64'));
await click(`document.querySelectorAll('.nav-item')[4].click()`);
assert(await value(`document.querySelector('#panel-settings')!==null`));
await click(`document.querySelectorAll('.nav-item')[5].click()`);
assert(await value(`document.querySelector('#panel-export')!==null`));
assert.equal(await value(`document.querySelectorAll('.export-card:disabled').length`),3);
console.log('PASS sidebar settings/parts/export, quantity +/−, zero exclusion, export disabled before result');close();
