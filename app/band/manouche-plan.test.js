// Tests de l'orchestre Jazz manouche (band/manouche-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { manoucheVoicing, manoucheLick, manouchePhraseExtras, buildManouchePlan, mnUpperDegrees, mnChordShape } = require('./manouche-plan.js');
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
const M6 = 'x:m:P:6:-';
const Am6 = { rootIndex: 9, chordId: M6, scaleId: 'melodicMinor' };
const Dm6 = { rootIndex: 2, chordId: M6, scaleId: 'dorian' };
const E7 = { rootIndex: 4, chordId: '7', scaleId: 'phrygianDominant' };
const E7b9 = { rootIndex: 4, chordId: '7b9', scaleId: 'phrygianDominant' };
const C6 = { rootIndex: 0, chordId: '6', scaleId: 'ionian' };
const Cs0 = { rootIndex: 1, chordId: 'dim7', scaleId: 'wholeHalfDim' };
const pc = (n) => ((n % 12) + 12) % 12;
const findChordObj = (id) => T.lookupChord(id) || T.chordTypes.maj[0];

const mkEnv = (over = {}) => ({ transOffset: 0, findChordObj, splitBeat: 2, bpm: 180, density: 0.5, measureInStep: 0, state: { mnState: null }, ...over });
const mkPhrase = (seed, over = {}) => ({ rng: seeded(seed), style: 'manouche', ...manouchePhraseExtras(seeded(seed * 31), null, seed % 3), ...over });
function plan({ bpb = 4, ternary = false, step = Am6, nextStep = Dm6, last = false, halves = null, seed = 1, i = 0, L = 4, isTurn = false, m = 0, env = mkEnv(), ph = mkPhrase(seed) } = {}) {
    return buildManouchePlan(env, bpb, ternary, step, nextStep, last, halves, ph, i, L, isTurn, m);
}
const real = (x, off = 0) => 48 + x + off;
const of = (p, inst, art) => p.piano.filter(e => e.inst === inst && (!art || e.art === art));

describe('manouchePhraseExtras (choix de la phrase)', () => {
    test('valeurs dans leurs bornes, sur beaucoup de graines', () => {
        for (let s = 1; s <= 300; s++) {
            const e = manouchePhraseExtras(seeded(s), s % 2 ? null : { style: 'manouche', intensity: (s % 10) / 10 }, s % 4);
            assert.ok(e.intensity >= 0.25 && e.intensity <= 0.95);
            assert.ok(e.slide > 0 && e.slide < 1);
            for (const k of ['walk', 'walkHalf', 'ghost']) assert.equal(typeof e[k], 'boolean', k);
            for (const k of ['leadRoll', 'leadKind', 'leadMid', 'vlnRoll', 'vlnKind']) assert.ok(e[k] >= 0 && e[k] < 1, k);
        }
    });
    test('déterministe à graine égale', () => {
        assert.deepEqual(manouchePhraseExtras(seeded(5), null, 1), manouchePhraseExtras(seeded(5), null, 1));
    });
});

describe('manoucheVoicing (formes de la pompe)', () => {
    const env = { transOffset: 0, findChordObj };
    const degs = (cs, v) => v.up.map(x => pc(x - cs.rootIndex));
    test('m6 = 1-♭3-5-6, 7 = 1-3-5-♭7, 7(♭9) avec la ♭9, °7 les quatre notes', () => {
        assert.deepEqual(degs(Am6, manoucheVoicing(env, Am6, null)).sort((a, b) => a - b), [3, 7, 9]);
        assert.deepEqual(degs(E7, manoucheVoicing(env, E7, null)).sort((a, b) => a - b), [4, 7, 10]);
        assert.deepEqual(degs(E7b9, manoucheVoicing(env, E7b9, null)).sort((a, b) => a - b), [1, 4, 10]);
        assert.deepEqual(degs(Cs0, manoucheVoicing(env, Cs0, null)).sort((a, b) => a - b), [3, 6, 9]);
    });
    test('basse sur la fondamentale (ou la basse choisie), dans le registre des cordes graves ; trois notes au-dessus, jouables', () => {
        for (const cs of [Am6, Dm6, E7, E7b9, C6, Cs0, { ...C6, bassRootIndex: 4 }]) {
            for (const off of [0, -2, -9]) {
                const v = manoucheVoicing({ transOffset: off, findChordObj }, cs, null);
                assert.ok(v.low >= 40 && v.low <= 51, `basse ${v.low}`);
                assert.equal(pc(v.low - off), Number.isInteger(cs.bassRootIndex) ? cs.bassRootIndex : cs.rootIndex);
                assert.equal(v.up.length, 3);
                assert.ok(v.up[0] > v.low + 2 && v.up[2] <= 69 && v.up[0] >= 52, JSON.stringify(v));
                assert.ok(v.up[2] - v.up[0] <= 14);
                assert.ok(v.up[0] < v.up[1] && v.up[1] < v.up[2]);
            }
        }
    });
    test('conduite des voix : l\'accord suivant bouge peu', () => {
        const a = manoucheVoicing(env, Am6, null);
        const b = manoucheVoicing(env, E7, a);
        assert.ok(b.up.reduce((s, x, k) => s + Math.abs(x - a.up[k]), 0) <= 6);
    });
    test('mnUpperDegrees : triade 3-5-8, accord à tension : la tension en haut', () => {
        assert.deepEqual(mnUpperDegrees(mnChordShape(env, { rootIndex: 0, chordId: 'majTriad' })), [4, 7, 0]);
        assert.deepEqual(mnUpperDegrees(mnChordShape(env, { rootIndex: 0, chordId: 'x:M:P:6:9' })), [4, 9, 2]);
    });
});

