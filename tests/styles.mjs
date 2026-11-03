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
    btnFont: getComputedStyle(document.getElementById('new-btn')).fontFamily.split(',')[0],
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
  btn: getComputedStyle(document.getElementById('new-btn')).color, source: getComputedStyle(document.getElementById('source')).display,
  bg: getComputedStyle(document.querySelector('#output p')).backgroundImage, h1: getComputedStyle(document.querySelector('#output h1')).color,
  sheet: document.adoptedStyleSheets.map((s) => [...s.cssRules].map((x) => x.cssText).join(' ')).join(' ') }))()`);
c.report('cannot hide or restyle Raute itself', r.body === 'flex' && r.bar === 'flex' && r.btn !== 'rgb(255, 0, 0)' && r.source !== 'none', r);
c.report('nothing is loaded from outside', r.bg === 'none' && !/example\.com/.test(r.sheet), r);
c.report('a plain rule without !important still wins', r.h1 === 'rgb(0, 128, 0)', r);

// 3b. Named list markers (@counter-style) work.
await type('<style type="text/css">\n    @counter-style alpha-paren { system: extends lower-alpha; suffix: ") "; }\n    ol { list-style-type: alpha-paren; }\n</style>\n\n1. first\n2. second');
await sleep(300);
r = await evaluate(`({ type: getComputedStyle(document.querySelector('#output ol')).listStyleType,
  rule: document.adoptedStyleSheets.some((s) => [...s.cssRules].some((x) => x instanceof CSSCounterStyleRule && x.name === 'alpha-paren')) })`);
c.report('@counter-style: lists show a) b) c)', r.type === 'alpha-paren' && r.rule, r);

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

// 6. Printing a plain document: 11pt text, tight lines, small headings.
await type('# One\n\n## Two\n\n### Three\n\nBody text.');
await sleep(200);
await send('Emulation.setEmulatedMedia', { media: 'print' });
const printed = () => evaluate(`(() => { const o = document.getElementById('output'); const cs = (sel) => o.querySelector(sel) ? getComputedStyle(o.querySelector(sel)) : {};
  const pt = (px) => Math.round(parseFloat(px) * 0.75 * 10) / 10;
  return { p: pt(cs('p').fontSize), line: Math.round(parseFloat(cs('p').lineHeight) / parseFloat(cs('p').fontSize) * 100) / 100,
    h1: pt(cs('h1').fontSize), h2: pt(cs('h2').fontSize), h3: pt(cs('h3').fontSize) }; })()`);
r = await printed();
c.report('print: 11pt text, line spacing 1.35, headings 16/13/11.5pt', r.p === 11 && r.line === 1.35 && r.h1 === 16 && r.h2 === 13 && r.h3 === 11.5, r);
await type(worksheet); await sleep(200);
r = await printed();
c.report('print: a file\'s own <style> still wins', r.h1 === 17 && r.p === 10, r);
await send('Emulation.setEmulatedMedia', { media: '' });

// 7. A formula far down a long document must not make the page itself scroll.
await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 700, deviceScaleFactor: 1, mobile: false });
await type('# Long\n\n' + 'Text.\n\n'.repeat(120) + '$$\nT = 2\\pi\\sqrt{\\frac{m}{D}}\n$$\n');
await sleep(300);
for (const view of ['preview', 'split']) {
  await evaluate(`document.getElementById('view-${view}').click(); 1`);
  await sleep(150);
  r = await evaluate(`({ page: document.scrollingElement.scrollHeight, window: innerHeight })`);
  c.report(`no second scroll bar with a formula at the end (${view})`, r.page === r.window, r);
}

// 8. Printing suggests the file's name: energie.md prints to energie.pdf.
await evaluate(`(() => { const f = new File(['# Energie'], 'energie-aufgaben.md'); const dt = new DataTransfer(); dt.items.add(f);
  const el = document.getElementById('file-input'); Object.defineProperty(el, 'files', { value: dt.files, configurable: true }); el.dispatchEvent(new Event('change')); })()`);
await sleep(300);
r = await evaluate(`(() => { const screen = document.title; dispatchEvent(new Event('beforeprint')); const printing = document.title;
  dispatchEvent(new Event('afterprint')); return { screen, printing, after: document.title }; })()`);
c.report('window title names the file; printing suggests energie-aufgaben.pdf',
  r.screen === 'energie-aufgaben.md' && r.printing === 'energie-aufgaben' && r.after === r.screen, r);

// 9. Pandoc attributes in curly braces.
await type([
  '<style>.red { color: rgb(255, 0, 0) } .box { border: 2px solid rgb(0, 0, 255) }</style>',
  '',
  '# Title {#start .red}',
  '',
  'Some [red words]{.red} and [styled]{style="color: rgb(0, 128, 0)"} and [Smallcaps]{.smallcaps}.',
  '',
  '![picture](https://example.org/p.png){width=50% .framed}',
  '',
  '[a link](https://example.org){.button target=_blank}',
  '',
  '```{.python .numberLines}',
  'print(1)',
  '```',
  '',
  '::: box',
  'Inside the **box**.',
  '',
  '::: {.inner #deep}',
  'Nested.',
  ':::',
  ':::',
  '',
  'Not attributes: {just braces} and [brackets] stay text.',
].join('\n'));
await sleep(300);
r = await evaluate(`(() => { const o = document.getElementById('output'); const q = (s) => o.querySelector(s);
  return {
    h1: q('h1') && q('h1').id + '|' + q('h1').className + '|' + q('h1').textContent + '|' + getComputedStyle(q('h1')).color,
    span: q('span.red') && q('span.red').textContent + '|' + getComputedStyle(q('span.red')).color,
    styled: [...o.querySelectorAll('span')].map((x) => x.getAttribute('style')).filter(Boolean)[0] || null,
    smallcaps: q('span.smallcaps') ? getComputedStyle(q('span.smallcaps')).fontVariantCaps : null,
    img: q('img') && q('img').className + '|' + q('img').style.width,
    link: q('a.button') && q('a.button').getAttribute('data-target'),
    code: q('pre.numberLines code.language-python') ? q('pre code').textContent : null,
    div: q('div.box') && q('div.box').textContent.trim().replace(/\\s+/g, ' ') + '|' + getComputedStyle(q('div.box')).borderTopColor,
    nested: q('div.box > div.inner#deep') ? 'yes' : 'no',
    plain: [...o.querySelectorAll('p')].pop().textContent,
  }; })()`);
