// node --test test/dialogue-colors.test.mjs   (from the extension folder; finds the Σ checkout beside it)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { addSpeaker, applyPreset, buildStylesheet, nextColor, normalizeRegistry, recolorAll, resolveKey, speakerClass } from '../client/core/registry.js';
import { cardRegistry, emptyDoc, normalizeDoc, overridesFor, setOverrides, updateEntry } from '../client/core/store.js';
import { attribute, expandNames, paintBody } from '../client/core/paint.js';
import { colorDistanceOklab } from '../client/vendor/dialogue-colors/gradients.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const extDir = path.resolve(here, '..');
const sigmaDir = [process.env.SIGMA_DIR, path.resolve(extDir, '../../../../ProjectSigma-main'), 'D:/ProjectSigma-main']
    .filter(Boolean).find(p => fs.existsSync(path.join(p, 'tools/extension-kit/index.mjs')));
const kit = (f) => pathToFileURL(path.join(sigmaDir, 'tools/extension-kit', f)).href;
const digest = (s) => { let h = 0x811c9dc5; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };

// a reply body as the chat renders it: quotes as .cl-quote spans, *actions* as <em>
const BODY = '<p>Alice folded her arms.</p><p><span class="cl-quote">&quot;I am not doing this.&quot;</span></p>'
    + '<p>Bob laughed. <span class="cl-quote">&quot;You will,&quot;</span> he said. <em>She is so stubborn.</em></p>'
    + '<pre><code>"not a quote"</code></pre>';
const TEXT = 'Alice folded her arms.\n\n"I am not doing this."\n\nBob laughed. "You will," he said. *She is so stubborn.*\n\n```\n"not a quote"\n```';

// ---------- the speaker table ----------

test('new speakers take distinct palette colours; aliases resolve; unsafe names are refused', () => {
    const reg = Object.create(null);
    const a = addSpeaker(reg, 'Alice', { theme: 'pastel', dark: true });
    const b = addSpeaker(reg, 'Bob', { theme: 'pastel', dark: true });
    assert.ok(a.created && b.created);
    assert.ok(colorDistanceOklab(a.entry.color, b.entry.color) * 100 >= 8, 'two speakers never share a colour');
    assert.equal(addSpeaker(reg, 'alice').created, false, 'a name is matched without case');
    updateEntry(reg, 'bob', { aliases: ['Bobby', 'the stranger'] });
    assert.equal(resolveKey(reg, 'BOBBY'), 'bob');
    for (const bad of ['', '   ', 'A[b]', 'x=y', 'a,b', 'Name (nick)']) assert.equal(addSpeaker(reg, bad).entry, null, bad);
    assert.equal(Object.keys(reg).length, 2);
});

