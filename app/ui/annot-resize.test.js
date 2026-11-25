// Tests du partage de hauteur grille / annotations pendant la jam (ui/annot-resize.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { ARZ_MIN, ARZ_GRID_MIN, ARZ_STEP, ARZ_STORAGE_KEY, arzParsePull, arzLayout, arzDragPull, arzKeyPull } = require('./annot-resize.js');

describe('annot-resize : mémoire', () => {
    test('clé et lecture du tirage', () => {
        assert.equal(ARZ_STORAGE_KEY, 'jamAnnotPull');
        assert.equal(arzParsePull('150'), 150);
        assert.equal(arzParsePull(42.6), 43);
    });
    test('valeurs illisibles ou négatives → 0', () => {
        [null, undefined, '', 'x', '-20', '0', '99999', 'NaN'].forEach(v => assert.equal(arzParsePull(v), 0, String(v)));
    });
});

describe('annot-resize : partage de la hauteur', () => {
    test('sans tirage : grille entière, annotations jusqu\'en bas', () => {
        assert.deepEqual(arzLayout({ total: 900, gridContent: 340, pull: 0 }), { grid: 340, annot: 560, pull: 0, maxPull: 340 - ARZ_GRID_MIN });
    });
    test('le tirage prend sur la grille, le total ne change pas', () => {
        const L = arzLayout({ total: 900, gridContent: 340, pull: 100 });
        assert.equal(L.grid, 240);
        assert.equal(L.annot, 660);
        assert.equal(L.grid + L.annot, 900);
    });
    test('la grille ne descend pas sous une ligne', () => {
        const L = arzLayout({ total: 900, gridContent: 340, pull: 5000 });
        assert.equal(L.grid, ARZ_GRID_MIN);
        assert.equal(L.pull, L.maxPull);
    });
    test('tirage négatif ramené à 0', () => {
        assert.equal(arzLayout({ total: 900, gridContent: 340, pull: -50 }).pull, 0);
    });
    test('grille plus haute que la fenêtre : les annotations gardent leur minimum', () => {
        const L = arzLayout({ total: 500, gridContent: 800, pull: 0 });
        assert.equal(L.annot, ARZ_MIN);
        assert.equal(L.grid, 500 - ARZ_MIN);
    });
    test('petite grille (une ligne) : pas de tirage possible', () => {
        const L = arzLayout({ total: 900, gridContent: 76, pull: 200 });
        assert.equal(L.maxPull, 0);
        assert.equal(L.grid, 76);
        assert.equal(L.annot, 824);
    });
    test('fenêtre minuscule : jamais sous le minimum', () => {
        assert.equal(arzLayout({ total: 60, gridContent: 300, pull: 0 }).annot, ARZ_MIN);
    });
});

describe('annot-resize : glisser et clavier', () => {
    test('monter agrandit les annotations', () => {
        assert.equal(arzDragPull(0, 500, 380), 120);
        assert.equal(arzDragPull(120, 500, 560), 60);
    });
    test('flèches, Maj, Début, Fin', () => {
        assert.equal(arzKeyPull(0, 'ArrowUp', false, 300), ARZ_STEP);
        assert.equal(arzKeyPull(0, 'ArrowUp', true, 300), 5 * ARZ_STEP);
        assert.equal(arzKeyPull(5, 'ArrowDown', false, 300), 0);
        assert.equal(arzKeyPull(40, 'Home', false, 300), 300);
        assert.equal(arzKeyPull(40, 'End', false, 300), 0);
        assert.equal(arzKeyPull(40, 'x', false, 300), null);
    });
});
