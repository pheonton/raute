// Runs Raute's browser tests: node tests/run.mjs
// Starts a small web server for the repository and a headless Edge (or Chrome)
// with a throwaway profile, runs every suite, then cleans up.
// Needs Node 22 or newer. Set RAUTE_BROWSER to choose the browser binary.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const suites = ['folders-saving.mjs', 'recent-theme.mjs', 'styles.mjs'];

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.md': 'text/markdown', '.txt': 'text/plain',
};

function findBrowser() {
  if (process.env.RAUTE_BROWSER) return process.env.RAUTE_BROWSER;
  const names = ['microsoft-edge', 'microsoft-edge-stable', 'msedge', 'google-chrome', 'chromium', 'chromium-browser'];
  for (const name of names) {
    if (spawnSync('which', [name]).status === 0) return name;
  }
  throw new Error('No Edge or Chrome found. Set RAUTE_BROWSER to the browser binary.');
}

// ---------- web server for the repository ----------
const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(root, path));
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

// ---------- headless browser ----------
const profile = mkdtempSync(join(tmpdir(), 'raute-test-'));
const browser = spawn(findBrowser(), [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank',
], { stdio: 'ignore', detached: true });

let cdpPort = null;
for (let i = 0; i < 100 && !cdpPort; i++) {
  await new Promise((r) => setTimeout(r, 100));
  const portFile = join(profile, 'DevToolsActivePort');
  if (existsSync(portFile)) cdpPort = readFileSync(portFile, 'utf8').split('\n')[0].trim() || null;
}

function cleanUp() {
  try { process.kill(-browser.pid); } catch (e) { /* already gone */ }
  server.close();
  setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500);
}

if (!cdpPort) {
  console.error('The browser did not start.');
  cleanUp();
  process.exit(1);
}

// ---------- suites ----------
let failed = 0;
for (const suite of suites) {
  console.log(`\n== ${suite}`);
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [join(here, suite)], {
      stdio: 'inherit',
      env: { ...process.env, RAUTE_URL: base, RAUTE_CDP: cdpPort },
    });
    child.on('exit', resolve);
  });
  if (code !== 0) failed++;
}

console.log(failed ? `\n${failed} of ${suites.length} suites failed` : `\nall ${suites.length} suites passed`);
cleanUp();
setTimeout(() => process.exit(failed ? 1 : 0), 600);
