// Tests de l'orchestre Classique par époque (band/classic-eras-plan.js) et des styles de grille associés. Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const E = require('./classic-eras-plan.js');
const { classicPhraseExtras, buildClassicPlan } = require('./classic-plan.js');
const C = require('./band-catalog.js');
const T = require('../theory.js');
const G = require('../grid/generation.js');
const M = require('../styles/style-meta.js');
const { buildStyleTemplate } = require('../styles/style-builders.js');

const findChordObj = (id) => T.lookupChord(id) || T.chordTypes.maj[0];
function rngOf(seed) {
    let a = seed >>> 0;
    return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
}
const env = (o = {}) => ({ transOffset: 0, findChordObj, bpm: 72, ...o });
const step = (rootIndex, chordId, extra = {}) => ({ rootIndex, chordId, scaleId: (findChordObj(chordId).scales[0] || {}).id || 'ionian', measures: 1, ...extra });
const phrase = (groove, index = 0, seed = 1, prev = null) => {
    const rng = rngOf(seed);
    return { style: 'classic', index, rng, ...classicPhraseExtras(72, rng, prev, index, groove) };
};
const STYLES = ['renaissance', 'chaconne', 'nocturne', 'romantique', 'impressionnisme', 'gymnopedie', 'neoclassique', 'minimalisme'];
const GROOVE_OF = { renaissance: 'c-renaissance', chaconne: 'c-chaconne', nocturne: 'c-nocturne', romantique: 'c-romantic',
    impressionnisme: 'c-impression', gymnopedie: 'c-satie', neoclassique: 'c-neoclassic', minimalisme: 'c-minimal' };

function checkPlan(plan, bpb, label, off = 0) {
    assert.ok(plan && Array.isArray(plan.piano), label);
    assert.deepEqual(plan.bass, []); assert.deepEqual(plan.drums, []);
    assert.ok(plan.piano.length > 0, `${label} : aucune note`);
    let last = -1;
    plan.piano.forEach(e => {
        assert.ok(e.pos >= -1e-9 && e.pos < bpb - 1e-9, `${label} : position ${e.pos}`);
        assert.ok(e.pos >= last - 1e-9, `${label} : frappes triées`); last = e.pos;
        assert.ok(e.dur > 0 && e.dur <= bpb + 1.5, `${label} : durée ${e.dur}`);
        assert.ok(e.vel > 0 && e.vel <= 1, `${label} : vélocité ${e.vel}`);
        assert.ok(e.intervals.length >= 1 && e.intervals.every(Number.isInteger), label);
        e.intervals.forEach(p => assert.ok(p + off >= -26 && p + off <= 31, `${label} : hauteur réelle ${p + off}`));
        assert.equal(e.noteVels.length, e.intervals.length);
        assert.equal(e.opt, undefined, 'champ de travail retiré');
    });
}

describe('rythmes par époque : catalogue', () => {
    test('huit rythmes, reconnus par classicEraGroove, joués par l\'orchestre Classique seulement', () => {
        assert.equal(E.CLASSIC_ERA_GROOVES.length, 8);
        E.CLASSIC_ERA_GROOVES.forEach(g => {
            assert.equal(E.classicEraGroove(g), g);
            assert.equal(C.bandEffectiveGroove('classic', g), g);
            assert.equal(C.bandEffectiveGroove('guitar', g), null);
            assert.ok(C.bandEntryFor('classic', g), g);
            assert.ok(C.BAND_GROOVE_LABELS[g], g);
        });
        assert.equal(E.classicEraGroove('c-baroque'), null);
        assert.equal(E.classicEraGroove(null), null);
    });
    test('chaque style de grille propose l\'orchestre Classique et impose son écriture', () => {
        STYLES.forEach(st => {
            assert.equal(M.bandStyleFor(st), 'classic', st);
            assert.equal(M.grooveHintFor(st), GROOVE_OF[st], st);
            assert.ok(M.tempoMeterFor(st), st);
        });
        assert.equal(M.tempoMeterFor('chaconne').meter, '3/4');
        assert.equal(M.tempoMeterFor('gymnopedie').meter, '3/4');
    });
    test('choisir la formation Classique garde l\'écriture d\'époque ; une autre formation l\'efface', () => {
        assert.equal(C.bandGrooveAfterPlainChoice('c-nocturne', 'classic'), 'c-nocturne');
        assert.equal(C.bandGrooveAfterPlainChoice('c-nocturne', 'guitar'), null);
        assert.equal(C.bandGrooveAfterPlainChoice('c-minimal', 'swing'), null);
    });
});

