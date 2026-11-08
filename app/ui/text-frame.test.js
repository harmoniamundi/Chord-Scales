// Tests des cadres de texte (ui/text-frame.js) : zones sensibles des bords et des coins, curseurs, échelle obtenue en tirant une poignée,
// bloc enregistré. Le glisser, le dessin et l'édition se testent dans un navigateur (e2e/annotations.e2e.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const T = require('./text-frame.js');
const F = require('../grid/grid-format.js');

describe('ntfHitZone : bords et coins', () => {
    const W = 200, H = 100;
    const z = (x, y) => T.ntfHitZone(x, y, W, H);
    test('le milieu du cadre n\'est pas une poignée (il sert à le déplacer)', () => {
        assert.equal(z(100, 50), '');
        assert.equal(z(20, 20), '');
        assert.equal(z(T.NTF_EDGE + 2, 50), '');
    });
    test('les bords', () => {
        assert.equal(z(100, 2), 'n');
        assert.equal(z(100, H - 2), 's');
        assert.equal(z(2, 50), 'w');
        assert.equal(z(W - 2, 50), 'e');
    });
    test('les coins', () => {
        assert.equal(z(2, 2), 'nw');
        assert.equal(z(W - 2, 2), 'ne');
        assert.equal(z(2, H - 2), 'sw');
        assert.equal(z(W - 2, H - 2), 'se');
        // un point du bord proche d'un coin (dans la zone du coin) compte comme le coin
        assert.equal(z(T.NTF_CORNER - 1, 2), 'nw');
        assert.equal(z(2, T.NTF_CORNER - 1), 'nw');
        assert.equal(z(W - 2, H - T.NTF_CORNER + 1), 'se');
    });
    test('juste après la zone du coin, on est sur le bord', () => {
        assert.equal(z(T.NTF_CORNER + 2, 2), 'n');
        assert.equal(z(2, T.NTF_CORNER + 2), 'w');
    });
    test('hors du cadre : rien', () => {
        assert.equal(z(-1, 50), '');
        assert.equal(z(50, H + 1), '');
        assert.equal(z(NaN, 5), '');
    });
    test('au doigt, les zones sont plus larges', () => {
        assert.equal(T.ntfHitZone(10, 50, W, H), '');
        assert.equal(T.ntfHitZone(10, 50, W, H, 14, 24), 'w');
    });
});

describe('ntfCursor', () => {
    test('chaque zone a un curseur de redimensionnement adapté', () => {
        assert.equal(T.ntfCursor('n'), 'ns-resize');
        assert.equal(T.ntfCursor('s'), 'ns-resize');
        assert.equal(T.ntfCursor('e'), 'ew-resize');
        assert.equal(T.ntfCursor('w'), 'ew-resize');
        assert.equal(T.ntfCursor('nw'), 'nwse-resize');
        assert.equal(T.ntfCursor('se'), 'nwse-resize');
        assert.equal(T.ntfCursor('ne'), 'nesw-resize');
        assert.equal(T.ntfCursor('sw'), 'nesw-resize');
        assert.equal(T.ntfCursor(''), '');
    });
});

