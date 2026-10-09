// Tests de l'orchestre Piazzolla (band/piazzolla-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { piazzollaPhraseExtras, lyricPhraseExtras, pzReg, buildPiazzollaPlan } = require('./piazzolla-plan.js');
const { PZ_SUBJECTS, PZ_LYR_ARP } = require('../band-patterns.js');
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
const VOICES = ['bandoneon', 'violin', 'guitar', 'piano', 'bass'];
const TEXTURES = ['cantilena', 'marcato', 'canon', 'chromatic', 'fugue', 'cantabile', 'dialogue'];

const mkEnv = (over = {}) => ({
    transOffset: 0, splitBeat: 2, state: { pzState: null },
    findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0],
    ...over
});
const mkPhrase = (seed, groove, extra = {}) => ({ rng: seeded(seed), style: 'piazzolla', ...piazzollaPhraseExtras({ groove }, seeded(seed * 31), null, seed % 3), ...extra });
function plan({ bpb = 4, ternary = false, step = Dm7, nextStep = G7, last = false, halves = null, seed = 1, i = 0, L = 4, isTurn = false, m = 0, env = mkEnv(), groove, ph = mkPhrase(seed, groove) } = {}) {
    return buildPiazzollaPlan(env, bpb, ternary, step, nextStep, last, halves, ph, i, L, isTurn, m);
}

describe('pzReg (registre de chaque instrument)', () => {
    test('chaque instrument connu a un registre croissant pour tous ses rôles', () => {
        for (const who of ['violin', 'bandoneon', 'guitar']) for (const role of ['lead', 'counter', 'inner', 'fugue']) {
            const [lo, hi] = pzReg(who, role);
            assert.ok(lo < hi, `${who} ${role}`);
        }
    });
    test('le violon joue plus haut que le bandonéon', () => {
        assert.ok(pzReg('violin', 'lead')[0] > pzReg('bandoneon', 'lead')[0]);
    });
    test('instrument ou rôle inconnus : registre par défaut', () => {
        assert.deepEqual(pzReg('kazoo', 'lead'), [5, 20]);
        assert.deepEqual(pzReg('violin', 'inconnu'), pzReg('violin', 'lead'));
    });
});

describe('piazzollaPhraseExtras (Tango nuevo)', () => {
    test('valeurs valides sur beaucoup de graines', () => {
        for (let s = 1; s <= 200; s++) {
            const e = piazzollaPhraseExtras({ groove: undefined }, seeded(s), s % 2 ? null : { style: 'piazzolla', intensity: (s % 10) / 10 }, s % 4);
            assert.ok(e.intensity >= 0.25 && e.intensity <= 0.98, `${e.intensity}`);
            assert.ok(['violin', 'bandoneon'].includes(e.lead));
            assert.equal(typeof e.counterGuitar, 'boolean');
            assert.equal(e.order.length, 3);
            assert.deepEqual([...e.order].sort(), ['bandoneon', 'guitar', 'violin']);
            assert.ok(Number.isInteger(e.subjIdx) && e.subjIdx >= 0 && e.subjIdx < PZ_SUBJECTS.length);
            assert.equal(e.contour.length, 12);
        }
    });
    test('déterministe', () => {
        assert.deepEqual(piazzollaPhraseExtras({ groove: undefined }, seeded(5), null, 1), piazzollaPhraseExtras({ groove: undefined }, seeded(5), null, 1));
    });
});

describe('Milonga lyrique', () => {
    test('le style de grille « lyrique » ajoute les caractéristiques lyriques', () => {
        const e = piazzollaPhraseExtras({ groove: 'lyrique' }, seeded(3), null, 0);
        assert.equal(e.lyr !== undefined, true);
        assert.ok(Number.isInteger(e.arpIdx) && e.arpIdx >= 0 && e.arpIdx < PZ_LYR_ARP.length);
    });
    test('sans ce style, aucune caractéristique lyrique', () => {
        const e = piazzollaPhraseExtras({ groove: undefined }, seeded(3), null, 0);
        assert.equal(e.lyr, undefined);
        assert.equal(e.arpIdx, undefined);
    });
    test('lyricPhraseExtras garde les valeurs de base et reste dans des bornes lentes', () => {
        for (let s = 1; s <= 100; s++) {
            const base = piazzollaPhraseExtras({ groove: undefined }, seeded(s), null, 0);
            const e = lyricPhraseExtras(seeded(s + 1000), null, s % 3, base);
            assert.ok(e.intensity > 0 && e.intensity < 0.7, `phrase lyrique trop intense : ${e.intensity}`);
        }
    });
});

