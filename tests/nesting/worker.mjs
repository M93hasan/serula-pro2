import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {DEFAULT_NESTING_SETTINGS} from '../../frontend/src/nesting/nestingEngine.ts';
import {validateLayout} from '../../frontend/src/nesting/validateLayout.ts';
const part={id:'square',name:'square',quantity:60,bounds:{minX:0,minY:0,maxX:20,maxY:20,width:20,height:20},outerContour:{closed:true,points:[{x:0,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20}]},holes:[]};
const settings={...DEFAULT_NESTING_SETTINGS,materialType:'roll',rollWidth:150,timeBudgetMs:10000};
const worker=new Worker(new URL('./worker-adapter.mjs',import.meta.url),{execArgv:['--import','./tests/nesting/register.mjs']});
let stopSent=false,stopTime=0,progressCount=0,lastPlaced=0,completed=0;
await new Promise((resolve,reject)=>{
 const timeout=setTimeout(()=>reject(Error('Worker timeout')),15000);
 worker.on('error',reject);
 worker.on('message',message=>{
  try{
   if(message.type==='READY')worker.postMessage({type:'RUN_NESTING',parts:[part],settings});
   if(message.type==='NESTING_ERROR')throw Error(message.message);
   if(message.type==='NESTING_PROGRESS'){
    progressCount++;lastPlaced=Math.max(lastPlaced,message.progress.result.placedCount);
    if(message.progress.result.placedCount>0&&!stopSent){stopSent=true;stopTime=performance.now();worker.postMessage({type:'STOP_NESTING'});}
   }
   if(message.type==='NESTING_COMPLETE'){
    validateLayout([part],settings,message.result);assert(message.result.placedCount>=lastPlaced);completed++;
    if(completed===1){assert(performance.now()-stopTime<1500,'Stop must promptly return best');assert.equal(message.phase,'Durduruldu');lastPlaced=0;worker.postMessage({type:'RUN_NESTING',parts:[part],settings:{...settings,timeBudgetMs:500}});}
    else{assert(progressCount>1);clearTimeout(timeout);resolve();}
   }
  }catch(error){clearTimeout(timeout);reject(error);}
 });
});
await worker.terminate();console.log('PASS Worker progress, cooperative STOP preserves incumbent, and next run succeeds');
