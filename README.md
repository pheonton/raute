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

## Updating

When you change any file, also change `VERSION` at the top of `sw.js`.
Browsers then fetch fresh copies instead of using their saved ones.

## What is inside

- `index.html`: the app (page, styles and script)
- `sw.js`: saves the app's files for offline use
- `manifest.webmanifest`: name, icons and file types for the installed app
- `vendor/`: marked 12.0.2 (MIT), DOMPurify 3.1.6 (Apache-2.0 or MPL-2.0),
  KaTeX 0.16.9 (MIT) and the font styles
- `fonts/`: KaTeX fonts plus Atkinson Hyperlegible, Bricolage Grotesque and
  JetBrains Mono (all under the SIL Open Font License)

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
