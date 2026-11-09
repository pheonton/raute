// Adding pictures: pasted, dropped or chosen files land in _assets/ next to the
// document and a link is inserted. The folder is an in-memory stand-in.
import { base, connect, sleep, counter } from './cdp.mjs';
const { ws, send, evaluate } = await connect();
const c = counter();

await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 700, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: base }); await sleep(1200);

await evaluate(`
  window.confirm = () => true;
  const notFound = () => new DOMException('missing', 'NotFoundError');
  window.__file = (name, content) => {
    const f = { kind: 'file', name, content,
      getFile: async () => new File([f.content], name, { lastModified: f.time || 1, type: name.endsWith('.png') ? 'image/png' : '' }),
      queryPermission: async () => 'granted', requestPermission: async () => 'granted',
      createWritable: async () => { let b; return { write: async (x) => { b = x; }, close: async () => { f.content = b; f.time = (f.time || 1) + 1; } }; } };
    return f;
  };
  window.__dir = (name) => {
    const d = { kind: 'directory', name, kids: new Map(), perm: 'granted', asked: 0, deny: false,
      values: async function* () { yield* d.kids.values(); },
      queryPermission: async (o) => o && o.mode === 'readwrite' ? d.perm : 'granted',
      requestPermission: async () => { d.asked++; if (!d.deny) d.perm = 'granted'; return d.perm; },
      isSameEntry: async (o) => o === d, resolve: async () => null,
      getDirectoryHandle: async (n, o) => { let k = d.kids.get(n); if (!k) { if (!o || !o.create) throw notFound(); k = __dir(n); d.kids.set(n, k); } return k; },
      getFileHandle: async (n, o) => { let k = d.kids.get(n); if (!k) { if (!o || !o.create) throw notFound(); k = __file(n, ''); d.kids.set(n, k); } return k; } };
    return d;
  };
  window.__root = __dir('Schule');
  window.__teil = __dir('Teil');
  __teil.kids.set('Mechanik 10.md', __file('Mechanik 10.md', '# Mechanik'));
  __root.kids.set('Teil', __teil);
  window.__assets = () => [...(__teil.kids.get('_assets') || { kids: new Map() }).kids.keys()];
  window.__src = () => document.getElementById('source').value;
  window.__img = (name, type) => new File(['IMG'], name, { type: type || 'image/png' });
  window.__paste = (files, text) => { const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f)); if (text) dt.setData('text/plain', text);
    const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); document.getElementById('source').dispatchEvent(e); return e.defaultPrevented; };
  window.__drop = (files) => { const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f));
    document.getElementById('source').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); };
  window.__note = () => document.getElementById('asset-note').textContent;
  window.showDirectoryPicker = async () => __root;
  document.getElementById('folder-btn').click();
  1`);
await sleep(500);
await evaluate(`document.querySelector('#tree summary[title="Teil"]').click(); 1`);
await sleep(150);
await evaluate(`document.querySelector('.tree-file[data-path="Teil/Mechanik 10.md"]').click(); 1`);
await sleep(400);
const is = async (label, cond) => { await sleep(350); c.report(label, await evaluate(cond), await evaluate(`({ src: __src(), assets: __assets(), note: __note(), notice: document.getElementById('notice').textContent })`)); };

const btn = `document.getElementById('picture-btn')`;
await is('Insert picture is hidden in Preview', `${btn}.hidden`);
await evaluate(`document.getElementById('view-split').click(); 1`);
await is('and offered while editing', `!${btn}.hidden`);

// Paste
await evaluate(`{ const s = document.getElementById('source'); s.selectionStart = s.selectionEnd = s.value.length; } __paste([__img('image.png')]); 1`);
await is('a pasted picture is saved next to the document, named after it', `JSON.stringify(__assets()) === '["Mechanik 10-1.png"]'`);
await is('the link is inserted', `__src() === '# Mechanik\\n\\n![](<_assets/Mechanik 10-1.png>)'`);
await is('and the picture shows', `!!document.querySelector('#output img[src^="blob:"]') && document.getElementById('notice').textContent === 'Saved the picture in _assets/.'`);
await evaluate(`__paste([__img('image.png')]); 1`);
await is('the next one gets the next number', `__assets().includes('Mechanik 10-2.png')`);
await evaluate(`__teil.kids.get('_assets').kids.set('Mechanik 10-3.png', __file('Mechanik 10-3.png', 'OLD')); __paste([__img('image.png')]); 1`);
await is('existing files are not overwritten', `__assets().includes('Mechanik 10-4.png') && __teil.kids.get('_assets').kids.get('Mechanik 10-3.png').content === 'OLD'`);
await is('pasting text stays normal, even with a picture on the clipboard', `__paste([__img('image.png')], 'plain text') === false`);

// Drop
await evaluate(`__drop([__img('foto.jpg', 'image/jpeg')]); 1`);
await is('a dropped picture keeps its name', `__assets().includes('foto.jpg') && __src().endsWith('![](<_assets/foto.jpg>)')`);
await evaluate(`__drop([__img('foto.jpg', 'image/jpeg')]); 1`);
await is('the same name again is numbered', `__assets().includes('foto-2.jpg')`);
await evaluate(`__drop([__img('a#b?c.png')]); 1`);
await is('characters that would break the link are replaced', `__assets().includes('a-b-c.png')`);
await evaluate(`__drop([__img('eins.png'), __img('zwei.png')]); 1`);
await is('several at once', `__src().endsWith('![](<_assets/eins.png>)\\n\\n![](<_assets/zwei.png>)') && document.getElementById('notice').textContent === 'Saved 2 pictures in _assets/.'`);

// The button
await evaluate(`window.showOpenFilePicker = async (o) => { window.__pickOpts = o; return [__file('gewaehlt.png', 'X')]; }; ${btn}.click(); 1`);
await is('Insert picture starts in the working folder and saves the choice', `__pickOpts.startIn === __root && __pickOpts.multiple && __assets().includes('gewaehlt.png')`);

// Permission
await evaluate(`__root.perm = 'prompt'; __root.deny = true; __paste([__img('image.png')]); 1`);
await is('no permission yet: nothing saved, the note asks', `__note() === 'Raute needs your permission to save pictures in “Schule”.' && document.getElementById('asset-btn').textContent === 'Allow' && !__assets().includes('Mechanik 10-5.png')`);
await evaluate(`__root.deny = false; document.getElementById('asset-btn').click(); 1`);
await is('Allow saves the waiting picture', `__assets().includes('Mechanik 10-5.png')`);

// Where it cannot work
await evaluate(`document.getElementById('new-btn').click(); __paste([__img('image.png')]); 1`);
await is('an unsaved document asks to be saved first', `__note() === 'Save the document in the working folder first, so the picture has a place next to it.' && document.getElementById('asset-btn').textContent === 'Save as…'`);
await evaluate(`document.getElementById('view-preview').click(); __drop([__img('x.png')]); 1`);
await is('dropping in Preview explains what to do, and does not open the picture as text', `__note() === 'Switch to Split or Source to add pictures to the document.' && __src() === ''`);

c.finish(ws);
