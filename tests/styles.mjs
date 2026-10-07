// <style> blocks inside a document: applied to the preview and printing,
// confined to the document, and never loading anything from outside.
import { readFileSync } from 'node:fs';
import { base, connect, sleep, counter } from './cdp.mjs';
const worksheet = readFileSync(new URL('./fixtures/worksheet.md', import.meta.url), 'utf8');
const { ws, send, evaluate } = await connect();
const c = counter();
const type = (t) => evaluate(`(() => { const el = document.getElementById('source'); el.value = ${JSON.stringify(t)}; el.dispatchEvent(new Event('input')); })()`);

await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
await send('Page.navigate', { url: base }); await sleep(1200);
await evaluate(`window.confirm = () => true; 1`);

// 1. The worksheet's styles reach the preview, but not Raute's controls.
await type(worksheet); await sleep(300);
let r = await evaluate(`(() => { const o = document.getElementById('output'); const cs = (sel) => getComputedStyle(o.querySelector(sel));
  return { h1: cs('h1').fontSize, p: cs('p').fontFamily.split(',')[0], td: cs('td').fontSize, hr: cs('hr').borderBottomWidth + ' ' + cs('hr').borderTopWidth,
    btnFont: getComputedStyle(document.getElementById('clear-btn')).fontFamily.split(',')[0],
    sourceFont: getComputedStyle(document.getElementById('source')).fontFamily.split(',')[0],
    styleShownAsText: o.textContent.includes('@page') }; })()`);
c.report('worksheet: heading 17pt, its font, small tables, writing lines',
  r.h1 === '22.6667px' && r.p === '"Liberation Sans"' && r.td === '12.6667px' && r.hr === '1px 0px' && !r.styleShownAsText, r);
c.report('Raute\'s own controls keep their fonts', r.btnFont === '"Atkinson Hyperlegible"' && r.sourceFont === '"JetBrains Mono"', r);

// 2. @page is kept: printing uses A4 (595 x 842 points).
const pdf = Buffer.from((await send('Page.printToPDF', { preferCSSPageSize: true })).result.data, 'base64').toString('latin1');
const box = (pdf.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/) || []).slice(1).map(Number);
c.report('printing uses the file\'s A4 page size', Math.abs(box[0] - 595) < 3 && Math.abs(box[1] - 842) < 3, box);

// 3. A file that tries to break out.
await evaluate(`document.getElementById('view-split').click(); 1`);
await type('<style>\nbody { display: none } .bar { display: none } button { color: rgb(255,0,0) } #source { display: none }\n' +
  'p { background-image: url(https://example.com/track.png) }\n@import url(https://example.com/x.css);\n' +
  '@font-face { font-family: X; src: url(https://example.com/x.woff2) }\nh1 { color: rgb(0, 128, 0) }\n</style>\n\n# Title\n\ntext');
await sleep(300);
r = await evaluate(`(() => ({ body: getComputedStyle(document.body).display, bar: getComputedStyle(document.querySelector('.bar')).display,
  btn: getComputedStyle(document.getElementById('clear-btn')).color, source: getComputedStyle(document.getElementById('source')).display,
  bg: getComputedStyle(document.querySelector('#output p')).backgroundImage, h1: getComputedStyle(document.querySelector('#output h1')).color,
  sheet: document.adoptedStyleSheets.map((s) => [...s.cssRules].map((x) => x.cssText).join(' ')).join(' ') }))()`);
c.report('cannot hide or restyle Raute itself', r.body === 'flex' && r.bar === 'flex' && r.btn !== 'rgb(255, 0, 0)' && r.source !== 'none', r);
c.report('nothing is loaded from outside', r.bg === 'none' && !/example\.com/.test(r.sheet), r);
c.report('a plain rule without !important still wins', r.h1 === 'rgb(0, 128, 0)', r);

// 4. <style> inside a code block is just text.
await type('```html\n<style>h1 { color: rgb(255, 0, 0) }</style>\n```\n\n# Heading');
await sleep(300);
r = await evaluate(`({ h1: getComputedStyle(document.querySelector('#output h1')).color, code: document.querySelector('#output pre').textContent.includes('<style>') })`);
c.report('<style> in a code block is shown, not applied', r.h1 !== 'rgb(255, 0, 0)' && r.code, r);

// 5. Clearing removes the styles; plain documents look as before.
await type(worksheet); await sleep(200);
await type(''); await sleep(200);
r = await evaluate(`document.adoptedStyleSheets.reduce((n, s) => n + s.cssRules.length, 0)`);
c.report('clearing removes the document styles', r === 0, r);
await type('# Plain\n\ntext'); await sleep(200);
r = await evaluate(`getComputedStyle(document.querySelector('#output h1')).fontSize`);
c.report('a plain document looks as before', r === '33px', r);

c.finish(ws);
