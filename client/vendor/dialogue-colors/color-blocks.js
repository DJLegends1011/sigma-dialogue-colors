// color-blocks.js - SUBSET for the Σ port (Local DOM engine only).
// Every function below is copied verbatim from platberlitz/sillytavern-character-colors
// v6.1.4 src/color-blocks.js (MIT; see THIRD_PARTY_NOTICES.md). Left out: the LLM-engine
// parts (font-tag scanning, DOM color-block stripping, chat rescans) and their imports.
import { getEntryEffectiveColor } from './palettes.js';
import { normalizeRegistryIdentity, normalizeRegistryIdentityName } from './group-profiles.js';
import { getThoughtDelimiterSymbols } from './prompts.js';
import { escapeRegex } from './st-api.js';
import { characterColors } from './state.js';
import { isCompositeSpeakerLabel, normalizeAliases, normalizeGoogleFontName, normalizeHexColor, parseNameWithNicknames, splitCompositeSpeakerName } from './utils.js';

function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function isInsideMarkdownCode(source, position) {
    let fence = null;
    let inlineTicks = 0;
    let lineStart = 0;
    while (lineStart < position) {
        let lineEnd = source.indexOf('\n', lineStart);
        if (lineEnd === -1 || lineEnd > position) lineEnd = position;
        const line = source.slice(lineStart, lineEnd).replace(/\r$/, '');
        if (fence) {
            const close = line.match(/^ {0,3}(`+|~+)[ \t]*$/);
            if (close && close[1][0] === fence.char && close[1].length >= fence.length) fence = null;
        } else if (!inlineTicks) {
            const open = line.match(/^ {0,3}(`{3,}|~{3,})/);
            if (open) {
                fence = { char: open[1][0], length: open[1].length };
            } else {
                for (let i = 0; i < line.length;) {
                    if (line[i] !== '`') { i++; continue; }
                    let end = i + 1;
                    while (line[end] === '`') end++;
                    const run = end - i;
                    if (!inlineTicks) inlineTicks = run;
                    else if (run === inlineTicks) inlineTicks = 0;
                    i = end;
                }
            }
        } else {
            for (let i = 0; i < line.length;) {
                if (line[i] !== '`') { i++; continue; }
                let end = i + 1;
                while (line[end] === '`') end++;
                if (end - i === inlineTicks) inlineTicks = 0;
                i = end;
            }
        }
        lineStart = lineEnd + 1;
    }
    return !!fence || !!inlineTicks;
}

/** Parse the one metadata form this extension owns: a final standalone line outside code. */
export function parseTrailingColorMetadata(text) {
    const source = String(text ?? '');
    const match = /(^|\r\n?|\n)([ \t]*)\[(COLORS?):([^\]\r\n]*)\][ \t]*((?:\r\n?|\n)?[ \t]*)$/i.exec(source);
    if (!match) return null;
    const start = match.index + match[1].length + match[2].length;
    if (/\t| {4}/.test(match[2]) || isInsideMarkdownCode(source, start)) return null;
    const pairsStart = start + match[0].slice(match[1].length + match[2].length).indexOf(':') + 1;
    return {
        source,
        label: match[3].toUpperCase(),
        pairs: match[4],
        start,
        end: pairsStart + match[4].length + 1,
        pairsStart,
        pairsEnd: pairsStart + match[4].length,
        removeStart: match.index,
        removeEnd: source.length,
    };
}

export function stripTrailingColorMetadata(text) {
    const source = String(text ?? '');
    const block = parseTrailingColorMetadata(source);
    return block ? source.slice(0, block.removeStart) : source;
}


export function resolveCharacterKeyByNameOrAlias(rawName) {
    const lookupName = normalizeRegistryIdentity(rawName);
    if (!lookupName) return '';
    if (hasOwn(characterColors, lookupName) && characterColors[lookupName]) return lookupName;
    for (const [key, entry] of Object.entries(characterColors)) {
        if (!entry) continue;
        if (normalizeRegistryIdentity(entry.name) === lookupName) return key;
        if (normalizeAliases(entry.aliases).some(alias => normalizeRegistryIdentity(alias) === lookupName)) return key;
    }
    return '';
}

export function resolveLookupAssignmentByName(lookup, rawName) {
    if (!(lookup instanceof Map)) return null;
    if (typeof rawName !== 'string') return null;
    const trimmedName = rawName.trim();
    if (!trimmedName) return null;
    const { name, nicknames } = parseNameWithNicknames(trimmedName);
    const candidates = [];
    const pushCandidate = value => {
        const normalized = normalizeRegistryIdentity(value);
        if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
    };
    pushCandidate(trimmedName);
    pushCandidate(name);
    nicknames.forEach(pushCandidate);
    for (const candidate of candidates) {
        const assignment = lookup.get(candidate);
        if (assignment) return assignment;
    }
    return null;
}

