# Raute

A Markdown viewer with KaTeX formulas, named after the German word for `#`.
Everything runs in the browser: no server code, no accounts, and no requests to
other sites. After the first visit it works without an internet connection and
can be installed from the browser's menu.

## Hosting

The repository is served as-is by GitHub Pages. There is no build step, and it
works at the root of a domain or in a subfolder.

## Running without a host

Open `index.html` directly from disk. Everything works except installing the
app and the offline cache, which need a web address.

## Light and dark

The theme button in the top bar switches between **Auto** (follows the
system), **Light** and **Dark**. The choice is remembered.

## Editing and saving

Files open in Preview. Switching to Split or Source means you want to edit:
in Chrome and Edge the browser then asks once whether Raute may save changes
to that file, and from then on every change is saved to the file a moment
after you stop typing. The top bar shows whether changes are saved.

- Ctrl+S (Cmd+S on a Mac) saves right away. Text that is not a file yet
  (typed or pasted) is saved with a "Save as" dialog, and saves itself from
  then on.
- If another program changed the file since Raute read it, Raute does not
  overwrite it and offers **Overwrite** or **Reload** instead.
- Opening another file while changes could not be saved asks first.
- Firefox and Safari cannot write to files; there **Download** saves a copy.

## Styles inside a file

A `<style>` block in a Markdown file styles the preview and the printout, for
example to fit a worksheet on one sheet of paper. Its rules only reach the
document, never Raute's own buttons, and they win over Raute's default look.
`@page` (paper size and margins) is kept. Anything that would load a file
(`url(…)`, `@import`, web fonts) is left out, so Raute stays offline. This
needs a browser that supports CSS `@scope` (current Chrome, Edge and Safari);
browsers without it ignore the block.

## Pictures and links to other files

A web page only receives the one file it is given, not the folder around it.
To show pictures stored next to a Markdown file, choose **Open folder** and
pick the folder that contains the file (or a folder above it). Raute then
resolves relative paths such as `images/plot.png` inside that folder, lists
the folder's Markdown files in the top bar, and follows links between them.
Hidden folders and `node_modules` are skipped.

In Chrome and Edge the folder dialog opens in the folder of the file you are
reading, so usually you only have to confirm it. If the pictures are in a
folder above (paths starting with `../`), the top bar says how many levels
to go up. If one of your recent folders (see below) holds the file and its
pictures, the button names that folder and opens it without the dialog.

If you then open a file that is not in that folder, the folder is set aside:
the top bar shows only that file, and a **Back to** button returns to the
folder.

Raute starts fresh every time: when you close it, it forgets the open file,
the folder and any changes that were not saved (it warns you first if there
are unsaved changes).

In Chrome and Edge, **Recent** next to **Open folder** lists the last 10
folders you opened. Raute keeps only the browser's reference to them, not
their contents. The first time you reopen one, the browser asks for access
and offers **Allow on every visit**; after that, recent folders open with one
click. A folder that was moved or deleted drops off the list.

## Updating

When you change any file, also change `VERSION` at the top of `sw.js`.
Browsers then fetch fresh copies instead of using their saved ones.

## Tests

```bash
node tests/run.mjs
```

This starts a small local web server and a headless Edge (or Chrome) with a
throwaway profile, runs every suite in `tests/`, and cleans up afterwards. It
needs Node 22 or newer. Set `RAUTE_BROWSER` to pick a different browser
binary. File and folder dialogs cannot open in a headless browser, so the
tests use stand-ins for them; the real dialogs and Edge's permission
questions still need a quick check by hand. Firefox is not covered: the
tests drive the browser through Chrome's DevTools protocol, and the file
features need Edge or Chrome anyway.

## What is inside

- `index.html`: the app (page, styles and script)
- `sw.js`: saves the app's files for offline use
- `manifest.webmanifest`: name, icons and file types for the installed app
- `vendor/`: marked 12.0.2 (MIT), DOMPurify 3.1.6 (Apache-2.0 or MPL-2.0),
  KaTeX 0.16.9 (MIT) and the font styles
- `fonts/`: KaTeX fonts plus Atkinson Hyperlegible, Bricolage Grotesque and
  JetBrains Mono (all under the SIL Open Font License)
- `tests/`: browser tests (not part of the app; see Tests above)

## Licenses of the bundled parts

Raute ships copies of other people's work. Their license texts are in
`licenses/` and must stay with the app wherever it is hosted.

| Part | License | File |
| --- | --- | --- |
| KaTeX 0.16.9 (script, styles, math fonts) | MIT | `licenses/KaTeX-LICENSE.txt` |
| marked 12.0.2 | MIT | `licenses/marked-LICENSE.md` |
| DOMPurify 3.1.6 | Apache-2.0 or MPL-2.0 | `licenses/DOMPurify-LICENSE.txt` |
| Atkinson Hyperlegible | SIL OFL 1.1 | `licenses/AtkinsonHyperlegible-OFL.txt` |
| Bricolage Grotesque | SIL OFL 1.1 | `licenses/BricolageGrotesque-OFL.txt` |
| JetBrains Mono | SIL OFL 1.1 | `licenses/JetBrainsMono-OFL.txt` |
