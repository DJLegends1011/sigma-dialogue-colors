// Dialogue Colors for Project Σ: each speaker's quotes and *thoughts* in a colour (or gradient) of
// their own, worked out on this device from the text the chat shows. Nothing is written into a
// message and nothing is sent to a model. A port of the Local DOM engine of platberlitz's
// SillyTavern extension (MIT); the speaker heuristics are the original's, unchanged, in vendor/.

import { cardRegistry, emptyDoc, normalizeDoc, overridesFor, setOverrides, updateEntry } from './core/store.js';
import {
    GRADIENT_PRESET_NAMES, PALETTE_NAMES, addSpeaker, applyPreset, buildStylesheet, randomGradient,
    recolorAll, resolveKey, speakerClass,
} from './core/registry.js';
import { attribute, expandNames, paintBody } from './core/paint.js';
import { normalizeGradient } from './vendor/dialogue-colors/gradients.js';

const ID = 'dialogue-colors';
const STYLE_ID = 'dc-speaker-styles';
// a body with none of these has no quote or thought to paint
const DELIMS = /["\u201c\u201d\u00ab\u00bb\u300c\u300d\u300e\u300f\uff02*_]/;

let ctx = null;
let doc = emptyDoc();
let personaName = '';
let unhook = null;
let styleEl = null;
let saveTimer = null;
let saving = Promise.resolve();
let currentCharId = null;
let windowBody = null;

const esc = (s) => ctx.CoreAPI.escapeHtml(String(s ?? ''));
const setting = (k) => ctx.settings.get(k);
const charOf = (charId) => (charId ? ctx.CoreAPI.getCharacterById?.(charId) : null) || null;
const classFor = (charId, key) => speakerClass(`${charId || '_'}\u0001${key}`, ctx.messages.digest);

// the chat's own body colour: light text means a dark chat, where the palette is drawn lighter
function isDark() {
    const color = typeof getComputedStyle === 'function' && document.body ? getComputedStyle(document.body).color : '';
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color || '');
    if (!m) return true;
    const [r, g, b] = m.slice(1, 4).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5;
}
const paletteOpts = () => ({ theme: setting('palette'), dark: isDark() });

function thoughtSymbols() {
    // Σ reads an empty setting as its default, so "leave narration alone" is its own switch
    if (setting('colorThoughts') === false) return '';
    // single characters only (the original's delimiter rule); letters and digits would split words
    return [...String(setting('thoughtSymbols') ?? '')].filter(c => c.trim() && !/[\p{L}\p{N}]/u.test(c)).slice(0, 4).join('');
}

// ---------- storage ----------

function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
}
function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const snapshot = JSON.parse(JSON.stringify(doc));
    saving = saving.catch(() => {}).then(() => ctx.storage.save(snapshot)).catch((e) => {
        ctx.log('save failed', e);
        ctx.CoreAPI.showToast(`Dialogue Colors could not save: ${e?.message || e}`, 'error');
    });
    return saving;
}

// ---------- paint ----------

function refreshStyles() {
    if (!styleEl) return;
    const regs = Object.entries(doc.cards).map(([charId, reg]) => Object.fromEntries(
        Object.entries(reg).map(([key, entry]) => [`${charId}\u0001${key}`, entry]),
    ));
    styleEl.textContent = buildStylesheet(regs, ctx.messages.digest, { animate: setting('animateGradients') !== false });
}

function ensureSpeaker(reg, name, opts = {}) {
    const out = addSpeaker(reg, name, { ...paletteOpts(), ...opts });
    if (out.created) {
        refreshStyles();
        saveSoon();
        queueMicrotask(drawWindow);
    }
    return out;
}

// the speaker a message's own quotes fall back to; a reply's is the card's (or the message's) name
function speakerOf(message, charName) {
    return message.is_user ? (message.name || personaName) : (message.name || charName);
}

