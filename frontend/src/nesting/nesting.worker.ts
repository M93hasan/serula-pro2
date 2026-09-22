import { runGlsNesting, type SearchProgress } from './glsNestingEngine';
import type { NestingResult, NestingSettings } from './nestingEngine';
import type { NestingPart } from '../dxf/dxfTypes';
import { NfpCache } from './nfpGeometry';
export type NestingWorkerRequest = { type: 'RUN_NESTING'; parts: NestingPart[]; settings: NestingSettings } | { type:'STOP_NESTING' };
export type NestingWorkerSuccess = { type: 'NESTING_COMPLETE'; result: NestingResult; duration: number; trialsRun: number; bestTrialIndex: number; phase:string; validated:boolean; penaltyUpdates:number };
export type NestingWorkerError = { type: 'NESTING_ERROR'; message: string };
export type NestingWorkerProgress = { type:'NESTING_PROGRESS'; progress:SearchProgress };
export type NestingWorkerResponse = NestingWorkerSuccess | NestingWorkerError | NestingWorkerProgress;
let running:{aborted:boolean}|null=null;
const cache=new NfpCache();
self.onmessage = async (event: MessageEvent<NestingWorkerRequest>) => {
  if(event.data?.type==='STOP_NESTING'){if(running)running.aborted=true;return;}
  if(running)return;
  const signal={aborted:false};running=signal;
  try {
    if (event.data?.type !== 'RUN_NESTING') throw new Error('Geçersiz nesting isteği.');
    const advanced = await runGlsNesting(event.data.parts,event.data.settings,{signal,cache,onProgress:progress=>self.postMessage({type:'NESTING_PROGRESS',progress} satisfies NestingWorkerProgress)});
    self.postMessage({ type:'NESTING_COMPLETE',result:advanced.result,duration:advanced.elapsedMs,trialsRun:advanced.iterations,bestTrialIndex:0,phase:advanced.phase,validated:advanced.validation.valid,penaltyUpdates:advanced.penaltyUpdates } satisfies NestingWorkerSuccess);
  } catch(error) {
    self.postMessage({type:'NESTING_ERROR',message:error instanceof Error?error.message:'Nesting hesaplanamadı.'} satisfies NestingWorkerError);
  } finally {running=null;}
};
