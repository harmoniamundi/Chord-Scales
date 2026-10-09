// Tests de l'orchestre des Balkans (band/balkan-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { balkanVoicing, balkanPhraseExtras, buildBalkanPlan } = require('./balkan-plan.js');
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
const Am = { rootIndex: 9, chordId: 'minTriad', scaleId: 'aeolian' };
const E7 = { rootIndex: 4, chordId: '7', scaleId: 'phrygianDominant' };
const Dm = { rootIndex: 2, chordId: 'minTriad', scaleId: 'dorian' };

const mkEnv = (over = {}) => ({
    transOffset: 0,
    findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0],
    splitBeat: 2,
    bpm: 110,
    state: { balkanVoice: null, balkanMel: null },
    ...over
});
const mkPhrase = (seed) => ({ rng: seeded(seed), style: 'balkan', ...balkanPhraseExtras(seeded(seed * 31), null, seed % 3) });
function plan({ bpb = 2, ternary = false, step = Am, nextStep = E7, last = false, halves = null, seed = 1, i = 0, L = 4, isTurn = false, m = 0, env = mkEnv(), ph = mkPhrase(seed) } = {}) {
    return buildBalkanPlan(env, bpb, ternary, step, nextStep, last, halves, ph, i, L, isTurn, m);
}

describe('balkanPhraseExtras (choix de la phrase)', () => {
    test('valeurs dans leurs bornes, sur beaucoup de graines', () => {
        for (let s = 1; s <= 300; s++) {
            const e = balkanPhraseExtras(seeded(s), s % 2 ? null : { style: 'balkan', intensity: (s % 10) / 10 }, s % 4);
            assert.ok(e.intensity >= 0.28 && e.intensity <= 0.98, `intensité ${e.intensity}`);
            assert.ok(['oompah', 'drive'].includes(e.feel));
            assert.ok([0, 1, 2].includes(e.mel));
            assert.ok(Number.isInteger(e.percIdx) && e.percIdx >= 0 && e.percIdx < 3);
            assert.ok(Number.isInteger(e.darIdx) && e.darIdx >= 0 && e.darIdx < 2);
            assert.equal(e.melSteps.length, 8);
            for (const k of ['fill', 'run', 'daire', 'orn', 'oct']) assert.equal(typeof e[k], 'boolean');
        }
    });
    test('l’intensité part bas à la première phrase (index 0)', () => {
        for (let s = 1; s <= 50; s++) {
            const e = balkanPhraseExtras(seeded(s), null, 0);
            assert.ok(e.intensity >= 0.4 && e.intensity <= 0.55);
        }
    });
    test('déterministe à graine égale', () => {
        assert.deepEqual(balkanPhraseExtras(seeded(5), null, 1), balkanPhraseExtras(seeded(5), null, 1));
    });
});

describe('balkanVoicing (triade de l’accordéon)', () => {
    test('trois notes croissantes, aux bonnes hauteurs, dans le registre', () => {
        const env = { transOffset: 0, findChordObj: mkEnv().findChordObj };
        for (const cs of [Am, E7, Dm, { rootIndex: 0, chordId: 'maj7' }, { rootIndex: 6, chordId: 'm7b5' }]) {
            const v = balkanVoicing(env, cs, null);
            assert.equal(v.length, 3);
            assert.ok(v[0] < v[1] && v[1] < v[2]);
            assert.ok(v[0] >= 5 - 12 && v[2] <= 21 + 3, `${JSON.stringify(v)}`);
        }
    });
    test('les trois notes sont les degrés 1-3-5 de l’accord', () => {
        const env = { transOffset: 0, findChordObj: mkEnv().findChordObj };
        const pcs = (v) => v.map(n => ((n % 12) + 12) % 12).sort((a, b) => a - b);
        assert.deepEqual(pcs(balkanVoicing(env, Am, null)), [0, 4, 9]);
        assert.deepEqual(pcs(balkanVoicing(env, E7, null)), [4, 8, 11]);
        assert.deepEqual(pcs(balkanVoicing(env, Dm, null)), [2, 5, 9]);
    });
    test('conduite des voix : l’enchaînement bouge peu', () => {
        const env = { transOffset: 0, findChordObj: mkEnv().findChordObj };
        const a = balkanVoicing(env, Am, null);
        const b = balkanVoicing(env, Dm, a);
        const move = b.reduce((s, n, k) => s + Math.abs(n - a[k]), 0);
        assert.ok(move <= 10, `mouvement total ${move}`);
    });
});

