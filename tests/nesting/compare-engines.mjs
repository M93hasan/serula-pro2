import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import DxfParser from 'dxf-parser';
import {normalizeDxfEntities} from '../../frontend/src/dxf/dxfNormalizer.ts';
import {prepareGeometry} from '../../frontend/src/dxf/geometryDiagnostics.ts';
import {detectContours,calculateAbsoluteArea} from '../../frontend/src/dxf/contourEngine.ts';
import {createPartsFromContours} from '../../frontend/src/dxf/partEngine.ts';
import {runNesting,DEFAULT_NESTING_SETTINGS} from '../../frontend/src/nesting/nestingEngine.ts';
import {runGlsNesting,compareLayouts} from '../../frontend/src/nesting/glsNestingEngine.ts';
import {validateLayout} from '../../frontend/src/nesting/validateLayout.ts';
import {geometryAllowance} from '../../frontend/src/nesting/geometryAllowance.ts';
if(!isMainThread){
 const {engine,parts,settings,budget}=workerData;const start=performance.now();
 parentPort.postMessage({started:true});
 if(engine==='nfp-gls'){
  const result=await runGlsNesting(parts,settings,{timeBudgetMs:budget,onProgress:p=>parentPort.postMessage({result:p.result,elapsed:p.elapsedMs,iterations:p.iterations,penaltyUpdates:p.penaltyUpdates})});
  parentPort.postMessage({result:result.result,elapsed:result.elapsedMs,iterations:result.iterations,penaltyUpdates:result.penaltyUpdates,done:true});
 }else{
  const metrics=[p=>calculateAbsoluteArea(p.outerContour.points),p=>p.bounds.height,p=>p.bounds.width,p=>Math.max(p.bounds.width,p.bounds.height),p=>Math.max(p.bounds.width,p.bounds.height)/Math.min(p.bounds.width,p.bounds.height)];
  let best;
  for(let i=0;i<metrics.length;i++){
   const ordered=[...parts].sort((a,b)=>metrics[i](b)-metrics[i](a));
   const allowance=geometryAllowance(parts);
   const result=runNesting(ordered,{...settings,spacing:settings.spacing+2*allowance,margin:settings.margin+allowance},{preserveOrder:true,searchStep:i===0?undefined:40,candidateLimit:1});
   if(performance.now()-start>budget)break;
   if(!best||compareLayouts(result,best,settings)<0)best=result;
   parentPort.postMessage({result:best,elapsed:performance.now()-start,iterations:i+1,penaltyUpdates:0});
  }
  parentPort.postMessage({done:true,elapsed:performance.now()-start});
 }
}else{
 const path=process.env.NESTING_DXF??'storage/reference.dxf';
 const text=existsSync(path)?readFileSync(path,'utf8'):execFileSync('git',['show','84ade18:00.dxf'],{encoding:'utf8',maxBuffer:20*1024*1024});
 const entities=normalizeDxfEntities(new DxfParser().parseSync(text)),geometry=prepareGeometry(entities,0.1);
 if(geometry.issues.some(i=>i.blocking))throw Error(JSON.stringify(geometry.issues));
 const parts=createPartsFromContours(detectContours(geometry.curves));
 const budgets=(process.env.NESTING_BUDGETS??'10000').split(',').map(Number),reports=[];
 for(const budget of budgets)for(const materialType of ['roll','sheet'])for(const engine of ['legacy-v0.0.3','nfp-gls']){
  const settings={...DEFAULT_NESTING_SETTINGS,materialType,curveTolerance:0.1};
  const last=await new Promise((resolve,reject)=>{
   const worker=new Worker(new URL(import.meta.url),{workerData:{parts,settings,budget,engine},execArgv:['--import','./tests/nesting/register.mjs']});let last;let timer;
   worker.on('message',message=>{
    if(message.started){timer=setTimeout(()=>{void worker.terminate();resolve(last?{...last,totalElapsed:engine==='nfp-gls'?budget+1000:budget}:last);},engine==='nfp-gls'?budget+1000:budget);}
    if(message.result)last=message;
    if(message.done){clearTimeout(timer);void worker.terminate();resolve(last?{...last,totalElapsed:message.elapsed}:last);}
   });
   worker.on('error',reject);
   // Identical optimization budgets measured inside the worker. New engine gets
   // a separate final-validation grace; the legacy synchronous engine is stopped.
  });
  if(!last)throw Error(`${engine}: no incumbent within budget`);
  const validation=validateLayout(parts,settings,last.result),r=last.result;
  const report={source:'00.dxf (repository fixture; 32 parts)',engine,budgetMs:budget,settings,placed:r.placedCount,requested:r.totalCount,unplaced:r.unplacedCount,sheets:materialType==='sheet'?(r.sheetCount??1):null,usedLengthMm:materialType==='roll'?r.materialHeight:null,lastSheetUsedHeightMm:materialType==='sheet'?r.usedHeight:null,wastePercent:100-r.efficiency,elapsedMs:last.totalElapsed,lastReportedIncumbentMs:last.elapsed,iterations:last.iterations,penaltyUpdates:last.penaltyUpdates,validation};reports.push(report);console.log(JSON.stringify(report));
 }
 writeFileSync('docs/nesting/benchmark-v0.0.4.json',JSON.stringify(reports,null,2)+'\n');
}
