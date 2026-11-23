// The extension's one per-user document (ctx.storage): a speaker table per character card and the
// reader's reassigned quotes per message. Pure.
//
// { v: 1, cards: { <charId>: { <key>: entry } }, overrides: { <chatId>: { <messageId>: { d, s } } } }
// An override row holds the digest of the text it was made against (d) and segment index -> name
// (s); a swipe or an edit changes the text, and the row stops applying.

import { normalizeRegistry, normalizeEntry } from './registry.js';

export const DOC_VERSION = 1;
export const MAX_CARDS = 500;
export const MAX_OVERRIDE_CHATS = 100;
export const MAX_OVERRIDE_MESSAGES = 300;
export const MAX_OVERRIDE_SEGMENTS = 64;

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const idOk = id => typeof id === 'string' && id.length > 0 && id.length <= 128;

export function emptyDoc() {
    return { v: DOC_VERSION, cards: {}, overrides: {} };
}

export function normalizeDoc(raw) {
    const doc = emptyDoc();
    if (!isObj(raw)) return doc;
    for (const [charId, table] of Object.entries(isObj(raw.cards) ? raw.cards : {}).slice(0, MAX_CARDS)) {
        if (!idOk(charId)) continue;
        const reg = normalizeRegistry(table);
        if (Object.keys(reg).length) doc.cards[charId] = reg;
    }
    for (const [chatId, rows] of Object.entries(isObj(raw.overrides) ? raw.overrides : {}).slice(-MAX_OVERRIDE_CHATS)) {
        if (!idOk(chatId) || !isObj(rows)) continue;
        const kept = {};
        for (const [mid, row] of Object.entries(rows).slice(-MAX_OVERRIDE_MESSAGES)) {
            const clean = cleanOverride(row);
            if (/^\d+$/.test(mid) && clean) kept[mid] = clean;
        }
        if (Object.keys(kept).length) doc.overrides[chatId] = kept;
    }
    return doc;
}

function cleanOverride(row) {
    if (!isObj(row) || typeof row.d !== 'string' || !isObj(row.s)) return null;
    const s = {};
    for (const [idx, name] of Object.entries(row.s).slice(0, MAX_OVERRIDE_SEGMENTS)) {
        if (/^\d+$/.test(idx) && typeof name === 'string' && name.trim()) s[idx] = name.trim().slice(0, 120);
    }
    return Object.keys(s).length ? { d: row.d.slice(0, 16), s } : null;
}

/** The card's table, made on first ask (an object the caller may add to). */
export function cardRegistry(doc, charId) {
    const id = idOk(charId) ? charId : '_';
    if (!doc.cards[id]) doc.cards[id] = Object.create(null);
    return doc.cards[id];
}

/** The reassignments for a message while its text is still the one they were made against. */
export function overridesFor(doc, chatId, messageId, digest) {
    const row = doc.overrides?.[chatId]?.[String(messageId)];
    return row && row.d === digest ? { ...row.s } : null;
}

/** Writes one message's reassignments (an empty map drops the row); answers the doc. */
export function setOverrides(doc, chatId, messageId, digest, map) {
    if (!idOk(chatId) || !Number.isInteger(messageId)) return doc;
    const rows = doc.overrides[chatId] || (doc.overrides[chatId] = {});
    const clean = cleanOverride({ d: digest, s: map || {} });
    if (clean) rows[String(messageId)] = clean;
    else delete rows[String(messageId)];
    if (!Object.keys(rows).length) delete doc.overrides[chatId];
    // the oldest chats go first once the cap is reached
    const chats = Object.keys(doc.overrides);
    for (const old of chats.slice(0, Math.max(0, chats.length - MAX_OVERRIDE_CHATS))) delete doc.overrides[old];
    return doc;
}

/** A speaker's row edited from the window: name stays the key's, everything else replaced. */
export function updateEntry(registry, key, patch) {
    const cur = registry[key];
    if (!cur) return null;
    const next = normalizeEntry({ ...cur, ...patch, name: cur.name });
    if (next) registry[key] = next;
    return next;
}
