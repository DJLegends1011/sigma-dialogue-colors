// The speaker table: who has which colour or gradient, per character card. Pure: no DOM, no ctx.
// Palettes and the next-colour walk follow the original's palettes.js (COLOR_THEMES copied verbatim,
// MIT, see THIRD_PARTY_NOTICES.md); the readability and perceptual-conflict passes are left out.

import {
    BUILTIN_GRADIENT_PRESETS, applyGradientPresetToEntry, buildGradientCss, buildRandomGradient,
    cloneGradient, colorDistanceOklab, normalizeGradient,
} from '../vendor/dialogue-colors/gradients.js';
import { normalizeRegistryIdentity, normalizeRegistryIdentityName } from '../vendor/dialogue-colors/group-profiles.js';
import { hslToHex, normalizeAliases, normalizeHexColor } from '../vendor/dialogue-colors/utils.js';

// copied verbatim from v6.1.4 src/palettes.js: [hue, saturation, lightness] slots
export const COLOR_THEMES = {
    pastel: [[340, 70, 75], [200, 70, 75], [120, 50, 70], [45, 80, 70], [280, 60, 75], [170, 60, 70], [20, 80, 75], [240, 60, 75]],
    neon: [[320, 100, 60], [180, 100, 50], [90, 100, 50], [45, 100, 55], [270, 100, 60], [150, 100, 45], [0, 100, 60], [210, 100, 55]],
    earth: [[25, 50, 55], [45, 40, 50], [90, 30, 45], [150, 35, 45], [180, 30, 50], [30, 60, 60], [60, 35, 55], [120, 25, 50]],
    jewel: [[340, 70, 45], [200, 80, 40], [150, 70, 40], [45, 80, 50], [280, 70, 45], [170, 70, 40], [0, 75, 50], [220, 75, 45]],
    muted: [[350, 30, 60], [200, 30, 55], [120, 25, 55], [45, 35, 60], [280, 25, 55], [170, 30, 55], [20, 35, 60], [240, 25, 55]],
    jade: [[170, 60, 55], [150, 55, 50], [160, 65, 45], [165, 50, 60], [155, 70, 40], [140, 45, 55], [175, 55, 50], [130, 60, 45]],
    forest: [[120, 50, 50], [90, 45, 45], [100, 55, 40], [110, 40, 55], [80, 50, 35], [130, 45, 50], [95, 60, 45], [85, 55, 40]],
    ocean: [[200, 70, 60], [190, 65, 55], [180, 60, 65], [210, 55, 60], [170, 75, 50], [220, 50, 65], [195, 80, 45], [205, 60, 70]],
    sunset: [[15, 85, 60], [35, 90, 55], [25, 80, 65], [40, 75, 70], [30, 95, 50], [20, 70, 75], [45, 85, 55], [10, 80, 60]],
    aurora: [[280, 50, 70], [300, 55, 65], [260, 45, 75], [290, 60, 60], [270, 65, 55], [310, 40, 80], [285, 70, 50], [275, 55, 70]],
    warm: [[20, 70, 65], [35, 75, 60], [45, 65, 70], [30, 80, 55], [40, 85, 50], [25, 90, 60], [50, 60, 75], [15, 75, 65]],
    cool: [[210, 60, 70], [240, 55, 65], [200, 65, 75], [225, 70, 60], [190, 75, 55], [250, 50, 80], [215, 80, 50], [235, 60, 75]],
    berry: [[330, 70, 60], [350, 65, 55], [320, 60, 70], [340, 75, 50], [360, 80, 45], [310, 55, 75], [345, 85, 40], [325, 70, 65]],
    monochrome: [[0, 0, 30], [0, 0, 40], [0, 0, 50], [0, 0, 60], [0, 0, 70], [0, 0, 80], [0, 0, 90], [0, 0, 20]],
    protanopia: [[45, 80, 60], [200, 80, 55], [270, 60, 65], [30, 90, 55], [180, 70, 50], [300, 50, 60], [60, 70, 55], [220, 70, 60]],
    deuteranopia: [[45, 80, 60], [220, 80, 55], [280, 60, 65], [30, 90, 55], [200, 70, 50], [320, 50, 60], [60, 70, 55], [240, 70, 60]],
    tritanopia: [[0, 70, 60], [180, 70, 55], [330, 60, 65], [20, 80, 55], [200, 60, 50], [350, 50, 60], [160, 70, 55], [10, 70, 60]],
};
export const PALETTE_NAMES = Object.freeze(Object.keys(COLOR_THEMES));
export const GRADIENT_PRESET_NAMES = Object.freeze(Object.keys(BUILTIN_GRADIENT_PRESETS));

// below this OKLab distance (x100) two speakers read as one colour
const MIN_SEPARATION = 8;
const JITTER_ATTEMPTS = 12;
export const MAX_SPEAKERS = 200;

const isTaken = (color, used) => used.some(other => colorDistanceOklab(color, other) * 100 < MIN_SEPARATION);

/** The palette's first slot no speaker holds yet, lightened for a dark chat as the original does; jittered once they are all taken. */
export function nextColor(used = [], { theme = 'pastel', dark = true, random = Math.random } = {}) {
    const slots = COLOR_THEMES[theme] || COLOR_THEMES.pastel;
    for (const [h, s, l] of slots) {
        const color = hslToHex(h, s, dark ? Math.min(l + 15, 85) : Math.max(l - 15, 35));
        if (!isTaken(color, used)) return color;
    }
    const jitter = () => {
        const [h, s] = slots[Math.floor(random() * slots.length)];
        return hslToHex((h + random() * 60 - 30 + 360) % 360, s, dark ? 75 : 40);
    };
    for (let i = 0; i < JITTER_ATTEMPTS; i++) {
        const color = jitter();
        if (!isTaken(color, used)) return color;
    }
    return jitter();
}