describe('phrases', () => {
    test('sans rythme d\'époque, aucun champ ajouté (le jeu Classique d\'origine est inchangé)', () => {
        const a = classicPhraseExtras(100, rngOf(4), null, 0, null);
        const b = classicPhraseExtras(100, rngOf(4), null, 0, 'c-baroque');
        assert.equal(a.cEra, undefined); assert.equal(b.cEra, undefined);
        assert.deepEqual(E.classicEraPhraseExtras('c-baroque', 100, rngOf(1), null, 0), {});
    });
    test('déterministe pour une même graine', () => {
        E.CLASSIC_ERA_GROOVES.forEach(g => assert.deepEqual(E.classicEraPhraseExtras(g, 80, rngOf(9), null, 3), E.classicEraPhraseExtras(g, 80, rngOf(9), null, 3)));
    });
    test('chaconne : les variations se suivent par énoncé de huit mesures (deux phrases)', () => {
        let prev = null;
        const seen = [];
        for (let k = 0; k < 8; k++) { const p = E.classicEraPhraseExtras('c-chaconne', 72, rngOf(k + 1), prev, k); seen.push(p.ceVar); prev = p; }
        assert.deepEqual(seen.slice(0, 6), ['sarabande', 'sarabande', 'eighths', 'eighths', 'dotted', 'dotted']);
    });
    test('minimalisme : l\'ostinato tient deux phrases', () => {
        const a = E.classicEraPhraseExtras('c-minimal', 120, rngOf(3), null, 0);
        const b = E.classicEraPhraseExtras('c-minimal', 120, rngOf(8), a, 1);
        assert.deepEqual([b.ceFam, b.ceP, b.ceSize], [a.ceFam, a.ceP, a.ceSize]);
    });
});

