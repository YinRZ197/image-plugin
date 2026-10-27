/**
 * 通过 Chrome CDP 检查 gallery.html 是否由扩展正确加载
 * 用法: node test/cdp-gallery-check.mjs <port>
 */
const port = process.argv[2] || '9444';
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((t) => t.url && t.url.includes('gallery.html'));
if (!page) {
  console.error('gallery tab not found');
  console.error(targets.map((t) => t.url));
  process.exit(1);
}

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
const evalResult = await send('Runtime.evaluate', {
  expression: `({
    title: document.title,
    hasSelectAll: !!document.getElementById('btn-select-all'),
    hasInvert: !!document.getElementById('btn-invert'),
    hasDownload: !!document.getElementById('btn-download'),
    hasGrid: !!document.getElementById('grid'),
    emptyEl: !!document.getElementById('empty'),
    emptyHidden: document.getElementById('empty') ? document.getElementById('empty').hidden : null,
    emptyText: document.getElementById('empty') ? document.getElementById('empty').textContent.trim() : null,
    readyState: document.readyState
  })`,
  returnByValue: true,
  awaitPromise: false,
});

console.log('raw:', JSON.stringify(evalResult, null, 2));
const v = evalResult?.result?.value;
if (!v) {
  console.error('no value from Runtime.evaluate');
  process.exit(1);
}
console.log(JSON.stringify(v, null, 2));
const ok =
  v.hasSelectAll &&
  v.hasInvert &&
  v.hasDownload &&
  v.hasGrid &&
  v.emptyEl;
if (!ok) {
  console.error('gallery DOM check failed');
  process.exit(1);
}
console.log('gallery DOM check passed');
ws.close();