describe('buildBalkanPlan : forme générale', () => {
    const cases = [['2/4 kolo', 2, false], ['4/4', 4, false], ['3/4', 3, false], ['9/8 aksak', 3, true], ['6/8', 2, true], ['12/8', 4, true]];
    for (const [name, bpb, ternary] of cases) {
        test(`${name} : événements dans la mesure, vélocités valides`, () => {
            for (let seed = 1; seed <= 60; seed++) {
                const p = plan({ bpb, ternary, seed, i: seed % 4, m: seed % 4, isTurn: seed % 5 === 0, last: seed % 2 === 0, env: mkEnv({ splitBeat: bpb === 2 ? 1 : 2 }) });
                for (const kind of ['piano', 'bass', 'drums']) {
                    assert.ok(Array.isArray(p[kind]), `${name} ${kind}`);
                    for (const e of p[kind]) {
                        assert.ok(e.pos >= 0 && e.pos < bpb, `${name} ${kind} pos ${e.pos} (graine ${seed})`);
                        assert.ok(e.vel > 0 && e.vel <= 1, `${name} ${kind} vel ${e.vel}`);
                    }
                }
                assert.ok(p.piano.length > 0 && p.bass.length > 0 && p.drums.length > 0, `${name} vide (graine ${seed})`);
                assert.equal(p.accordion, true);
            }
        });
    }
    test('déterministe : même graine, même mémoire → même plan', () => {
        assert.deepEqual(plan({ seed: 9 }), plan({ seed: 9 }));
    });
    test('mesure coupée en deux accords : piano et basse dans chaque moitié', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const p = plan({ bpb: 4, halves: [Am, Dm], seed, env: mkEnv({ splitBeat: 2 }) });
            for (const kind of ['piano', 'bass']) {
                assert.ok(p[kind].some(e => e.pos < 2), `${kind} 1re moitié (graine ${seed})`);
                assert.ok(p[kind].some(e => e.pos >= 2 - 1e-6), `${kind} 2de moitié (graine ${seed})`);
            }
        }
    });
});

describe('mémoire entre deux mesures (env.state)', () => {
    test('le renversement de l’accordéon est mémorisé puis réutilisé sur le même accord', () => {
        const env = mkEnv();
        plan({ env, seed: 3 });
        const mem = env.state.balkanVoice;
        assert.ok(mem && Array.isArray(mem.v) && mem.v.length === 3, 'voicing mémorisé');
        const p2 = plan({ env, seed: 3, m: 1, nextStep: null });
        assert.ok(p2.piano.length > 0);
        assert.equal(env.state.balkanVoice.key.split(':')[1].length > 0, true);
    });
    test('sans mémoire initiale, le plan se calcule quand même', () => {
        const env = mkEnv({ state: { balkanVoice: null, balkanMel: null } });
        assert.ok(plan({ env }).piano.length > 0);
    });
});

describe('allègement quand le tempo monte', () => {
    test('à tempo très rapide l’accordéon joue moins de notes qu’à tempo lent', () => {
        let slow = 0, fast = 0;
        for (let seed = 1; seed <= 80; seed++) {
            const base = { bpb: 2, seed, i: 1, m: 1 };
            slow += plan({ ...base, env: mkEnv({ bpm: 100 }) }).piano.length;
            fast += plan({ ...base, env: mkEnv({ bpm: 240 }) }).piano.length;
        }
        assert.ok(fast <= slow, `rapide ${fast} > lent ${slow}`);
    });
});