c.report('pandoc: heading {#id .class}', r.h1 === 'start|red|Title|rgb(255, 0, 0)', r.h1);
c.report('pandoc: [span]{.class} and {style=…} and .smallcaps', r.span === 'red words|rgb(255, 0, 0)' && r.styled === 'color: rgb(0, 128, 0)' && r.smallcaps === 'small-caps', r);
c.report('pandoc: picture {width=50%} and link {.class key=val → data-key}', r.img === 'framed|50%' && r.link === '_blank', r);
c.report('pandoc: code fence {.python .numberLines}', r.code === 'print(1)\n', r.code);
c.report('pandoc: ::: fenced divs, also nested', r.div === 'Inside the box. Nested.|rgb(0, 0, 255)' && r.nested === 'yes', r);
c.report('pandoc: plain braces and brackets stay text', r.plain === 'Not attributes: {just braces} and [brackets] stay text.', r.plain);

await type('[x]{onclick="alert(1)" style="background: url(https://example.com/t.png); color: rgb(1, 2, 3)"}\n\n# H {onmouseover=alert(2)}');
await sleep(300);
r = await evaluate(`(() => { const o = document.getElementById('output'); const sp = o.querySelector('span'); const h = o.querySelector('h1');
  return { onclick: sp.hasAttribute('onclick'), data: sp.getAttribute('data-onclick'), style: sp.getAttribute('style'), h: h.getAttributeNames().join(',') }; })()`);
c.report('pandoc: no scripts, nothing loaded from outside', !r.onclick && r.data === 'alert(1)' && !/url|example/.test(r.style) && /rgb\(1, 2, 3\)/.test(r.style) && !/^on|,on/.test(r.h), r);

// 10. Paths in <angle brackets> (with spaces), width in %, and align.
await type('![](<_assets/Mechanik 01.png>){width=85%}\n\n![x](<_assets/a b.png> "Title"){width=25% align="right"}\n\n![](<leer.svg>){width=1.9cm height=0.5cm}');
await sleep(300);
r = await evaluate(`(() => { const t = document.createElement('template'); t.innerHTML = marked.parse(document.getElementById('source').value); return [...t.content.querySelectorAll('img')].map((i) => i.getAttribute('style')); })()`);
c.report('pandoc: <path with spaces>{width=85%}, align=right, sizes in cm', JSON.stringify(r) === JSON.stringify([
  'width:85%', 'width:25%;float:right;margin:0 0 0.5em 1em', 'width:1.9cm;height:0.5cm']), r);

r = await evaluate(`document.querySelector('#output .img-missing').textContent`);
c.report('a missing picture is named as written (spaces, not %20)', r === 'Image not shown: _assets/Mechanik 01.png', r);

// 11. A completely empty table header is hidden; one with an empty cell stays.
await type('| | |\n|---|---|\n| a | b |\n\n| | Ereignis |\n|---|---|\n| A | x |');
await sleep(300);
r = await evaluate(`[...document.querySelectorAll('#output thead')].map((h) => getComputedStyle(h).display)`);
c.report('empty table header hidden, partly empty header kept', JSON.stringify(r) === JSON.stringify(['none', 'table-header-group']), r);

c.finish(ws);
