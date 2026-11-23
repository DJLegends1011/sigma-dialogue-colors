// prompts.js - Σ stand-in: the two prompt helpers the vendored modules read. The thought
// delimiter normalizer is copied verbatim from v6.1.4 src/prompts.js (MIT).
import { settings } from './state.js';

export function normalizePromptThoughtSymbols(thoughtSymbols) {
    // Accepts a bare run of characters ("*\"") or a comma-separated list ("*, \"").
    // Downstream consumers (buildDialogueRegex character classes, delimiter pairing)
    // only support single-character delimiters, so tokens are flattened per character.
    const tokens = Array.isArray(thoughtSymbols)
        ? thoughtSymbols
        : String(thoughtSymbols ?? '').split(',');
    const symbols = [];
    for (const token of tokens) {
        for (const symbol of formatPromptLiteralSymbol(token)) {
            if (symbol.trim()) symbols.push(symbol);
        }
    }
    return [...new Set(symbols)];
}

export function getThoughtDelimiterSymbols() {
    return normalizePromptThoughtSymbols(settings.thoughtSymbols);
}

export function formatPromptLiteralSymbol(symbol) {
    return String(symbol ?? '');
}

// used only by colorizeMessageText (the LLM engine's writer), which the port never calls
export function formatColorBlockPair(name, color) {
    return name && color ? `${name}=${color}` : '';
}
