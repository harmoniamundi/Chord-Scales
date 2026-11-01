// Tests des triades (theory.js : triadOf, scaleFits, triadizeItem). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const T = require('./theory.js');

describe('triades', () => {
    test('triadOf : septièmes et tensions retirées, dominantes gardées', () => {
        assert.equal(T.triadOf('maj7'), 'majTriad');
        assert.equal(T.triadOf('6'), 'majTriad');
        assert.equal(T.triadOf('m9'), 'minTriad');
        assert.equal(T.triadOf('m7b5'), 'dimTriad');
        assert.equal(T.triadOf('dim7'), 'dimTriad');
        assert.equal(T.triadOf('7'), '7');
        assert.equal(T.triadOf('7alt'), '7alt');
        assert.equal(T.triadOf('majTriad'), 'majTriad');
    });
    test('triadOf avec includeDominants : la dominante devient une triade majeure', () => {
        assert.equal(T.triadOf('7', true), 'majTriad');
        assert.equal(T.triadOf('9', true), 'majTriad');
        assert.equal(T.triadOf('m7', true), 'minTriad');
    });
    test('scaleFits : la gamme contient les notes de la triade', () => {
        assert.ok(T.scaleFits('ionian', 'majTriad'));
        assert.ok(T.scaleFits('phrygian', 'minTriad'));
        assert.ok(!T.scaleFits('dorian', 'majTriad'));
        assert.ok(T.scaleFits('locrianSharp2', 'dimTriad'));
    });
    test('triadizeItem : bloc de modèle et son second accord, la gamme est gardée si elle convient', () => {
        const it = T.triadizeItem({ r: 2, c: 'm7', s: 'phrygian', split: { r: 7, c: '7', s: 'mixolydian' } });
        assert.equal(it.c, 'minTriad'); assert.equal(it.s, 'phrygian');
        assert.equal(it.split.c, '7'); // dominante gardée
        const jj = T.triadizeItem({ r: 0, c: 'maj7', s: 'lydian' });
        assert.equal(jj.c, 'majTriad'); assert.equal(jj.s, 'lydian');
        const m = T.triadizeItem({ r: 0, c: 'maj7', s: 'dorian' }); // gamme qui ne convient pas (tierce mineure) : première gamme de la triade
        assert.equal(m.c, 'majTriad'); assert.equal(m.s, 'ionian');
    });
    test('les styles classiques et traditionnels sont listés', () => {
        assert.deepEqual([...T.TRIAD_STYLES].sort(), ['baroque', 'menuet', 'mozart', 'trad']);
    });
});
