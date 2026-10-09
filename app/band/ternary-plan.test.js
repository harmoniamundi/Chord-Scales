// Tests de l'orchestre des mesures composées 6/8, 9/8, 12/8 (band/ternary-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { ternaryPhraseExtras, buildTernaryPlan } = require('./ternary-plan.js');
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
const Dm7 = { rootIndex: 2, chordId: 'm7', scaleId: 'dorian' };
const G7 = { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' };
const Cmaj7 = { rootIndex: 0, chordId: 'maj7', scaleId: 'ionian' };
const STYLES = ['swing', 'pop', 'latin', 'classic'];
const KEYS = { 2: '6/8', 3: '9/8', 4: '12/8' };

const freshState = () => ({ meterVoice: undefined, bandLastFill: false });
const mkEnv = (bpb, state = freshState()) => ({
    transOffset: 0, state, splitBeat: bpb === 2 ? 1 : 2, meterKey: H.meterKey(bpb, true),
    findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0]
});
function mkPhrase(bpb, style, seed, extra = {}) {
    const lib = H.patternLib(H.meterKey(bpb, true), style);
    const hits = lib.piano[0].hits;
    return {
        rng: seeded(seed), style, fill: false, lift: false, density: 0.7, voicing: 'closed',
        motif: hits, second: hits, varied: hits, turn: lib.turn[0].hits,
        bassMotif: lib.bass ? lib.bass[0].hits : null, bassAlt: lib.bass ? lib.bass[0].hits : null,
        bassTurn: lib.bassTurn ? lib.bassTurn[0].hits : null, ...extra
    };
}
function plan({ bpb = 4, style = 'swing', step = Dm7, nextStep = G7, last = false, halves = null, seed = 1, i = 0, L = 4, isTurn = false, m = 0, env = mkEnv(bpb), ph = mkPhrase(bpb, style, seed) } = {}) {
    return buildTernaryPlan(env, bpb, style, step, nextStep, last, halves, ph, i, L, isTurn, m);
}

describe('signatures', () => {
    test('meterKey donne 6/8, 9/8 et 12/8 pour 2, 3 et 4 pulsations ternaires', () => {
        for (const bpb of [2, 3, 4]) assert.equal(H.meterKey(bpb, true), KEYS[bpb]);
    });
});

describe('ternaryPhraseExtras (choix faits une fois par phrase)', () => {
    test('les unités de la mesure : H = deux pulsations, P = une pulsation', () => {
        for (const style of STYLES) {
            const lib = H.patternLib('6/8', style);
            assert.deepEqual(ternaryPhraseExtras(2, style, lib, mkPhrase(2, style, 1), seeded(1)).kinds, ['H']);
            assert.deepEqual(ternaryPhraseExtras(3, style, lib, mkPhrase(3, style, 1), seeded(1)).kinds, ['H', 'P']);
            assert.deepEqual(ternaryPhraseExtras(4, style, lib, mkPhrase(4, style, 1), seeded(1)).kinds, ['H', 'H']);
        }
    });
    test('déterministe et intensité entre 0 et 1', () => {
        for (let s = 1; s <= 60; s++) for (const style of STYLES) {
            const bpb = 2 + (s % 3);
            const lib = H.patternLib(H.meterKey(bpb, true), style);
            const a = ternaryPhraseExtras(bpb, style, lib, mkPhrase(bpb, style, s), seeded(s));
            const b = ternaryPhraseExtras(bpb, style, lib, mkPhrase(bpb, style, s), seeded(s));
            assert.deepEqual(a, b);
            assert.ok(a.I >= 0 && a.I <= 1, `${style} I=${a.I}`);
        }
    });
});

describe('buildTernaryPlan', () => {
    for (const bpb of [2, 3, 4]) for (const style of STYLES) {
        test(`${KEYS[bpb]} ${style} : événements dans la mesure, vélocités valides`, () => {
            for (let seed = 1; seed <= 40; seed++) {
                const p = plan({ bpb, style, seed, i: seed % 4, m: seed % 4, isTurn: seed % 5 === 0, last: seed % 2 === 0 });
                for (const kind of ['piano', 'bass', 'drums']) {
                    assert.ok(Array.isArray(p[kind]), kind);
                    for (const e of p[kind]) {
                        assert.ok(e.pos >= 0 && e.pos < bpb, `${KEYS[bpb]} ${style} ${kind} pos ${e.pos}`);
                        assert.ok(e.vel > 0 && e.vel <= 1.2, `${KEYS[bpb]} ${style} ${kind} vel ${e.vel}`);
                    }
                }
                assert.ok(p.piano.length > 0, `${KEYS[bpb]} ${style} : piano vide (graine ${seed})`);
            }
        });
    }
    test('les positions tombent sur des croches (tiers de pulsation)', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const p = plan({ bpb: 3, style: 'pop', seed });
            for (const e of [...p.piano, ...p.bass]) {
                const thirds = e.pos * 3;
                assert.ok(Math.abs(thirds - Math.round(thirds)) < 1e-6 || Math.abs(e.pos * 6 - Math.round(e.pos * 6)) < 1e-6, `pos ${e.pos}`);
            }
        }
    });
    test('le style classique n’écrit que pour le piano', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const p = plan({ bpb: 4, style: 'classic', seed });
            assert.equal(p.bass.length, 0);
            assert.equal(p.drums.length, 0);
        }
    });
    test('les autres styles ont de la basse et de la batterie', () => {
        for (const style of ['swing', 'pop', 'latin']) {
            const p = plan({ bpb: 4, style, seed: 4 });
            assert.ok(p.bass.length > 0 && p.drums.length > 0, style);
        }
    });
    test('déterministe : même graine, même plan', () => {
        for (const style of STYLES) assert.deepEqual(plan({ style, seed: 12 }), plan({ style, seed: 12 }));
    });
    test('mesure à deux accords (12/8 : 2+2) : la basse joue dans chaque moitié', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const p = plan({ bpb: 4, style: 'swing', halves: [Dm7, G7], nextStep: Cmaj7, seed });
            assert.ok(p.bass.some(b => b.pos < 2), `1re moitié (graine ${seed})`);
            assert.ok(p.bass.some(b => b.pos >= 2 - 1e-6), `2de moitié (graine ${seed})`);
        }
    });
    test('le tirage de phrase est mémorisé dans ph.mx quand il manque', () => {
        const ph = mkPhrase(4, 'swing', 3);
        assert.equal(ph.mx, undefined);
        plan({ ph });
        assert.ok(ph.mx && Array.isArray(ph.mx.kinds));
    });
});

describe('mémoire entre les mesures (env.state)', () => {
    test('le voicing du piano est mémorisé pour l’accord joué (pop)', () => {
        const state = freshState();
        plan({ style: 'pop', env: mkEnv(4, state), seed: 2 });
        assert.ok(state.meterVoice && state.meterVoice.v.length >= 3);
        assert.equal(state.meterVoice.key, '2:m7');
    });
    test('bandLastFill reste un booléen', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const state = freshState();
            plan({ env: mkEnv(4, state), seed, last: true, isTurn: true, nextStep: Cmaj7, ph: mkPhrase(4, 'swing', seed, { fill: true }) });
            assert.equal(typeof state.bandLastFill, 'boolean');
        }
    });
});
