// dom-match.js - SUBSET for the Σ port. matchSegmentsToElements and isApproximateSegmentTextMatch
// are copied verbatim from platberlitz/sillytavern-character-colors v6.1.4 src/dom-engine.js
// (MIT; see THIRD_PARTY_NOTICES.md). They pair attributed segments with rendered elements by
// text alone, so they run unchanged on Σ's .cl-quote spans and <em> elements.
import { normalizeSegmentText } from './utils.js';

export function matchSegmentsToElements(segments, elements, getTargetText, onMatch, options = {}) {
    // Exact matches claim their element, so the optional second pass can only
    // ever fill the gaps they leave behind.
    const claimed = new Array(elements.length).fill(false);
    const unmatched = [];
    let elementIndex = 0;

    for (const seg of segments) {
        const target = getTargetText(seg);
        if (elementIndex >= elements.length) {
            unmatched.push({ seg, target, after: elementIndex });
            continue;
        }
        let foundIndex = -1;
        for (let i = elementIndex; i < elements.length; i++) {
            if (normalizeSegmentText(elements[i].textContent) === target) { foundIndex = i; break; }
        }
        if (foundIndex === -1) {
            unmatched.push({ seg, target, after: elementIndex });
            continue;
        }
        claimed[foundIndex] = true;
        onMatch(seg, elements[foundIndex]);
        // An empty target still consumes its element. Skipping it left every
        // later segment matching one element too early.
        elementIndex = foundIndex + 1;
    }

    if (options.allowAnchoredFallback !== true || !unmatched.length) return;

    const exactClaims = claimed.slice();
    let fallbackIndex = 0;
    for (const pending of unmatched) {
        if (!pending.target) continue;
        // Bound the search to the unclaimed run starting where this segment
        // would have sat, stopping at the next element an exact match claimed.
        let lower = Math.max(pending.after, fallbackIndex);
        while (lower < elements.length && claimed[lower]) lower++;
        // A claim by a LATER segment anchors the boundary: this unmatched
        // segment may only search before that element, never beyond it.
        let nextAnchor = -1;
        for (let i = pending.after; i < elements.length; i++) {
            if (exactClaims[i]) { nextAnchor = i; break; }
        }
        const searchEnd = nextAnchor === -1 ? elements.length : nextAnchor;
        let chosen = -1;
        let candidates = 0;
        for (let i = lower; i < searchEnd; i++) {
            candidates++;
            if (chosen !== -1) continue;
            if (isApproximateSegmentTextMatch(pending.target, normalizeSegmentText(elements[i].textContent))) chosen = i;
        }
        // A single unclaimed element between two anchors can only belong to
        // this segment, so accept it even when the text was rewritten wholesale.
        if (chosen === -1 && candidates === 1 && unmatched.filter(other => other.after === pending.after).length === 1) {
            chosen = lower < searchEnd ? lower : -1;
        }
        if (chosen === -1) continue;
        claimed[chosen] = true;
        fallbackIndex = chosen + 1;
        onMatch(pending.seg, elements[chosen]);
    }
}

// Containment with a length floor: entity decoding, macro expansion and regex
// scripts change a quote's rendered text without changing which quote it is.
export function isApproximateSegmentTextMatch(target, rendered) {
    if (!target || !rendered) return false;
    const longer = rendered.length >= target.length ? rendered : target;
    const shorter = rendered.length >= target.length ? target : rendered;
    if (!longer.includes(shorter)) return false;
    return shorter.length / longer.length >= 0.6;
}
