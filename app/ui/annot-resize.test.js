// Tests de la poignée de hauteur des annotations pendant la jam (ui/annot-resize.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { ARZ_MIN, ARZ_DEFAULT, ARZ_STEP, ARZ_STORAGE_KEY, arzClamp, arzParse, arzDragHeight, arzKeyHeight, arzAria } = require('./annot-resize.js');

describe('annot-resize : bornes', () => {
    test('valeurs de départ', () => {
        assert.equal(ARZ_DEFAULT, 220);
        assert.ok(ARZ_MIN < ARZ_DEFAULT);
        assert.equal(ARZ_STORAGE_KEY, 'jamAnnotPlayHeight');
    });
    test('arzClamp borne entre le minimum et la place disponible', () => {
        assert.equal(arzClamp(50, 600), ARZ_MIN);
        assert.equal(arzClamp(400, 600), 400);
        assert.equal(arzClamp(900, 600), 600);
        assert.equal(arzClamp(333.6, 600), 334);
    });
    test('place disponible absente ou trop petite', () => {
        assert.equal(arzClamp(900), 900);
        assert.equal(arzClamp(900, 0), 900);
        assert.equal(arzClamp(300, 80), ARZ_MIN); // jamais sous le minimum
    });
    test('valeur illisible → hauteur d\'origine', () => {
        assert.equal(arzClamp('abc', 600), ARZ_DEFAULT);
        assert.equal(arzClamp(undefined, 600), ARZ_DEFAULT);
    });
});

describe('annot-resize : mémoire', () => {
    test('arzParse lit un nombre valable', () => {
        assert.equal(arzParse('360'), 360);
        assert.equal(arzParse(360.4), 360);
    });
    test('arzParse refuse le reste (hauteur d\'origine)', () => {
        [null, undefined, '', 'x', '50', '99999', 'NaN'].forEach(v => assert.equal(arzParse(v), null, String(v)));
    });
});

describe('annot-resize : glisser et clavier', () => {
    test('glisser vers le bas agrandit, vers le haut réduit, toujours borné', () => {
        assert.equal(arzDragHeight(220, 500, 600, 700), 320);
        assert.equal(arzDragHeight(220, 500, 450, 700), 170);
        assert.equal(arzDragHeight(220, 500, 100, 700), ARZ_MIN);
        assert.equal(arzDragHeight(220, 500, 1500, 700), 700);
    });
    test('flèches, Maj, Début, Fin', () => {
        assert.equal(arzKeyHeight(220, 'ArrowDown', false, 700), 220 + ARZ_STEP);
        assert.equal(arzKeyHeight(220, 'ArrowUp', false, 700), 220 - ARZ_STEP);
        assert.equal(arzKeyHeight(220, 'ArrowDown', true, 700), 220 + 5 * ARZ_STEP);
        assert.equal(arzKeyHeight(220, 'Home', false, 700), ARZ_MIN);
        assert.equal(arzKeyHeight(220, 'End', false, 700), 700);
        assert.equal(arzKeyHeight(220, 'a', false, 700), null);
    });
    test('valeurs ARIA', () => {
        assert.deepEqual(arzAria(900, 600), { now: 600, min: ARZ_MIN, max: 600 });
    });
});
