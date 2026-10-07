// Recent folders and the theme button. Folders are faked.
import { base, connect, sleep, counter } from './cdp.mjs';
const { ws, send, evaluate } = await connect();
const c = counter();
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
await send('Page.navigate', { url: base }); await sleep(1200);
await evaluate(`localStorage.removeItem('raute-theme'); location.reload(); 1`); await sleep(1200);
await evaluate(`
  window.confirm = () => true;
  window.__ids = 0;
  window.__mkDir = (name, opts = {}) => {
    const id = opts.id || ++__ids;
    const d = { kind: 'directory', name, __id: id, perm: opts.perm || 'granted', asked: 0,
      values: async function* () { yield { kind: 'file', name: 'README.md', getFile: async () => new File(['# ' + name], 'README.md') }; },
      queryPermission: async () => d.perm,
      requestPermission: async () => { d.asked++; d.perm = 'granted'; return d.perm; },
      isSameEntry: async (o) => o.__id === id, resolve: async () => null };
    return d;
  };
  window.__pickDir = async (d) => { window.showDirectoryPicker = async () => d; document.getElementById('folder-btn').click(); await new Promise((r) => setTimeout(r, 250)); };
  window.__recent = () => [...document.querySelectorAll('#recent-select option')].filter((o) => o.value !== '').map((o) => o.textContent);
  window.__openRecent = (name) => { const s = document.getElementById('recent-select'); s.value = String(__recent().indexOf(name)); s.dispatchEvent(new Event('change')); };
  window.__folderName = () => document.getElementById('folder-box').hidden ? null : document.getElementById('folder-name').textContent;
  1`);
const is = async (label, cond) => c.report(label, await evaluate(cond), await evaluate(`typeof __recent === 'function' ? ({ recent: __recent(), folder: __folderName(), notice: document.getElementById('notice').textContent }) : ({ bg: getComputedStyle(document.body).backgroundColor })`));

// ---------- recent folders ----------
await is('no recent list before any folder', `document.getElementById('recent-select').hidden`);
await evaluate(`__pickDir(__mkDir('alpha', { id: 'A' }))`);
await evaluate(`__pickDir(__mkDir('beta', { id: 'B' }))`);
await evaluate(`__pickDir(__mkDir('alpha', { id: 'A' }))`);
await is('reopening moves to the top, no duplicate', `JSON.stringify(__recent()) === '["alpha","beta"]'`);
await evaluate(`(async () => { for (let i = 1; i <= 11; i++) await __pickDir(__mkDir('f' + i)); })()`);
await is('list keeps the last 10', `__recent().length === 10 && __recent()[0] === 'f11'`);
await evaluate(`(async () => { await __pickDir(__mkDir('docs')); await __pickDir(__mkDir('docs')); })()`);
await is('same names are told apart', `__recent()[0] === 'docs' && __recent()[1] === 'docs (2)'`);
await evaluate(`(async () => { window.__g = __mkDir('gamma', { id: 'G' }); await __pickDir(__g); await __pickDir(__mkDir('delta')); __g.perm = 'prompt'; __openRecent('gamma'); })()`);
await sleep(400);
await is('a recent folder asks for access and opens its own README', `__g.asked >= 1 && __folderName() === 'gamma/' && document.querySelector('#output h1').textContent === 'gamma'`);
await evaluate(`(async () => { window.__o = __mkDir('old', { id: 'O' }); await __pickDir(__o); await __pickDir(__mkDir('eps'));
  __o.values = async function* () { throw new DOMException('gone', 'NotFoundError'); }; __openRecent('old'); })()`);
await sleep(400);
await is('a deleted folder drops off the list', `!__recent().includes('old') && document.getElementById('notice').textContent === '“old” no longer exists.'`);

// ---------- theme (system is dark) ----------
const DARK = 'rgb(16, 20, 26)', LIGHT = 'rgb(238, 241, 244)';
const bg = `getComputedStyle(document.body).backgroundColor`;
const label = `document.getElementById('theme-btn').getAttribute('aria-label')`;
await is('Auto follows the dark system', `${bg} === '${DARK}' && ${label} === 'Colour theme: auto. Click for light.' && !!document.querySelector('#theme-btn svg')`);
await evaluate(`document.getElementById('theme-btn').click(); 1`);
await is('Light overrides it and is remembered', `${bg} === '${LIGHT}' && localStorage.getItem('raute-theme') === 'light'`);
await evaluate(`location.reload(); 1`); await sleep(1200);
await is('Light survives a reload', `${bg} === '${LIGHT}'`);
await evaluate(`document.getElementById('theme-btn').click(); 1`);
await is('Dark', `${bg} === '${DARK}' && ${label} === 'Colour theme: dark. Click for auto.'`);
await evaluate(`document.getElementById('theme-btn').click(); 1`);
await is('back to Auto clears the choice', `localStorage.getItem('raute-theme') === null`);

c.finish(ws);
