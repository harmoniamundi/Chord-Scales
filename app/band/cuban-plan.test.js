// Tests de l'orchestre cubain (band/cuban-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { cubanPhraseExtras, buildCubanPlan } = require('./cuban-plan.js');
const { CUBA } = require('../band-patterns.js');
const T = require('../theory.js');

// Générateur pseudo-aléatoire à graine : mêmes graines → mêmes résultats.
function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Environnement factice (ce que JamEngine fournit en vrai) : basses dans le registre mi1–ré#2.
const baseEnv = (over = {}) => ({
    splitBeat: 2,
    transOffset: 0,
    state: { latTie: false },
    findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0],
    ...over
});
const Dm7 = { rootIndex: 2, chordId: 'm7' };
const G7 = { rootIndex: 7, chordId: '7' };
const Cmaj7 = { rootIndex: 0, chordId: 'maj7' };
const phrase = (seed, extra = {}) => ({ rng: seeded(seed), intensity: 0.5, fill: false, fillKind: 0, ...extra });

// Une mesure : bpb temps, ternaire ou non, mesure m de la phrase.
function plan({ bpb = 4, ternary = false, step = Dm7, nextStep = G7, last = false, halves = null, seed = 1, i = 0, L = 4, isTurn = false, m = 0, env = {}, ph = {} } = {}) {
    const e = baseEnv({ splitBeat: bpb === 2 ? 1 : 2, ...env });
    const p = buildCubanPlan(e, bpb, ternary, step, nextStep, last, halves, phrase(seed, ph), i, L, isTurn, m);
    return { ...p, tie: e.state.latTie }; // tie : nouvel état de liaison de la basse, rangé par le plan dans env.state
}

describe('cubanPhraseExtras (choix de la phrase)', () => {
    for (const ternary of [false, true]) {
        test(`${ternary ? 'ternaire' : 'binaire'} : indices valides dans les tables`, () => {
            const C = ternary ? CUBA.ternary : CUBA.binary;
            for (let s = 1; s <= 200; s++) {
                const ex = cubanPhraseExtras({ rng: seeded(s), intensity: (s % 10) / 10 }, ternary);
                assert.equal(ex.t, ternary);
                for (const [k, list] of [['cellIdx', C.guajeos], ['altIdx', C.guajeos], ['bassIdx', C.bass], ['bassAlt', C.bass], ['congaIdx', C.congas]]) {
                    assert.ok(Number.isInteger(ex[k]) && ex[k] >= 0 && ex[k] < list.length, `${k} = ${ex[k]}`);
                }
            }
        });
    }
    test('sans intensité, elle se déduit de la densité', () => {
        const ex = cubanPhraseExtras({ rng: seeded(3), density: 1 }, false);
        assert.ok(Math.abs(ex.I - 0.9) < 1e-9);
    });
    test('à graine égale, résultat identique', () => {
        const a = cubanPhraseExtras({ rng: seeded(9), intensity: 0.4 }, true);
        const b = cubanPhraseExtras({ rng: seeded(9), intensity: 0.4 }, true);
        assert.deepEqual(a, b);
    });
});

describe('buildCubanPlan : forme générale', () => {
    const cases = [['4/4', 4, false], ['2/4', 2, false], ['3/4', 3, false], ['6/8', 2, true], ['9/8', 3, true], ['12/8', 4, true]];
    for (const [name, bpb, ternary] of cases) {
        test(`${name} : événements dans la mesure, durées > 0, vélocités ≤ 1`, () => {
            for (let seed = 1; seed <= 60; seed++) {
                const p = plan({ bpb, ternary, seed, m: seed % 4, i: seed % 4, isTurn: seed % 5 === 0, ph: { fill: seed % 2 === 0 } });
                for (const kind of ['piano', 'bass', 'drums']) {
                    assert.ok(Array.isArray(p[kind]) && p[kind].length > 0, `${name} ${kind} vide (graine ${seed})`);
                    for (const e of p[kind]) {
                        assert.ok(e.pos >= 0 && e.pos < bpb, `${name} ${kind} pos ${e.pos}`);
                        assert.ok(e.vel > 0 && e.vel <= 1, `${name} ${kind} vel ${e.vel}`);
                        if (kind !== 'drums') assert.ok(e.dur > 0, `${name} ${kind} dur ${e.dur}`);
                    }
                }
                assert.equal(typeof p.tie, 'boolean');
            }
        });
    }
    test('déterministe : même graine → même plan', () => {
        assert.deepEqual(plan({ seed: 42, m: 1 }), plan({ seed: 42, m: 1 }));
    });
    test('les notes de piano sont des nombres entiers (hauteurs en demi-tons)', () => {
        for (const e of plan({ seed: 5 }).piano) for (const n of e.intervals) assert.ok(Number.isInteger(n));
    });
    test('la phrase mémorise ses choix (ph.cu) et les refait si la métrique change', () => {
        const ph = phrase(7);
        const env = baseEnv();
        buildCubanPlan(env, 4, false, Dm7, G7, false, null, ph, 0, 4, false, 0);
        const first = ph.cu;
        buildCubanPlan(env, 4, false, Dm7, G7, false, null, ph, 1, 4, false, 1);
        assert.equal(ph.cu, first);
        buildCubanPlan(env, 2, true, Dm7, G7, false, null, ph, 2, 4, false, 0);
        assert.notEqual(ph.cu, first);
        assert.equal(ph.cu.t, true);
    });
});

