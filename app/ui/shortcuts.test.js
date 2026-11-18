// Tests des raccourcis clavier personnalisables (ui/shortcuts.js) et de leur effet sur la portée (ui/staff-editor.js).
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
const K = require('./shortcuts.js');
const E = require('./staff-editor.js');

describe('raccourcis : combinaisons', () => {
    beforeEach(() => K.kbReset());
    it('normalise lettres, Maj, ⌘ / Ctrl, ⌥ et touches spéciales', () => {
        assert.equal(K.kbCombo({ key: 'N' }), 'n');
        assert.equal(K.kbCombo({ key: 'N', shiftKey: true }), 'Shift+n');
        assert.equal(K.kbCombo({ key: '#', shiftKey: true }), '#');
        assert.equal(K.kbCombo({ key: 's', metaKey: true }), 'Mod+s');
        assert.equal(K.kbCombo({ key: 's', ctrlKey: true }), 'Mod+s');
        assert.equal(K.kbCombo({ key: '˜', code: 'KeyN', altKey: true }), 'Alt+n');
        assert.equal(K.kbCombo({ key: ' ' }), 'Space');
        assert.equal(K.kbCombo({ key: 'Shift', shiftKey: true }), null);
    });
    it('libellés Mac et hors Mac', () => {
        assert.equal(K.kbLabel('Mod+Shift+s', true), '⌘⇧S');
        assert.equal(K.kbLabel('Mod+s', false), 'Ctrl+S');
        assert.equal(K.kbLabel('', true), '—');
    });
});

describe('raccourcis : personnalisation', () => {
    beforeEach(() => K.kbReset());
    it('change une touche et la retire de l\'action qui l\'avait', () => {
        const r = K.kbSet('input', 'r');
        assert.equal(r.ok, true);
        assert.equal(r.replaced, 'rest');
        assert.equal(K.kbBinding('rest'), '');
        assert.deepEqual(E.nseKeyAction('r'), { type: 'input' });
        assert.equal(E.nseKeyAction('n'), null);
        assert.ok(mem[K.KB_STORAGE_KEY]);
    });
    it('refuse les touches fixes', () => {
        assert.equal(K.kbSet('dot', 'Mod+z').ok, false);
        assert.equal(K.kbSet('dot', 'ArrowUp').ok, false);
    });
    it('une durée sur une combinaison avec ⌘', () => {
        K.kbSet('durq', 'Mod+Alt+q');
        assert.deepEqual(E.nseKeyAction('œ', { meta: true, alt: true, code: 'KeyQ' }), { type: 'dur', dur: 'q' });
        assert.equal(E.nseKeyAction('3'), null);
    });
    it('Maj + lettre retombe sur la lettre seule', () => {
        assert.deepEqual(E.nseKeyAction('G', { shift: true }), { type: 'letter', letter: 'g' });
    });
    it('lecture du Jam : Espace, ⇧Espace, et une même touche dans deux parties', () => {
        assert.equal(K.kbMatch({ key: ' ' }, 'play'), true);
        assert.equal(K.kbMatch({ key: ' ', shiftKey: true }, 'stop'), true);
        assert.equal(K.kbActionFor('b', 'jam'), 'loop');
        assert.deepEqual(E.nseKeyAction('b'), { type: 'letter', letter: 'b' }); // dans une portée, « b » reste la note si
        const r = K.kbSet('metro', 'b');                                         // même partie : la boucle perd la touche
        assert.equal(r.replaced, 'loop');
        assert.deepEqual(E.nseKeyAction('b'), { type: 'letter', letter: 'b' });
        assert.equal(K.kbMatch({ key: 'ArrowUp', altKey: true, code: 'ArrowUp' }, 'tempoUp'), true);
        assert.equal(K.kbMatch({ key: 's', metaKey: true }, 'save'), true);
        assert.equal(K.kbMatch({ key: 's', ctrlKey: true }, 'save'), true);
    });
    it('tout rétablir', () => {
        K.kbSet('tie', 'k');
        K.kbReset();
        assert.equal(K.kbBinding('tie'), 'l');
        assert.equal(mem[K.KB_STORAGE_KEY], undefined);
    });
    it('les infobulles de la barre suivent le choix', () => {
        K.kbSet('dot', 'p');
        assert.match(E.nseToolsHtml(require('./staff-notes.js').staffDefault(), null, 0), /Note pointée \(clavier : P\)/);
    });
});
