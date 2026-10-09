// Tests des lignes de basse swing (band/bass-lines.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { resolveBassToken, buildWalkingBass, buildWalkingBassSplit } = require('./bass-lines.js');
const H = require('./band-helpers.js');
const T = require('../theory.js');

function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const env = { transOffset: 0, findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0] };
const Dm7 = { rootIndex: 2, chordId: 'm7', scaleId: 'dorian' };
const G7 = { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' };
const Cmaj7 = { rootIndex: 0, chordId: 'maj7', scaleId: 'ionian' };
const pc = (n) => ((n % 12) + 12) % 12;
const SW = 2 / 3;

describe('resolveBassToken', () => {
    const tones = env.findChordObj('m7').notes;
    test('R, 3, 5, 7 : degrés de l\'accord (D m7)', () => {
        const rng = () => 0.5;
        assert.equal(resolveBassToken(env, 'R', Dm7, null, false, rng), 2 + tones[0]);
        assert.equal(resolveBassToken(env, '3', Dm7, null, false, rng), 2 + tones[1]);
        assert.equal(resolveBassToken(env, '5', Dm7, null, false, rng), 2 + tones[2]);
        assert.equal(resolveBassToken(env, '7', Dm7, null, false, rng), 2 + tones[3]);
    });
    test('un jeton inconnu retombe sur la fondamentale', () => {
        assert.equal(resolveBassToken(env, 'zz', Dm7, null, false, () => 0.5), 2 + tones[0]);
    });
    test('O : fondamentale à l\'octave, ramenée dans le registre grave', () => {
        assert.equal(resolveBassToken(env, 'O', Dm7, null, false, () => 0.5), 2 + tones[0] + 12);
        const high = { rootIndex: 9, chordId: 'm7', scaleId: 'dorian' };
        assert.equal(resolveBassToken(env, 'O', high, null, false, () => 0.5), 9 + tones[0] - 12);
    });
    test('A : approche chromatique de l\'accord suivant en fin d\'accord, sinon la quinte', () => {
        const target = H.bassNear(env, G7);
        assert.equal(resolveBassToken(env, 'A', Dm7, G7, true, () => 0.1), target - 1);
        assert.equal(resolveBassToken(env, 'A', Dm7, G7, true, () => 0.9), target + 1);
        assert.equal(resolveBassToken(env, 'A', Dm7, G7, false, () => 0.1), 2 + tones[2]);
        assert.equal(resolveBassToken(env, 'A', Dm7, null, true, () => 0.1), 2 + tones[2]);
    });
    test('préfixe n : lit l\'accord suivant seulement à la dernière mesure', () => {
        const g = env.findChordObj('7').notes;
        assert.equal(resolveBassToken(env, 'nR', Dm7, G7, true, () => 0.5), 7 + g[0]);
        assert.equal(resolveBassToken(env, 'nR', Dm7, G7, false, () => 0.5), 2 + tones[0]);
        assert.equal(resolveBassToken(env, 'n5', Dm7, null, true, () => 0.5), 2 + tones[2]);
    });
});

describe('buildWalkingBass', () => {
    test('quatre noires (temps 0 à 3) sur la fondamentale, 4 hits minimum', () => {
        for (let s = 1; s <= 200; s++) {
            const h = buildWalkingBass(env, Dm7, G7, false, seeded(s), SW);
            assert.ok(h.length >= 2 && h.length <= 5);
            assert.equal(h[0].pos, 0);
            assert.equal(h[0].abs, H.bassNear(env, Dm7));
            h.forEach(x => { assert.ok(Number.isFinite(x.abs)); assert.ok(x.dur > 0 && x.vel > 0 && x.vel <= 1); });
        }
    });
    test('en fin d\'accord, le dernier temps approche chromatiquement l\'accord suivant', () => {
        const target = H.bassNear(env, G7);
        for (let s = 1; s <= 200; s++) {
            const h = buildWalkingBass(env, Dm7, G7, true, seeded(s), SW);
            const last = h.filter(x => x.pos >= 3).pop();
            assert.equal(Math.abs(last.abs - target), 1, `graine ${s}`);
        }
    });
    test('sans accord suivant, pas de note d\'approche (dernier temps = note de l\'accord)', () => {
        const chordPcs = new Set(env.findChordObj('m7').notes.map(n => pc(2 + n)));
        for (let s = 1; s <= 100; s++) {
            const h = buildWalkingBass(env, Dm7, null, true, seeded(s), SW);
            const quarters = h.filter(x => Number.isInteger(x.pos));
            quarters.forEach(x => assert.ok(chordPcs.has(pc(x.abs)) || x.pos === 1, `graine ${s} pos ${x.pos}`));
        }
    });
    test('feeling « à deux temps » : deux notes longues (graine forçant rng<0.15)', () => {
        const h = buildWalkingBass(env, Dm7, null, false, () => 0.01, SW);
        assert.deepEqual(h.map(x => x.pos), [0, 2]);
        assert.equal(h[0].dur, 1.9);
        const h2 = buildWalkingBass(env, Dm7, G7, true, () => 0.01, SW);
        assert.deepEqual(h2.map(x => x.pos), [0, 2, 3 + SW]);
    });
    test('note de passage chromatique swinguée, avec raccourcissement du temps 2', () => {
        let seen = false;
        for (let s = 1; s <= 300 && !seen; s++) {
            const h = buildWalkingBass(env, Dm7, null, false, seeded(s), SW);
            if (h.length === 5) { seen = true; assert.equal(h[4].pos, 1 + SW); assert.equal(h[1].dur, 0.6); assert.equal(h[4].dur, 0.3); }
        }
        assert.ok(seen);
    });
    test('déterministe pour une même graine', () => {
        assert.deepEqual(buildWalkingBass(env, Dm7, G7, true, seeded(5), SW), buildWalkingBass(env, Dm7, G7, true, seeded(5), SW));
    });
    test('une gamme inconnue retombe sur la gamme majeure pour la seconde', () => {
        const h = buildWalkingBass(env, { ...Dm7, scaleId: 'nope' }, null, false, seeded(3), SW);
        assert.ok(h.length >= 2);
    });
});

describe('buildWalkingBassSplit', () => {
    const halves = [Dm7, G7];
    test('fondamentale de chaque accord aux temps 1 et 3', () => {
        for (let s = 1; s <= 200; s++) {
            const h = buildWalkingBassSplit(env, halves, Cmaj7, seeded(s), SW);
            assert.equal(h[0].pos, 0); assert.equal(h[0].abs, H.bassNear(env, Dm7));
            const second = h.find(x => x.pos === 2);
            assert.equal(second.abs, H.bassNear(env, G7));
        }
    });
    test('mesure à quatre noires : approche vers le second accord au temps 2 et vers le suivant au temps 4', () => {
        const h = buildWalkingBassSplit(env, halves, Cmaj7, () => 0.5, SW);
        assert.deepEqual(h.map(x => x.pos), [0, 1, 2, 3]);
        assert.equal(Math.abs(h[1].abs - H.bassNear(env, G7)), 1);
        assert.equal(Math.abs(h[3].abs - H.bassNear(env, Cmaj7)), 1);
    });
    test('même fondamentale : pas d\'approche, une note de l\'accord', () => {
        const same = [Dm7, { rootIndex: 2, chordId: '7', scaleId: 'mixolydian' }];
        const h = buildWalkingBassSplit(env, same, null, () => 0.5, SW);
        const a = H.bassNear(env, Dm7);
        assert.notEqual(pc(h[1].abs), pc(a));
    });
    test('« à deux temps » : approche finale seulement si l\'accord suivant diffère', () => {
        const withNext = buildWalkingBassSplit(env, halves, Cmaj7, () => 0.01, SW);
        assert.deepEqual(withNext.map(x => x.pos), [0, 2, 3 + SW]);
        const noNext = buildWalkingBassSplit(env, halves, null, () => 0.01, SW);
        assert.deepEqual(noNext.map(x => x.pos), [0, 2]);
        assert.equal(noNext[1].dur, 1.9);
        const sameNext = buildWalkingBassSplit(env, halves, G7, () => 0.01, SW);
        assert.deepEqual(sameNext.map(x => x.pos), [0, 2]);
    });
});
