// Shared helpers for the suites: talk to the headless browser over the
// Chrome DevTools Protocol. run.mjs passes RAUTE_URL and RAUTE_CDP.
export const base = process.env.RAUTE_URL || 'http://127.0.0.1:8765/';

export async function connect() {
  const port = process.env.RAUTE_CDP || '9333';
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expr) => {
    const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    const err = res.result.exceptionDetails;
    if (err) throw new Error(err.exception?.description || JSON.stringify(err));
    return res.result.result.value;
  };
  return { ws, send, evaluate };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function counter() {
  const c = { failures: 0 };
  c.report = (label, ok, got) => {
    console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got ' + JSON.stringify(got)));
    if (!ok) c.failures++;
  };
  c.finish = (ws) => {
    console.log(c.failures ? `${c.failures} failed` : 'all passed');
    ws.close();
    process.exit(c.failures ? 1 : 0);
  };
  return c;
}