describe('buildManouchePlan : la pompe et la contrebasse', () => {
    test('4/4 : « boum » sur 1 et 3, « tchac » accentué et court sur 2 et 4, pas de batterie', () => {
        const p = plan();
        assert.deepEqual(of(p, 'pompe', 'boom').map(e => e.pos), [0, 2]);
        assert.deepEqual(of(p, 'pompe', 'chick').map(e => e.pos), [1, 3]);
        const boom = of(p, 'pompe', 'boom')[0], chick = of(p, 'pompe', 'chick')[0];
        assert.ok(chick.vel > boom.vel);
        assert.ok(chick.dur < boom.dur && chick.dur <= 0.32);
        assert.equal(p.drums.length, 0);
        assert.equal(p.manouche, true);
    });
    test('les notes de la pompe sont celles de l\'accord', () => {
        for (let s = 1; s <= 40; s++) {
            const p = plan({ seed: s, step: E7b9, nextStep: Am6 });
            const pcs = T.lookupChord('7b9').notes.map(n => pc(n + 4));
            of(p, 'pompe').filter(e => e.art !== 'slide' && e.art !== 'ghost').forEach(e => e.intervals.forEach(x => assert.ok(pcs.includes(pc(x)), `${x}`)));
        }
    });
    test('3/4 (valse manouche) : boum - tchac - tchac, basse sur le 1', () => {
        const p = plan({ bpb: 3, bpm: 160 });
        assert.deepEqual(of(p, 'pompe', 'boom').map(e => e.pos), [0]);
        assert.deepEqual(of(p, 'pompe', 'chick').map(e => e.pos), [1, 2]);
        assert.equal(p.bass[0].pos, 0);
        assert.ok(p.bass.every(b => b.pos === 0 || b.pos === 2));
    });
    test('2/4 : boum - tchac', () => {
        const p = plan({ bpb: 2 });
        assert.deepEqual(of(p, 'pompe').filter(e => e.art !== 'ghost').map(e => e.art), ['boom', 'chick']);
    });
    test('ballade (sous 100) : quatre coups égaux, basse en blanches', () => {
        const p = plan({ env: mkEnv({ bpm: 72 }) });
        assert.deepEqual(of(p, 'pompe', 'ballad').map(e => e.pos), [0, 1, 2, 3]);
        assert.equal(of(p, 'pompe', 'chick').length, 0);
        assert.deepEqual(p.bass.map(b => b.pos), [0, 2]);
    });
    test('contrebasse : fondamentale sur le 1 ; en deux temps ou en noires selon la phrase', () => {
        let walked = 0, twoFeel = 0;
        for (let s = 1; s <= 80; s++) {
            const p = plan({ seed: s, i: 3 });
            const root = p.bass[0];
            assert.equal(root.pos, 0);
            assert.equal(pc(root.abs), 9);
            if (p.bass.length === 4) walked++; else twoFeel++;
        }
        assert.ok(walked > 0 && twoFeel > 0, `${walked} / ${twoFeel}`);
    });
    test('mesure à deux accords : chaque moitié a sa basse et sa forme', () => {
        const p = plan({ halves: [Am6, E7], step: { ...Am6, split: E7 } });
        const hi = p.bass.find(b => b.pos === 2);
        assert.equal(pc(hi.abs), 4);
        const ch3 = of(p, 'pompe', 'chick').find(e => e.pos === 3) || of(p, 'pompe', 'slide').find(e => e.pos === 3);
        assert.ok(ch3);
    });
    test('mesure composée (6/8, 12/8) : un boum et un tchac par pulsation, sans coups remontés', () => {
        const p = plan({ bpb: 4, ternary: true });
        assert.deepEqual(of(p, 'pompe').map(e => e.art), ['boom', 'chick', 'boom', 'chick']);
    });
    test('glissando d\'accord : le dernier tchac est l\'accord suivant un demi-ton plus haut', () => {
        let seen = 0;
        for (let s = 1; s <= 60; s++) {
            const p = plan({ seed: s, step: E7, nextStep: Am6, last: true });
            const sl = of(p, 'pompe', 'slide');
            if (!sl.length) continue;
            seen++;
            const nv = manoucheVoicing({ transOffset: 0, findChordObj }, Am6, manoucheVoicing({ transOffset: 0, findChordObj }, E7, null));
            assert.deepEqual(sl[0].intervals.map(x => real(x)), nv.up.map(x => x + 1));
            assert.equal(sl[0].pos, 3);
        }
        assert.ok(seen > 5);
    });
    test('transposition (Si♭, Mi♭) : mêmes hauteurs réelles', () => {
        const a = plan({ seed: 3 });
        const b = plan({ seed: 3, env: mkEnv({ transOffset: -2 }), step: { ...Am6, rootIndex: 11 }, nextStep: { ...Dm6, rootIndex: 4 } });
        assert.deepEqual(of(a, 'pompe', 'boom')[0].intervals.map(x => real(x)), of(b, 'pompe', 'boom')[0].intervals.map(x => real(x, -2)));
    });
});