export function resolveCompositeSpeakerParts(rawName, lookup) {
    const parts = splitCompositeSpeakerName(rawName);
    if (parts.length < 2 || !(lookup instanceof Map)) return [];
    const resolved = [];
    const seenKeys = new Set();
    for (const part of parts) {
        const assignment = resolveLookupAssignmentByName(lookup, part);
        if (!assignment || isCompositeSpeakerLabel(assignment.name)) return [];
        if (seenKeys.has(assignment.key)) continue;
        seenKeys.add(assignment.key);
        resolved.push(assignment);
    }
    return resolved;
}

export function isReducibleCompositeSpeakerName(rawName, lookup) {
    return resolveCompositeSpeakerParts(rawName, lookup).length >= 2;
}

export function resolveSingleSpeakerAssignment(rawName, lookup) {
    const trimmedName = String(rawName ?? '').trim();
    if (!trimmedName || !(lookup instanceof Map)) return null;
    const resolvedCompositeParts = resolveCompositeSpeakerParts(trimmedName, lookup);
    if (resolvedCompositeParts.length === 1) return resolvedCompositeParts[0];
    if (resolvedCompositeParts.length >= 2 || isCompositeSpeakerLabel(trimmedName)) return null;
    const directAssignment = resolveLookupAssignmentByName(lookup, trimmedName);
    if (!directAssignment || isCompositeSpeakerLabel(directAssignment.name)) return null;
    return directAssignment;
}

export function buildSingleSpeakerEntryLookup(rawColors) {
    const lookup = new Map();
    for (const entry of Object.values(rawColors || {})) {
        if (!entry || isCompositeSpeakerLabel(entry.name)) continue;
        registerLookupAssignment(lookup, entry.name, getEntryEffectiveColor(entry), entry.aliases, false, entry.font);
    }
    return lookup;
}

// Phase 1A: Shared color-pair processing — deduplicates parseColorBlock, scanAllMessages, onNewMessage
// Also fixes auto-lock inconsistency (2A) and adds group field (6B)

export function pruneReducibleCompositeEntries(rawColors) {
    if (!rawColors || typeof rawColors !== 'object' || Array.isArray(rawColors)) return Object.create(null);
    let removed = false;
    do {
        removed = false;
        const lookup = buildSingleSpeakerEntryLookup(rawColors);
        for (const [key, entry] of Object.entries(rawColors)) {
            if (!entry || !isCompositeSpeakerLabel(entry.name)) continue;
            if (!isReducibleCompositeSpeakerName(entry.name, lookup)) continue;
            delete rawColors[key];
            removed = true;
        }
    } while (removed);
    return rawColors;
}

// Phase 1A: Shared color-pair processing — deduplicates parseColorBlock, scanAllMessages, onNewMessage
// Also fixes auto-lock inconsistency (2A) and adds group field (6B)
export function parseColorMetadataPairs(pairsString) {
    if (typeof pairsString !== 'string') return [];
    const assignments = [];
    for (const pair of pairsString.split(',')) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx < 1) continue;
        const rawName = pair.slice(0, eqIdx).trim();
        const expression = rawName.match(/^([^()]+)((?:\([^()]+\))*)$/);
        const name = expression && normalizeRegistryIdentityName(expression[1]);
        const color = normalizeHexColor(pair.slice(eqIdx + 1).trim(), null);
        if (!name || !color || /[\[\]=,()]/.test(name)) continue;
        const aliases = [];
        let valid = true;
        for (const match of expression[2].matchAll(/\(([^()]+)\)/g)) {
            const alias = normalizeRegistryIdentityName(match[1]);
            if (!alias || /[\[\]=,()]/.test(alias)) { valid = false; break; }
            aliases.push(alias);
        }
        if (valid) assignments.push({ name, aliases: normalizeAliases(aliases), color });
    }
    return assignments;
}


export function parseNamedColorAssignmentsFromText(text) {
    const block = parseTrailingColorMetadata(text);
    return block ? parseColorMetadataPairs(block.pairs) : [];
}

const RENDERED_QUOTE_PAIRS = Object.freeze([
    ['"', '"'],
    ['\u201C', '\u201D'],
    ['\u00AB', '\u00BB'],
    ['\u300C', '\u300D'],
    ['\u300E', '\u300F'],
    ['\uFF02', '\uFF02'],
]);

// The leading alternatives of SillyTavern's quote regex, which swallow code and
// style spans before any quote inside them can match. Copied verbatim so both
// sides skip the same regions.
const RENDERED_QUOTE_SKIP_PATTERN = '<[sS][tT][yY][lL][eE]>[\\s\\S]*?<\\/[sS][tT][yY][lL][eE]>|```[\\s\\S]*?```|~~~[\\s\\S]*?~~~|``[\\s\\S]*?``|`[\\s\\S]*?`';

// Alternation named group marking a skipped region rather than a dialogue
// segment. Consumers must discard these matches.
export const DIALOGUE_SKIP_GROUP = 'dcSkip';

