// st-api.js - Σ stand-in for the original's single SillyTavern import point.
// The vendored modules import these two helpers from './st-api.js'; nothing else of
// SillyTavern is reachable from this folder.

export function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// SillyTavern's escapeRegex, the same character set
export function escapeRegex(value) {
    return String(value ?? '').replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}