describe('buildPiazzollaPlan : forme générale', () => {
    for (const groove of [undefined, 'lyrique']) {
        test(`${groove || 'tango nuevo'} : événements dans la mesure, vélocités valides`, () => {
            for (let seed = 1; seed <= 60; seed++) {
                const p = plan({ seed, groove, i: seed % 4, m: seed % 6, isTurn: seed % 5 === 0, last: seed % 2 === 0 });
                assert.equal(p.piazzolla, true);
                for (const kind of ['piano', 'bass', 'drums']) {
                    for (const e of p[kind]) {
                        assert.ok(e.pos >= 0 && e.pos < 4 + 1e-6, `${kind} pos ${e.pos} (graine ${seed})`);
                        assert.ok(e.vel > 0 && e.vel <= 1.3, `${kind} vel ${e.vel}`);
                    }
                }
                for (const e of p.piano) assert.ok(VOICES.includes(e.inst), `voix ${e.inst}`);
                assert.ok(p.piano.length > 0 && p.bass.length > 0, `vide (graine ${seed})`);
            }
        });
    }
    test('autres métriques (2/4, 3/4, 6/8, 9/8)', () => {
        for (const [bpb, ternary] of [[2, false], [3, false], [2, true], [3, true]]) {
            for (let seed = 1; seed <= 30; seed++) {
                const p = plan({ bpb, ternary, seed, env: mkEnv({ splitBeat: bpb === 2 ? 1 : 2 }) });
                for (const kind of ['piano', 'bass', 'drums']) for (const e of p[kind]) assert.ok(e.pos >= 0 && e.pos < bpb + 1e-6, `${bpb}/${ternary} ${kind} pos ${e.pos}`);
            }
        }
    });
    test('déterministe', () => {
        assert.deepEqual(plan({ seed: 14 }), plan({ seed: 14 }));
    });
    test('toutes les textures de phrase produisent un plan', () => {
        const seen = new Set();
        for (let seed = 1; seed <= 200 && seen.size < TEXTURES.length; seed++) {
            const ph = mkPhrase(seed, seed % 2 ? 'lyrique' : undefined);
            seen.add(ph.tex);
            assert.ok(plan({ seed, ph }).piano.length > 0, ph.tex);
        }
        assert.ok(seen.size >= 5, `textures vues : ${[...seen]}`);
    });
    test('mesure coupée en deux accords : la basse joue dans chaque moitié', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const p = plan({ halves: [Dm7, G7], nextStep: Cmaj7, seed });
            assert.ok(p.bass.some(b => b.pos < 2), `1re moitié (graine ${seed})`);
            assert.ok(p.bass.some(b => b.pos >= 2 - 1e-6), `2de moitié (graine ${seed})`);
        }
    });
});

describe('mémoire entre les mesures (env.state.pzState)', () => {
    test('créée au premier appel, avec ses quatre registres', () => {
        const env = mkEnv();
        plan({ env });
        const st = env.state.pzState;
        for (const k of ['v', 'mel', 'chrom', 'fugueStart']) assert.ok(k in st, k);
    });
    test('l’objet de mémoire est conservé (mutation en place) d’une mesure à l’autre', () => {
        const env = mkEnv();
        plan({ env, seed: 2 });
        const st = env.state.pzState;
        plan({ env, seed: 3, m: 1 });
        assert.equal(env.state.pzState, st);
    });
    test('les voix mémorisées sont des voicings croissants', () => {
        const env = mkEnv();
        for (let m = 0; m < 4; m++) plan({ env, seed: 6, m, i: m });
        for (const [who, entry] of Object.entries(env.state.pzState.v)) {
            const notes = Array.isArray(entry) ? entry : entry && entry.v;
            if (Array.isArray(notes)) for (let k = 1; k < notes.length; k++) assert.ok(notes[k] >= notes[k - 1], `${who} : ${notes}`);
        }
    });
});

describe('transposition', () => {
    test('Do, Si♭ et Mi♭ : le plan se calcule', () => {
        for (const transOffset of [0, -2, -9]) for (let seed = 1; seed <= 15; seed++) {
            const p = plan({ seed, env: mkEnv({ transOffset }) });
            assert.ok(p.piano.length > 0 && p.bass.length > 0);
        }
    });
});
