import { runAdvancedNesting } from './advancedNestingEngine';
import type { NestingResult, NestingSettings } from './nestingEngine';
import type { NestingPart } from '../dxf/dxfTypes';
export type NestingWorkerRequest = { type: 'RUN_NESTING'; parts: NestingPart[]; settings: NestingSettings };
export type NestingWorkerSuccess = { type: 'NESTING_COMPLETE'; result: NestingResult; duration: number; trialsRun: number; bestTrialIndex: number };
export type NestingWorkerError = { type: 'NESTING_ERROR'; message: string };
export type NestingWorkerResponse = NestingWorkerSuccess | NestingWorkerError;
self.onmessage = (event: MessageEvent<NestingWorkerRequest>) => {
  try {
    if (event.data?.type !== 'RUN_NESTING') throw new Error('Geçersiz nesting isteği.');
    const count = event.data.parts.reduce((total, part) => total + part.quantity, 0);
    const advanced = runAdvancedNesting(event.data.parts, event.data.settings, { maxTrials: count > 100 || event.data.settings.rotations.length > 4 ? 1 : 5 });
    const response: NestingWorkerSuccess = { type: 'NESTING_COMPLETE', result: advanced.result,
      duration: advanced.durationMs, trialsRun: advanced.trials, bestTrialIndex: advanced.bestTrialIndex };
    self.postMessage(response);
  } catch (error) {
    const response: NestingWorkerError = { type: 'NESTING_ERROR', message: error instanceof Error ? error.message : 'Nesting hesaplanamadı.' };
    self.postMessage(response);
  }
};
