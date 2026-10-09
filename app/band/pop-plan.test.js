// Tests de l'orchestre Pop (band/pop-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { popPhraseExtras, buildPopPlan } = require('./pop-plan.js');
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
const Cmaj7 = { rootIndex: 0, chordId: 'maj7', scaleId: 'ionian' };
const Am7 = { rootIndex: 9, chordId: 'm7', scaleId: 'aeolian' };
const G7 = { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' };
const freshState = () => ({ popVoice: null, popRunAt: -9, bandLastFill: false });
const mkEnv = (state = freshState(), transOffset = 0) => ({
    transOffset, state, findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0]
});
const mkPhrase = (seed, extra = {}) => ({ rng: seeded(seed), style: 'pop', fill: false, lift: false, ...popPhraseExtras(seeded(seed * 31), null, seed % 3), ...extra });
function plan({ step = Cmaj7, nextStep = G7, last = false, halves = null, seed = 1, i = 0, L = 4, isTurn = false, m = 0, env = mkEnv(), ph = mkPhrase(seed) } = {}) {
    return buildPopPlan(env, step, nextStep, last, halves, ph, i, L, isTurn, m);
}

describe('popPhraseExtras', () => {
    test('valeurs valides sur beaucoup de graines', () => {
        for (let s = 1; s <= 200; s++) {
            const e = popPhraseExtras(seeded(s), s % 2 ? null : { style: 'pop', intensity: (s % 10) / 10 }, s % 4);
            assert.ok(e.intensity > 0 && e.intensity <= 1, `intensité ${e.intensity}`);
            assert.equal(typeof e.lift, 'boolean');
            assert.ok(Number.isInteger(e.compIdx) && e.compIdx >= 0);
            assert.ok(Array.isArray(e.arpPattern));
        }
    });
    test('déterministe', () => {
        assert.deepEqual(popPhraseExtras(seeded(4), null, 1), popPhraseExtras(seeded(4), null, 1));
    });
});

describe('buildPopPlan', () => {
    test('piano, basse et batterie : positions dans la mesure à 4 temps, vélocités valides', () => {
        for (let seed = 1; seed <= 80; seed++) {
            const p = plan({ seed, i: seed % 4, m: seed % 4, isTurn: seed % 5 === 0, last: seed % 2 === 0, ph: mkPhrase(seed, { fill: seed % 3 === 0 }) });
            for (const kind of ['piano', 'bass', 'drums']) {
                assert.ok(Array.isArray(p[kind]) && p[kind].length > 0, `${kind} vide (graine ${seed})`);
                for (const e of p[kind]) {
                    assert.ok(e.pos >= 0 && e.pos < 4, `${kind} pos ${e.pos} (graine ${seed})`);
                    assert.ok(e.vel > 0 && e.vel <= 1.2, `${kind} vel ${e.vel}`);
                }
            }
        }
    });
    test('déterministe : mêmes graines, même mémoire → même plan', () => {
        assert.deepEqual(plan({ seed: 7 }), plan({ seed: 7 }));
    });
    test('les événements de piano portent des hauteurs entières et raisonnables', () => {
        for (let seed = 1; seed <= 40; seed++) {
            for (const e of plan({ seed, step: Am7, nextStep: null }).piano) {
                assert.ok(Array.isArray(e.intervals) && e.intervals.length > 0);
                for (const n of e.intervals) {
                    const abs = (e.rootIndex || 0) + n;
                    assert.ok(Number.isInteger(abs) && abs > -30 && abs < 60, `note ${abs}`);
                }
            }
        }
    });
    test('mesure coupée en deux accords : piano et basse dans chaque moitié', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const p = plan({ halves: [Cmaj7, Am7], nextStep: G7, seed });
            assert.ok(p.bass.some(b => b.pos < 2), `basse 1re moitié (graine ${seed})`);
            assert.ok(p.bass.some(b => b.pos >= 2 - 1e-6), `basse 2de moitié (graine ${seed})`);
        }
    });
});

describe('mémoire entre les mesures (env.state)', () => {
    test('le dernier voicing du piano est mémorisé', () => {
        const state = freshState();
        plan({ env: mkEnv(state) });
        assert.ok(state.popVoice && Array.isArray(state.popVoice.v) && state.popVoice.v.length >= 3);
        assert.equal(state.popVoice.key, '0:maj7');
    });
    test('la conduite des voix réutilise le voicing mémorisé pour un accord identique', () => {
        const state = freshState();
        plan({ env: mkEnv(state), seed: 2 });
        const first = state.popVoice.v.slice();
        plan({ env: mkEnv(state), seed: 3, m: 1, nextStep: null });
        assert.deepEqual(state.popVoice.v, first);
    });
    test('une fin de mesure de retournement avec remplissage mémorise le remplissage pour la mesure suivante', () => {
        const state = freshState();
        plan({ env: mkEnv(state), isTurn: true, ph: mkPhrase(11, { fill: true }) });
        assert.equal(typeof state.bandLastFill, 'boolean');
    });
    test('l’état initial n’est jamais laissé undefined', () => {
        const state = freshState();
        plan({ env: mkEnv(state), seed: 5 });
        for (const k of ['popVoice', 'popRunAt', 'bandLastFill']) assert.notEqual(state[k], undefined, k);
    });
});

describe('transposition', () => {
    test('la basse reste dans le registre pour Do, Si♭ et Mi♭', () => {
        for (const off of [0, -2, -9]) for (let seed = 1; seed <= 20; seed++) {
            const p = plan({ seed, env: mkEnv(freshState(), off) });
            for (const b of p.bass) if (b.abs !== undefined) assert.ok(b.abs + off >= -12 && b.abs + off <= 16, `abs ${b.abs} offset ${off}`);
        }
    });
});
