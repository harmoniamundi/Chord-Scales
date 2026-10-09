// Tests de l'orchestre standard à 4 temps (band/swing-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { bandPhraseLength, varyCell, buildBandDrums, buildStandardPlan } = require('./swing-plan.js');
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
const SW = 2 / 3;
const Dm7 = { rootIndex: 2, chordId: 'm7', scaleId: 'dorian' };
const G7 = { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' };
const Cmaj7 = { rootIndex: 0, chordId: 'maj7', scaleId: 'ionian' };
const mkEnv = (extra = {}) => ({
    transOffset: 0, swing: SW, state: { bandLastFill: false },
    findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0], ...extra
});
function mkPhrase(style, seed, extra = {}) {
    const lib = H.patternLib('4/4', style);
    const hits = lib.piano[0].hits;
    return {
        rng: seeded(seed), style, fill: false, fillKind: 0, density: 0.7, voicing: 'closed', feather: false,
        hat16: false, kickPattern: [0, 2.5], motif: hits, second: lib.piano[Math.min(1, lib.piano.length - 1)].hits,
        varied: lib.piano[Math.min(2, lib.piano.length - 1)].hits, turn: lib.turn[0].hits,
        bassMotif: lib.bass ? lib.bass[0].hits : null, bassAlt: lib.bass ? lib.bass[0].hits : null,
        bassTurn: lib.bassTurn ? lib.bassTurn[0].hits : null, ...extra
    };
}

describe('bandPhraseLength', () => {
    const g = (...ms) => ms.map(measures => ({ measures }));
    test('4 si la forme est un multiple de 4, sinon 3, sinon 2', () => {
        assert.equal(bandPhraseLength(g(4, 4)), 4);
        assert.equal(bandPhraseLength(g(3, 3, 3)), 3);
        assert.equal(bandPhraseLength(g(2, 2, 2)), 3); // 6 = 3 × 2 : 4 ne divise pas 6, 3 oui
        assert.equal(bandPhraseLength(g(2, 2, 1)), 4);  // 5 : aucun diviseur → 4 par défaut
        assert.equal(bandPhraseLength(g(2)), 2);
    });
    test('grille vide ou mesures manquantes : 4 par défaut', () => {
        assert.equal(bandPhraseLength([]), 4);
        assert.equal(bandPhraseLength([{}, {}, {}, {}]), 4);
    });
});

describe('varyCell', () => {
    const cell = [[0, 1, 'C', 0.9], [1.5, 0.6, 'S', 0.7], [3, 0.5, 'N', 0.6]];
    test('ne modifie pas le motif d\'origine et renvoie des frappes triées', () => {
        const copy = JSON.stringify(cell);
        for (let s = 1; s <= 200; s++) {
            const out = varyCell(cell, seeded(s));
            assert.equal(JSON.stringify(cell), copy);
            out.forEach((h, k) => { if (k) assert.ok(h[0] >= out[k - 1][0]); });
        }
    });
    test('trois variantes possibles : décalage, retrait, ajout (ou rien)', () => {
        const kinds = new Set();
        for (let s = 1; s <= 300; s++) {
            const out = varyCell(cell, seeded(s));
            if (out.length === cell.length - 1) kinds.add('retrait');
            else if (out.length === cell.length + 1) kinds.add('ajout');
            else if (JSON.stringify(out) !== JSON.stringify(cell)) kinds.add('décalage');
            else kinds.add('rien');
        }
        assert.ok(kinds.has('retrait') && kinds.has('ajout') && kinds.has('décalage') && kinds.has('rien'));
    });
    test('maxPos limite la position des frappes déplacées ou ajoutées', () => {
        for (let s = 1; s <= 300; s++) {
            const out = varyCell([[0, 1, 'C', 0.9], [1, 1, 'S', 0.7]], seeded(s), 1.5);
            out.forEach(h => assert.ok(h[0] <= 1.5));
        }
    });
    test('une frappe ajoutée est une note de couleur à la vélocité 0.6', () => {
        for (let s = 1; s <= 300; s++) {
            const out = varyCell(cell, seeded(s));
            if (out.length === cell.length + 1) {
                const added = out.find(h => !cell.some(c => c[0] === h[0]));
                assert.deepEqual(added.slice(1), [0.4, 'N', 0.6]);
                return;
            }
        }
        assert.fail('aucun ajout observé');
    });
});

