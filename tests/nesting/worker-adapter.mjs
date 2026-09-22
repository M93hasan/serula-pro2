import {parentPort} from 'node:worker_threads';
globalThis.self={postMessage:message=>parentPort.postMessage(message)};
await import('../../frontend/src/nesting/nesting.worker.ts');
parentPort.on('message',data=>self.onmessage({data}));
parentPort.postMessage({type:'READY'});