/** One stored speaker, made safe: name, colour, aliases, optional gradient. */
export function normalizeEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = normalizeRegistryIdentityName(raw.name);
    if (!name) return null;
    const gradient = normalizeGradient(raw.gradient);
    return {
        name,
        color: normalizeHexColor(raw.color, '#888888'),
        aliases: normalizeAliases(raw.aliases),
        gradient: gradient ? cloneGradient(gradient) : null,
        bold: raw.bold === true,
        persona: raw.persona === true,
        // which built-in gradient the row's picker shows; '' for none or one of the reader's own
        gradientPreset: gradient && Object.hasOwn(BUILTIN_GRADIENT_PRESETS, raw.gradientPreset) ? raw.gradientPreset : '',
    };
}

/** A card's table from storage: keyed by the lowercased name, bad rows dropped. */
export function normalizeRegistry(raw) {
    const out = Object.create(null);
    if (!raw || typeof raw !== 'object') return out;
    for (const value of Object.values(raw)) {
        const entry = normalizeEntry(value);
        if (!entry) continue;
        const key = normalizeRegistryIdentity(entry.name);
        if (key && !out[key] && Object.keys(out).length < MAX_SPEAKERS) out[key] = entry;
    }
    return out;
}

/** The key a name or alias belongs to, '' when nobody has it. */
export function resolveKey(registry, rawName) {
    const wanted = normalizeRegistryIdentity(rawName);
    if (!wanted) return '';
    if (registry[wanted]) return wanted;
    for (const [key, entry] of Object.entries(registry)) {
        if (entry.aliases.some(alias => normalizeRegistryIdentity(alias) === wanted)) return key;
    }
    return '';
}

/** Adds a speaker unless the name (or an alias) is already there; answers { key, entry, created }. */
export function addSpeaker(registry, rawName, { color = null, theme, dark, random, persona = false } = {}) {
    const name = normalizeRegistryIdentityName(String(rawName ?? ''));
    // the original refuses the color-block delimiters and control characters in a name
    if (!name || /[\r\n\t[\]=,()]/.test(name)) return { key: '', entry: null, created: false };
    const existing = resolveKey(registry, name);
    if (existing) return { key: existing, entry: registry[existing], created: false };
    if (Object.keys(registry).length >= MAX_SPEAKERS) return { key: '', entry: null, created: false };
    const key = normalizeRegistryIdentity(name);
    const used = Object.values(registry).map(e => e.color);
    const entry = normalizeEntry({ name, color: normalizeHexColor(color, null) || nextColor(used, { theme, dark, random }), persona });
    registry[key] = entry;
    return { key, entry, created: true };
}

export function applyPreset(entry, presetName) {
    const preset = BUILTIN_GRADIENT_PRESETS[presetName];
    if (!entry || !preset) return entry;
    const next = applyGradientPresetToEntry(entry, preset);
    return next ? { ...entry, color: next.color, gradient: cloneGradient(next.gradient) } : entry;
}

export function randomGradient(entry, random = Math.random) {
    if (!entry) return entry;
    return { ...entry, gradient: cloneGradient(buildRandomGradient(entry.color, {}, random)) };
}

/** The original's palette rotation: every speaker re-drawn from the palette in table order. */
export function recolorAll(registry, { theme, dark, random } = {}) {
    const used = [];
    for (const entry of Object.values(registry)) {
        entry.color = nextColor(used, { theme, dark, random });
        entry.gradient = null;
        used.push(entry.color);
    }
    return registry;
}

/** The class a speaker's quotes carry: their key's digest, so no name ever reaches a selector. */
export const speakerClass = (key, digest) => `dc-s-${digest(String(key))}`;

/**
 * The stylesheet that paints every speaker's quotes. Rules carry the chat body's class so they
 * outweigh the app's own voices (.chat-conv-msg-text .cl-quote / :is(em, i)) and nothing more.
 * A gradient is the original's background-clip text recipe (style.css, .dc-gradient-text), keyed
 * on the speaker's class so a colour or gradient change repaints without rebuilding a row.
 */
export function buildStylesheet(registries, digest, { animate = true } = {}) {
    const rules = [];
    const seen = new Set();
    for (const registry of registries) {
        for (const [key, entry] of Object.entries(registry || {})) {
            const cls = speakerClass(key, digest);
            if (seen.has(cls)) continue;
            seen.add(cls);
            // the chat's quotes, and the name samples in the extension's own window and dialog
            const sel = `:is(.chat-conv-msg-text .dc-q, .dc-preview).${cls}`;
            const bold = entry.bold ? ' font-weight: 700;' : '';
            const css = entry.gradient ? buildGradientCss(entry) : null;
            if (!css) {
                rules.push(`${sel} { color: ${entry.color};${bold} }`);
                continue;
            }
            rules.push(`${sel}, ${sel} * { text-shadow: none !important; }`);
            rules.push(`${sel} { color: ${entry.color}; background-image: ${css}; background-repeat: no-repeat; `
                + 'background-position: 0% 50%; background-size: 100% 100%; background-clip: text; -webkit-background-clip: text; '
                + `-webkit-text-fill-color: transparent; box-decoration-break: clone; -webkit-box-decoration-break: clone;${bold} }`);
            const g = normalizeGradient(entry.gradient);
            if (animate && g?.animation?.enabled) {
                rules.push(`${sel} { background-size: 260% 260%; animation: dc-gradient-drift ${g.animation.duration}s linear infinite `
                    + `${g.animation.reverse ? 'alternate-reverse' : 'alternate'}; }`);
            }
        }
    }
    return rules.join('\n');
}
