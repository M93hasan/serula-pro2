import { send, evaluate, close, onEvent } from './cdp.mjs';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
const networkErrors=[];
onEvent(data=>{
  if(data.method==='Network.loadingFailed' && !data.params.canceled) networkErrors.push(data.params.errorText);
  if(data.method==='Network.responseReceived' && data.params.response.status>=400) networkErrors.push(data.params.response.url);
});
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
await send('Page.addScriptToEvaluateOnNewDocument',{source:`
window.testErrors=[];window.workerResults=[];window.heartbeat=0;
window.addEventListener('error',e=>window.testErrors.push(e.message));
window.addEventListener('unhandledrejection',e=>window.testErrors.push(String(e.reason)));
setInterval(()=>window.heartbeat++,50);
const OriginalWorker=window.Worker;
window.Worker=class extends OriginalWorker {constructor(...args){super(...args);this.addEventListener('message',e=>window.workerResults.push(e.data));}};
`});
await send('Page.navigate',{url:'http://localhost:5173/'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function value(expression){const response=await evaluate(expression);if(response.exceptionDetails)throw new Error(JSON.stringify(response));return response.result.value;}
async function until(expression,timeout=120000){const start=Date.now();while(Date.now()-start<timeout){if(await value(expression))return;await sleep(250);}throw new Error('Timed out: '+expression);}
async function click(text){await value(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(text)})).click()`);}
async function margin(number){await value(`(()=>{const el=document.querySelector('[aria-label="margin"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'${number}');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
await until('document.body?.innerText.includes("Parça: 32")');
assert.deepEqual(await value('window.testErrors'),[]);
const doc=await send('DOM.getDocument');
const input=await send('DOM.querySelector',{nodeId:doc.result.root.nodeId,selector:'input[type=file]'});
await send('DOM.setFileInputFiles',{nodeId:input.result.nodeId,files:[process.cwd()+'/00.dxf']});
await sleep(500); await until('document.body?.innerText.includes("Parça: 32")');
await margin(-1); await click('Otomatik Nesting');
await until('window.workerResults.some(r=>r.type==="NESTING_ERROR")');
assert(await value('document.body?.innerText.includes("negatif olamaz")'));
await margin(5); await click('Otomatik Nesting');
await until('document.body?.innerText.includes("Hesaplamayı iptal et")');
await click('Hesaplamayı iptal et');
await until('!document.body?.innerText.includes("Hesaplanıyor")'); await sleep(300);
await click('Otomatik Nesting');
await until('document.body?.innerText.includes("Hesaplanıyor")');
const heartbeat=await value('window.heartbeat'); await sleep(1000);
assert(await value('window.heartbeat')>heartbeat+5,'Main thread blocked');
await until('window.workerResults.some(r=>r.type==="NESTING_COMPLETE")');
await until('document.body?.innerText.includes("Duraklat")');
await click('Duraklat'); const paused=await value('document.body?.innerText'); await sleep(700);
assert.equal(await value('document.body?.innerText'),paused,'Pause did not hold');
await click('Devam Et'); await until('document.body?.innerText.includes("Simülasyonu Tekrarla")');
const response=await value('window.workerResults.find(r=>r.type==="NESTING_COMPLETE")');
assert.equal(response.result.placedCount,32); assert.equal(response.trialsRun,10);
assert.deepEqual(await value('window.testErrors'),[]); assert.deepEqual(networkErrors,[]);
const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
writeFileSync('storage/browser-nesting.png',Buffer.from(screenshot.result.data,'base64'));
writeFileSync('storage/browser-test-report.json',JSON.stringify({response,networkErrors,errors:await value('window.testErrors'),body:await value('document.body?.innerText')},null,2));
console.log('Browser passed: import, Worker, responsiveness, pause/resume, simulation.',JSON.stringify({...response.result,placements:undefined}));
await click('Nesting Sıfırla'); await until('!document.body?.innerText.includes("Yerleşen")');
await send('Page.reload',{ignoreCache:true}); await until('document.body?.innerText.includes("Parça: 32")');
assert.deepEqual(await value('window.testErrors'),[]); assert.deepEqual(networkErrors,[]);
console.log('Production passed: manual import, error recovery, cancel/reset, refresh, zero runtime/network errors.');
close();

