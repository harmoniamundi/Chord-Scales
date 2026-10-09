// Tests de l'orchestre Classique et du mode Arpèges (band/classic-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { classicPhraseExtras, buildClassicPlan, buildArpPlan } = require('./classic-plan.js');
const P = require('../band-patterns.js');
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
const FAMILIES = ['quarter', 'blockarp', 'mixed', 'roll', 'bassup'];
const mkEnv = (extra = {}) => ({ transOffset: 0, bpm: 100, ternary: false, splitBeat: 2, findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0], ...extra });
const Dm7 = { rootIndex: 2, chordId: 'm7', scaleId: 'dorian' };
const G7 = { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' };
const Cmaj7 = { rootIndex: 0, chordId: 'maj7', scaleId: 'ionian' };

describe('classicPhraseExtras', () => {
    test('intensité bornée et famille connue ; indices dans les tables de motifs', () => {
        let prev = null;
        for (let idx = 0; idx < 60; idx++) {
            const ph = classicPhraseExtras(100, seeded(idx + 1), prev, idx);
            assert.ok(ph.intensity >= 0.25 && ph.intensity <= 0.9);
            assert.ok(FAMILIES.includes(ph.family));
            assert.ok(ph.eightIdx < P.CLS_EIGHTS.length && ph.eightAlt < P.CLS_EIGHTS.length);
            assert.ok(ph.quarterIdx < P.CLS_QUARTERS.length && ph.mixedIdx < P.CLS_MIXED.length && ph.upperIdx < P.CLS_UPPER.length);
            assert.ok(ph.ending === 0 || ph.ending === 1);
            assert.equal(typeof ph.bassLow, 'boolean');
            prev = { ...ph, style: 'classic' };
        }
    });
    test('au-delà de 165 BPM : jamais de croches continues (roll / bassup)', () => {
        for (let s = 1; s <= 300; s++) {
            const ph = classicPhraseExtras(190, seeded(s), { style: 'classic', family: 'roll', intensity: 0.8 }, 3);
            assert.ok(['quarter', 'blockarp', 'mixed'].includes(ph.family), ph.family);
        }
    });
    test('la première phrase part d\'une intensité modérée (0.35 à 0.55)', () => {
        for (let s = 1; s <= 50; s++) {
            const ph = classicPhraseExtras(100, seeded(s), null, 0);
            assert.ok(ph.intensity >= 0.35 && ph.intensity <= 0.55);
        }
    });
    test('déterministe', () => {
        assert.deepEqual(classicPhraseExtras(100, seeded(9), null, 0), classicPhraseExtras(100, seeded(9), null, 0));
    });
});

function mkPhrase(seed, family, extra = {}) {
    return { ...classicPhraseExtras(100, seeded(seed), null, 0), rng: seeded(seed + 1000), family, ...extra };
}
function plan({ env = mkEnv(), step = Dm7, nextStep = G7, last = false, halves = null, ph, i = 0, L = 4, isTurn = false, m = 0 } = {}) {
    return buildClassicPlan(env, step, nextStep, last, halves, ph, i, L, isTurn, m);
}

describe('buildClassicPlan', () => {
    test('piano seul : ni basse ni batterie, événements triés et valides', () => {
        for (const fam of FAMILIES) for (let i = 0; i < 4; i++) for (let s = 1; s <= 20; s++) {
            const r = plan({ ph: mkPhrase(s, fam), i, isTurn: i === 3, last: i === 3 });
            assert.deepEqual(r.bass, []); assert.deepEqual(r.drums, []);
            assert.ok(r.piano.length > 0, `${fam} i=${i}`);
            r.piano.forEach((e, k) => {
                assert.ok(e.pos >= 0 && e.pos < 4);
                assert.ok(e.dur >= 0.2); assert.ok(e.vel >= 0.12 && e.vel <= 1);
                assert.equal(e.noteVels.length, e.intervals.length);
                assert.equal(e.wide, true);
                if (k) assert.ok(e.pos >= r.piano[k - 1].pos);
            });
        }
    });
    test('les hauteurs d\'un événement sont triées sans doublon', () => {
        for (let s = 1; s <= 50; s++) {
            const r = plan({ ph: mkPhrase(s, 'blockarp') });
            r.piano.forEach(e => e.intervals.forEach((v, k) => { if (k) assert.ok(v > e.intervals[k - 1]); }));
        }
    });
    test('famille « quarter » : quatre noires aux temps 0 à 3', () => {
        const r = plan({ ph: mkPhrase(1, 'quarter', { bassLow: false, blockOnOne: false }), i: 0 });
        assert.deepEqual(r.piano.map(e => e.pos), [0, 1, 2, 3]);
    });
    test('basse sous le motif quand bassLow ou famille bassup', () => {
        const withLow = plan({ ph: mkPhrase(1, 'quarter', { bassLow: true, blockOnOne: false }) });
        assert.equal(withLow.piano.filter(e => e.pos === 0).length, 2);
        const without = plan({ ph: mkPhrase(1, 'quarter', { bassLow: false, blockOnOne: false }) });
        assert.equal(without.piano.filter(e => e.pos === 0).length, 1);
    });
    test('accord sur basse (slash) : la basse est jouée même sans bassLow', () => {
        const slash = { ...Dm7, bassRootIndex: 5 };
        const r = plan({ step: slash, ph: mkPhrase(1, 'quarter', { bassLow: false, blockOnOne: false }) });
        assert.equal(r.piano.filter(e => e.pos === 0).length, 2);
    });
    test('dernière mesure de phrase : le motif se referme (note aiguë ou accord doux au temps 4)', () => {
        for (const ending of [0, 1]) {
            const r = plan({ ph: mkPhrase(2, 'roll', { endingOn: true, ending, blockOnOne: false, bassLow: false }), i: 3, isTurn: true });
            const at3 = r.piano.filter(e => e.pos === 3);
            assert.equal(at3.length, 1);
            assert.equal(at3[0].vel > 0, true);
            assert.equal(at3[0].intervals.length > 1, ending === 1);
            assert.ok(r.piano.every(e => e.pos < 3 || e.pos === 3));
        }
    });
    test('mesure à deux accords : deux demi-mesures indépendantes', () => {
        const r = plan({ halves: [Dm7, G7], ph: mkPhrase(3, 'blockarp') });
        assert.ok(r.piano.some(e => e.pos < 2) && r.piano.some(e => e.pos >= 2));
        r.piano.filter(e => e.pos < 2).forEach(e => assert.ok(e.pos + e.dur <= 2.06 + 1e-9 || e.dur === 0.2));
    });
    test('mesure à deux accords, famille quarter ou tempo rapide : deux notes par demi-mesure', () => {
        const r = plan({ env: mkEnv({ bpm: 190 }), halves: [Dm7, G7], ph: mkPhrase(3, 'roll', { bassLow: false }) });
        assert.deepEqual(r.piano.map(e => e.pos), [0, 1, 2, 3]);
    });
    test('la résonance de la dernière note se prolonge si l\'accord suivant est identique', () => {
        const same = plan({ nextStep: Dm7, last: true, ph: mkPhrase(4, 'quarter', { bassLow: false, blockOnOne: false }) });
        const diff = plan({ nextStep: G7, last: true, ph: mkPhrase(4, 'quarter', { bassLow: false, blockOnOne: false }) });
        const end = (r) => { const e = r.piano[r.piano.length - 1]; return e.pos + e.dur; };
        assert.ok(end(same) >= end(diff));
    });
    test('accord inconnu de la bibliothèque : repli sans erreur', () => {
        assert.doesNotThrow(() => plan({ step: { rootIndex: 0, chordId: 'zzz', scaleId: 'ionian' }, ph: mkPhrase(1, 'roll') }));
    });
    test('déterministe pour une même graine', () => {
        const a = plan({ ph: mkPhrase(7, 'mixed') }), b = plan({ ph: mkPhrase(7, 'mixed') });
        assert.deepEqual(a, b);
    });
});

describe('buildArpPlan', () => {
    const withMathRandom = (v, fn) => { const o = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = o; } };
    test('4 temps : notes montantes à partir de la basse, une vague par accord', () => {
        withMathRandom(0.5, () => {
            const r = buildArpPlan(mkEnv(), 4, Cmaj7, Dm7, true, null);
            assert.deepEqual(r.bass, []); assert.deepEqual(r.drums, []);
            assert.ok(r.piano.length >= 4);
            assert.equal(r.piano[0].pos, 0);
            assert.equal(r.piano[0].vel, 0.74);
            for (let k = 1; k < 4; k++) assert.ok(r.piano[k].intervals[0] > r.piano[k - 1].intervals[0]);
        });
    });
    test('mesure à deux accords : la coupure suit env.splitBeat', () => {
        withMathRandom(0.5, () => {
            const r = buildArpPlan(mkEnv({ splitBeat: 2 }), 4, Cmaj7, null, false, [Dm7, G7]);
            assert.ok(r.piano.some(e => e.pos === 2 && e.vel === 0.74), 'nouvelle vague au temps 3');
            const r3 = buildArpPlan(mkEnv({ splitBeat: 1 }), 3, Cmaj7, null, false, [Dm7, G7]);
            assert.ok(r3.piano.some(e => e.pos === 1 && e.vel === 0.74));
        });
    });
    test('mesure composée : arpège en triolets (pas de 1/3)', () => {
        withMathRandom(0.5, () => {
            const r = buildArpPlan(mkEnv({ ternary: true }), 2, Cmaj7, null, false, null);
            assert.ok(r.piano.some(e => Math.abs(e.pos - Math.round(e.pos)) > 0.3));
            const n = buildArpPlan(mkEnv({ ternary: false }), 2, Cmaj7, null, false, null);
            assert.ok(n.piano.every(e => e.pos === Math.round(e.pos * 2) / 2));
        });
    });
    test('retardement aléatoire (lay) tiré par Math.random', () => {
        const lo = withMathRandom(0, () => buildArpPlan(mkEnv(), 4, Cmaj7, null, false, null));
        const hi = withMathRandom(0.999, () => buildArpPlan(mkEnv(), 4, Cmaj7, null, false, null));
        assert.ok(lo.piano.every(e => e.lay === 0));
        assert.ok(hi.piano.every(e => e.lay > 0.005 && e.lay < 0.006));
    });
    test('durées bornées, vélocités fixes selon la place dans la mesure', () => {
        withMathRandom(0.5, () => {
            const r = buildArpPlan(mkEnv(), 4, Cmaj7, Dm7, true, null);
            r.piano.forEach(e => { assert.ok(e.dur >= 0.3 && e.dur <= 3); assert.ok([0.74, 0.6, 0.52].includes(e.vel)); });
        });
    });
});
