// Tests de l'orchestre Brass band (band/brass-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { brassPhraseExtras, buildBrassPlan } = require('./brass-plan.js');
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
const Bb = { rootIndex: 10, chordId: 'majTriad', scaleId: 'ionian', measures: 1 };
const Eb = { rootIndex: 3, chordId: 'majTriad', scaleId: 'ionian', measures: 1 };
const F7 = { rootIndex: 5, chordId: '7', scaleId: 'mixolydian', measures: 1 };
const TEXTURES = ['chorale', 'march', 'fanfare'];
const SLOTS = ['t1', 't2', 'h1', 'h2', 'c1', 'c2'];

const freshState = () => ({ brassVoice: null, brassLines: null });
const mkEnv = (over = {}) => ({
    transOffset: 0, splitBeat: 2, bpm: 100, bandCtx: { measureInStep: 0 }, state: freshState(),
    findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0],
    ...over
});
const mkPhrase = (seed, extra = {}) => ({ rng: seeded(seed), style: 'brass', ...brassPhraseExtras({ groove: undefined }, seeded(seed * 31), null, seed % 3), ...extra });
function plan({ bpb = 4, ternary = false, step = Bb, nextStep = Eb, last = false, halves = null, seed = 1, i = 0, L = 4, isTurn = false, m = 0, env = mkEnv(), ph = mkPhrase(seed) } = {}) {
    return buildBrassPlan(env, bpb, ternary, step, nextStep, last, halves, ph, i, L, isTurn, m);
}

describe('brassPhraseExtras', () => {
    test('texture valide et intensité entre 0,25 et 0,95', () => {
        for (let s = 1; s <= 200; s++) {
            const e = brassPhraseExtras({ groove: undefined }, seeded(s), s % 2 ? null : { style: 'brass', intensity: (s % 10) / 10, texture: 'march' }, s % 4);
            assert.ok(TEXTURES.includes(e.texture), e.texture);
            assert.ok(e.intensity >= 0.25 && e.intensity <= 0.95, `${e.intensity}`);
            for (const k of ['cornetEcho', 'timpOn', 'fillOn']) assert.equal(typeof e[k], 'boolean');
        }
    });
    test('style de grille « b-chorale » : intensité plafonnée à 0,6 et texture surtout chorale', () => {
        let chorale = 0;
        for (let s = 1; s <= 200; s++) {
            const e = brassPhraseExtras({ groove: 'b-chorale' }, seeded(s), null, 2);
            assert.ok(e.intensity <= 0.6 + 1e-9, `${e.intensity}`);
            if (e.texture === 'chorale') chorale++;
        }
        assert.ok(chorale > 140, `chorale seulement ${chorale}/200`);
    });
    test('déterministe', () => {
        assert.deepEqual(brassPhraseExtras({ groove: undefined }, seeded(8), null, 1), brassPhraseExtras({ groove: undefined }, seeded(8), null, 1));
    });
});

describe('buildBrassPlan : forme générale', () => {
    for (const tex of TEXTURES) {
        test(`${tex} : événements dans la mesure, pupitres connus, vélocités valides`, () => {
            for (let seed = 1; seed <= 50; seed++) {
                const p = plan({ seed, i: seed % 4, m: seed % 4, isTurn: seed % 5 === 0, last: seed % 2 === 0, ph: mkPhrase(seed, { texture: tex }) });
                assert.equal(p.brass, true);
                for (const kind of ['piano', 'bass', 'drums']) {
                    for (const e of p[kind]) {
                        assert.ok(e.pos >= 0 && e.pos < 4 + 1e-6, `${tex} ${kind} pos ${e.pos}`);
                        assert.ok(e.vel > 0 && e.vel <= 1.2, `${tex} ${kind} vel ${e.vel}`);
                    }
                }
                for (const e of p.piano) for (const part of e.parts || []) assert.ok(SLOTS.includes(part.slot), part.slot);
                assert.ok(p.piano.length > 0 && p.bass.length > 0, `${tex} vide (graine ${seed})`);
            }
        });
    }
    test('3/4 et 6/8 : positions dans la mesure', () => {
        for (const [bpb, ternary] of [[3, false], [2, true], [3, true]]) {
            for (let seed = 1; seed <= 30; seed++) {
                const p = plan({ bpb, ternary, seed, env: mkEnv({ splitBeat: bpb === 2 ? 1 : 2 }) });
                for (const kind of ['piano', 'bass', 'drums']) for (const e of p[kind]) assert.ok(e.pos >= 0 && e.pos < bpb + 1e-6, `${bpb}/${ternary} ${kind} pos ${e.pos}`);
            }
        }
    });
    test('déterministe quand Math.random est figé (l’humanisation des entrées des pupitres l’utilise)', () => {
        const real = Math.random;
        try {
            Math.random = seeded(99);
            const a = plan({ seed: 21 });
            Math.random = seeded(99);
            const b = plan({ seed: 21 });
            assert.deepEqual(a, b);
        } finally { Math.random = real; }
    });
    test('mesure coupée en deux accords : la basse joue dans chaque moitié', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const p = plan({ halves: [Bb, F7], nextStep: Eb, seed });
            assert.ok(p.bass.some(b => b.pos < 2), `1re moitié (graine ${seed})`);
            assert.ok(p.bass.some(b => b.pos >= 2 - 1e-6), `2de moitié (graine ${seed})`);
        }
    });
    test('le tempo rapide ne casse rien (bpm 200)', () => {
        for (let seed = 1; seed <= 20; seed++) assert.ok(plan({ seed, env: mkEnv({ bpm: 200 }) }).piano.length > 0);
    });
});

describe('mémoire entre les mesures (env.state)', () => {
    test('le voicing et les lignes des pupitres sont mémorisés', () => {
        const env = mkEnv();
        plan({ env, ph: mkPhrase(3, { texture: 'chorale' }) });
        assert.ok(env.state.brassVoice && env.state.brassVoice.v.length >= 3);
        assert.ok(env.state.brassLines && typeof env.state.brassLines === 'object');
        assert.ok(Object.keys(env.state.brassLines).every(k => SLOTS.includes(k)), JSON.stringify(Object.keys(env.state.brassLines)));
    });
    test('l’objet des lignes est conservé d’une mesure à l’autre (mutation en place)', () => {
        const env = mkEnv();
        plan({ env, seed: 4 });
        const lines = env.state.brassLines;
        plan({ env, seed: 5, m: 1 });
        assert.equal(env.state.brassLines, lines);
    });
    test('un contexte de grille absent (bandCtx indéfini) est toléré', () => {
        assert.ok(plan({ env: mkEnv({ bandCtx: undefined }) }).piano.length > 0);
    });
});

describe('transposition', () => {
    test('Do, Si♭ et Mi♭ : le plan se calcule et la basse reste jouable', () => {
        for (const off of [0, -2, -9]) for (let seed = 1; seed <= 20; seed++) {
            const p = plan({ seed, env: mkEnv({ transOffset: off }) });
            for (const b of p.bass) if (b.abs !== undefined) assert.ok(b.abs + off >= -14 && b.abs + off <= 16, `abs ${b.abs} offset ${off}`);
        }
    });
});
