// Tests de l'orchestre Classique et du mode Arpèges (band/classic-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { classicPhraseExtras, buildClassicPlan, buildArpPlan } = require('./classic-plan.js');
const P = require('../band-patterns.js');
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
const FAMILIES = ['quarter', 'blockarp', 'mixed', 'roll', 'bassup'];
const mkEnv = (extra = {}) => ({ transOffset: 0, bpm: 100, ternary: false, splitBeat: 2, findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0], ...extra });
const Dm7 = { rootIndex: 2, chordId: 'm7', scaleId: 'dorian' };
const G7 = { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' };
const Cmaj7 = { rootIndex: 0, chordId: 'maj7', scaleId: 'ionian' };

describe('classicPhraseExtras', () => {
    test('intensité bornée et famille connue ; indices dans les tables de motifs', () => {
        let prev = null;
        for (let idx = 0; idx < 60; idx++) {
            const ph = classicPhraseExtras(100, seeded(idx + 1), prev, idx);
            assert.ok(ph.intensity >= 0.25 && ph.intensity <= 0.9);
            assert.ok(FAMILIES.includes(ph.family));
            assert.ok(ph.eightIdx < P.CLS_EIGHTS.length && ph.eightAlt < P.CLS_EIGHTS.length);
            assert.ok(ph.quarterIdx < P.CLS_QUARTERS.length && ph.mixedIdx < P.CLS_MIXED.length && ph.upperIdx < P.CLS_UPPER.length);
            assert.ok(ph.ending === 0 || ph.ending === 1);
            assert.equal(typeof ph.bassLow, 'boolean');
            prev = { ...ph, style: 'classic' };
        }
    });
    test('au-delà de 165 BPM : jamais de croches continues (roll / bassup)', () => {
        for (let s = 1; s <= 300; s++) {
            const ph = classicPhraseExtras(190, seeded(s), { style: 'classic', family: 'roll', intensity: 0.8 }, 3);
            assert.ok(['quarter', 'blockarp', 'mixed'].includes(ph.family), ph.family);
        }
    });
    test('la première phrase part d\'une intensité modérée (0.35 à 0.55)', () => {
        for (let s = 1; s <= 50; s++) {
            const ph = classicPhraseExtras(100, seeded(s), null, 0);
            assert.ok(ph.intensity >= 0.35 && ph.intensity <= 0.55);
        }
    });
    test('déterministe', () => {
        assert.deepEqual(classicPhraseExtras(100, seeded(9), null, 0), classicPhraseExtras(100, seeded(9), null, 0));
    });
});

function mkPhrase(seed, family, extra = {}) {
    return { ...classicPhraseExtras(100, seeded(seed), null, 0), rng: seeded(seed + 1000), family, ...extra };
}
function plan({ env = mkEnv(), step = Dm7, nextStep = G7, last = false, halves = null, ph, i = 0, L = 4, isTurn = false, m = 0 } = {}) {
    return buildClassicPlan(env, step, nextStep, last, halves, ph, i, L, isTurn, m);
}

describe('buildClassicPlan', () => {
    test('piano seul : ni basse ni batterie, événements triés et valides', () => {
        for (const fam of FAMILIES) for (let i = 0; i < 4; i++) for (let s = 1; s <= 20; s++) {
            const r = plan({ ph: mkPhrase(s, fam), i, isTurn: i === 3, last: i === 3 });
            assert.deepEqual(r.bass, []); assert.deepEqual(r.drums, []);
            assert.ok(r.piano.length > 0, `${fam} i=${i}`);
            r.piano.forEach((e, k) => {
                assert.ok(e.pos >= 0 && e.pos < 4);
                assert.ok(e.dur >= 0.2); assert.ok(e.vel >= 0.12 && e.vel <= 1);
                assert.equal(e.noteVels.length, e.intervals.length);
                assert.equal(e.wide, true);
                if (k) assert.ok(e.pos >= r.piano[k - 1].pos);
            });
        }
    });
    test('les hauteurs d\'un événement sont triées sans doublon', () => {
        for (let s = 1; s <= 50; s++) {
            const r = plan({ ph: mkPhrase(s, 'blockarp') });
            r.piano.forEach(e => e.intervals.forEach((v, k) => { if (k) assert.ok(v > e.intervals[k - 1]); }));
        }
    });
    test('famille « quarter » : quatre noires aux temps 0 à 3', () => {
        const r = plan({ ph: mkPhrase(1, 'quarter', { bassLow: false, blockOnOne: false }), i: 0 });
        assert.deepEqual(r.piano.map(e => e.pos), [0, 1, 2, 3]);
    });
    test('basse sous le motif quand bassLow ou famille bassup', () => {
        const withLow = plan({ ph: mkPhrase(1, 'quarter', { bassLow: true, blockOnOne: false }) });
        assert.equal(withLow.piano.filter(e => e.pos === 0).length, 2);
        const without = plan({ ph: mkPhrase(1, 'quarter', { bassLow: false, blockOnOne: false }) });
        assert.equal(without.piano.filter(e => e.pos === 0).length, 1);
    });
    test('accord sur basse (slash) : la basse est jouée même sans bassLow', () => {
        const slash = { ...Dm7, bassRootIndex: 5 };
        const r = plan({ step: slash, ph: mkPhrase(1, 'quarter', { bassLow: false, blockOnOne: false }) });
        assert.equal(r.piano.filter(e => e.pos === 0).length, 2);
    });
    test('dernière mesure de phrase : le motif se referme (note aiguë ou accord doux au temps 4)', () => {
        for (const ending of [0, 1]) {
            const r = plan({ ph: mkPhrase(2, 'roll', { endingOn: true, ending, blockOnOne: false, bassLow: false }), i: 3, isTurn: true });
            const at3 = r.piano.filter(e => e.pos === 3);
            assert.equal(at3.length, 1);
            assert.equal(at3[0].vel > 0, true);
            assert.equal(at3[0].intervals.length > 1, ending === 1);
            assert.ok(r.piano.every(e => e.pos < 3 || e.pos === 3));
        }
    });
    test('mesure à deux accords : deux demi-mesures indépendantes', () => {
        const r = plan({ halves: [Dm7, G7], ph: mkPhrase(3, 'blockarp') });
        assert.ok(r.piano.some(e => e.pos < 2) && r.piano.some(e => e.pos >= 2));
        r.piano.filter(e => e.pos < 2).forEach(e => assert.ok(e.pos + e.dur <= 2.06 + 1e-9 || e.dur === 0.2));
    });
    test('mesure à deux accords, famille quarter ou tempo rapide : deux notes par demi-mesure', () => {
        const r = plan({ env: mkEnv({ bpm: 190 }), halves: [Dm7, G7], ph: mkPhrase(3, 'roll', { bassLow: false }) });
        assert.deepEqual(r.piano.map(e => e.pos), [0, 1, 2, 3]);
    });
    test('la résonance de la dernière note se prolonge si l\'accord suivant est identique', () => {
        const same = plan({ nextStep: Dm7, last: true, ph: mkPhrase(4, 'quarter', { bassLow: false, blockOnOne: false }) });
        const diff = plan({ nextStep: G7, last: true, ph: mkPhrase(4, 'quarter', { bassLow: false, blockOnOne: false }) });
        const end = (r) => { const e = r.piano[r.piano.length - 1]; return e.pos + e.dur; };
        assert.ok(end(same) >= end(diff));
    });
    test('accord inconnu de la bibliothèque : repli sans erreur', () => {
        assert.doesNotThrow(() => plan({ step: { rootIndex: 0, chordId: 'zzz', scaleId: 'ionian' }, ph: mkPhrase(1, 'roll') }));
    });
    test('déterministe pour une même graine', () => {
        const a = plan({ ph: mkPhrase(7, 'mixed') }), b = plan({ ph: mkPhrase(7, 'mixed') });
        assert.deepEqual(a, b);
    });
});

describe('buildArpPlan', () => {
    const withMathRandom = (v, fn) => { const o = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = o; } };
    test('4 temps : notes montantes à partir de la basse, une vague par accord', () => {
        withMathRandom(0.5, () => {
            const r = buildArpPlan(mkEnv(), 4, Cmaj7, Dm7, true, null);
            assert.deepEqual(r.bass, []); assert.deepEqual(r.drums, []);
            assert.ok(r.piano.length >= 4);
            assert.equal(r.piano[0].pos, 0);
            assert.equal(r.piano[0].vel, 0.74);
            for (let k = 1; k < 4; k++) assert.ok(r.piano[k].intervals[0] > r.piano[k - 1].intervals[0]);
        });
    });
    test('mesure à deux accords : la coupure suit env.splitBeat', () => {
        withMathRandom(0.5, () => {
            const r = buildArpPlan(mkEnv({ splitBeat: 2 }), 4, Cmaj7, null, false, [Dm7, G7]);
            assert.ok(r.piano.some(e => e.pos === 2 && e.vel === 0.74), 'nouvelle vague au temps 3');
            const r3 = buildArpPlan(mkEnv({ splitBeat: 1 }), 3, Cmaj7, null, false, [Dm7, G7]);
            assert.ok(r3.piano.some(e => e.pos === 1 && e.vel === 0.74));
        });
    });
    test('mesure composée : arpège en triolets (pas de 1/3)', () => {
        withMathRandom(0.5, () => {
            const r = buildArpPlan(mkEnv({ ternary: true }), 2, Cmaj7, null, false, null);
            assert.ok(r.piano.some(e => Math.abs(e.pos - Math.round(e.pos)) > 0.3));
            const n = buildArpPlan(mkEnv({ ternary: false }), 2, Cmaj7, null, false, null);
            assert.ok(n.piano.every(e => e.pos === Math.round(e.pos * 2) / 2));
        });
    });
    test('retardement aléatoire (lay) tiré par Math.random', () => {
        const lo = withMathRandom(0, () => buildArpPlan(mkEnv(), 4, Cmaj7, null, false, null));
        const hi = withMathRandom(0.999, () => buildArpPlan(mkEnv(), 4, Cmaj7, null, false, null));
        assert.ok(lo.piano.every(e => e.lay === 0));
        assert.ok(hi.piano.every(e => e.lay > 0.005 && e.lay < 0.006));
    });
    test('durées bornées, vélocités fixes selon la place dans la mesure', () => {
        withMathRandom(0.5, () => {
            const r = buildArpPlan(mkEnv(), 4, Cmaj7, Dm7, true, null);
            r.piano.forEach(e => { assert.ok(e.dur >= 0.3 && e.dur <= 3); assert.ok([0.74, 0.6, 0.52].includes(e.vel)); });
        });
    });
});