describe('percussions', () => {
    const drumsAt = (p, name) => p.drums.filter(d => d.drum === name).map(d => d.pos).sort((a, b) => a - b);
    test('4/4 : clave de son 3-2 (3 coups la 1re mesure, 2 la seconde)', () => {
        assert.deepEqual(drumsAt(plan({ m: 0 }), 'clave'), [0, 1.5, 3]);
        assert.deepEqual(drumsAt(plan({ m: 1 }), 'clave'), [1, 2]);
    });
    test('pas de clave en 3/4, 2/4 ni en ternaire', () => {
        for (const [bpb, ternary] of [[3, false], [2, false], [2, true], [4, true]]) {
            assert.equal(drumsAt(plan({ bpb, ternary }), 'clave').length, 0);
        }
    });
    test('6/8 : la cloche de bembé joue', () => {
        assert.ok(drumsAt(plan({ bpb: 2, ternary: true }), 'bell').length > 0);
    });
    test('9/8 : cloche sur les trois pulsations (2 coups par pulsation, sauf le dernier ajusté)', () => {
        const bells = drumsAt(plan({ bpb: 3, ternary: true }), 'bell');
        assert.equal(bells.length, 6);
        for (const p of [0, 1, 2]) assert.ok(bells.includes(p), `pulsation ${p}`);
    });
    test('un remplissage de congas occupe le dernier temps de la mesure de retournement', () => {
        const withFill = plan({ isTurn: true, ph: { fill: true }, seed: 11 });
        const last = withFill.drums.filter(d => d.pos >= 3 && ['conga1', 'conga2', 'slap'].includes(d.drum));
        assert.ok(last.length >= 2, 'remplissage attendu au dernier temps');
        assert.equal(withFill.drums.filter(d => d.pos >= 3 && d.drum === 'shaker').length, 0);
    });
});

describe('accords, anticipation et liaison de basse', () => {
    test('mesure coupée en deux accords : piano et basse jouent dans chaque moitié', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const p = plan({ halves: [Dm7, G7], nextStep: Cmaj7, seed });
            for (const kind of ['piano', 'bass']) {
                assert.ok(p[kind].some(e => e.pos < 2), `${kind} : 1re moitié (graine ${seed})`);
                assert.ok(p[kind].some(e => e.pos >= 2 - 1e-6), `${kind} : 2de moitié (graine ${seed})`);
            }
        }
    });
    test('latTie=true : la 1re note de basse (tenue de la mesure précédente) n’est pas rejouée sur le 1', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const p = plan({ env: { state: { latTie: true } }, seed });
            assert.ok(!p.bass.some(b => b.pos < 0.2), `graine ${seed}`);
        }
    });
    test('latTie=false : la basse joue au moins une note avant l’anticipation finale', () => {
        for (let seed = 1; seed <= 40; seed++) assert.ok(plan({ seed }).bass.some(b => b.pos < 3.5 - 1e-6), `graine ${seed}`);
    });
    test('changement d’accord en fin de pas : la basse peut anticiper (tie), jamais sans note finale', () => {
        let anticipated = 0;
        for (let seed = 1; seed <= 200; seed++) {
            const p = plan({ last: true, nextStep: Cmaj7, seed });
            if (p.tie) {
                anticipated++;
                assert.ok(p.bass.some(b => b.tok === 'N' && b.pos >= 3.5 - 1e-6), `graine ${seed}`);
            }
        }
        assert.ok(anticipated > 0, 'au moins une anticipation sur 200 tirages');
    });
    test('transposition (transOffset) : les notes de piano restent dans le registre', () => {
        for (const off of [0, -2, -9]) {
            const p = plan({ env: { transOffset: off }, seed: 3 });
            for (const e of p.piano) for (const n of e.intervals) assert.ok(n + off <= 40, `note ${n} (offset ${off})`);
        }
    });
    test('le calcul ne modifie de l’environnement que sa mémoire (env.state)', () => {
        const env = baseEnv();
        const copy = JSON.stringify({ ...env, findChordObj: 0, state: 0 });
        buildCubanPlan(env, 4, false, Dm7, G7, true, null, phrase(1), 0, 4, true, 0);
        assert.equal(JSON.stringify({ ...env, findChordObj: 0, state: 0 }), copy);
        assert.deepEqual(Object.keys(env.state), ['latTie']);
        assert.equal(typeof env.state.latTie, 'boolean');
    });
});
