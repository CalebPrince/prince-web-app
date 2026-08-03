import fs from 'node:fs/promises';

const [url, output, scrollY = '0'] = process.argv.slice(2);
const tabs = await (await fetch('http://127.0.0.1:9225/json')).json();
const tab = tabs.find((item) => item.type === 'page');
if (!tab) throw new Error('No Chrome page target found');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let seq = 0;
const pending = new Map();
ws.onmessage = ({data}) => {
  const message = JSON.parse(data);
  if (message.id && pending.has(message.id)) {
    const {resolve, reject} = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, {resolve, reject});
  ws.send(JSON.stringify({id, method, params}));
});
await send('Page.enable');
await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {source: `localStorage.setItem('theme','light');localStorage.setItem('site_default_theme','light');`});
await send('Page.navigate', {url});
await new Promise((resolve) => setTimeout(resolve, 6000));
await send('Runtime.evaluate', {expression: `localStorage.setItem('theme','light');document.documentElement.setAttribute('data-theme','light');scrollTo(0,${Number(scrollY)});`, awaitPromise: true});
await new Promise((resolve) => setTimeout(resolve, 1500));
const shot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false, fromSurface: true});
await fs.writeFile(output, Buffer.from(shot.data, 'base64'));
ws.close();