/** The segments of a message as the chat shows it, or null when it has nobody to colour. */
function segmentsFor({ chatId, charId, messageId, message }) {
    if (!message || message.is_system) return null;
    const shown = ctx.messages.shown(message);
    if (!shown || !DELIMS.test(shown)) return null;
    const charName = charOf(charId)?.name || '';
    const reg = cardRegistry(doc, charId);
    const speaker = speakerOf(message, charName);
    if (message.is_user) {
        if (setting('colorPersona') === true && speaker) ensureSpeaker(reg, speaker, { persona: true });
        // a user's message is painted only when the name it was sent under is in the list
        if (!resolveKey(reg, speaker)) return null;
    } else if (speaker) {
        ensureSpeaker(reg, speaker);
    }
    const text = expandNames(shown, { charName, userName: personaName });
    const overrides = Number.isInteger(messageId) ? overridesFor(doc, chatId, messageId, ctx.messages.digest(shown)) : null;
    const segments = attribute(text, speaker, reg, { thoughtSymbols: thoughtSymbols(), overrides });
    return { segments, reg, shown, speaker };
}

function renderFilter(html, context) {
    const found = segmentsFor(context);
    if (!found || !found.segments.some(s => s.assignment)) return undefined;
    // a template's content is inert: no image in the body loads while it is painted
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const painted = paintBody(tpl.content || tpl, found.segments, key => classFor(context.charId, key));
    return painted ? tpl.innerHTML : undefined;
}

// Adding or removing a render hook rebuilds the open conversation's rows once (guide, "The
// conversation's hooks"): how a change to who says what reaches rows already drawn. A colour or
// gradient change needs none of this; the stylesheet repaints it.
function repaint() {
    unhook?.();
    unhook = null;
    if (setting('enabled') !== false) unhook = ctx.hooks.add('message.render', renderFilter);
}

// ---------- the window: the card's speakers ----------

function gradientChoice(entry) {
    if (!entry.gradient) return '';
    return entry.gradientPreset || 'custom';
}

function rowHtml(key, entry) {
    const g = normalizeGradient(entry.gradient);
    const choice = gradientChoice(entry);
    const options = ['<option value="">Solid colour</option>', '<option value="random">New random gradient</option>']
        .concat(choice === 'custom' ? ['<option value="custom" selected>Custom gradient</option>'] : [])
        .concat(GRADIENT_PRESET_NAMES.map(n => `<option value="${esc(n)}"${n === choice ? ' selected' : ''}>${esc(n.replace(/-/g, ' '))}</option>`))
        .join('');
    return `
        <div class="cl-cwin-block dc-row" data-key="${esc(key)}">
            <div class="dc-row-head">
                <input type="color" class="dc-color" data-dc="color" value="${esc(entry.color)}" title="Colour" aria-label="${esc(entry.name)}'s colour">
                <span class="dc-name dc-preview ${esc(classFor(currentCharId, key))}">${esc(entry.name)}${entry.persona ? ' <span class="cl-cwin-dim">(you)</span>' : ''}</span>
                <button type="button" class="cl-cwin-btn-text" data-dc="more" aria-expanded="false" title="Aliases, gradient and more"><i class="fa-solid fa-sliders" aria-hidden="true"></i></button>
            </div>
            <div class="dc-row-more cl-hidden">
                <div class="cl-cwin-field">
                    <span class="cl-cwin-field-label">Gradient</span>
                    <select class="cl-select-fluid cl-cwin-field-control" data-dc="gradient">${options}</select>
                </div>
                <label class="cl-cwin-field cl-cwin-toggle${g ? '' : ' is-off'}">
                    <span class="cl-cwin-field-label">Animate the gradient</span>
                    <span><input type="checkbox" class="cl-switch-input" data-dc="animate"${g?.animation?.enabled ? ' checked' : ''}${g ? '' : ' disabled'}><span class="cl-switch" aria-hidden="true"></span></span>
                </label>
                <label class="cl-cwin-field cl-cwin-toggle">
                    <span class="cl-cwin-field-label">Bold</span>
                    <span><input type="checkbox" class="cl-switch-input" data-dc="bold"${entry.bold ? ' checked' : ''}><span class="cl-switch" aria-hidden="true"></span></span>
                </label>
                <div class="cl-cwin-field">
                    <span class="cl-cwin-field-label">Also called</span>
                    <input type="text" class="cl-cwin-input cl-cwin-field-control" data-dc="aliases" maxlength="400" placeholder="Nicknames, comma separated" value="${esc(entry.aliases.join(', '))}">
                </div>
                <div class="dc-row-verbs">
                    <button type="button" class="cl-cwin-btn-text is-danger" data-dc="remove"><i class="fa-solid fa-trash" aria-hidden="true"></i> Remove</button>
                </div>
            </div>
        </div>`;
}