test('the palette walk lightens for a dark chat and darkens for a light one', () => {
    const dark = nextColor([], { theme: 'jewel', dark: true });
    const light = nextColor([], { theme: 'jewel', dark: false });
    assert.notEqual(dark, light);
    assert.match(dark, /^#[0-9a-f]{6}$/);
    const reg = normalizeRegistry({ a: { name: 'A', color: '#000000' }, b: { name: 'B', color: '#000000' } });
    recolorAll(reg, { theme: 'neon', dark: true });
    assert.notEqual(reg.a.color, reg.b.color);
});

test('the stylesheet paints solid colours, gradients and their motion, and outweighs the app\'s voices', () => {
    const reg = Object.create(null);
    addSpeaker(reg, 'Alice', { color: '#ff0000' });
    addSpeaker(reg, 'Bob', { color: '#00ff00' });
    reg.bob = applyPreset(reg.bob, 'aurora-drift');
    const css = buildStylesheet([reg], digest, { animate: true });
    const a = speakerClass('alice', digest);
    const b = speakerClass('bob', digest);
    assert.match(css, new RegExp(`:is\\(\\.chat-conv-msg-text \\.dc-q, \\.dc-preview\\)\\.${a} \\{ color: #ff0000;`));
    assert.match(css, new RegExp(`\\.${b} \\{ color: #[0-9a-f]{6}; background-image: linear-gradient\\(`));
    assert.match(css, /animation: dc-gradient-drift 10s linear infinite alternate-reverse/, 'aurora-drift moves, reversed');
    assert.doesNotMatch(buildStylesheet([reg], digest, { animate: false }), /animation:/, 'the setting stills every gradient');
    assert.match(a, /^dc-s-[0-9a-f]{8}$/, 'no name reaches a selector');
});

// ---------- the document ----------

test('the stored document keeps good rows and drops the rest', () => {
    const doc = normalizeDoc({
        cards: { c1: { x: { name: 'Alice', color: 'red', aliases: ['Al', 'Al', ''] }, y: { name: '' } }, '': { z: { name: 'Q' } } },
        overrides: { chat1: { 5: { d: 'abcd1234', s: { 0: 'Bob', x: 'Nope', 1: '' } }, bad: { d: 'x', s: { 0: 'A' } } } },
        junk: true,
    });
    assert.deepEqual(Object.keys(doc.cards), ['c1']);
    assert.equal(doc.cards.c1.alice.color, '#888888', 'a colour that is not #rrggbb falls back');
    assert.deepEqual(doc.cards.c1.alice.aliases, ['Al']);
    assert.deepEqual(doc.overrides, { chat1: { 5: { d: 'abcd1234', s: { 0: 'Bob' } } } });
    assert.equal('junk' in doc, false);
});

test('a reassignment applies only while the message shows the text it was made against', () => {
    const doc = emptyDoc();
    setOverrides(doc, 'chat1', 7, 'aaaa0000', { 1: 'Alice' });
    assert.deepEqual(overridesFor(doc, 'chat1', 7, 'aaaa0000'), { 1: 'Alice' });
    assert.equal(overridesFor(doc, 'chat1', 7, 'bbbb1111'), null, 'a swipe or an edit retires it');
    setOverrides(doc, 'chat1', 7, 'aaaa0000', {});
    assert.deepEqual(doc.overrides, {}, 'Reset to Auto drops the row and the empty chat');
    assert.ok(cardRegistry(doc, 'c9') === cardRegistry(doc, 'c9'));
});

// ---------- attribution and paint ----------

test('macros name speakers as the chat shows them', () => {
    assert.equal(expandNames('{{char}} waves at {{USER}}.', { charName: 'Mira', userName: 'Kai' }), 'Mira waves at Kai.');
});

test('a reply\'s quotes and actions go to the right speakers, and the body\'s elements carry them', async () => {
    const { createElement } = await import(kit('mini-dom.mjs'));
    const reg = Object.create(null);
    addSpeaker(reg, 'Alice');
    addSpeaker(reg, 'Bob');
    const segs = attribute(TEXT, 'Alice', reg);
    assert.deepEqual(segs.map(s => s.assignment?.name), ['Alice', 'Bob', 'Bob'], 'the code fence is skipped, as the chat skips it');
    const root = createElement('div');
    root.innerHTML = BODY;
    const painted = paintBody(root, segs, key => `dc-s-${key}`);
    assert.equal(painted, 3);
    const quotes = root.querySelectorAll('.cl-quote');
    assert.ok(quotes[0].classList.contains('dc-s-alice') && quotes[0].classList.contains('dc-q'));
    assert.ok(quotes[1].classList.contains('dc-s-bob'));
    assert.ok(root.querySelector('em').classList.contains('dc-s-bob'));
    assert.equal(root.querySelector('code').innerHTML.includes('dc-'), false);
});

test('a reassigned line beats the guess; quotes only when the thought marks are empty', async () => {
    const { createElement } = await import(kit('mini-dom.mjs'));
    const reg = Object.create(null);
    addSpeaker(reg, 'Alice');
    addSpeaker(reg, 'Bob');
    assert.equal(attribute(TEXT, 'Alice', reg, { overrides: { 1: 'Alice' } })[1].assignment.name, 'Alice');
    const quotesOnly = attribute(TEXT, 'Alice', reg, { thoughtSymbols: '' });
    assert.equal(quotesOnly.length, 2);
    const root = createElement('div');
    root.innerHTML = BODY;
    paintBody(root, quotesOnly, key => `dc-s-${key}`);
    assert.equal(root.querySelector('em').classList.contains('dc-q'), false);
});

test('a lone rewritten quote still finds its element; a quote the body lacks paints nothing', async () => {
    const { createElement } = await import(kit('mini-dom.mjs'));
    const reg = Object.create(null);
    addSpeaker(reg, 'Alice');
    const root = createElement('div');
    // a display script rewrote the only quote: the one segment and the one element still pair
    root.innerHTML = '<p><span class="cl-quote">&quot;Hi there, pal.&quot;</span> Alice said.</p>';
    assert.equal(paintBody(root, attribute('"Hello there, friend." Alice said.', 'Alice', reg), () => 'dc-s-a'), 1);
    // a script dropped the second quote: the first still pairs, nothing else is painted
    root.innerHTML = '<p><span class="cl-quote">&quot;One.&quot;</span> Alice said.</p>';
    assert.equal(paintBody(root, attribute('"One." Alice said. "Two."', 'Alice', reg), () => 'dc-s-a'), 1);
});

// ---------- the boundary checks and the page ----------

test('lintExtension passes', { skip: !sigmaDir && 'no Σ checkout' }, async () => {
    const { lintExtension } = await import(kit('lint.mjs'));
    assert.deepEqual(await lintExtension(extDir), []);
});

test('in Σ: the extension boots, paints a rendered reply through message.render and writes its stylesheet', { skip: !sigmaDir && 'no Σ checkout' }, async () => {
    const { startSigma } = await import(kit('index.mjs'));
    const sigma = await startSigma({ extensions: [extDir] });
    let page;
    try {
        await sigma.session.enable('dialogue-colors', true);
        page = await sigma.session.page();
        page.CoreAPI.getCharacterById = (id) => (id === 'card-1' ? { id, name: 'Alice' } : undefined);
        page.CoreAPI.syncActivePersonaName = async () => 'Kai';
        await page.boot();
        assert.ok(page.registry.hasHook('message.render'), 'the render hook is joined');

        const message = { name: 'Alice', is_user: false, mes: TEXT };
        // Bob is a side character: added by hand, as the window's Add does
        const out = page.registry.runFilter('message.render', BODY, { chatId: 'chat-1', charId: 'card-1', seq: 1, messageId: 1, message, format: s => s });
        assert.match(out, /class="cl-quote dc-q dc-s-[0-9a-f]{8}"/, 'Alice\'s quote is painted');
        const style = page.document.body.querySelector('#dc-speaker-styles');
        assert.ok(style, 'the stylesheet is on the page');
        assert.match(style.textContent, /\.dc-s-[0-9a-f]{8} \{ color: #[0-9a-f]{6};/);

        // narration left uncoloured: the switch, since Σ reads an empty marks setting as its default '*'
        page.settings['ext:dialogue-colors:thoughtSymbols'] = '';
        page.settings['ext:dialogue-colors:colorThoughts'] = false;
        const quotesOnly = page.registry.runFilter('message.render', BODY, { chatId: 'chat-1', charId: 'card-1', seq: 1, messageId: 1, message, format: s => s });
        assert.match(quotesOnly, /class="cl-quote dc-q/);
        assert.doesNotMatch(quotesOnly, /<em class="[^"]*dc-q/, 'narration stays the chat\'s own');
        page.settings['ext:dialogue-colors:colorThoughts'] = true;
        assert.match(page.registry.runFilter('message.render', BODY, { chatId: 'chat-1', charId: 'card-1', seq: 1, messageId: 1, message, format: s => s }), /<em class="[^"]*dc-q/,
            'an empty marks box falls back to *');

        // a user's message is left alone until their name is in the list
        const mine = { name: 'Kai', is_user: true, mes: '"Hi."' };
        assert.equal(page.registry.runFilter('message.render', '<p><span class="cl-quote">&quot;Hi.&quot;</span></p>', { chatId: 'chat-1', charId: 'card-1', seq: 2, messageId: 2, message: mine, format: s => s }),
            '<p><span class="cl-quote">&quot;Hi.&quot;</span></p>');

        // the new speaker is saved to the extension's document (debounced)
        let saved = null;
        for (let i = 0; i < 50 && !saved?.cards?.['card-1']?.alice; i++) {
            await new Promise(r => setTimeout(r, 50));
            const r = await sigma.session.api('/store/ext-dialogue-colors').catch(() => null);
            if (r?.status === 200) saved = r.body;
        }
        assert.ok(saved?.cards?.['card-1']?.alice, `the card's table is stored: ${JSON.stringify(saved)}`);
    } finally {
        await page?.CoreAPI && new Promise(r => setTimeout(r, 50));
        page?.close();
        await sigma.close();
    }
});