describe('buildBandDrums', () => {
    const piano = [{ pos: 0 }, { pos: 1.5 }, { pos: 3.5 }];
    const drums = (style, ph, o = {}) => {
        const env = o.env || mkEnv();
        return buildBandDrums(env, style, ph, o.i ?? 1, o.L ?? 4, piano, ph.rng, SW, o.m ?? 0);
    };
    test('swing : ride sur les 4 temps, charleston aux temps 2 et 4, grosse caisse légère', () => {
        const d = drums('swing', mkPhrase('swing', 1));
        [0, 1, 2, 3].forEach(b => assert.ok(d.some(h => h.pos === b && h.drum === 'ride')));
        [1, 3].forEach(b => assert.ok(d.some(h => h.pos === b && h.drum === 'pedal')));
        assert.ok(d.some(h => h.pos === 0 && h.drum === 'kick'));
    });
    test('swing « feathering » : grosse caisse très douce sur chaque temps', () => {
        const d = drums('swing', mkPhrase('swing', 1, { feather: true }));
        const k = d.filter(h => h.drum === 'kick' && Number.isInteger(h.pos));
        assert.equal(k.length >= 4, true);
        k.slice(0, 4).forEach(h => assert.ok(h.vel >= 0.16 && h.vel <= 0.22));
    });
    test('pop : charleston en croches, caisse claire aux temps 2 et 4', () => {
        const d = drums('pop', mkPhrase('pop', 1));
        assert.equal(d.filter(h => h.drum === 'hat' || h.drum === 'ohat').length >= 8, true);
        assert.ok(d.some(h => h.pos === 1 && h.drum === 'snare'));
        assert.ok(d.some(h => h.pos === 3 && h.drum === 'snare'));
        assert.ok(d.some(h => h.pos === 0 && h.drum === 'kick' && h.vel === 1));
    });
    test('latin : cross-stick alterné selon la parité de la mesure globale m', () => {
        const even = drums('latin', mkPhrase('latin', 1), { m: 0 }).filter(h => h.drum === 'rim').map(h => h.pos);
        const odd = drums('latin', mkPhrase('latin', 1), { m: 1 }).filter(h => h.drum === 'rim').map(h => h.pos);
        assert.deepEqual(even, [0, 1.5, 3]);
        assert.deepEqual(odd, [1, 2]);
    });
    test('fill à la dernière mesure d\'une phrase : rien après le temps 4, bandLastFill mémorisé', () => {
        for (const style of ['swing', 'pop', 'latin']) for (const fillKind of [0, 1]) {
            const env = mkEnv();
            const d = drums(style, mkPhrase(style, 2, { fill: true, fillKind }), { env, i: 3, L: 4 });
            assert.equal(env.state.bandLastFill, true, style);
            const base = d.filter(h => h.pos < 3 && (h.drum === 'ride' || h.drum === 'hat'));
            assert.ok(base.length > 0);
            assert.ok(d.filter(h => h.pos >= 3).some(h => ['snare', 'tom1', 'rim'].includes(h.drum)), style + fillKind);
        }
    });
    test('mesure suivant un fill : crash possible au temps 1, puis le drapeau retombe', () => {
        const env = mkEnv({ state: { bandLastFill: true } });
        const d = drums('swing', mkPhrase('swing', 1), { env, i: 0 });
        assert.equal(env.state.bandLastFill, false);
        const crashes = d.filter(h => h.drum === 'crash');
        assert.ok(crashes.length <= 1);
        // rng() < 0.6 pour la graine 1 ou non : on force les deux cas
        const yes = drums('swing', mkPhrase('swing', 1, { rng: () => 0.1 }), { env: mkEnv({ state: { bandLastFill: true } }), i: 0 });
        const no = drums('swing', mkPhrase('swing', 1, { rng: () => 0.9 }), { env: mkEnv({ state: { bandLastFill: true } }), i: 0 });
        assert.ok(yes.some(h => h.drum === 'crash'));
        assert.ok(!no.some(h => h.drum === 'crash'));
    });
    test('hors fin de phrase, bandLastFill ne change pas', () => {
        const env = mkEnv({ state: { bandLastFill: false } });
        drums('swing', mkPhrase('swing', 1, { fill: true }), { env, i: 1 });
        assert.equal(env.state.bandLastFill, false);
    });
    test('pop : seizièmes de charleston si hat16', () => {
        const d = drums('pop', mkPhrase('pop', 1, { hat16: true }));
        assert.ok(d.some(h => h.drum === 'hat' && h.pos === 0.25));
    });
});

