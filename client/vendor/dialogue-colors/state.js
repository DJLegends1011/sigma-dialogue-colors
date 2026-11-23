// state.js - Σ stand-in for the original's shared runtime state.
// characterColors is the registry the vendored attribution reads; the extension swaps its
// contents (never the object) before each pass through setRegistry().

export const characterColors = Object.create(null);

// the original's streaming session; the Σ port never attributes a streaming reply
export const streamingSession = { mesIndex: -1, assignments: new Map() };

export const settings = { thoughtSymbols: '*' };

export function setRegistry(entries) {
    for (const key of Object.keys(characterColors)) delete characterColors[key];
    Object.assign(characterColors, entries || {});
}
