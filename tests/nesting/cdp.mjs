const tabs = await (await fetch('http://127.0.0.1:9223/json')).json();
const tab = tabs.find(t => t.type === 'page');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let id = 0; const pending = new Map();
export function onEvent(callback) { ws.addEventListener('message', e => { const data = JSON.parse(e.data); if (!data.id) callback(data); }); }
ws.addEventListener('message', e => { const data = JSON.parse(e.data); if (data.id) { pending.get(data.id)?.(data); pending.delete(data.id); } });
export function send(method, params = {}) { return new Promise(resolve => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })); }); }
export async function evaluate(expression) { return (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result; }
export function close() { ws.close(); }
if (process.argv[2]) { console.log(JSON.stringify(await evaluate(process.argv[2]))); close(); }