describe('guitare solo et violon', () => {
    test('manoucheLick : arpège diminué en triolets sur une dominante, note d\'arrivée sur l\'accord suivant', () => {
        const env = { transOffset: 0, findChordObj };
        const l = manoucheLick(env, E7, Am6, 2, 4, 'dim', seeded(2), 67);
        assert.equal(l.notes.length, 6);
        const dim = [8, 11, 2, 5];   // sol#, si, ré, fa
        l.notes.forEach(n => assert.ok(dim.includes(pc(n.m))));
        assert.ok([0, 4, 9, 6].includes(pc(l.target)));   // do (tierce de Lam), fa# (6te), mi, la
        for (let k = 1; k < l.notes.length; k++) assert.ok(l.notes[k].m > l.notes[k - 1].m);
    });
    test('manoucheLick : descente chromatique jusqu\'à un demi-ton au-dessus de la note d\'arrivée', () => {
        const env = { transOffset: 0, findChordObj };
        const l = manoucheLick(env, Am6, E7, 2, 4, 'chrom', seeded(4), 70);
        assert.equal(l.notes.length, 4);
        assert.equal(l.notes[3].m, l.target + 1);
        for (let k = 1; k < 4; k++) assert.equal(l.notes[k].m, l.notes[k - 1].m - 1);
    });
    test('fin de phrase : la guitare solo joue, puis sa note d\'arrivée ouvre la mesure suivante', () => {
        let found = 0;
        for (let s = 1; s <= 40; s++) {
            const env = mkEnv({ density: 0.9 });
            const ph = mkPhrase(s);
            const p1 = plan({ seed: s, env, ph, i: 3, isTurn: true, step: E7, nextStep: Am6, last: true });
            const lead = of(p1, 'lead', 'pick');
            if (!lead.length) continue;
            found++;
            lead.forEach(e => assert.ok(e.pos >= 2 - 1e-9 && e.pos < 4));
            const p2 = plan({ seed: s + 1, env, ph, i: 0, step: Am6, nextStep: Dm6 });
            const tg = of(p2, 'lead', 'target');
            assert.equal(tg.length, 1);
            assert.equal(tg[0].pos, 0);
            assert.ok([0, 4, 9, 6].includes(pc(tg[0].intervals[0])));
        }
        assert.ok(found > 25);
    });
    test('densité : à 0 ni guitare solo ni violon ; à 1 bien plus de phrases', () => {
        const count = (d) => {
            let n = 0;
            for (let s = 1; s <= 60; s++) {
                const p = plan({ seed: s, env: mkEnv({ density: d }), i: 3, isTurn: true, step: E7, nextStep: Am6, last: true });
                n += p.piano.filter(e => e.inst === 'lead' || e.inst === 'violin').length;
            }
            return n;
        };
        assert.equal(count(0), 0);
        assert.ok(count(1) > count(0.5) && count(0.5) > 0);
    });
    test('violon : nappes sur une note guide de l\'accord (tierce, 6te / 7e), dans son registre', () => {
        for (let s = 1; s <= 60; s++) {
            const p = plan({ seed: s, env: mkEnv({ density: 1 }), step: E7, nextStep: Am6 });
            of(p, 'violin', 'sus').forEach(e => {
                const x = real(e.intervals[0]);
                assert.ok(x >= 62 && x <= 79);
                assert.ok([8, 2].includes(pc(x)), `${x}`);
            });
        }
    });
    test('toutes les frappes restent dans la mesure et ont une durée positive', () => {
        for (let s = 1; s <= 50; s++) {
            for (const [bpb, ternary] of [[4, false], [3, false], [2, false], [4, true], [2, true]]) {
                const p = plan({ seed: s, bpb, ternary, env: mkEnv({ density: s % 3 / 2 }), i: s % 4, isTurn: s % 4 === 3, last: s % 2 === 0 });
                p.piano.concat(p.bass).forEach(e => {
                    assert.ok(e.pos >= 0 && e.pos < bpb, `pos ${e.pos}`);
                    assert.ok(e.dur > 0 && e.vel > 0 && e.vel <= 1);
                });
                p.piano.forEach(e => assert.ok(['pompe', 'lead', 'violin'].includes(e.inst)));
            }
        }
    });
});
