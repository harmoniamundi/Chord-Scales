// Tests du violão brésilien à la Baden Powell (band/baden-plan.js) : phrase, pouce en surdo, pincés et abafados, ligne
// chromatique, riffs, virada, percussions discrètes, et style de grille « Afro-samba ».
// Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const B = require('./baden-plan.js');
const G = require('./guitar-plan.js');
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
const mod12 = (n) => ((n % 12) + 12) % 12;
const METERS = { '2/4': [2, false], '3/4': [3, false], '4/4': [4, false], '6/8': [2, true], '12/8': [4, true] };

function playGrid({ meter = '2/4', groove = 'g-baden', off = 0, seed = 1, bpm = 100, grid, measures = 16, loop = true, L = 4, density }) {
    const [bpb, ternary] = METERS[meter];
    const env = { transOffset: off, bpm, splitBeat: bpb === 2 ? 1 : 2, findChordObj, density, state: { gtrVoice: null, badenHold: null } };
    const flat = [];
    grid.forEach(g => { for (let k = 0; k < (g.measures || 1); k++) flat.push({ g, k }); });
    let phrase = null;
    const out = [];
    for (let mi = 0; mi < measures; mi++) {
        const { g, k } = flat[mi % flat.length];
        const isLast = k === (g.measures || 1) - 1;
        const nx = flat[(mi + 1) % flat.length];
        const hasNext = loop || mi + 1 < measures;
        const nextStep = hasNext ? (isLast ? nx.g : g) : null;
        const pi = Math.floor(mi / L), i = mi % L;
        if (!phrase || phrase.index !== pi) {
            phrase = buildBandPhrase({ lib: H.patternLib(H.meterKey(bpb, ternary), 'guitar'), bpb, ternary, bpm, isCuba: false, groove, rng: seeded(seed + pi * 7919 + 1) }, pi, 'guitar', phrase);
        }
        const halves = g.split ? [{ rootIndex: g.rootIndex, chordId: g.chordId, scaleId: g.scaleId }, { rootIndex: g.split.rootIndex, chordId: g.split.chordId, scaleId: g.split.scaleId }] : null;
        const plan = G.buildGuitarPlan(env, bpb, ternary, g, nextStep, isLast, halves, phrase, i, L, i === L - 1, mi);
        out.push({ mi, g, nextStep, halves, bpb, ternary, plan, phrase, isLast });
    }
    return out;
}
const st = (rootIndex, chordId, scaleId, measures = 1, split) => ({ rootIndex, chordId, scaleId, measures, split });
// Ré mineur dorien : vamp Rém7 - Sol7 (Canto de Ossanha), puis Mi ø - La7(b9)
const OSSANHA = [st(2, 'm7', 'dorian', 2), st(7, '7', 'mixolydian', 2), st(4, 'm7b5', 'locrianSharp2'), st(9, '7b9', 'phrygianDominant'), st(2, 'minTriad', 'dorian', 4)];

describe('violão de Baden Powell : phrase', () => {
    test('le rythme g-baden marque la phrase (sauf en mesure composée, où la guitare garde son jeu classique)', () => {
        const ph = G.guitarPhraseExtras({ groove: 'g-baden', ternary: false, bpm: 100 }, seeded(3), null, 0);
        assert.equal(ph.baden, true);
        assert.ok(ph.intensity >= 0.28 && ph.intensity <= 0.92);
        const t = G.guitarPhraseExtras({ groove: 'g-baden', ternary: true, bpm: 100 }, seeded(3), null, 0);
        assert.equal(t.baden, undefined);
        assert.equal(G.guitarPhraseExtras({ groove: '', ternary: false }, seeded(3), null, 0).baden, undefined);
    });
    test('les motifs de doigts existent', () => {
        for (let s = 1; s < 40; s++) {
            const ph = B.badenPhraseExtras({ groove: 'g-baden' }, seeded(s), null, 0);
            assert.ok(B.BDN_FINGERS[ph.fingers] && B.BDN_FINGERS[ph.fingersAlt]);
        }
        B.BDN_FINGERS.forEach(p => assert.equal(p.length, 16));
    });
});

