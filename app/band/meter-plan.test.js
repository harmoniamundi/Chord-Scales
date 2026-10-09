// Tests de l'orchestre des mesures à 2 et 3 temps (band/meter-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { meterPhraseExtras, buildMeterPlan } = require('./meter-plan.js');
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

const freshState = () => ({ meterVoice: undefined, bandLastFill: false });
const mkEnv = (bpb, style, state = freshState()) => ({
    transOffset: 0, state, splitBeat: bpb === 2 ? 1 : 2, meterKey: H.meterKey(bpb, false),
    swing: H.bandSwing(style, 120), findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0]
});
// Phrase minimale, sans « mx » : le générateur le tire lui-même (comme dans le moteur).
function mkPhrase(bpb, style, seed, extra = {}) {
    const lib = H.patternLib(H.meterKey(bpb, false), style);
    const hits = lib.piano[0].hits;
    return {
        rng: seeded(seed), style, fill: false, lift: false, density: 0.7, voicing: 'closed',
        motif: hits, second: hits, varied: hits, turn: lib.turn[0].hits,
        bassMotif: lib.bass ? lib.bass[0].hits : null, bassAlt: lib.bass ? lib.bass[0].hits : null,
        bassTurn: lib.bassTurn ? lib.bassTurn[0].hits : null, ...extra
    };
}
function plan({ bpb = 3, style = 'swing', step = Dm7, nextStep = G7, last = false, halves = null, seed = 1, i = 0, L = 4, isTurn = false, m = 0, env = mkEnv(bpb, style), ph = mkPhrase(bpb, style, seed) } = {}) {
    return buildMeterPlan(env, bpb, style, step, nextStep, last, halves, ph, i, L, isTurn, m);
}

describe('meterPhraseExtras (choix faits une fois par phrase)', () => {
    test('déterministe pour une même graine', () => {
        for (const bpb of [2, 3]) for (const style of STYLES) {
            const lib = H.patternLib(H.meterKey(bpb, false), style);
            const ph = mkPhrase(bpb, style, 5);
            assert.deepEqual(meterPhraseExtras(bpb, style, lib, ph, seeded(9)), meterPhraseExtras(bpb, style, lib, ph, seeded(9)));
        }
    });
    test('l’intensité I reste entre 0 et 1', () => {
        for (let s = 1; s <= 60; s++) for (const style of STYLES) {
            const bpb = 2 + (s % 2);
            const lib = H.patternLib(H.meterKey(bpb, false), style);
            const mx = meterPhraseExtras(bpb, style, lib, mkPhrase(bpb, style, s), seeded(s));
            assert.ok(mx.I >= 0 && mx.I <= 1, `${style} I=${mx.I}`);
        }
    });
});

describe('buildMeterPlan', () => {
    for (const bpb of [2, 3]) for (const style of STYLES) {
        test(`${bpb}/4 ${style} : événements dans la mesure, vélocités valides`, () => {
            for (let seed = 1; seed <= 40; seed++) {
                const p = plan({ bpb, style, seed, i: seed % 4, m: seed % 4, isTurn: seed % 5 === 0, last: seed % 2 === 0 });
                for (const kind of ['piano', 'bass', 'drums']) {
                    assert.ok(Array.isArray(p[kind]), kind);
                    for (const e of p[kind]) {
                        assert.ok(e.pos >= 0 && e.pos < bpb, `${bpb}/4 ${style} ${kind} pos ${e.pos}`);
                        assert.ok(e.vel > 0 && e.vel <= 1.2, `${bpb}/4 ${style} ${kind} vel ${e.vel}`);
                    }
                }
                assert.ok(p.piano.length > 0, `${bpb}/4 ${style} : piano vide (graine ${seed})`);
            }
        });
    }
    test('le style classique n’écrit que pour le piano', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const p = plan({ bpb: 3, style: 'classic', seed });
            assert.equal(p.bass.length, 0);
            assert.equal(p.drums.length, 0);
        }
    });
    test('les autres styles ont de la basse et de la batterie', () => {
        for (const style of ['swing', 'pop', 'latin']) {
            const p = plan({ bpb: 3, style, seed: 4 });
            assert.ok(p.bass.length > 0 && p.drums.length > 0, style);
        }
    });
    test('déterministe : même graine, même plan', () => {
        for (const style of STYLES) assert.deepEqual(plan({ style, seed: 12 }), plan({ style, seed: 12 }));
    });
    test('mesure à deux accords : la basse joue dans chaque moitié (3/4 : 2+1)', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const p = plan({ bpb: 3, style: 'swing', halves: [Dm7, G7], nextStep: Cmaj7, seed });
            assert.ok(p.bass.some(b => b.pos < 2), `1re moitié (graine ${seed})`);
            assert.ok(p.bass.some(b => b.pos >= 2 - 1e-6), `2de moitié (graine ${seed})`);
        }
    });
    test('le tirage de phrase est mémorisé dans ph.mx quand il manque', () => {
        const ph = mkPhrase(3, 'swing', 3);
        assert.equal(ph.mx, undefined);
        plan({ ph });
        assert.ok(ph.mx && typeof ph.mx.I === 'number');
    });
    test('un ph.mx déjà tiré n’est pas modifié', () => {
        const ph = mkPhrase(3, 'swing', 3);
        ph.mx = meterPhraseExtras(3, 'swing', H.patternLib('3/4', 'swing'), ph, seeded(1));
        const before = JSON.stringify(ph.mx);
        plan({ ph });
        assert.equal(JSON.stringify(ph.mx), before);
    });
    test('la transposition de l’instrument change le registre du piano (pop) et de la basse (latin)', () => {
        let differs = 0;
        for (let seed = 1; seed <= 30; seed++) {
            const low = plan({ style: 'pop', seed, env: { ...mkEnv(3, 'pop'), transOffset: -9 } });
            const hi = plan({ style: 'pop', seed, env: mkEnv(3, 'pop') });
            if (JSON.stringify(low.piano) !== JSON.stringify(hi.piano)) differs++;
            const lowL = plan({ style: 'latin', seed, env: { ...mkEnv(3, 'latin'), transOffset: -9 } });
            const hiL = plan({ style: 'latin', seed, env: mkEnv(3, 'latin') });
            if (JSON.stringify(lowL.bass) !== JSON.stringify(hiL.bass)) differs++;
        }
        assert.equal(differs, 60);
    });
});

describe('mémoire entre les mesures (env.state)', () => {
    test('le voicing du piano est mémorisé pour l’accord joué (pop)', () => {
        const state = freshState();
        plan({ style: 'pop', env: mkEnv(3, 'pop', state), seed: 2 });
        assert.ok(state.meterVoice && state.meterVoice.v.length >= 3);
        assert.equal(state.meterVoice.key, '2:m7');
    });
    test('bandLastFill reste un booléen', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const state = freshState();
            plan({ env: mkEnv(3, 'swing', state), seed, last: true, isTurn: true, nextStep: Cmaj7, ph: mkPhrase(3, 'swing', seed, { fill: true }) });
            assert.equal(typeof state.bandLastFill, 'boolean');
        }
    });
});