function drawWindow() {
    const body = windowBody;
    if (!body?.isConnected) return;
    const open = new Set([...body.querySelectorAll('.dc-row:not(.is-collapsed) .dc-row-more:not(.cl-hidden)')].map(el => el.closest('.dc-row')?.dataset.key));
    const char = charOf(currentCharId);
    if (!currentCharId) {
        body.innerHTML = '<div class="cl-cwin-empty"><i class="fa-solid fa-palette" aria-hidden="true"></i><p>Open a chat to see its speakers.</p></div>';
        return;
    }
    const reg = cardRegistry(doc, currentCharId);
    const rows = Object.entries(reg);
    body.innerHTML = `
        <div class="dc-win">
            <p class="cl-cwin-group-note">${setting('enabled') === false ? 'Dialogue Colors is switched off in Settings &gt; Extensions. ' : ''}Speakers in ${esc(char?.name || 'this card')}'s chats. A name is added the first time it speaks; add the side characters yourself.</p>
            <div class="dc-rows">${rows.length ? rows.map(([k, e]) => rowHtml(k, e)).join('') : '<div class="cl-cwin-empty"><i class="fa-solid fa-palette" aria-hidden="true"></i><p>Nobody has spoken yet.</p></div>'}</div>
            <form class="dc-add" data-dc="add-form">
                <input type="text" class="cl-cwin-input" data-dc="add-name" maxlength="120" placeholder="Add a speaker by name" aria-label="Speaker's name">
                <button type="submit" class="cl-cwin-btn-text is-primary"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add</button>
            </form>
            <div class="dc-foot">
                <button type="button" class="cl-cwin-btn-text" data-dc="recolor" title="Every speaker gets a new colour from the palette chosen in Settings"><i class="fa-solid fa-shuffle" aria-hidden="true"></i> Recolor All</button>
            </div>
        </div>`;
    for (const sel of body.querySelectorAll('select')) ctx.CoreAPI.initCustomSelect?.(sel);
    for (const key of open) {
        const row = [...body.querySelectorAll('.dc-row')].find(r => r.dataset.key === key);
        row?.querySelector('.dc-row-more')?.classList.remove('cl-hidden');
        row?.querySelector('[data-dc="more"]')?.setAttribute('aria-expanded', 'true');
    }
}

function wireWindow(body) {
    const rowOf = (el) => el.closest('.dc-row');
    const regNow = () => cardRegistry(doc, currentCharId);
    const changed = ({ attribution = false } = {}) => {
        refreshStyles();
        saveSoon();
        if (attribution) repaint();
    };
    body.addEventListener('input', (e) => {
        const el = e.target;
        if (el.dataset?.dc !== 'color') return;
        const key = rowOf(el)?.dataset.key;
        // a new base colour keeps the gradient's other stops
        if (key && updateEntry(regNow(), key, { color: el.value })) refreshStyles();
    });
    body.addEventListener('change', (e) => {
        const el = e.target;
        const key = rowOf(el)?.dataset.key;
        const reg = regNow();
        const entry = key ? reg[key] : null;
        if (!entry) return;
        switch (el.dataset.dc) {
            case 'color': updateEntry(reg, key, { color: el.value }); changed(); break;
            case 'bold': updateEntry(reg, key, { bold: el.checked }); changed(); break;
            case 'animate': {
                const g = normalizeGradient(entry.gradient);
                if (g) updateEntry(reg, key, { gradient: { ...g, animation: { ...g.animation, enabled: el.checked } } });
                changed();
                break;
            }
            case 'gradient': {
                const v = el.value;
                let next = entry;
                if (!v) next = { ...entry, gradient: null, gradientPreset: '' };
                else if (v === 'random') next = { ...randomGradient(entry), gradientPreset: '' };
                else if (v !== 'custom') next = { ...applyPreset(entry, v), gradientPreset: v };
                updateEntry(reg, key, next);
                changed();
                drawWindow();
                break;
            }
            case 'aliases': {
                const aliases = el.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20);
                updateEntry(reg, key, { aliases });
                changed({ attribution: true });
                break;
            }
            default:
        }
    });
    body.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-dc]');
        if (!btn) return;
        const reg = regNow();
        const key = rowOf(btn)?.dataset.key;
        if (btn.dataset.dc === 'more') {
            const more = rowOf(btn).querySelector('.dc-row-more');
            const opening = more.classList.contains('cl-hidden');
            more.classList.toggle('cl-hidden', !opening);
            btn.setAttribute('aria-expanded', String(opening));
        } else if (btn.dataset.dc === 'remove' && key) {
            delete reg[key];
            changed({ attribution: true });
            drawWindow();
        } else if (btn.dataset.dc === 'recolor') {
            if (!Object.keys(reg).length) return;
            recolorAll(reg, paletteOpts());
            changed();
            drawWindow();
        }
    });
    body.addEventListener('submit', (e) => {
        if (e.target.dataset?.dc !== 'add-form') return;
        e.preventDefault();
        const input = e.target.querySelector('[data-dc="add-name"]');
        const name = input.value.trim();
        if (!name || !currentCharId) return;
        const out = addSpeaker(regNow(), name, paletteOpts());
        if (!out.entry) {
            ctx.CoreAPI.showToast('That name cannot be used (brackets, commas, = and parentheses are not allowed).', 'warning');
            return;
        }
        if (!out.created) {
            ctx.CoreAPI.showToast(`${out.entry.name} is already in the list.`, 'info');
            return;
        }
        changed({ attribution: true });
        drawWindow();
        body.querySelector('[data-dc="add-name"]')?.focus();
    });
}

