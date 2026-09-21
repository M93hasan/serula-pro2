import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import DxfParser from 'dxf-parser';
import {send,evaluate,onEvent,close} from './cdp.mjs';
const folder=path.resolve('storage/download-tests');mkdirSync(folder,{recursive:true});
const downloads=[],completed=new Set(),errors=[],network=[];
onEvent(e=>{if(e.method==='Browser.downloadWillBegin')downloads.push(e.params);if(e.method==='Browser.downloadProgress'&&e.params.state==='completed')completed.add(e.params.guid);if(e.method==='Runtime.exceptionThrown')errors.push(e.params.exceptionDetails.text);if(e.method==='Network.responseReceived'&&e.params.response.status>=400)network.push(e.params.response.url);});
await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
await send('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:folder,eventsEnabled:true});
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.results=[];window.labels=[];window.beat=0;setInterval(()=>window.beat++,50);const W=Worker;window.Worker=class extends W{constructor(...args){super(...args);this.addEventListener('message',e=>window.results.push(e.data));}};const fill=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...rest){if(/^P[0-9]/.test(text))window.labels.push(text);return fill.call(this,text,...rest);};`});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function value(s){const r=await evaluate(s);if(r.exceptionDetails)throw Error(JSON.stringify(r));return r.result?.value;}
async function until(s,timeout=180000){const start=Date.now();while(Date.now()-start<timeout){if(await value(s))return;await pause(200);}throw Error('Timeout '+s);}
async function click(selector){await value(`document.querySelector(${JSON.stringify(selector)}).click()`);await pause(100);}
async function button(text){await value(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(text)})).click()`);await pause(100);}
await send('Page.navigate',{url:process.env.SERULA_TEST_URL||'http://localhost:5173/'});
await until(`document.querySelector('.job-badge')?.textContent.includes('32')`);
await click('.nav-item:nth-child(3)');assert(await value(`!!document.querySelector('#panel-parts')`));
await click('[aria-label="P1 artır"]');assert.equal(await value(`document.querySelector('[aria-label="P1 adet"]').value`),'2');
await click('[aria-label="P2 azalt"]');assert.equal(await value(`document.querySelector('[aria-label="P2 adet"]').value`),'0');
await button('Hepsi 1 adet');
await click('.nav-item:nth-child(5)');assert(await value(`!!document.querySelector('#panel-settings')`));
await button('Otomatik Nesting');await until(`document.body.innerText.includes('Hesaplanıyor')`);
const before=await value('window.beat');await pause(1000);assert(await value('window.beat')>before+5);
await until(`window.results.some(r=>r.type==='NESTING_COMPLETE')`);
await button('Duraklat');const paused=await value(`document.querySelector('.result-details').textContent`);await pause(500);assert.equal(await value(`document.querySelector('.result-details').textContent`),paused);await button('Devam Et');
await until(`document.body.innerText.includes('Simülasyonu Tekrarla')`);
const result=await value(`window.results.find(r=>r.type==='NESTING_COMPLETE')`);assert.equal(result.result.placedCount,32);assert.equal(result.trialsRun,10);
assert(result.result.usedHeight<828.34);
await click('.nav-item:nth-child(6)');assert.equal(await value(`document.querySelectorAll('.export-card:enabled').length`),3);
for(let i=1;i<=3;i++)await click(`.export-card:nth-child(${i})`);
for(let attempt=0;attempt<100&&completed.size<3;attempt++)await pause(100);
assert.equal(completed.size,3);
for(const download of downloads){const content=readFileSync(path.join(folder,download.guid),'utf8');if(download.suggestedFilename.endsWith('.dxf')){const dxf=new DxfParser().parseSync(content);assert.equal(dxf.entities.length,42);assert(dxf.entities.every(e=>e.type==='SPLINE'));}if(download.suggestedFilename.endsWith('.json'))assert.equal(JSON.parse(content).result.placedCount,32);if(download.suggestedFilename.endsWith('.svg'))assert.equal((content.match(/<path /g)||[]).length,42);}
const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});writeFileSync('storage/final-ui.png',Buffer.from(shot.result.data,'base64'));
await click('.nav-item:nth-child(3)');await button('Tümünü çıkar');assert(await value(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Otomatik Nesting')).disabled`));
await click('[aria-label="P1 artır"]');await click('[aria-label="P1 artır"]');assert(await value(`document.querySelector('.job-badge').textContent.includes('2 parça')`));
assert.equal(await value(`document.querySelectorAll('.export-card:enabled').length`),0);
await value('window.results=[];window.labels=[]');await button('Otomatik Nesting');await until(`window.results.some(r=>r.type==='NESTING_COMPLETE')`);await until(`document.body.innerText.includes('Simülasyonu Tekrarla')`);
assert.equal(await value(`window.results.find(r=>r.type==='NESTING_COMPLETE').result.placedCount`),2);
assert(await value(`window.labels.includes('P1')&&window.labels.includes('P1·2')`));
await click('.nav-item:nth-child(6)');await click('.export-card:nth-child(1)');
for(let attempt=0;attempt<100&&completed.size<4;attempt++)await pause(100);
assert.equal(completed.size,4);const last=downloads.at(-1);assert.equal(new DxfParser().parseSync(readFileSync(path.join(folder,last.guid),'utf8')).entities.length,2);
assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
writeFileSync('storage/ui-export-test-report.json',JSON.stringify({result:result.result,downloads:downloads.map(d=>d.suggestedFilename),errors,network,checks:['settings navigation','quantity increase/decrease/zero','duplicate rendering','DXF/SVG/JSON download','spline roundtrip','responsive UI','pause/resume']},null,2));
await send('Page.reload',{ignoreCache:true});await until(`document.querySelector('.job-badge')?.textContent.includes('32')`);
console.log('PASS: settings, quantity controls, all copies rendered, 4 real downloads validated, spacing result, simulation, refresh, no runtime/network errors.');close();
