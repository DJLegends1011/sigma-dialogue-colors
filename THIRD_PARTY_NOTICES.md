# Third-party notices

Dialogue Colors for Project Σ is licensed under the GNU Affero General Public License v3.0
(see LICENSE). It includes the following third-party material, which keeps its own licence.

## Dialogue Colors for SillyTavern (platberlitz/sillytavern-character-colors)

Source: https://github.com/platberlitz/sillytavern-character-colors, version 6.1.4
(commit 78b03c48fa7d638b49693260f49a2be2ab4fc6cf). The upstream README states the licence as
MIT; the repository carries no LICENSE file of its own, so the notice below names the
repository's owner and contributors.

Copied unmodified into `client/vendor/dialogue-colors/`:
`attribution.js`, `attribution-store.js`, `character-style.js`, `gradients.js`,
`group-profiles.js`, `seeded-gradient-generator.js`, `utils.js`.

Copied in part (each function verbatim, the file's header says what was left out):
`client/vendor/dialogue-colors/color-blocks.js` (from `src/color-blocks.js`),
`client/vendor/dialogue-colors/dom-match.js` (from `src/dom-engine.js`),
`client/vendor/dialogue-colors/prompts.js` (`normalizePromptThoughtSymbols`, from `src/prompts.js`),
`client/core/registry.js` (`COLOR_THEMES` and the next-colour walk, from `src/palettes.js`),
`client/style.css` and the gradient rule in `client/core/registry.js` (the gradient text recipe
and `@keyframes dc-gradient-drift`, from `style.css`).

Written for this port (stand-ins for the original's SillyTavern-facing modules):
`client/vendor/dialogue-colors/st-api.js`, `state.js`, `palettes.js`.

`test/upstream-attribution.test.mjs` is upstream's `tests/dom-attribution-heuristics.test.js`
with a new import block and its two DOM-statistics tests removed.

MIT License

Copyright (c) 2026 platberlitz and the Dialogue Colors contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
