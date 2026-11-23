// palettes.js - Σ stand-in. The vendored attribution reaches the palette module only to
// create a character on the fly (autoAddMessageSpeaker), which the Σ port never asks for:
// the extension adds speakers to its registry itself before attributing.

export function getEntryEffectiveColor(entry) {
    return entry?.color || '#888888';
}

export function buildCharacterEntry() {
    return { key: '', entry: null, remapped: false };
}
