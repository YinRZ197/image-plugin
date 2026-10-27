const port = process.argv[2] || '9555';
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
console.log('targets:');
for (const t of targets) {
  console.log('-', t.type, t.title, t.url);
}

const page = targets.find((t) => t.type === 'page');
if (!page) process.exit(1);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
};
function send(method, params = {}) {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((resolve, reject) => pending.set(i, { resolve, reject }));
}

await send('Runtime.enable');
const body = await send('Runtime.evaluate', {
  expression: `document.documentElement.outerHTML.slice(0, 2000)`,
  returnByValue: true,
});
console.log('HTML snippet:\n', body.result.value);

const sw = targets.find((t) => t.type === 'service_worker' && t.url.includes('chrome-extension://'));
if (sw) {
  const m = sw.url.match(/chrome-extension:\/\/([^/]+)\//);
  console.log('extension id from SW:', m && m[1]);
}
ws.close();
