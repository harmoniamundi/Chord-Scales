// Tests de l'orchestre Mexique (band/mexico-plan.js) : son jarocho, huapango norteño, polka norteña, bolero (trío), ranchera ;
// et de leurs styles de grille. Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const X = require('./mexico-plan.js');
const { drumSpec } = require('../audio/drum-synths.js');
const { latBassTones } = require('./band-helpers.js');
const { BAND_FORMATIONS, BAND_MENU, bandNativeInstrument, bandGrooveSelect, bandGrooveAfterPlainChoice, bandDisplayName } = require('./band-catalog.js');
const { STYLE_REGISTRY } = require('../styles/style-registry.js');
const { buildStyleTemplate } = require('../styles/style-builders.js');
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
const mkEnv = (over = {}) => ({ transOffset: 0, splitBeat: 1, density: 0.5, measureInStep: 0, state: { mxState: null, bandLastFill: false }, findChordObj, ...over });
const C = { rootIndex: 0, chordId: 'majTriad', scaleId: 'ionian' };
const F = { rootIndex: 5, chordId: 'majTriad', scaleId: 'lydian' };
const G7 = { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' };
const Am = { rootIndex: 9, chordId: 'm7', scaleId: 'aeolian' };
const phrase = (seed, extra = {}) => ({ rng: seeded(seed), index: seed % 5, ...extra });
// Mesures où chaque rythme se joue tel quel : [bpb, ternaire]
const METERS = { 'mx-jarocho': [2, true], 'mx-huapango': [2, true], 'mx-polka': [2, false], 'mx-bolero': [4, false], 'mx-ranchera': [3, false] };
function plan(groove, { bpb, ternary, step = C, nextStep = G7, last = true, halves = null, seed = 1, i = 0, L = 4, isTurn = false, m = 0, env, ph } = {}) {
    const [b0, t0] = METERS[groove];
    const b = bpb || b0, t = ternary === undefined ? t0 : ternary;
    const e = env || mkEnv({ splitBeat: b === 3 ? 2 : b / 2 });
    return X.buildMexicoPlan(e, groove, b, t, step, nextStep, last, halves, ph || phrase(seed), i, L, isTurn, m);
}
const near = (a, b, eps = 0.03) => Math.abs(a - b) < eps;
const ALL_METERS = [[2, false], [3, false], [4, false], [2, true], [3, true], [4, true]];

describe('rythme joué selon la mesure', () => {
    test('chaque rythme garde sa formation et prend la forme de la mesure', () => {
        assert.equal(X.mexicoGroove('mx-jarocho', 2, true), 'mx-jarocho');
        assert.equal(X.mexicoGroove('mx-jarocho', 3, false), 'mx-jarocho');   // sesquiáltera : 3/4 aussi
        assert.equal(X.mexicoGroove('mx-jarocho', 4, false), 'mx-bolero');
        assert.equal(X.mexicoGroove('mx-jarocho', 2, false), 'mx-ranchera');
        assert.equal(X.mexicoGroove('mx-polka', 2, true), 'mx-huapango');
        assert.equal(X.mexicoGroove('mx-huapango', 4, false), 'mx-polka');
        assert.equal(X.mexicoGroove('mx-bolero', 3, false), 'mx-ranchera');
        ALL_METERS.forEach(([b, t]) => assert.equal(X.mexicoGroove('mx-ranchera', b, t), 'mx-ranchera'));
        // Auto
        assert.equal(X.mexicoGroove(null, 2, true), 'mx-jarocho');
        assert.equal(X.mexicoGroove('', 4, false), 'mx-bolero');
        assert.equal(X.mexicoGroove(null, 3, false), 'mx-ranchera');
        assert.equal(X.mexicoGroove(null, 2, false), 'mx-ranchera');
        // norteño reste norteño, guitares restent guitares
        for (const g of X.MEXICO_GROOVES) ALL_METERS.forEach(([b, t]) => assert.equal(!!X.MX_NORTENO[X.mexicoGroove(g, b, t)], !!X.MX_NORTENO[g], `${g} ${b} ${t}`));
    });
});

describe('les cinq rythmes : plans bien formés', () => {
    test('positions, durées, vélocités et instruments valides (toutes mesures, Ut / Si♭ / Mi♭, mesures coupées, fins de phrase)', () => {
        for (const g of X.MEXICO_GROOVES) for (const [bpb, tern] of ALL_METERS) for (const off of [0, -2, -9]) for (let s = 1; s < 10; s++) {
            const env = mkEnv({ transOffset: off, splitBeat: bpb === 3 ? 2 : bpb / 2, density: (s % 5) / 4, state: { mxState: null, bandLastFill: s % 2 === 0 } });
            const ph = phrase(s);
            for (let m = 0; m < 4; m++) {
                const out = X.buildMexicoPlan(env, g, bpb, tern, m % 2 ? G7 : C, m % 2 ? Am : G7, true, s % 4 === 0 ? [C, F] : null, ph, m, 4, m === 3, m);
                assert.equal(out.mexico, true);
                for (const arr of [out.piano, out.bass, out.drums]) for (const e of arr) {
                    assert.ok(e.pos >= 0 && e.pos < bpb, `${g} ${bpb} : position ${e.pos}`);
                    assert.ok(e.vel > 0 && e.vel <= 1, `${g} : vélocité ${e.vel}`);
                    if (e.dur !== undefined) assert.ok(e.dur > 0 && e.dur < bpb + 2, `${g} : durée ${e.dur}`);
                }
                out.piano.forEach(e => {
                    assert.ok(['acc', 'gtr'].includes(e.inst), `${g} : instrument ${e.inst}`);
                    e.intervals.forEach(n => assert.ok(Number.isFinite(n)));
                    if (e.inst === 'acc') assert.ok(['lin', 'run', 'orn', 'pad'].includes(e.art), `${g} : articulation ${e.art}`);
                });
                out.bass.forEach(b => assert.ok(Number.isFinite(b.abs)));
            }
        }
    });
    test('chaque percussion a un son (drumSpec) ; la ranchera n\'a pas de percussions', () => {
        for (const g of X.MEXICO_GROOVES) for (let s = 1; s < 12; s++) {
            const out = plan(g, { seed: s, isTurn: true, i: 3 });
            out.drums.forEach(d => assert.ok(drumSpec(d), `${g} : ${d.drum}`));
            if (g === 'mx-ranchera') assert.equal(out.drums.length, 0);
        }
    });
    test('aucun cuivre : seulement l\'accordéon (norteño) et les cordes pincées', () => {
        for (const g of X.MEXICO_GROOVES) for (let s = 1; s < 10; s++) {
            const out = plan(g, { seed: s });
            const insts = new Set(out.piano.map(e => e.inst));
            if (X.MX_NORTENO[g]) assert.ok(out.piano.some(e => e.inst === 'gtr'), `${g} : bajo sexto`);
            else assert.ok(!insts.has('acc'), `${g} : pas d'accordéon`);
            assert.ok(!out.brass && !out.piazzolla);
        }
    });
    test('la basse joue la basse de l\'accord sur le 1', () => {
        for (const g of X.MEXICO_GROOVES) {
            const out = plan(g, { step: G7, nextStep: C });
            const first = out.bass.find(b => near(b.pos, 0, 0.01));
            assert.ok(first, `${g} : basse sur le 1`);
            assert.equal(first.abs, latBassTones(mkEnv(), G7).root);
        }
    });
    test('mesure coupée : la basse du second accord est jouée à la coupure', () => {
        for (const g of X.MEXICO_GROOVES) {
            const [bpb] = METERS[g];
            const split = bpb === 3 ? 2 : bpb / 2;
            const out = plan(g, { halves: [C, F], env: mkEnv({ splitBeat: split }) });
            const b = out.bass.find(x => near(x.pos, split, 0.05));
            assert.ok(b, `${g} : basse à la coupure`);
            assert.equal(((b.abs % 12) + 12) % 12, 5);
        }
    });
});

describe('écriture de chaque rythme', () => {
    test('son jarocho : rasgueo de jarana sur les six croches, zapateado sur la tarima, sesquiáltera', () => {
        const out = plan('mx-jarocho', { seed: 3, i: 1, ph: phrase(3, { index: 2 }) });
        const strums = out.piano.filter(e => e.inst === 'gtr' && e.intervals.length >= 3);
        assert.ok(strums.length >= 5, 'rasgueo continu');
        assert.ok(strums.some(e => e.dir < 0), 'coups montants');
        assert.ok(out.drums.some(d => d.drum === 'cajonb') && out.drums.some(d => d.drum === 'cajont'), 'talon et pointe');
        // sur une phrase, les deux figures (6/8 et 3/4) alternent
        const seqs = X.MX_JARANA_SEQ.map(s => s.some(f => f === 'tres' || f === 'tresap') && s.some(f => f === 'seis' || f === 'apagon'));
        assert.ok(seqs.every(Boolean));
    });
    test('huapango : bajo sexto (basse + accords) et accordéon qui chante en tierces', () => {
        let thirds = 0, acc = 0;
        for (let s = 1; s < 30; s++) {
            const ph = phrase(s, { index: 1 });
            for (let i = 0; i < 4; i++) {
                const out = plan('mx-huapango', { seed: s, i, ph, isTurn: i === 3, m: i });
                const a = out.piano.filter(e => e.inst === 'acc' && e.art !== 'pad' && e.art !== 'orn');
                acc += a.length;
                thirds += a.filter(e => e.intervals.length === 2 && [3, 4].includes(e.intervals[1] - e.intervals[0])).length;
                assert.ok(out.piano.some(e => e.inst === 'gtr' && e.intervals.length === 1 && near(e.pos, 0, 0.01)), 'basse du bajo sexto sur le 1');
            }
        }
        assert.ok(acc > 100, 'l\'accordéon chante');
        assert.ok(thirds / acc > 0.3, `tierces : ${thirds}/${acc}`);
    });
    test('polka : grosse caisse sur les temps, caisse claire et bajo sexto sur les contretemps', () => {
        const out = plan('mx-polka', { seed: 5, last: false });
        [0, 1].forEach(b => assert.ok(out.drums.some(d => d.drum === 'kick' && near(d.pos, b)), `grosse caisse ${b}`));
        [0.5, 1.5].forEach(p => {
            assert.ok(out.drums.some(d => d.drum === 'snare' && near(d.pos, p)), `caisse claire ${p}`);
            assert.ok(out.piano.some(e => e.inst === 'gtr' && e.intervals.length >= 3 && near(e.pos, p)), `bajo sexto ${p}`);
        });
        const bass = out.bass.map(b => b.abs);
        const T0 = latBassTones(mkEnv(), C);
        assert.deepEqual(bass.slice(0, 2), [T0.root, T0.fifth], 'tónica - quinta');
    });
    test('polka : bajeo vers l\'accord suivant (notes conjointes du bajo sexto qui mènent à sa basse)', () => {
        let seen = 0;
        for (let s = 1; s < 40; s++) {
            const out = plan('mx-polka', { seed: s, isTurn: true, i: 3, ph: phrase(s, { index: 3 }) });
            const run = out.piano.filter(e => e.inst === 'gtr' && e.intervals.length === 1 && e.pos >= 1 - 1e-6);
            if (run.length >= 2) {
                seen++;
                const target = latBassTones(mkEnv(), G7).root;
                assert.ok(Math.abs(run[run.length - 1].intervals[0] - target) <= 2, 'le bajeo arrive à côté de la basse suivante');
            }
        }
        assert.ok(seen > 5, `bajeos : ${seen}`);
    });
    test('bolero : pouce sur 1 et 3, maracas, requinto en triolets au tour de phrase', () => {
        let triplets = 0;
        for (let s = 1; s < 40; s++) {
            const ph = phrase(s, { index: 2 });
            const out = plan('mx-bolero', { seed: s, ph, i: 3, isTurn: true, last: true });
            assert.ok(out.piano.some(e => e.intervals.length === 1 && near(e.pos, 0, 0.01)), 'pouce sur le 1');
            if (ph.mex.perc) assert.ok(out.drums.some(d => d.drum === 'shaker'), 'maracas');
            const lead = out.piano.filter(e => e.pos > 0 && Math.abs((e.pos * 3) - Math.round(e.pos * 3)) < 0.02 && Math.abs(e.pos * 2 - Math.round(e.pos * 2)) > 0.1);
            if (lead.length >= 2) triplets++;
        }
        assert.ok(triplets > 5, `triolets : ${triplets}`);
    });
    test('ranchera : guitarrón sur le 1, vihuela sur les temps 2 et 3 (vals), alternance fondamentale / quinte', () => {
        const T0 = latBassTones(mkEnv(), C);
        const a = plan('mx-ranchera', { seed: 2, last: false, env: mkEnv({ measureInStep: 0, splitBeat: 2 }) });
        const b = plan('mx-ranchera', { seed: 2, last: false, env: mkEnv({ measureInStep: 1, splitBeat: 2 }) });
        assert.equal(a.bass[0].abs, T0.root);
        assert.equal(b.bass[0].abs, T0.fifth);
        [1, 2].forEach(p => assert.ok(a.piano.some(e => e.intervals.length >= 3 && near(e.pos, p)), `vihuela ${p}`));
        assert.ok(!a.piano.some(e => e.intervals.length >= 3 && near(e.pos, 0)), 'pas d\'accord sur le 1 : le guitarrón est seul');
        // polka ranchera (2/4) et bolero ranchero (4/4)
        const p = plan('mx-ranchera', { bpb: 2, ternary: false, last: false });
        assert.deepEqual(p.bass.map(x => x.pos), [0, 1]);
        const r = plan('mx-ranchera', { bpb: 4, ternary: false, last: false });
        assert.deepEqual(r.bass.map(x => x.pos), [0, 2]);
    });
    test('densité : la voix chantée a moins de notes à 0, plus à 1', () => {
        const count = (d) => {
            let n = 0;
            for (let s = 1; s < 25; s++) {
                const env = mkEnv({ density: d });
                const ph = phrase(s);
                for (let i = 0; i < 4; i++) n += X.buildMexicoPlan(env, 'mx-huapango', 2, true, C, G7, true, null, ph, i, 4, i === 3, i).piano.filter(e => e.inst === 'acc' && e.art !== 'pad').length;
            }
            return n;
        };
        const lo = count(0), mid = count(0.5), hi = count(1);
        assert.ok(lo < mid && mid < hi, `${lo} < ${mid} < ${hi}`);
    });
    test('même graine, même musique', () => {
        for (const g of X.MEXICO_GROOVES) {
            const a = plan(g, { seed: 9 }), b = plan(g, { seed: 9 });
            assert.deepEqual(a, b);
        }
    });
});

describe('catalogue et styles de grille', () => {
    test('formation Mexique : ses cinq rythmes, son nom, ses instruments', () => {
        assert.deepEqual(BAND_FORMATIONS.mexico.grooves, X.MEXICO_GROOVES);
        assert.equal(bandDisplayName('mexico', null), 'Mexique');
        assert.equal(bandDisplayName('mexico', 'mx-jarocho'), 'Son jarocho');
        assert.equal(bandNativeInstrument('mexico', 'mx-polka', 'harmony'), 'accordion');
        assert.equal(bandNativeInstrument('mexico', 'mx-polka', 'bass'), 'electric');
        assert.equal(bandNativeInstrument('mexico', 'mx-bolero', 'harmony'), 'guitar');
        assert.equal(bandNativeInstrument('mexico', null, 'bass'), 'upright');
        const sel = bandGrooveSelect('mexico', 'mx-huapango');
        assert.equal(sel.value, 'mx-huapango');
        assert.equal(sel.options.length, 6);
        assert.equal(bandGrooveAfterPlainChoice('mx-polka', 'mexico'), null);
    });
    test('chaque style mexicain : orchestre Mexique, son rythme, une entrée du menu Orchestre avec son tempo', () => {
        const styles = { sonjarocho: 'mx-jarocho', huapango: 'mx-huapango', polkanortena: 'mx-polka', bolerotrio: 'mx-bolero', ranchera: 'mx-ranchera' };
        Object.entries(styles).forEach(([k, g]) => {
            const e = STYLE_REGISTRY[k];
            assert.ok(e, k);
            assert.equal(e.band, 'mexico');
            assert.equal(e.groove, g);
            assert.equal(X.mexicoGroove(g, ...({ '6/8': [2, true], '3/4': [3, false], '2/4': [2, false], '4/4': [4, false] })[e.meter]), g, `${k} : rythme joué tel quel dans sa mesure`);
            const menu = BAND_MENU.find(x => x.value === k);
            assert.ok(menu && menu.band === 'mexico' && menu.groove === g && menu.tempo, `${k} : entrée du menu`);
        });
    });
    test('grilles : longueur, triades et dominantes des styles populaires, accords connus, en majeur et en mineur', () => {
        for (const k of ['sonjarocho', 'huapango', 'polkanortena', 'bolerotrio', 'ranchera']) for (const q of ['ionian', 'aeolian']) for (let s = 0; s < 12; s++) {
            const R = s ? seeded(s * 13 + 1) : null;
            const tpl = buildStyleTemplate(k, { keyRoot: s % 12, mainQuality: q, R, findChordObj });
            const bars = tpl.reduce((a, x) => a + x.m, 0);
            assert.equal(bars, STYLE_REGISTRY[k].bars || 16, `${k} ${q} : ${bars} mesures`);
            tpl.forEach(x => {
                [x, x.split].filter(Boolean).forEach(y => {
                    assert.ok(T.lookupChord(y.c), `${k} : accord ${y.c}`);
                    assert.ok(T.scalesDb[y.s], `${k} : gamme ${y.s}`);
                    if (k !== 'bolerotrio') assert.ok(['majTriad', 'minTriad', '7', '7b9'].includes(y.c), `${k} : ${y.c}`);
                });
            });
            // la grille commence sur la tonique et se termine sur la tonique (ou sa dominante, qui y ramène en boucle)
            assert.equal(tpl[0].r, s % 12, `${k} : départ sur la tonique`);
        }
    });
});