describe('violão de Baden Powell : plan d\'une mesure', () => {
    test('2/4 : guitare classique seule (plus percussions discrètes), notes dans la mesure, registre de guitare', () => {
        for (let seed = 1; seed <= 25; seed++) {
            playGrid({ grid: OSSANHA, seed, measures: 24 }).forEach(({ plan, bpb }) => {
                assert.equal(plan.classicalGuitar, true);
                assert.deepEqual(plan.bass, []);
                plan.piano.forEach(e => {
                    assert.ok(e.pos >= 0 && e.pos < bpb, 'position ' + e.pos);
                    assert.ok(e.dur > 0 && Number.isFinite(e.vel) && e.vel > 0 && e.vel <= 1);
                    e.intervals.forEach(x => { const midi = 48 + x; assert.ok(midi >= 38 && midi <= 81, 'hauteur ' + midi); });
                });
                plan.drums.forEach(d => {
                    assert.ok(['agogoh', 'agogol', 'ganza', 'golpe'].includes(d.drum), d.drum);
                    assert.ok(d.pos >= 0 && d.pos < bpb);
                });
            });
        }
    });
    test('le pouce joue sur chaque temps : basse légère sur le 1, appuyée sur le 2 (surdo)', () => {
        const run = playGrid({ grid: [st(2, 'm7', 'dorian', 8)], seed: 5, measures: 4, loop: true });
        run.forEach(({ plan, phrase }) => {
            if (phrase.riff === 'baixo') return;
            const at = (p) => plan.piano.filter(e => Math.abs(e.pos - p) < 1e-6 && e.intervals.length === 1 && 48 + e.intervals[0] <= 55);
            assert.ok(at(0).length >= 1, 'basse sur le 1');
            assert.ok(at(1).length >= 1, 'basse sur le 2');
            assert.ok(at(1)[0].vel > at(0)[0].vel * 0.9, 'temps 2 au moins aussi appuyé');
        });
    });
    test('les basses du pouce sont des notes de l\'accord (fondamentale et quinte) hors notes de passage', () => {
        playGrid({ grid: OSSANHA, seed: 9, measures: 16 }).forEach(({ plan, g, halves }) => {
            if (halves) return;
            const notes = findChordObj(g.chordId).notes.map(x => mod12(g.rootIndex + x));
            plan.piano.filter(e => e.tok === 'B' || e.tok === 'b').forEach(e => assert.ok(notes.includes(mod12(48 + e.intervals[0])), 'basse ' + e.intervals[0]));
        });
    });
    test('jeu en notes détachées : surtout des notes seules, très peu d\'accords pincés', () => {
        let single = 0, chords = 0;
        for (let seed = 1; seed <= 20; seed++) playGrid({ grid: OSSANHA, seed, measures: 16 }).forEach(({ plan }) => {
            plan.piano.filter(e => !['B', 'b', 'p', 'A', 'v', 'x', 'R'].includes(e.tok)).forEach(e => {
                if (e.intervals.length >= 3) chords++; else single++;
            });
        });
        assert.ok(chords * 8 < single, single + ' notes seules / ' + chords + ' accords');
    });
    test('notes étouffées très courtes, et les doubles-croches sont utilisées', () => {
        let mutes = 0, sixteenths = 0;
        for (let seed = 1; seed <= 10; seed++) playGrid({ grid: OSSANHA, seed, measures: 16 }).forEach(({ plan }) => {
            plan.piano.forEach(e => {
                if (e.mute) { mutes++; assert.ok(e.dur <= 0.1); }
                const f = (e.pos * 4) % 2;
                if (f > 0.5 && f < 1.5) sixteenths++;
            });
        });
        assert.ok(mutes > 5, 'abafados : ' + mutes);
        assert.ok(sixteenths > 50, 'doubles-croches : ' + sixteenths);
    });
    test('ligne chromatique sur un mineur tenu : fondamentale, 7M, 7, 6', () => {
        // on cherche une phrase avec cliché et sans riff
        let found = false;
        for (let seed = 1; seed <= 40 && !found; seed++) {
            const run = playGrid({ grid: [st(2, 'minTriad', 'dorian', 4)], seed, measures: 4, loop: true, L: 4 });
            if (!run[0].phrase.cliche || run.some(r => r.phrase.riff)) continue;
            const pcsOf = (r) => new Set(r.plan.piano.filter(e => ['c', 'd', 'n'].includes(e.tok)).flatMap(e => e.intervals.map(x => mod12(48 + x))));
            const want = [2, 1, 0, 11];       // ré, do#, do, si
            const ok = run.every((r, k) => pcsOf(r).size === 0 || pcsOf(r).has(want[k]));
            assert.ok(ok, 'ligne attendue ré - do# - do - si');
            found = true;
        }
        assert.ok(found);
    });
    test('virada : en fin de phrase, quatre doubles-croches du pouce mènent un demi-ton à côté de la basse suivante', () => {
        let seen = 0;
        for (let seed = 1; seed <= 30; seed++) playGrid({ grid: OSSANHA, seed, measures: 16 }).forEach(({ plan, nextStep, g }) => {
            const v = plan.piano.filter(e => e.tok === 'v');
            if (!v.length) return;
            seen++;
            assert.equal(v.length, 4);
            const last = 48 + v[3].intervals[0];
            const target = mod12(H.bassPc({ transOffset: 0, findChordObj }, nextStep));
            assert.ok([1, 11].includes(mod12(last - target)), 'approche chromatique');
        });
        assert.ok(seen > 3, 'viradas : ' + seen);
    });
    test('4/4, 3/4, deux accords par mesure, transposition : aucune erreur, positions valides', () => {
        const mixed = [st(2, 'm7', 'dorian', 1, { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' }), st(4, 'm7b5', 'locrianSharp2'), st(9, '7b9', 'phrygianDominant')];
        for (const meter of ['4/4', '3/4', '2/4']) for (const off of [0, 3, -2]) {
            playGrid({ meter, grid: mixed, off, seed: 4, measures: 12 }).forEach(({ plan, bpb }) => {
                plan.piano.forEach(e => assert.ok(e.pos >= 0 && e.pos < bpb));
                assert.ok(plan.piano.length > 0);
            });
        }
    });
    test('mesure composée : le jeu classique (arpèges) reprend la main', () => {
        playGrid({ meter: '6/8', grid: OSSANHA, seed: 2, measures: 4 }).forEach(({ plan }) => {
            assert.ok(plan.piano.every(e => !e.mute && e.tok !== 'v'));
        });
    });
    test('dernier accord de la grille : coup étouffé puis accord roulé qui résonne', () => {
        const run = playGrid({ grid: OSSANHA, seed: 3, measures: 10, loop: false });
        const last = run[run.length - 1].plan;
        assert.ok(last.piano.some(e => e.tok === 'R' && e.dur > 2));
        assert.ok(last.drums.some(d => d.drum === 'golpe'));
    });
    test('la densité change le nombre de notes', () => {
        const count = (d) => playGrid({ grid: OSSANHA, seed: 7, measures: 16, density: d }).reduce((a, r) => a + r.plan.piano.length, 0);
        assert.ok(count(1) > count(0), count(1) + ' > ' + count(0));
    });
});

describe('style de grille Afro-samba', () => {
    const SB = require('../styles/style-builders.js');
    const TK = require('../styles/toolkit.js');
    const R = require('../styles/style-registry.js');
    test('fiche : orchestre Guitare, rythme g-baden, 2/4, ré mineur', () => {
        const f = R.STYLE_REGISTRY.afrosamba;
        assert.equal(f.band, 'guitar'); assert.equal(f.groove, 'g-baden'); assert.equal(f.meter, '2/4'); assert.equal(f.key, 2);
    });
    test('32 mesures, en ré mineur, tous les accords connus', () => {
        for (let s = 0; s < 30; s++) {
            const t = TK.makeStyleToolkit({ keyRoot: 2, mainQuality: 'dorian', styleKey: 'afrosamba', R: s ? seeded(s) : null, findChordObj });
            const tpl = SB.STYLE_BUILDERS.afrosamba(t);
            assert.equal(tpl.reduce((a, x) => a + x.m, 0), 32);
            assert.equal(tpl[0].r, 2);
            tpl.forEach(x => assert.ok(T.lookupChord(x.c), x.c));
        }
    });
});
