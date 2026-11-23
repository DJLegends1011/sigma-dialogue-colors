// Attribution and painting for one message. No ctx and no document: the caller hands a parsed
// body (a template's content in the page, a mini-dom element in tests).
//
// The vendored attribution reads speakers from its own module state; attribute() loads the card's
// table there for the length of one synchronous call.

import { attributeDialogueSegments, clearDomCache } from '../vendor/dialogue-colors/attribution.js';
import { matchSegmentsToElements } from '../vendor/dialogue-colors/dom-match.js';
import { setRegistry, settings } from '../vendor/dialogue-colors/state.js';
import { normalizeSegmentText } from '../vendor/dialogue-colors/utils.js';

/** {{char}} and {{user}} as the chat shows them, so a name written as a macro still names a speaker. */
export function expandNames(text, { charName = '', userName = '' } = {}) {
    let out = String(text ?? '');
    if (charName) out = out.replace(/\{\{char\}\}/gi, charName);
    if (userName) out = out.replace(/\{\{user\}\}/gi, userName);
    return out;
}

/**
 * Who says each quote and thought. overrides maps a segment index to a speaker's name (the
 * reader's reassignments). Answers the original's segments: { index, text, delimiter, assignment }.
 */
export function attribute(text, speakerName, registry, { thoughtSymbols = '*', overrides = null } = {}) {
    setRegistry(registry);
    settings.thoughtSymbols = thoughtSymbols;
    // speaker regexes are cached by key; a renamed alias must not answer from the old table
    clearDomCache();
    try {
        return attributeDialogueSegments(String(text ?? ''), String(speakerName ?? ''), {
            autoAddMessageSpeaker: false,
            overrides: overrides && Object.keys(overrides).length ? overrides : null,
            overrideSources: overrides ? Object.fromEntries(Object.keys(overrides).map(k => [k, 'manual'])) : null,
        }).segments;
    } finally {
        setRegistry(null);
    }
}

const isThought = seg => seg.delimiter === '*' || seg.delimiter === '_';

// the app's chat body: quotes are .cl-quote spans, *actions* are <em>; neither counts inside code
export function dialogueElements(root) {
    const quotes = [...root.querySelectorAll('.cl-quote')].filter(el => !el.closest('pre, code'));
    const thoughts = [...root.querySelectorAll('em')].filter(el => !el.closest('pre, code, .cl-quote'));
    return { quotes, thoughts };
}

/**
 * Pairs segments with the body's elements the way the original's DOM engine does (text first,
 * then the anchored fallback) and hands each pair to onMatch(seg, el). Answers how many paired.
 */
export function pairSegments(root, segments, onMatch) {
    const { quotes, thoughts } = dialogueElements(root);
    let paired = 0;
    const hit = (seg, el) => { paired++; onMatch(seg, el); };
    matchSegmentsToElements(segments.filter(s => !isThought(s)), quotes, seg => normalizeSegmentText(seg.text), hit, { allowAnchoredFallback: true });
    matchSegmentsToElements(segments.filter(isThought), thoughts, seg => normalizeSegmentText(seg.text.slice(1, -1)), hit, { allowAnchoredFallback: true });
    return paired;
}

/** Puts each attributed segment's speaker class on its element; answers how many it painted. */
export function paintBody(root, segments, classFor) {
    let painted = 0;
    pairSegments(root, segments, (seg, el) => {
        if (!seg.assignment?.key) return;
        el.classList.add('dc-q', classFor(seg.assignment.key));
        painted++;
    });
    return painted;
}
