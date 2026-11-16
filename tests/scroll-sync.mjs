// Split view: the source and the preview scroll together, both ways.
import { base, connect, sleep, counter } from './cdp.mjs';
const { ws, send, evaluate } = await connect();
const c = counter();

await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 700, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: base }); await sleep(1200);

// 60 sections, each with one long line that wraps in the source; every fifth
// has a block that is tall only in the preview.
await evaluate(`(() => {
  const long = 'Ein langer Absatz, der im Quelltext umbricht, weil er in einer einzigen Zeile steht. '.repeat(6);
  const parts = [];
  for (let i = 0; i < 60; i++) {
    parts.push('## H' + i, '', long, '');
    if (i % 5 === 0) parts.push('<div style="height: 300px"></div>', '');
  }
  const t = document.getElementById('source');
  t.value = parts.join('\\n');
  t.dispatchEvent(new Event('input'));
  document.getElementById('view-split').click();
  /* the source y of a line, measured like Raute does */
  window.__lineTop = (n) => {
    const s = document.getElementById('source'), cs = getComputedStyle(s);
    const m = document.createElement('div');
    m.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;width:' +
      (s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) + 'px;font:' + cs.font + ';line-height:' + cs.lineHeight + ';letter-spacing:' + cs.letterSpacing;
    const rows = s.value.split('\\n');
    m.textContent = rows.slice(0, n).join('\\n') + (n ? '\\n' : '');
    const mark = document.createElement('span'); mark.textContent = 'x'; m.appendChild(mark);
    document.body.appendChild(m); const y = mark.offsetTop + parseFloat(cs.paddingTop); m.remove(); return y;
  };
  window.__line = (text) => document.getElementById('source').value.split('\\n').indexOf(text);
  window.__headTop = (i) => { const h = [...document.querySelectorAll('#output h2')].find((x) => x.textContent === 'H' + i);
    return h.getBoundingClientRect().top - document.getElementById('preview').getBoundingClientRect().top; };
  window.__frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))));
})(); 1`);
await sleep(600);
const is = async (label, cond) => c.report(label, await evaluate(cond), await evaluate(`({ s: document.getElementById('source').scrollTop, p: document.getElementById('preview').scrollTop })`));

await is('preview blocks know their source line', `document.querySelector('#output h2').dataset.line === '0' && [...document.querySelectorAll('#output h2')][30].dataset.line === String(__line('## H30'))`);

// source → preview
await evaluate(`(async () => { const s = document.getElementById('source'); s.scrollTop = __lineTop(__line('## H30')); s.dispatchEvent(new Event('scroll')); await __frames(); })()`);
await is('scrolling the source brings the same heading to the top of the preview', `Math.abs(__headTop(30)) < 4`);

// preview → source
await evaluate(`(async () => { const p = document.getElementById('preview'); p.scrollTop += __headTop(45); p.dispatchEvent(new Event('scroll')); await __frames(); })()`);
await is('scrolling the preview brings the same line to the top of the source', `Math.abs(document.getElementById('source').scrollTop - __lineTop(__line('## H45'))) < 4`);

// steady: nothing keeps pushing the other side
const settled = await evaluate(`({ s: document.getElementById('source').scrollTop, p: document.getElementById('preview').scrollTop })`);
await sleep(500);
await is('no back and forth afterwards', `document.getElementById('source').scrollTop === ${settled.s} && document.getElementById('preview').scrollTop === ${settled.p}`);

// in between: smooth, always forward
await is('in between it moves smoothly and only forward', `(async () => {
  const s = document.getElementById('source'), p = document.getElementById('preview'); const from = __lineTop(__line('## H10')), to = __lineTop(__line('## H11'));
  let last = -1; for (let k = 0; k <= 10; k++) { s.scrollTop = from + (to - from) * k / 10; s.dispatchEvent(new Event('scroll')); await __frames(); if (p.scrollTop < last) return false; last = p.scrollTop; }
  return last > 0; })()`);

// the ends
await evaluate(`(async () => { const s = document.getElementById('source'); s.scrollTop = s.scrollHeight; s.dispatchEvent(new Event('scroll')); await __frames(); })()`);
await is('source at the end: preview at the end', `(() => { const p = document.getElementById('preview'); return p.scrollHeight - p.clientHeight - p.scrollTop < 2; })()`);
await evaluate(`(async () => { const p = document.getElementById('preview'); p.scrollTop = 0; p.dispatchEvent(new Event('scroll')); await __frames(); })()`);
await is('preview at the top: source at the top', `document.getElementById('source').scrollTop === 0`);

// typing keeps the preview with the source
await evaluate(`(async () => { const s = document.getElementById('source'); s.scrollTop = __lineTop(__line('## H20')); s.dispatchEvent(new Event('scroll')); await __frames();
  s.value = s.value.replace('## H20', '## H20 neu'); s.dispatchEvent(new Event('input')); await __frames(); await __frames(); })()`);
await is('after typing the preview stays at the same place', `Math.abs([...document.querySelectorAll('#output h2')].find((x) => x.textContent === 'H20 neu').getBoundingClientRect().top - document.getElementById('preview').getBoundingClientRect().top) < 4`);

c.finish(ws);