// ---------- reassigning a message's quotes ----------

function openReassign(dialog, context) {
    const { chatId, messageId, message } = context;
    const charId = context.character?.id || currentCharId;
    const found = segmentsFor({ chatId, charId, messageId, message });
    if (!found?.segments.length) {
        ctx.CoreAPI.showToast('This message has no quotes or thoughts to reassign.', 'info');
        return;
    }
    const digest = ctx.messages.digest(found.shown);
    const current = overridesFor(doc, chatId, messageId, digest) || {};
    const names = Object.values(found.reg).map(e => e.name);
    const body = dialog.open({ title: 'Who Says What' });
    const root = document.createElement('div');
    root.className = 'dc-reassign';
    body.innerHTML = '';
    body.appendChild(root);
    root.innerHTML = `
        <p class="settings-hint">Pick a speaker for any line the guess got wrong. Auto keeps the guess. A reassignment lasts while the message's text stays the same.</p>
        <div class="dc-seg-list">${found.segments.map(seg => {
            const pinned = current[String(seg.index)] || '';
            const opts = [`<option value="">Auto${seg.assignment && !pinned ? ` (${esc(seg.assignment.name)})` : ''}</option>`]
                .concat(names.map(n => `<option value="${esc(n)}"${n === pinned ? ' selected' : ''}>${esc(n)}</option>`)).join('');
            const cls = seg.assignment ? `dc-preview ${classFor(charId, seg.assignment.key)}` : '';
            return `<div class="settings-row dc-seg">
                <span class="dc-seg-text"><span class="${esc(cls)}">${esc(seg.text.length > 160 ? `${seg.text.slice(0, 157)}...` : seg.text)}</span></span>
                <select class="cl-select-fluid" data-seg="${seg.index}">${opts}</select>
            </div>`;
        }).join('')}</div>
        <div class="dc-dialog-foot">
            <button type="button" class="cl-btn cl-btn-secondary" data-dc="reset">Reset to Auto</button>
            <button type="button" class="cl-btn cl-btn-primary" data-dc="save">Save</button>
        </div>`;
    for (const sel of root.querySelectorAll('select')) ctx.CoreAPI.initCustomSelect?.(sel);
    root.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-dc]');
        if (!btn) return;
        const map = {};
        if (btn.dataset.dc === 'save') {
            for (const sel of root.querySelectorAll('select[data-seg]')) if (sel.value) map[sel.dataset.seg] = sel.value;
        }
        setOverrides(doc, chatId, messageId, digest, map);
        saveSoon();
        repaint();
        void dialog.close({ force: true });
    });
}

// ---------- settings ----------