// ---------- Style Baroque (rythme imposé « c-baroque ») ----------
describe('style Baroque', () => {
    const { BAROQUE_GROOVE } = require('./classic-plan.js');
    const C = { rootIndex: 0, chordId: 'maj', scaleId: 'ionian' };
    const F = { rootIndex: 5, chordId: 'maj', scaleId: 'ionian' };
    const bqPhrase = (seed, bFam, extra = {}) => ({ ...classicPhraseExtras(84, seeded(seed), null, 0, BAROQUE_GROOVE), rng: seeded(seed + 500), bFam, ...extra });
    const bqPlan = (o = {}) => plan({ env: mkEnv({ bpm: 84 }), step: C, nextStep: F, ...o });

    test('sans le rythme c-baroque, les phrases Classique restent inchangées', () => {
        assert.equal(classicPhraseExtras(84, seeded(3), null, 0).baroque, undefined);
        assert.deepEqual(classicPhraseExtras(84, seeded(3), null, 0), classicPhraseExtras(84, seeded(3), null, 0, 'r-roll'));
    });
    test('le rythme c-baroque pose les choix de phrase baroques', () => {
        for (let s = 1; s <= 80; s++) {
            const ph = classicPhraseExtras(84, seeded(s), null, 0, BAROQUE_GROOVE);
            assert.equal(ph.baroque, true);
            assert.ok(['prelude', 'cells', 'scale'].includes(ph.bFam));
            assert.ok(['held', 'walk', 'eights'].includes(ph.bBass));
        }
    });
    test('à tempo vif (> 132 BPM) : jamais de motif de prélude (doubles-croches)', () => {
        for (let s = 1; s <= 200; s++) {
            const ph = classicPhraseExtras(150, seeded(s), { style: 'classic', baroque: true, bFam: 'prelude' }, 2, BAROQUE_GROOVE);
            assert.notEqual(ph.bFam, 'prelude');
        }
    });
    test('mesure pleine : beaucoup de notes (≥ 16 aux deux mains) dans chaque famille, bien plus que le style Classique', () => {
        for (const fam of ['prelude', 'cells', 'scale']) {
            for (let s = 1; s <= 40; s++) {
                const ph = bqPhrase(s, fam, { bBass: ['held', 'walk', 'eights'][s % 3] });
                for (let i = 0; i < 4; i++) {
                    const out = bqPlan({ ph, i, isTurn: i === 3 });
                    const n = out.piano.length;
                    assert.ok(n >= (i === 3 ? 12 : 16), `${fam} seed ${s} mesure ${i} : ${n} notes`);
                }
            }
        }
    });
    test('événements valides : triés, dans la mesure, durées positives, hauteurs jouables', () => {
        for (const fam of ['prelude', 'cells', 'scale']) {
            for (let s = 1; s <= 40; s++) {
                const ph = bqPhrase(s, fam, { bBass: ['held', 'walk', 'eights'][s % 3] });
                for (let i = 0; i < 4; i++) {
                    const { piano, bass, drums } = bqPlan({ ph, i, isTurn: i === 3, last: i === 3 });
                    assert.deepEqual([bass.length, drums.length], [0, 0]);
                    let prev = -1;
                    piano.forEach(e => {
                        assert.ok(e.pos >= 0 && e.pos < 4, `pos ${e.pos}`);
                        assert.ok(e.pos >= prev); prev = e.pos;
                        assert.ok(e.dur > 0 && e.vel > 0 && e.vel <= 1);
                        e.intervals.forEach(p => assert.ok(Number.isFinite(p) && p >= -29 && p <= 19, `hauteur ${p}`));
                    });
                }
            }
        }
    });
    test('la basse est la fondamentale sur le premier temps (accord sur basse compris)', () => {
        for (const bass of ['held', 'walk', 'eights']) {
            const ph = bqPhrase(7, 'cells', { bBass: bass });
            const first = bqPlan({ ph, step: { ...C, bassRootIndex: 4 } }).piano.filter(e => e.pos === 0).map(e => e.intervals[0]);
            assert.ok(first.some(p => ((p % 12) + 12) % 12 === 4), `${bass} : ${first}`);
            const first2 = bqPlan({ ph }).piano.filter(e => e.pos === 0).map(e => e.intervals[0]);
            assert.ok(first2.some(p => ((p % 12) + 12) % 12 === 0), `${bass} : ${first2}`);
        }
    });
    test('mesure à deux accords : les deux moitiés sont jouées, chacune sur son accord', () => {
        const ph = bqPhrase(11, 'cells', { bBass: 'walk' });
        const { piano } = bqPlan({ ph, halves: [C, F] });
        const a = piano.filter(e => e.pos < 2), b = piano.filter(e => e.pos >= 2);
        assert.ok(a.length >= 8 && b.length >= 8, `${a.length} / ${b.length}`);
        const pcs = (arr) => new Set(arr.map(e => ((e.intervals[0] % 12) + 12) % 12));
        const cTones = [0, 4, 7], fTones = [5, 9, 0];
        assert.ok([...pcs(a.filter(e => e.pos === 0))].every(p => cTones.includes(p)));
        assert.ok([...pcs(b.filter(e => e.pos === 2))].every(p => fTones.includes(p)));
    });
    test('transposition (Sib) : hauteurs restent dans la plage jouable', () => {
        const env = mkEnv({ bpm: 84, transOffset: 2 });
        for (let s = 1; s <= 30; s++) {
            const ph = bqPhrase(s, ['prelude', 'cells', 'scale'][s % 3]);
            bqPlan({ env, ph, i: s % 4 }).piano.forEach(e => e.intervals.forEach(p => assert.ok(p + 2 <= 19 && p + 2 >= -14, `${p}`)));
        }
    });
    test('tempo vif : croches (au moins 8 notes par mesure, moins de 17 par main)', () => {
        const ph = { ...classicPhraseExtras(150, seeded(5), null, 0, BAROQUE_GROOVE), rng: seeded(6) };
        const out = plan({ env: mkEnv({ bpm: 150 }), step: C, nextStep: F, ph, i: 1 });
        assert.ok(out.piano.length >= 8 && out.piano.length <= 24, `${out.piano.length}`);
    });
    test('déterministe à graine égale', () => {
        const a = bqPlan({ ph: bqPhrase(4, 'scale') }), b = bqPlan({ ph: bqPhrase(4, 'scale') });
        assert.deepEqual(a, b);
    });
});