export function buildDialogueRegex() {
    const delimiters = new Set();
    for (const ch of getThoughtDelimiterSymbols()) {
        delimiters.add(ch);
    }
    
    const ASYMMETRIC_MAP = {
        '“': '”',
        '『': '』',
        '「': '」',
        '（': '）',
        '《': '》',
        '〈': '〉',
        '【': '】',
        '〔': '〕',
        '〖': '〗',
        '〘': '〙',
        '〚': '〛',
        '(': ')',
        '{': '}',
        '[': ']',
        '<': '>',
    };
    const REVERSE_ASYMMETRIC_MAP = {};
    for (const [open, close] of Object.entries(ASYMMETRIC_MAP)) {
        REVERSE_ASYMMETRIC_MAP[close] = open;
    }

    const patterns = [];
    const processedAsymmetricPairs = new Set();

    // Quote pairs come first and are never conditional, so segment order and
    // count line up with the <q> elements SillyTavern rendered. The character
    // classes exclude line breaks because SillyTavern's quote regex runs without
    // the dotAll flag, so a quote it renders can never span a line.
    for (const [openChar, closeChar] of RENDERED_QUOTE_PAIRS) {
        processedAsymmetricPairs.add(`${openChar}:${closeChar}`);
        const escapedOpen = escapeRegex(openChar);
        const escapedClose = escapeRegex(closeChar);
        patterns.push(`${escapedOpen}([^${escapedClose}\\n\\r]*)${escapedClose}`);
    }

    for (const delimiter of delimiters) {
        const isOpening = ASYMMETRIC_MAP[delimiter] !== undefined;
        const isClosing = REVERSE_ASYMMETRIC_MAP[delimiter] !== undefined;

        if (isOpening || isClosing) {
            const openChar = isOpening ? delimiter : REVERSE_ASYMMETRIC_MAP[delimiter];
            const closeChar = isOpening ? ASYMMETRIC_MAP[delimiter] : delimiter;
            const pairKey = `${openChar}:${closeChar}`;

            if (processedAsymmetricPairs.has(pairKey)) {
                continue;
            }
            processedAsymmetricPairs.add(pairKey);

            const escapedOpen = escapeRegex(openChar);
            const escapedClose = escapeRegex(closeChar);
            patterns.push(`${escapedOpen}([^${escapedClose}]+)${escapedClose}`);
        } else {
            if (processedAsymmetricPairs.has(`${delimiter}:${delimiter}`)) continue;
            processedAsymmetricPairs.add(`${delimiter}:${delimiter}`);
            const escaped = escapeRegex(delimiter);
            // Reject doubled delimiters (e.g. markdown **bold** or __bold__) so a
            // bold span is not misattributed as a thought/delimiter segment; such
            // segments never match rendered <em> elements and previously caused a
            // permanent readiness/health-check re-render loop in the DOM engine.
            patterns.push(`(?<!${escaped})${escaped}([^${escaped}]+)${escaped}(?!${escaped})`);
        }
    }
    if (!patterns.length) return null;
    // The skip alternative is first so a quote inside a code or style span is
    // consumed as a skipped region, exactly as SillyTavern consumes it before
    // it can become a <q>.
    // Do not use new RegExp(source, 'gi') here: STYLE is case-insensitive, but
    // user-selected alphabetic thought delimiters are not.
    return new RegExp(`(?<${DIALOGUE_SKIP_GROUP}>${RENDERED_QUOTE_SKIP_PATTERN})|(${patterns.join('|')})`, 'g');
}

export function registerLookupAssignment(lookup, name, color, aliases = [], preserveExisting = false, font = '') {
    const normalizedName = normalizeRegistryIdentityName(name);
    const normalizedColor = normalizeHexColor(color, null);
    const canonicalKey = normalizeRegistryIdentity(normalizedName);
    if (!canonicalKey || !normalizedColor) return;
    const assignment = { key: canonicalKey, name: normalizedName, color: normalizedColor, font: normalizeGoogleFontName(font) };
    const lookupNames = [normalizedName, ...normalizeAliases(aliases)];
    for (const lookupName of lookupNames) {
        const lookupKey = normalizeRegistryIdentity(lookupName);
        if (!lookupKey) continue;
        if (preserveExisting && lookup.has(lookupKey)) continue;
        lookup.set(lookupKey, assignment);
    }
}

export function buildNameColorLookup(extraAssignments = []) {
    const lookup = new Map();
    for (const entry of Object.values(characterColors)) {
        registerLookupAssignment(lookup, entry.name, getEntryEffectiveColor(entry), entry.aliases, false, entry.font);
    }
    const pendingCompositeAssignments = [];
    for (const assignment of Array.isArray(extraAssignments) ? extraAssignments : []) {
        if (!assignment) continue;
        if (isCompositeSpeakerLabel(assignment.name)) {
            pendingCompositeAssignments.push(assignment);
            continue;
        }
        registerLookupAssignment(lookup, assignment.name, assignment.color, assignment.aliases, true);
    }
    for (const assignment of pendingCompositeAssignments) {
        if (isReducibleCompositeSpeakerName(assignment.name, lookup)) continue;
        registerLookupAssignment(lookup, assignment.name, assignment.color, assignment.aliases, true);
    }
    return lookup;
}
