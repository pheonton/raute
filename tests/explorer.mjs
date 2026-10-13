// The file tree on the left: folders and Markdown files, filtering and Ctrl+K.
import { base, connect, sleep, counter } from './cdp.mjs';
const { ws, send, evaluate } = await connect();
const c = counter();

await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: base }); await sleep(1200);
await evaluate(`localStorage.removeItem('raute-tree'); location.reload(); 1`); await sleep(1200);

const helpers = `
  window.confirm = () => true;
  window.__openFolder = () => {
    const mk = (path, text) => { const f = new File([text], path.split('/').pop()); Object.defineProperty(f, 'webkitRelativePath', { value: path }); return f; };
    const files = [
      mk('docs/README.md', '# Start'),
      mk('docs/Physik/10/Energie/energie-aufgaben.md', '# Energie\\n\\n![a](img/a.png)'),
      mk('docs/Physik/10/Energie/img/a.png', 'PNG'),
      mk('docs/Physik/9/Übung.md', '# Übung'),
      mk('docs/Mathe/Bruch.md', '# Bruch'),
      mk('docs/Bilder/foto.png', 'PNG'),
    ];
    const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f));
    const el = document.getElementById('folder-input');
    Object.defineProperty(el, 'files', { value: dt.files, configurable: true });
    el.dispatchEvent(new Event('change'));
  };
  window.__tree = () => {
    const t = document.getElementById('tree');
    const visible = (el) => el.checkVisibility();
    return {
      shown: !t.hidden && visible(t),
      name: document.getElementById('tree-name').textContent,
      count: document.getElementById('tree-count').textContent,
      folders: [...t.querySelectorAll('summary')].filter(visible).map((s) => s.textContent),
      files: [...t.querySelectorAll('.tree-file')].filter(visible).map((b) => b.dataset.path),
      current: (t.querySelector('[aria-current="true"]') || { dataset: {} }).dataset.path || null,
      pick: (t.querySelector('.tree-file.pick') || { dataset: {} }).dataset.path || null,
      heading: (document.querySelector('#output h1') || {}).textContent || null,
      bar: document.getElementById('folder-path').textContent,
    };
  };
  window.__filter = (text) => { const f = document.getElementById('tree-filter'); f.value = text; f.dispatchEvent(new Event('input')); };
  window.__key = (key, opts = {}) => { const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }); (opts.target || document.getElementById('tree-filter')).dispatchEvent(e); return e.defaultPrevented; };
  1`;
await evaluate(helpers);
const is = async (label, cond) => { await sleep(250); c.report(label, await evaluate(cond), await evaluate('__tree()')); };

// Opening a folder shows the tree.
await evaluate(`__openFolder(); 1`);
await is('the tree shows the folder with its Markdown files',
  `(() => { const t = __tree(); return t.shown && t.name === 'docs' && t.count === '4 files' && t.current === 'README.md' && t.bar === 'README.md'; })()`);
await is('folders without Markdown files are left out, top level collapsed',
  `(() => { const t = __tree(); return JSON.stringify(t.folders) === '["Mathe","Physik"]' && JSON.stringify(t.files) === '["README.md"]'; })()`);

// Clicking files and folders.
await evaluate(`document.querySelector('#tree summary[title="Physik"]').click(); 1`);
await is('clicking a folder opens it (numbers sort naturally: 9 before 10)', `JSON.stringify(__tree().folders) === '["Mathe","Physik","9","10"]'`);
await evaluate(`document.querySelector('#tree summary[title="Physik/10"]').click(); 1`);
await evaluate(`document.querySelector('#tree summary[title="Physik/10/Energie"]').click(); 1`);
await evaluate(`document.querySelector('.tree-file[data-path="Physik/10/Energie/energie-aufgaben.md"]').click(); 1`);
await is('clicking a file opens it and marks it', `(() => { const t = __tree(); return t.current === 'Physik/10/Energie/energie-aufgaben.md' && t.heading === 'Energie' && t.bar === 'Physik/10/Energie/energie-aufgaben.md' && !!document.querySelector('#output img[src^="blob:"]'); })()`);

// Filtering.
await evaluate(`__filter('10 ener'); 1`);
await is('filtering by parts of the path', `(() => { const t = __tree(); return JSON.stringify(t.files) === '["Physik/10/Energie/energie-aufgaben.md"]' && t.count === '1 of 4'; })()`);
await evaluate(`__filter('ubung'); 1`);
await is('accents and case are ignored', `(() => { const t = __tree(); return JSON.stringify(t.files) === '["Physik/9/Übung.md"]' && t.pick === 'Physik/9/Übung.md'; })()`);
await evaluate(`__key('Enter'); 1`);
await is('Enter opens the best match and clears the filter', `(() => { const t = __tree(); return t.current === 'Physik/9/Übung.md' && t.heading === 'Übung' && document.getElementById('tree-filter').value === ''; })()`);
await evaluate(`__filter('md'); 1`);
await is('Arrow keys move through the matches', `(() => { const first = __tree().pick; __key('ArrowDown'); return __tree().pick !== first && __tree().files.includes(__tree().pick); })()`);
await evaluate(`__key('Escape'); 1`);
await is('Escape clears the filter', `document.getElementById('tree-filter').value === '' && __tree().count === '4 files'`);
await evaluate(`__filter('zzz'); 1`);
await is('no match says so', `document.querySelector('#tree .tree-empty').textContent === 'No file matches.'`);
await evaluate(`__filter(''); 1`);

// Keyboard: Ctrl+K searches, Ctrl+P still prints.
await evaluate(`document.getElementById('tree-btn').click(); 1`);
await is('the tree button hides the tree and remembers it', `!__tree().shown && localStorage.getItem('raute-tree') === 'hidden'`);
await is('Ctrl+K shows the tree and focuses the filter', `__key('k', { ctrlKey: true, target: document.body }) && __tree().shown && document.activeElement === document.getElementById('tree-filter')`);
await is('Ctrl+P is left to the browser (printing)', `!__key('p', { ctrlKey: true, target: document.body })`);

// Phone: the tree slides in and gets out of the way.
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 800, deviceScaleFactor: 1, mobile: true });
await evaluate(`document.getElementById('tree-close').click(); __openFolder(); 1`);
await is('on a phone the tree starts hidden', `!__tree().shown && !document.getElementById('folder-box').hidden`);
await evaluate(`document.getElementById('tree-btn').click(); 1`);
await is('the button slides it in over the page', `__tree().shown && getComputedStyle(document.getElementById('tree')).position === 'fixed'`);
await evaluate(`document.querySelector('#tree summary[title="Mathe"]').click(); 1`);
await evaluate(`document.querySelector('.tree-file[data-path="Mathe/Bruch.md"]').click(); 1`);
await is('opening a file closes it again', `!__tree().shown && __tree().heading === 'Bruch'`);
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

// Closing the folder.
await evaluate(`localStorage.removeItem('raute-tree'); document.getElementById('tree-close').click(); 1`);
await is('× closes the folder and the tree', `!__tree().shown && document.getElementById('folder-box').hidden`);

c.finish(ws);
