// Tests de l'orchestre Latin (band/latin-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { latinPhraseExtras, buildLatinPlan } = require('./latin-plan.js');
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
const freshState = () => ({ latVoice: null, latTie: false, latRunAt: -9, bandLastFill: false });
const mkEnv = (state = freshState(), transOffset = 0) => ({
    transOffset, state, findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0]
});
const ctx = (over = {}) => ({ isCuba: false, bpm: 100, groove: undefined, ...over });
const mkPhrase = (seed, c = ctx(), extra = {}) => ({ rng: seeded(seed), style: 'latin', fill: false, lift: false, ...latinPhraseExtras(c, seeded(seed * 31), null, seed % 3), ...extra });
function plan({ step = Dm7, nextStep = G7, last = false, halves = null, seed = 1, i = 0, L = 4, isTurn = false, m = 0, env = mkEnv(), ph = mkPhrase(seed) } = {}) {
    return buildLatinPlan(env, step, nextStep, last, halves, ph, i, L, isTurn, m);
}

describe('latinPhraseExtras (choix du rythme)', () => {
    test('orchestre Cuba : toujours le rythme afro', () => {
        for (let s = 1; s <= 60; s++) assert.equal(latinPhraseExtras(ctx({ isCuba: true }), seeded(s), null, s % 3).groove, 'afro');
    });
    test('orchestre Brasil : jamais afro quand rien n’est imposé ; bossa ou samba', () => {
        for (let s = 1; s <= 100; s++) {
            const g = latinPhraseExtras(ctx(), seeded(s), null, s % 3).groove;
            assert.ok(['bossa', 'samba'].includes(g), g);
        }
    });
    test('un rythme imposé (tango, samba, piazzolla) est respecté', () => {
        for (const groove of ['tango', 'samba', 'piazzolla']) {
            for (let s = 1; s <= 20; s++) assert.equal(latinPhraseExtras(ctx({ groove }), seeded(s), null, 0).groove, groove);
        }
    });
    test('tempo lent → plutôt bossa, tempo rapide → plutôt samba', () => {
        const count = (bpm, g) => Array.from({ length: 300 }, (_, s) => latinPhraseExtras(ctx({ bpm }), seeded(s + 1), null, 0).groove).filter(x => x === g).length;
        assert.ok(count(90, 'bossa') > count(90, 'samba'));
        assert.ok(count(200, 'samba') > count(200, 'bossa'));
    });
    test('intensité entre 0,25 et 1', () => {
        for (let s = 1; s <= 100; s++) {
            const I = latinPhraseExtras(ctx(), seeded(s), s % 2 ? null : { style: 'latin', intensity: 0.9, groove: 'bossa' }, s % 3).intensity;
            assert.ok(I >= 0.25 && I <= 1, `${I}`);
        }
    });
});

describe('buildLatinPlan', () => {
    for (const groove of ['bossa', 'samba', 'afro', 'tango']) {
        test(`${groove} : guitare, basse et batterie dans la mesure, vélocités valides`, () => {
            for (let seed = 1; seed <= 50; seed++) {
                const c = ctx({ groove: groove === 'afro' ? undefined : groove, isCuba: groove === 'afro' });
                const p = plan({ seed, i: seed % 4, m: seed % 4, isTurn: seed % 5 === 0, last: seed % 2 === 0, ph: mkPhrase(seed, c, { fill: seed % 3 === 0 }) });
                for (const kind of ['piano', 'bass', 'drums']) {
                    assert.ok(Array.isArray(p[kind]), kind);
                    for (const e of p[kind]) {
                        assert.ok(e.pos >= 0 && e.pos < 4 + 1e-6, `${groove} ${kind} pos ${e.pos}`);
                        assert.ok(e.vel > 0 && e.vel <= 1.2, `${groove} ${kind} vel ${e.vel}`);
                    }
                }
                assert.ok(p.bass.length > 0 && p.drums.length > 0, `${groove} vide (graine ${seed})`);
            }
        });
    }
    test('déterministe', () => {
        assert.deepEqual(plan({ seed: 12 }), plan({ seed: 12 }));
    });
    test('mesure coupée en deux accords : basse dans chaque moitié', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const p = plan({ halves: [Dm7, G7], nextStep: Cmaj7, seed });
            assert.ok(p.bass.some(b => b.pos < 2), `1re moitié (graine ${seed})`);
            assert.ok(p.bass.some(b => b.pos >= 2 - 1e-6), `2de moitié (graine ${seed})`);
        }
    });
});

describe('mémoire entre les mesures (env.state)', () => {
    test('le voicing de la guitare est mémorisé', () => {
        const state = freshState();
        plan({ env: mkEnv(state) });
        assert.ok(state.latVoice && state.latVoice.v.length >= 3);
        assert.equal(state.latVoice.key, '2:m7');
    });
    test('latTie reste un booléen après chaque mesure', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const state = freshState();
            plan({ env: mkEnv(state), seed, last: true, nextStep: Cmaj7 });
            assert.equal(typeof state.latTie, 'boolean');
        }
    });
    test('latRunAt ne vaut que -9 (aucune phrase) ou le numéro de la mesure qui vient d’être jouée', () => {
        for (let seed = 1; seed <= 60; seed++) {
            const state = freshState();
            plan({ env: mkEnv(state), seed, m: 3, isTurn: true });
            assert.ok(state.latRunAt === -9 || state.latRunAt === 3, `${state.latRunAt}`);
        }
    });
});
