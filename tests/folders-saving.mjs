// Folders, the Open folder hint, saving to disk, fresh starts and front matter.
// Pickers and files are faked; the real browser dialogs cannot run headless.
import { base, connect, sleep, counter } from './cdp.mjs';
const { ws, send, evaluate } = await connect();
const c = counter();

await send('Page.navigate', { url: base }); await sleep(1200);

const helpers = `
  window.confirm = () => true;
  window.__mk = (name, text, rel, mtime) => {
    const f = new File([text], name, { lastModified: mtime || 1000 });
    if (rel) Object.defineProperty(f, 'webkitRelativePath', { value: rel });
    return f;
  };
  window.__folder = [
    __mk('README.md', '# Docs\\n\\n![a](img/a.png)\\n', 'docs/README.md', 1000),
    __mk('a.png', 'PNG', 'docs/img/a.png', 1000),
    __mk('other.md', '# Other\\n', 'docs/other.md', 2000),
  ];
  window.__pick = (input, files) => {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    const el = document.getElementById(input);
    Object.defineProperty(el, 'files', { value: dt.files, configurable: true });
    el.dispatchEvent(new Event('change'));
  };
  window.__type = (t) => { const el = document.getElementById('source'); el.value = t; el.dispatchEvent(new Event('input')); };
  window.__ui = () => {
    const $ = (id) => document.getElementById(id);
    return {
      file: $('file-name').hidden ? null : $('file-name').textContent,
      folder: $('folder-box').hidden ? null : $('folder-name').textContent,
      selected: $('folder-box').hidden ? null : $('folder-select').value,
      aside: $('aside-btn').hidden ? null : $('aside-btn').textContent,
      asset: $('asset-note').textContent + ($('asset-btn').hidden ? '' : ' [' + $('asset-btn').textContent + ']'),
      notice: $('notice').textContent,
      heading: ($('output').querySelector('h1') || {}).textContent || null,
      img: !!$('output').querySelector('img[src^="blob:"]'),
      save: $('save-note').textContent + ($('save-btn').hidden ? '' : ' [' + $('save-btn').textContent + ']') + ($('reload-btn').hidden ? '' : ' [Reload]'),
      view: $('panes').dataset.view,
    };
  };
  1`;
await evaluate(helpers);
const check = async (label, expected) => {
  await sleep(400);
  const ui = await evaluate('__ui()');
  const bad = Object.entries(expected).filter(([k, v]) => JSON.stringify(ui[k]) !== JSON.stringify(v));
  c.report(label, !bad.length, ui);
};
const is = async (label, cond) => c.report(label, await evaluate(cond), await evaluate('__ui()'));

// ---------- folders ----------
await evaluate(`__pick('folder-input', __folder); 1`);
await check('open folder shows README with picture', { folder: 'docs/', selected: 'README.md', heading: 'Docs', img: true, aside: null });
await evaluate(`__pick('file-input', [__mk('notes.md', '# Notes\\n\\n![x](pic.png)\\n', null, 5000)]); 1`);
await check('outside file hides the folder', { file: 'notes.md', folder: null, aside: 'Back to “docs”', heading: 'Notes', asset: '1 linked image is not shown. [Open folder]' });
await evaluate(`__pick('file-input', [__mk('README.md', '# Elsewhere\\n', null, 9000)]); 1`);
await check('same-named file from elsewhere stays outside', { file: 'README.md', folder: null, heading: 'Elsewhere' });
await evaluate(`__pick('file-input', [__folder[2]]); 1`);
await check('file from the folder brings it back', { folder: 'docs/', selected: 'other.md', aside: null, heading: 'Other' });
await evaluate(`__pick('file-input', [__mk('notes.md', '# Notes\\n', null, 5000)]); 1`);
await evaluate(`document.getElementById('aside-btn').click(); 1`);
await check('Back returns to other.md', { folder: 'docs/', selected: 'other.md', aside: null, heading: 'Other' });
await evaluate(`{ const s = document.getElementById('folder-select'); s.value = '::close'; s.dispatchEvent(new Event('change')); }
  __pick('file-input', [__mk('notes.md', '# Notes\\n', null, 5000)]); 1`);
await sleep(400);
await evaluate(`__pick('folder-input', __folder); 1`);
await check('folder without the open file is set aside', { file: 'notes.md', folder: null, aside: 'Show “docs”', notice: 'notes.md is not in “docs”.' });
await evaluate(`document.getElementById('aside-btn').click(); 1`);
await check('Show opens the folder at README', { folder: 'docs/', selected: 'README.md', img: true });
await evaluate(`document.getElementById('clear-btn').click(); __type('# Typed\\n\\n![a](img/a.png)'); 1`);
await check('typed text keeps using the folder', { folder: 'docs/', heading: 'Typed', img: true });

// ---------- Open folder starts next to the file ----------
await evaluate(`
  { const s = document.getElementById('folder-select'); s.value = '::close'; s.dispatchEvent(new Event('change')); }
  window.__fh = { kind: 'file', name: 'deep.md', getFile: async () => __mk('deep.md', '# Deep\\n\\n![a](../../img/a.png)\\n![b](pics/b.png)\\n', null, 7000) };
  window.showOpenFilePicker = async () => [__fh];
  window.showDirectoryPicker = (o) => { window.__dirOpts = o; window.__noteDuring = document.getElementById('asset-note').textContent; return Promise.reject(new DOMException('x', 'AbortError')); };
  document.getElementById('file-input').click(); 1`);
