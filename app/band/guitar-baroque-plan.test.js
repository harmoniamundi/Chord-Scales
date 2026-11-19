// Tests du jeu baroque de l'orchestre Guitare (band/guitar-baroque-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const G = require('./guitar-plan.js');
const GB = require('./guitar-baroque-plan.js');
const { buildBandPhrase } = require('./phrase-plan.js');
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
const findChordObj = (id) => T.lookupChord(id) || T.chordTypes.maj[0];
const realNotes = (e, off) => e.intervals.map(v => G.GTR_BASE + v + off);

// Grille baroque (do majeur) : I, IV, ii, V7, I/5 et une mesure à deux accords
const GRID = [
    { rootIndex: 0, chordId: 'majTriad', scaleId: 'ionian', measures: 2 },
    { rootIndex: 5, chordId: 'majTriad', scaleId: 'lydian', measures: 1 },
    { rootIndex: 2, chordId: 'minTriad', scaleId: 'dorian', measures: 1, split: { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' } },
    { rootIndex: 0, chordId: 'majTriad', scaleId: 'ionian', measures: 1, bassRootIndex: 7 },
    { rootIndex: 7, chordId: '7', scaleId: 'mixolydian', measures: 1 },
    { rootIndex: 9, chordId: 'minTriad', scaleId: 'aeolian', measures: 1 },
    { rootIndex: 11, chordId: 'dimTriad', scaleId: 'locrian', measures: 1 }
];

function play({ bpb = 4, ternary = false, off = 0, seed = 1, bpm = 84, density, measures = 16, groove = 'c-baroque', loop = true }) {
    const env = { transOffset: off, bpm, splitBeat: bpb === 2 ? 1 : 2, findChordObj, state: { gtrVoice: null } };
    if (density !== undefined) env.density = density;
    const flat = [];
    GRID.forEach(g => { for (let k = 0; k < g.measures; k++) flat.push({ g, k }); });
    const L = 4;
    let phrase = null;
    const out = [];
    for (let mi = 0; mi < measures; mi++) {
        const { g, k } = flat[mi % flat.length];
        const isLast = k === g.measures - 1;
        const hasNext = loop || mi + 1 < measures;
        const nx = flat[(mi + 1) % flat.length];
        const nextStep = hasNext ? (isLast ? nx.g : g) : null;
        const pi = Math.floor(mi / L), i = mi % L;
        if (!phrase || phrase.index !== pi) {
            phrase = buildBandPhrase({ lib: H.patternLib(H.meterKey(bpb, ternary), 'guitar'), bpb, ternary, bpm, isCuba: false, groove, rng: seeded(seed + pi * 7919 + 1) }, pi, 'guitar', phrase);
        }
        const halves = g.split ? [g, g.split] : null;
        const plan = G.buildGuitarPlan(env, bpb, ternary, g, nextStep, isLast, halves, phrase, i, L, i === L - 1, mi);
        out.push({ mi, g, halves, plan, phrase, env });
    }
    return out;
}

describe('phrase', () => {
    test('rythme « c-baroque » : la phrase de guitare porte le jeu baroque ; sans rythme ou en flamenco, non', () => {
        const ctx = (groove) => ({ lib: H.patternLib('4/4', 'guitar'), bpb: 4, ternary: false, bpm: 84, isCuba: false, groove, rng: seeded(3) });
        assert.equal(buildBandPhrase(ctx('c-baroque'), 0, 'guitar', null).gtrBaroque, true);
        assert.ok(!buildBandPhrase(ctx(null), 0, 'guitar', null).gtrBaroque);
        const fl = buildBandPhrase(ctx('f-solea'), 0, 'guitar', null);
        assert.ok(!fl.gtrBaroque);
        assert.ok(fl.flamenco);
    });
    test('tempo vif : pas de motif de prélude (doubles-croches impossibles)', () => {
        for (let s = 1; s < 60; s++) {
            const ph = buildBandPhrase({ lib: H.patternLib('4/4', 'guitar'), bpb: 4, ternary: false, bpm: 140, isCuba: false, groove: 'c-baroque', rng: seeded(s) }, 0, 'guitar', null);
            assert.notEqual(ph.gbFam, 'prelude');
        }
    });
});

describe('plan', () => {
    test('toutes les notes dans le registre réel de la guitare (mi2 à sol5), à toutes les transpositions', () => {
        for (const off of [-5, 0, 3, 7]) for (let seed = 1; seed <= 6; seed++) {
            play({ off, seed }).forEach(({ plan }) => {
                assert.equal(plan.classicalGuitar, true);
                assert.deepEqual(plan.bass, []); assert.deepEqual(plan.drums, []);
                plan.piano.forEach(e => realNotes(e, off).forEach(n => assert.ok(n >= 40 && n <= 79, `hors registre : ${n}`)));
            });
        }
    });
    test('à 84 BPM : flot de doubles-croches (au moins 10 notes aiguës par mesure de 4/4 hors fin de phrase), basse sur le premier temps', () => {
        for (let seed = 1; seed <= 8; seed++) {
            play({ seed }).forEach(({ plan, mi }) => {
                const single = plan.piano.filter(e => e.intervals.length === 1);
                assert.ok(single.some(e => e.pos === 0), `mesure ${mi} : rien sur le premier temps`);
                if (mi % 4 !== 3) {
                    const sixteenths = single.filter(e => Math.abs(e.pos * 4 - Math.round(e.pos * 4)) < 1e-9 && Math.round(e.pos * 4) % 2 === 1);
                    assert.ok(sixteenths.length >= 4, `mesure ${mi} : pas de doubles-croches (${sixteenths.length})`);
                    assert.ok(single.length >= 12, `mesure ${mi} : ${single.length} notes`);
                }
            });
        }
    });
    test('tempo vif : croches seulement', () => {
        play({ bpm: 140, seed: 2 }).forEach(({ plan }) => plan.piano.forEach(e => assert.ok(Math.abs(e.pos * 2 - Math.round(e.pos * 2)) < 1e-9, `position ${e.pos}`)));
    });
    test('mesures composées (6/8, 12/8) et 3/4 : positions dans la mesure, pas d\'erreur', () => {
        for (const [bpb, ternary] of [[2, true], [4, true], [3, false], [2, false]]) {
            play({ bpb, ternary, seed: 4 }).forEach(({ plan }) => {
                assert.ok(plan.piano.length > 0);
                plan.piano.forEach(e => { assert.ok(e.pos >= 0 && e.pos < bpb, `${bpb} ${ternary} : ${e.pos}`); assert.ok(e.dur > 0); });
                if (ternary) plan.piano.forEach(e => assert.ok(Math.abs(e.pos * 3 - Math.round(e.pos * 3)) < 1e-9));
            });
        }
    });
    test('les notes des doigts appartiennent à l\'accord ou à sa gamme', () => {
        for (let seed = 1; seed <= 10; seed++) {
            play({ seed }).forEach(({ plan, g, halves }) => {
                const pcsOf = (cs) => new Set(T.scalesDb[cs.scaleId].intervals.map(x => (x + cs.rootIndex) % 12));
                const ok = new Set([...pcsOf(g), ...(halves ? pcsOf(halves[1]) : [])]);
                // la petite gamme d'approche peut employer la gamme de l'accord suivant : on accepte toute la grille diatonique de do
                [0, 2, 4, 5, 7, 9, 11].forEach(x => ok.add(x));
                plan.piano.forEach(e => realNotes(e, 0).forEach(n => assert.ok(ok.has(((n % 12) + 12) % 12), `note étrangère ${n}`)));
            });
        }
    });
    test('curseur « Densité » : moins de notes à 0, au moins autant à 1 qu\'à l\'écriture d\'origine', () => {
        const count = (d) => play({ seed: 5, density: d }).reduce((a, x) => a + x.plan.piano.length, 0);
        const lo = count(0), mid = count(undefined), hi = count(1);
        assert.ok(lo < mid * 0.75, `${lo} / ${mid}`);
        assert.ok(hi >= mid * 0.95, `${hi} / ${mid}`);
    });
    test('dernière mesure de la grille sans boucle : un accord arpégé lent', () => {
        const r = play({ seed: 1, measures: 8, loop: false });
        const last = r[r.length - 1].plan.piano;
        assert.equal(last.length, 1);
        assert.ok(last[0].intervals.length >= 3);
    });
    test('la voix de la guitare est gardée d\'une mesure à l\'autre (conduite des voix partagée avec le jeu normal)', () => {
        const r = play({ seed: 1, measures: 2 });
        assert.ok(r[1].env.state.gtrVoice && Array.isArray(r[1].env.state.gtrVoice.up));
    });
});