describe('ntfResizeScale : l\'échelle suit le tirage, le cadre garde ses proportions', () => {
    const R = (zone, dx, dy, opts) => T.ntfResizeScale(zone, 200, 100, 100, dx, dy, opts);
    test('tirer le bord droit de +100 px : 150 %, le bord gauche reste en place', () => {
        assert.deepEqual(R('e', 100, 0), { s: 150, ax: 0, ay: 0.5 });
        assert.deepEqual(R('e', -100, 0), { s: 50, ax: 0, ay: 0.5 });
    });
    test('tirer le bord gauche vers la gauche agrandit, le bord droit reste en place', () => {
        assert.deepEqual(R('w', -100, 0), { s: 150, ax: 1, ay: 0.5 });
        assert.deepEqual(R('w', 100, 0), { s: 50, ax: 1, ay: 0.5 });
    });
    test('tirer le bord bas ou haut : la hauteur fixe l\'échelle', () => {
        assert.deepEqual(R('s', 0, 50), { s: 150, ax: 0.5, ay: 0 });
        assert.deepEqual(R('n', 0, -50), { s: 150, ax: 0.5, ay: 1 });
        assert.deepEqual(R('n', 0, 50), { s: 50, ax: 0.5, ay: 1 });
    });
    test('un mouvement perpendiculaire à un bord ne change rien', () => {
        assert.equal(R('e', 0, 80).s, 100);
        assert.equal(R('s', 80, 0).s, 100);
    });
    test('coins : projection sur la diagonale, le coin opposé reste en place', () => {
        const big = R('se', 100, 50);              // le long de la diagonale (2:1) : +50 % de largeur et de hauteur
        assert.deepEqual(big, { s: 150, ax: 0, ay: 0 });
        assert.deepEqual(R('nw', -100, -50), { s: 150, ax: 1, ay: 1 });
        assert.deepEqual(R('ne', 100, -50), { s: 150, ax: 0, ay: 1 });
        assert.deepEqual(R('sw', -100, 50), { s: 150, ax: 1, ay: 0 });
        assert.equal(R('se', -100, -50).s, 50);
        assert.equal(R('se', 20, -40).s, 100);     // déplacement perpendiculaire à la diagonale : aucun effet
    });
    test('bornes : 25 à 400 %', () => {
        assert.equal(R('e', 100000, 0).s, 400);
        assert.equal(R('e', -100000, 0).s, 25);
    });
    test('échelle maximale (largeur de la zone) et largeur minimale affichée', () => {
        assert.equal(R('e', 1000, 0, { maxScale: 180 }).s, 180);
        // base 100 px : jamais moins de 40 px de large affichés
        assert.equal(T.ntfResizeScale('e', 100, 50, 100, -1000, 0, { baseWidth: 100 }).s, 40);
    });
    test('déjà plus grand que la zone : on peut réduire sans saut, pas agrandir', () => {
        assert.equal(T.ntfResizeScale('e', 400, 200, 300, 100, 0, { maxScale: 200 }).s, 300);
        assert.equal(T.ntfResizeScale('e', 400, 200, 300, -100, 0, { maxScale: 200 }).s, 225);
    });
});

describe('ntfResizeScale : bornes propres à une portée', () => {
    test('opts.min / opts.max remplacent 25 à 400 %', () => {
        assert.equal(T.ntfResizeScale('e', 200, 100, 100, 100000, 0, { min: 50, max: 200 }).s, 200);
        assert.equal(T.ntfResizeScale('e', 200, 100, 100, -100000, 0, { min: 50, max: 200 }).s, 50);
        assert.equal(T.ntfResizeScale('se', 200, 100, 100, 100, 50, { min: 50, max: 200 }).s, 150);
    });
});

describe('noteFrameStubHtml', () => {
    test('bloc enregistrable : largeur / échelle, décalage et texte', () => {
        assert.equal(T.noteFrameStubHtml({ w: 260 }), '<div class="annot-frame" data-frame="260"></div>');
        assert.equal(T.noteFrameStubHtml({ w: 300, s: 150 }, { x: 4, y: -2 }, '<b>a</b>'), '<div class="annot-frame" data-frame="300,150" data-pos="4,-2"><b>a</b></div>');
        assert.equal(T.noteFrameStubHtml(), '<div class="annot-frame" data-frame="260"></div>');
    });
    test('le bloc fabriqué passe le nettoyage des annotations tel quel', () => {
        const stub = T.noteFrameStubHtml({ w: 300, s: 150 }, { x: 4, y: -2 }, '<b>a</b>');
        assert.equal(F.sanitizeNoteHtml(stub), stub);
    });
});