function drawSettings(el) {
    const sw = (key, label, hint = '') => `
        <div class="settings-row">
            <label><input type="checkbox" class="cl-switch-input" data-dc-set="${key}"${setting(key) !== false && setting(key) !== '' ? ' checked' : ''}><span class="cl-switch" aria-hidden="true"></span> ${label}</label>
            ${hint ? `<span class="settings-hint">${hint}</span>` : ''}
        </div>`;
    el.innerHTML = `
        ${sw('enabled', 'Color dialogue', 'Quotes and thoughts take their speaker\'s colour. Worked out on this device; messages are never changed.')}
        <div class="settings-row">
            <label>Palette for new speakers</label>
            <select class="cl-select-fluid" data-dc-set="palette">${PALETTE_NAMES.map(n => `<option value="${n}"${n === setting('palette') ? ' selected' : ''}>${n[0].toUpperCase()}${n.slice(1)}</option>`).join('')}</select>
        </div>
        ${sw('colorThoughts', 'Color narration and thoughts', 'Text between the marks below (*like this*) takes the speaker\'s colour too. Off colours quotes only.')}
        <div class="settings-row">
            <label>Narration and thought marks</label>
            <input type="text" class="glass-input" data-dc-set="thoughtSymbols" maxlength="4" value="${esc(setting('thoughtSymbols'))}">
            <span class="settings-hint">One or more single characters, * by default. Left empty, * is used.</span>
        </div>
        ${sw('animateGradients', 'Animate gradients', 'Off keeps every gradient still. Reduced motion on your device stills them anyway.')}
        ${sw('colorPersona', 'Add my persona automatically', 'Your own messages are colored once your name is in a card\'s list; this adds it the first time you speak.')}`;
    for (const sel of el.querySelectorAll('select')) ctx.CoreAPI.initCustomSelect?.(sel);
    el.addEventListener('change', (e) => {
        const t = e.target;
        const key = t.dataset?.dcSet;
        if (!key) return;
        if (t.type === 'checkbox') ctx.settings.set(key, t.checked);
        else if (key === 'thoughtSymbols') ctx.settings.set(key, [...t.value].filter(c => c.trim() && !/[\p{L}\p{N}]/u.test(c)).join(''));
        else ctx.settings.set(key, t.value);
        if (['enabled', 'thoughtSymbols', 'colorThoughts', 'colorPersona'].includes(key)) repaint();
        refreshStyles();
        drawWindow();
    });
}

// ---------- lifecycle ----------

export default {
    async init(context) {
        ctx = context;
        try {
            doc = normalizeDoc(await ctx.storage.load());
        } catch (e) {
            ctx.log('load failed', e);
            doc = emptyDoc();
        }
        try { personaName = (await ctx.CoreAPI.syncActivePersonaName?.()) || ''; } catch { personaName = ''; }

        styleEl = document.createElement('style');
        styleEl.id = STYLE_ID;
        (document.head || document.body).appendChild(styleEl);
        refreshStyles();
        repaint();

        ctx.events.on('conversation.changed', ({ charId }) => {
            currentCharId = charId || null;
            drawWindow();
        });
        ctx.events.on('persona.changed', async () => {
            try { personaName = (await ctx.CoreAPI.syncActivePersonaName?.()) || ''; } catch { /* kept */ }
            repaint();
        });
        ctx.events.on('settings.changed', ({ keys, all }) => {
            if (all || keys.some(k => k.startsWith(`ext:${ID}:`))) { refreshStyles(); repaint(); drawWindow(); }
        });

        ctx.ui.addChatWindow({
            id: 'speakers',
            label: 'Dialogue Colors',
            icon: 'fa-palette',
            size: { w: 32, h: 60 },
            render(body, wctx) {
                const root = document.createElement('div');
                body.innerHTML = '';
                body.appendChild(root);
                windowBody = root;
                currentCharId = wctx.character?.id || currentCharId;
                wireWindow(root);
                drawWindow();
            },
            onOpen(wctx) {
                currentCharId = wctx.character?.id || currentCharId;
                drawWindow();
            },
        });

        const reassign = ctx.ui.dialog({ id: 'reassign', label: 'Who Says What', icon: 'fa-palette', className: 'dc-dialog' });
        ctx.ui.addAction('message', {
            id: 'reassign',
            label: 'Who Says What',
            icon: 'fa-palette',
            when: ({ message }) => setting('enabled') !== false && !message?.is_system && DELIMS.test(ctx.messages.shown(message)),
            run: (mctx) => openReassign(reassign, mctx),
        });

        ctx.ui.addSettingsSection(drawSettings);
    },
    async dispose() {
        if (saveTimer) await saveNow();
        styleEl?.remove();
        styleEl = null;
        windowBody = null;
        unhook = null;
    },
};