await check('newer file picker opens the file', { file: 'deep.md', heading: 'Deep', asset: '2 linked images are not shown. [Open folder]' });
await evaluate(`document.getElementById('asset-btn').click(); 1`);
await sleep(300);
await is('folder dialog starts next to the file with a hint', `__dirOpts.startIn === __fh && !__dirOpts.id && __noteDuring === 'The images are in a folder above this file. Go up 2 levels, then choose that folder.'`);

// ---------- saving ----------
await evaluate(`
  window.__disk = {};
  window.__fakeFile = (name, text, perm) => {
    const d = window.__disk[name] = { text, mtime: 10000, perm: perm || 'prompt', asked: 0 };
    return { kind: 'file', name,
      getFile: async () => __mk(name, d.text, null, d.mtime),
      queryPermission: async () => d.perm,
      requestPermission: async () => { d.asked++; if (d.perm === 'prompt') d.perm = d.grant || 'granted'; return d.perm; },
      createWritable: async () => { let buf = ''; return { write: async (t) => { buf += t; }, close: async () => { d.text = buf; d.mtime += 1000; } }; } };
  }; 1`);
await evaluate(`{ const h = __fakeFile('edit.md', '# Edit\\n'); window.showOpenFilePicker = async () => [h]; document.getElementById('file-input').click(); } 1`);
await check('opened file starts in Preview', { view: 'preview', save: '' });
await evaluate(`document.getElementById('view-split').click(); 1`);
await sleep(200);
await is('switching to Split asks once for write access', `__disk['edit.md'].asked === 1`);
await evaluate(`__type('# Edit\\n\\nchanged'); 1`);
await sleep(1600);
await is('autosave writes the file', `__disk['edit.md'].text === '# Edit\\n\\nchanged' && __ui().save === 'Saved'`);
await evaluate(`__disk['edit.md'].text = 'from vscode'; __disk['edit.md'].mtime += 5000; __type('mine'); 1`);
await sleep(1600);
await is('change on disk is not overwritten', `__disk['edit.md'].text === 'from vscode' && __ui().save === 'Changed on disk by another program. [Overwrite] [Reload]'`);
await evaluate(`document.getElementById('reload-btn').click(); 1`);
await sleep(300);
await is('Reload shows the file from disk', `document.getElementById('source').value === 'from vscode' && __ui().save === ''`);
await evaluate(`{ const h = __fakeFile('ro.md', '# RO\\n'); __disk['ro.md'].grant = 'denied'; window.showOpenFilePicker = async () => [h]; document.getElementById('file-input').click(); } 1`);
await sleep(400);
await evaluate(`document.getElementById('view-split').click(); __type('# RO\\n\\nedit'); 1`);
await sleep(1600);
await is('declined: file untouched, Save offered', `__disk['ro.md'].text === '# RO\\n' && __ui().save === 'Unsaved changes. [Save]'`);
await evaluate(`window.confirm = () => false; { const h = __fakeFile('next.md', '# Next\\n'); window.showOpenFilePicker = async () => [h]; document.getElementById('file-input').click(); } 1`);
await sleep(500);
await is('opening another file asks, Cancel keeps the edits', `document.getElementById('source').value === '# RO\\n\\nedit'`);
await evaluate(`window.confirm = () => true; document.getElementById('clear-btn').click(); __type('# New\\n'); 1`);
await sleep(200);
await check('new text offers Save as', { save: 'Not saved to a file. [Save as…]', view: 'split' });
await evaluate(`window.showSaveFilePicker = async (o) => { window.__suggested = o.suggestedName; const h = __fakeFile('new.md', ''); __disk['new.md'].perm = 'granted'; return h; };
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true })); 1`);
await sleep(500);
await is('Ctrl+S saves as new.md', `__suggested === 'Untitled.md' && __disk['new.md'].text === '# New\\n' && __ui().file === 'new.md' && __ui().save === 'Saved'`);

// ---------- front matter ----------
await evaluate(`__type('---\\ntitle: Hello\\n---\\n\\n# Body\\n'); 1`);
await sleep(300);
await is('front matter in a closed box', `(() => { const d = document.querySelector('#output details.front-matter'); return d && !d.open && document.getElementById('output').firstElementChild === d && !document.querySelector('#output h2, #output hr'); })()`);
await evaluate(`__type('# A\\n\\n---\\n\\ntext\\n\\n---\\n'); 1`);
await sleep(200);
await is('a later --- is not front matter', `!document.querySelector('#output details.front-matter')`);

// ---------- fresh start ----------
await send('Page.navigate', { url: base }); await sleep(1200);
await evaluate(helpers);
await check('restart shows the sample with no folder, in Preview', { file: 'sample.md (example)', folder: null, aside: null, heading: 'Raute', view: 'preview' });

c.finish(ws);