describe('plans de mesure', () => {
    const chords = [step(0, 'majTriad'), step(9, 'minTriad'), step(7, '7'), step(5, 'maj9'), step(2, 'm7b5'), step(1, 'dim7'), step(0, 'x:M:P:-:9'), step(4, 'majTriad', { bassRootIndex: 8 })];
    for (const g of E.CLASSIC_ERA_GROOVES) {
        test(`${g} : 2, 3 et 4 temps, binaire et composé, mesures à deux accords, transposition`, () => {
            for (const [bpb, tern] of [[4, false], [3, false], [2, false], [4, true], [2, true], [3, true]]) {
                for (let k = 0; k < chords.length; k++) {
                    for (const off of [0, -2, -9]) {
                        const ph = phrase(g, k, 10 + k);
                        const i = k % 4;
                        const half = k % 3 === 2 ? [chords[k], chords[(k + 1) % chords.length]] : null;
                        const plan = E.buildClassicEraPlan(env({ transOffset: off, splitBeat: bpb === 2 ? 1 : 2 }), bpb, tern, chords[k], chords[(k + 1) % chords.length], true, half, ph, i, 4, i === 3, k);
                        checkPlan(plan, bpb, `${g} ${bpb}${tern ? 't' : ''} ${k}`, off);
                    }
                }
            }
        });
    }
    test('l\'orchestre Classique en 4/4 délègue à l\'écriture d\'époque', () => {
        const ph = phrase('c-nocturne', 1, 5);
        const a = buildClassicPlan(env({ bpm: 58 }), chords[0], chords[1], true, null, ph, 1, 4, false, 1);
        const ph2 = phrase('c-nocturne', 1, 5);
        const b = E.buildClassicEraPlan(env({ bpm: 58 }), 4, false, chords[0], chords[1], true, null, ph2, 1, 4, false, 1);
        assert.deepEqual(a, b);
    });
    test('curseur « Densité » : moins de notes à 0, plus à 1 (nocturne, minimalisme, chaconne)', () => {
        for (const g of ['c-nocturne', 'c-minimal', 'c-renaissance']) {
            const count = (d) => {
                let n = 0;
                for (let k = 0; k < 12; k++) n += E.buildClassicEraPlan(env({ density: d, bpm: 66 }), 4, false, chords[k % 4], chords[(k + 1) % 4], true, null, phrase(g, k, 30 + k), k % 4, 4, false, k).piano.length;
                return n;
            };
            const lo = count(0), mid = count(0.5), hi = count(1);
            assert.ok(lo < mid, `${g} : ${lo} < ${mid}`);
            assert.ok(hi > mid, `${g} : ${hi} > ${mid}`);
        }
    });
    test('nocturne : la main gauche commence par la basse de l\'accord, la mélodie est au-dessus', () => {
        const plan = E.buildClassicEraPlan(env({ bpm: 58 }), 4, false, step(0, 'majTriad'), step(9, 'minTriad'), true, null, phrase('c-nocturne', 0, 2), 0, 4, false, 0);
        const first = plan.piano[0];
        assert.equal(first.pos, 0);
        const lowest = Math.min(...plan.piano.map(e => e.intervals[0]));
        assert.equal(((lowest % 12) + 12) % 12, 0, 'basse = do');
        assert.ok(Math.max(...plan.piano.map(e => e.intervals[e.intervals.length - 1])) >= 12, 'mélodie dans l\'aigu');
    });
    test('accord sur basse : la basse jouée est la basse choisie', () => {
        for (const g of E.CLASSIC_ERA_GROOVES) {
            const plan = E.buildClassicEraPlan(env(), 4, false, step(0, 'majTriad', { bassRootIndex: 4 }), null, true, null, phrase(g, 1, 3), 1, 4, false, 1);
            const lowest = Math.min(...plan.piano.map(e => e.intervals[0]));
            assert.equal(((lowest % 12) + 12) % 12, 4, g);
        }
    });
    test('Satie : première phrase sans mélodie (main gauche seule), puis mélodie', () => {
        const run = (index) => {
            const ph = phrase('c-satie', index, 7);
            let hi = -99;
            for (let k = 0; k < 3; k++) E.buildClassicEraPlan(env(), 3, false, step(0, 'maj7'), step(5, 'maj7'), true, null, ph, k, 4, false, k).piano.forEach(e => { hi = Math.max(hi, e.intervals[e.intervals.length - 1]); });
            return hi;
        };
        assert.ok(run(1) > run(0), 'la mélodie monte au-dessus de l\'accompagnement');
    });
});