// ---------- Curseur « Densité » (orchestre Classique) ----------
describe('densité de notes (curseur du pop-up Orchestre)', () => {
    const C = { rootIndex: 0, chordId: 'maj', scaleId: 'ionian' };
    const G7b = { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' };
    const avg = (d, { bpm = 100, groove, halves = null } = {}) => {
        let tot = 0, N = 0;
        for (let s = 1; s <= 40; s++) {
            const env = mkEnv({ bpm, density: d });
            const ph = { ...classicPhraseExtras(bpm, seeded(s), null, 0, groove), rng: seeded(s + 9) };
            for (let i = 0; i < 4; i++) { tot += buildClassicPlan(env, C, G7b, i === 3, halves, ph, i, 4, i === 3, i).piano.length; N++; }
        }
        return tot / N;
    };

    test('sans densité, et à 0,5 : écriture d\'origine strictement identique', () => {
        for (let s = 1; s <= 20; s++) {
            const ph = () => ({ ...classicPhraseExtras(100, seeded(s), null, 0), rng: seeded(s + 9) });
            const a = buildClassicPlan(mkEnv(), C, G7b, false, null, ph(), 1, 4, false, 1);
            const b = buildClassicPlan(mkEnv({ density: 0.5 }), C, G7b, false, null, ph(), 1, 4, false, 1);
            assert.deepEqual(a, b);
        }
    });
    test('Classique : plus la densité monte, plus le piano joue de notes, avec un écart d\'au moins 5 entre 0 et 1', () => {
        const lv = [0, 0.25, 0.5, 0.75, 1].map(d => avg(d));
        for (let k = 1; k < lv.length; k++) assert.ok(lv[k] > lv[k - 1], lv.join(' < '));
        assert.ok(lv[4] >= lv[0] * 5, lv.join(' / '));
    });
    test('Baroque : l\'allègement est net (≥ 2 fois moins de notes à 0) et la main gauche s\'anime au-dessus de 0,5', () => {
        const g = 'c-baroque';
        assert.ok(avg(0, { bpm: 84, groove: g }) * 2 <= avg(0.5, { bpm: 84, groove: g }));
        assert.ok(avg(1, { bpm: 84, groove: g }) > avg(0.5, { bpm: 84, groove: g }));
    });
    test('événements valides à toutes les densités (mesure pleine et mesure à deux accords)', () => {
        for (const groove of [undefined, 'c-baroque']) {
            for (const d of [0, 0.3, 0.7, 1]) {
                for (const halves of [null, [C, G7b]]) {
                    for (let s = 1; s <= 15; s++) {
                        const env = mkEnv({ bpm: 90, density: d });
                        const ph = { ...classicPhraseExtras(90, seeded(s), null, 0, groove), rng: seeded(s + 9) };
                        for (let i = 0; i < 4; i++) {
                            const { piano } = buildClassicPlan(env, C, G7b, i === 3, halves, ph, i, 4, i === 3, i);
                            assert.ok(piano.length >= 1);
                            let prev = -1;
                            piano.forEach(e => {
                                assert.ok(e.pos >= 0 && e.pos < 4 && e.pos >= prev); prev = e.pos;
                                assert.ok(e.dur > 0 && e.vel > 0 && e.vel <= 1);
                                e.intervals.forEach(p => assert.ok(Number.isFinite(p) && p >= -30 && p <= 30));
                            });
                        }
                    }
                }
            }
        }
    });
    test('tempo vif : pas de doubles-croches au-delà de 132 BPM, pas de remplissage au-delà de 165', () => {
        const sixteenths = (pl) => pl.piano.some(e => Math.abs(e.pos * 4 - Math.round(e.pos * 4)) < 1e-9 && Math.abs(e.pos * 2 - Math.round(e.pos * 2)) > 1e-9);
        for (let s = 1; s <= 20; s++) {
            const mk = (bpm) => ({ env: mkEnv({ bpm, density: 1 }), ph: { ...classicPhraseExtras(bpm, seeded(s), null, 0), rng: seeded(s + 9) } });
            const a = mk(150), b = mk(120);
            assert.ok(!sixteenths(buildClassicPlan(a.env, C, G7b, false, null, a.ph, 1, 4, false, 1)));
            if (s === 1) assert.ok([1, 2, 3, 4, 5, 6].some(i => sixteenths(buildClassicPlan(b.env, C, G7b, false, null, b.ph, i % 4, 4, false, i))));
        }
        assert.equal(avg(1, { bpm: 190 }) <= avg(0.5, { bpm: 190 }) + 0.01, true);
    });
});