describe('buildStandardPlan', () => {
    const run = (o = {}) => {
        const { style = 'swing', step = Dm7, nextStep = G7, last = false, halves = null, seed = 1, i = 0, L = 4, isTurn = false, m = 0, env = mkEnv(), ph = mkPhrase(style, seed) } = o;
        return buildStandardPlan(env, style, step, nextStep, last, halves, ph, i, L, isTurn, m);
    };
    test('swing : piano + walking bass + batterie, tous bien formés', () => {
        for (let s = 1; s <= 100; s++) for (let i = 0; i < 4; i++) {
            const r = run({ seed: s, i, isTurn: i === 3, last: i === 3 });
            assert.ok(r.piano.length > 0 && r.bass.length >= 2 && r.drums.length > 0);
            r.piano.forEach(e => { assert.ok(e.dur > 0); assert.ok(e.vel > 0 && e.vel <= 1); assert.ok(Array.isArray(e.intervals)); assert.equal(typeof e.rootIndex, 'number'); });
            r.bass.forEach(b => { assert.ok(Number.isFinite(b.abs)); assert.ok(b.dur > 0); });
        }
    });
    test('swing : la walking bass commence sur la fondamentale de l\'accord', () => {
        assert.equal(run({ seed: 5 }).bass[0].abs, H.bassNear(mkEnv(), Dm7));
    });
    test('dernière mesure : une frappe de piano au temps 4« et » annonce l\'accord suivant', () => {
        const ph = mkPhrase('swing', 1, { turn: [[3.5, 0.6, 'C', 0.9]], motif: [[3.5, 0.6, 'C', 0.9]], second: [[3.5, 0.6, 'C', 0.9]], varied: [[3.5, 0.6, 'C', 0.9]] });
        const ant = run({ ph, last: true, nextStep: Cmaj7 });
        const noAnt = run({ ph: mkPhrase('swing', 1, { turn: ph.turn, motif: ph.motif, second: ph.second, varied: ph.varied }), last: false, nextStep: Cmaj7 });
        assert.equal(ant.piano[0].rootIndex, 0);
        assert.equal(noAnt.piano[0].rootIndex, 2);
    });
    test('mesure à deux accords : chaque moitié a au moins une frappe de piano, basse split', () => {
        for (let s = 1; s <= 60; s++) {
            const r = run({ halves: [Dm7, G7], seed: s, ph: mkPhrase('swing', s, { motif: [[3, 0.5, 'N', 0.6]] }) });
            assert.ok(r.piano.some(e => e.pos < 2 && e.rootIndex === 2));
            assert.ok(r.piano.some(e => e.pos >= 2 && e.rootIndex === 7));
            assert.ok(r.bass.some(b => b.pos === 0) && r.bass.some(b => b.pos === 2));
            r.piano.filter(e => e.pos < 2).forEach(e => assert.ok(e.pos + e.dur <= 2.0001 || e.dur <= 0.15 + 1e-9));
        }
    });
    test('style non swing : la basse vient du motif de la phrase (jetons R, 3, 5, A…)', () => {
        const bass = [[0, 'R', 1, 0.9], [2, '5', 1, 0.8], [3, 'A', 0.5, 0.7]];
        const ph = mkPhrase('pop', 1, { bassMotif: bass, bassAlt: bass, bassTurn: bass });
        const r = run({ style: 'pop', ph, last: true });
        assert.deepEqual(r.bass.map(b => b.pos), [0, 2, 3]);
        const tones = mkEnv().findChordObj('m7').notes;
        assert.equal(r.bass[0].abs, 2 + tones[0]);
        assert.equal(r.bass[1].abs, 2 + tones[2]);
        assert.equal(Math.abs(r.bass[2].abs - H.bassNear(mkEnv(), G7)), 1);
    });
    test('style non swing, deux accords : la fondamentale de chaque accord est ajoutée au motif', () => {
        const bass = [[3, 'R', 0.5, 0.7]];
        const ph = mkPhrase('pop', 1, { bassMotif: bass, bassAlt: bass, bassTurn: bass });
        const r = run({ style: 'pop', ph, halves: [Dm7, G7] });
        assert.ok(r.bass.some(b => b.pos < 2) && r.bass.some(b => b.pos >= 2 && b.pos < 2.75));
    });
    test('deux accords de même fondamentale : pas d\'approche vers le second', () => {
        const bass = [[0, 'A', 1, 0.7]];
        const ph = mkPhrase('pop', 1, { bassMotif: bass, bassAlt: bass, bassTurn: bass });
        const same = [Dm7, { rootIndex: 2, chordId: '7', scaleId: 'mixolydian' }];
        const r = run({ style: 'pop', ph, halves: same });
        const tones = mkEnv().findChordObj('m7').notes;
        assert.equal(r.bass[0].abs, 2 + tones[2]); // quinte (pas d'approche)
    });
    test('l\'état bandLastFill est mis à jour par la batterie', () => {
        const env = mkEnv();
        run({ env, ph: mkPhrase('swing', 1, { fill: true }), i: 3, isTurn: true });
        assert.equal(env.state.bandLastFill, true);
    });
    test('déterministe pour une même graine', () => {
        assert.deepEqual(run({ seed: 9 }), run({ seed: 9 }));
    });
});