describe('styles de grille par époque', () => {
    const build = (st, q, R = null, key = 0) => buildStyleTemplate(st, { keyRoot: key, mainQuality: q, R, findChordObj });
    test('majeur ou mineur selon la qualité choisie : la grille commence sur la tonique', () => {
        STYLES.forEach(st => {
            const maj = build(st, 'ionian'), min = build(st, 'aeolian'), dor = build(st, 'dorian');
            assert.equal(maj[0].r, 0, st); assert.equal(min[0].r, 0, st);
            assert.equal(G.chordFamily(maj[0].c), 'maj', st);
            assert.equal(G.chordFamily(min[0].c), 'min', st);
            assert.deepEqual(dor.map(x => x.c), min.map(x => x.c), `${st} : dorien = version mineure`);
        });
    });
    test('mesures : 16 (32 pour la basse obstinée) ; la forme de référence finit sur la tonique', () => {
        STYLES.forEach(st => ['ionian', 'aeolian'].forEach(q => {
            const t = build(st, q);
            const bars = t.reduce((s, x) => s + x.m, 0);
            assert.equal(bars, st === 'chaconne' ? 32 : 16, `${st} ${q}`);
            if (st !== 'minimalisme') assert.equal(t[t.length - 1].r, 0, `${st} ${q} : fin sur la tonique`);
        }));
    });
    test('Renaissance : triades seulement, tierce picarde en mineur', () => {
        const t = build('renaissance', 'aeolian');
        t.forEach(x => assert.ok(['majTriad', 'minTriad'].includes(x.c), x.c));
        assert.equal(t[t.length - 1].c, 'majTriad');
    });
    test('basse obstinée : le dernier énoncé reprend la basse du premier (sauf la cadence finale)', () => {
        for (let seed = 1; seed <= 10; seed++) {
            const t = build('chaconne', seed % 2 ? 'aeolian' : 'ionian', rngOf(seed));
            const bass = [];
            t.forEach(x => { for (let q = 0; q < x.m; q++) bass.push(Number.isInteger(x.bassRootIndex) ? x.bassRootIndex : x.r); });
            const n = t.some(x => x.section === 'A4') ? 4 : 2;
            const L = bass.length / n;
            for (let k = 0; k < L - 2; k++) assert.equal(bass[(n - 1) * L + k], bass[k], `graine ${seed}, mesure ${k + 1}`);
        }
    });
    test('fin libre : aucune dominante ajoutée devant la tonique finale (impressionnisme, Satie, minimalisme, Renaissance)', () => {
        ['impressionnisme', 'gymnopedie', 'minimalisme', 'renaissance'].forEach(st => {
            assert.ok(G.styleFreeEnding(st), st);
            for (let v = 1; v <= 12; v++) {
                const ctx = { findChordObj, freeEnding: true, generationVariant: v, seedBase: 77, recentGrids: [] };
                const canon = G.withResolvedEnding(ctx, build(st, v % 2 ? 'ionian' : 'aeolian'));
                const out = G.renewTemplate(ctx, st, (R) => build(st, v % 2 ? 'ionian' : 'aeolian', R), 0, canon);
                assert.ok(out && out.length, st);
                const last = out[out.length - 1];
                assert.equal(last.r, 0, `${st} : tonique finale`);
                const prev = out[out.length - 2];
                if (st !== 'renaissance') assert.ok(!(prev.split && prev._dom), st);
                out.forEach(x => {
                    assert.ok(T.lookupChord(x.c) && T.scalesDb[x.s], `${st} ${x.c} ${x.s}`);
                    if (st === 'renaissance') assert.ok(['majTriad', 'minTriad'].includes(x.c), `Renaissance : ${x.c}`);
                });
            }
        });
        assert.ok(!G.styleFreeEnding('nocturne') && !G.styleFreeEnding('swing'));
    });
    test('« Générer » renouvelle chaque style (grilles valides, différentes de la forme de référence)', () => {
        STYLES.forEach(st => {
            const ctx = { findChordObj, freeEnding: G.styleFreeEnding(st), generationVariant: 1, seedBase: 1234, recentGrids: [] };
            const canon = G.withResolvedEnding(ctx, build(st, 'ionian'));
            let differs = 0;
            for (let v = 1; v <= 6; v++) {
                const out = G.renewTemplate({ ...ctx, generationVariant: v, seedBase: 1234 + v }, st, (R) => build(st, 'ionian', R), 0, canon);
                assert.ok(out && out.length, st);
                const sig = (x) => x.map(y => `${y.r}${y.c}${y.m}`).join();
                if (sig(out) !== sig(G.normalizeGeneratedGrid(canon, st))) differs++;
            }
            assert.ok(differs >= 3, `${st} : ${differs} propositions différentes sur 6`);
        });
    });
    test('la variation de secours ne touche jamais un style par époque', () => {
        const t = build('nocturne', 'ionian');
        const out = G.createStyleVariation({ findChordObj, generationVariant: 3, seedBase: 1 }, t, 'nocturne', 0);
        assert.deepEqual(out, t.map(x => ({ ...x })));
    });
});
