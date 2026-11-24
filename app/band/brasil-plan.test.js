// Tests des rythmes brésiliens de l'orchestre Brasil (band/brasil-plan.js) : choro, partido alto, baião, samba-canção,
// samba-jazz ; et de leurs styles de grille. Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const B = require('./brasil-plan.js');
const { drumSpec } = require('../audio/drum-synths.js');
const { latBassTones } = require('./band-helpers.js');
const { BAND_FORMATIONS, BAND_MENU, bandNativeInstrument, bandGrooveSelect, bandGrooveAfterPlainChoice } = require('./band-catalog.js');
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
const mkEnv = (over = {}) => ({ transOffset: 0, splitBeat: 1, state: { brState: null, bandLastFill: false }, findChordObj, ...over });
const C6 = { rootIndex: 0, chordId: '6', scaleId: 'ionian' };
const A7 = { rootIndex: 9, chordId: '7b9', scaleId: 'phrygianDominant' };
const Dm = { rootIndex: 2, chordId: 'm7', scaleId: 'dorian' };
const G7 = { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' };
const phrase = (seed, extra = {}) => ({ rng: seeded(seed), intensity: 0.6, fill: false, fillKind: 0, ...extra });
function plan(groove, { bpb = 2, step = C6, nextStep = A7, last = true, halves = null, seed = 1, i = 0, L = 4, isTurn = false, m = 0, env, ph } = {}) {
    const e = env || mkEnv({ splitBeat: bpb / 2 });
    const p = ph || phrase(seed);
    return buildPlan(e, groove, bpb, step, nextStep, last, halves, p, i, L, isTurn, m);
}
const buildPlan = (...a) => B.buildBrasilPlan(...a);
const near = (a, b, eps = 0.07) => Math.abs(a - b) < eps;

describe('les cinq rythmes : plans bien formés', () => {
    test('positions dans la mesure, durées et vélocités valides (2/4 et 4/4, Ut / Si♭ / Mi♭, mesures coupées, viradas)', () => {
        for (const g of B.BRASIL_GROOVES) for (const bpb of [2, 4]) for (const off of [0, -2, -9]) for (let s = 1; s < 25; s++) {
            const env = mkEnv({ transOffset: off, splitBeat: bpb / 2, state: { brState: null, bandLastFill: s % 2 === 0 } });
            const ph = phrase(s, { intensity: (s % 10) / 10, fill: s % 3 === 0 });
            for (let m = 0; m < 4; m++) {
                const out = buildPlan(env, g, bpb, m % 2 ? A7 : C6, m % 2 ? Dm : A7, true, s % 5 === 0 ? [C6, Dm] : null, ph, m, 4, m === 3, m);
                for (const arr of [out.piano, out.bass, out.drums]) for (const e of arr) {
                    assert.ok(e.pos >= 0 && e.pos < bpb, `${g} ${bpb} : position ${e.pos}`);
                    assert.ok(e.vel > 0 && e.vel <= 1, `${g} : vélocité ${e.vel}`);
                    if (e.dur !== undefined) assert.ok(e.dur > 0, `${g} : durée`);
                }
                out.piano.forEach(e => e.intervals.forEach(n => assert.ok(Number.isFinite(n))));
            }
        }
    });
    test('chaque percussion a un son (drumSpec)', () => {
        for (const g of B.BRASIL_GROOVES) for (let s = 1; s < 12; s++) {
            const out = plan(g, { bpb: B.BR_CUT[g] ? 4 : 2, seed: s, isTurn: true, ph: phrase(s, { fill: true, intensity: 0.9 }) });
            out.drums.forEach(d => assert.ok(drumSpec(d), `${g} : ${d.drum}`));
        }
    });
    test('instrument de chaque rythme', () => {
        assert.equal(plan('br-choro').classicalGuitar, true);
        assert.equal(plan('br-partido').classicalGuitar, true);
        assert.equal(plan('br-cancao', { bpb: 4 }).classicalGuitar, true);
        assert.equal(plan('br-baiao').accordion, true);
        const sj = plan('br-sambajazz', { bpb: 4 });
        assert.ok(!sj.guitar && !sj.classicalGuitar && !sj.accordion, 'samba-jazz : piano');
    });
    test('choro et partido alto : pas de contrebasse, le violão 7 cordas tient la basse dans son registre', () => {
        for (const g of ['br-choro', 'br-partido']) for (let s = 1; s < 20; s++) {
            const out = plan(g, { seed: s, isTurn: s % 2 === 0 });
            assert.equal(out.bass.length, 0);
            const seven = out.piano.filter(e => e.who === '7c');
            assert.ok(seven.length >= 2, `${g} : pouce sur les temps`);
            seven.forEach(e => { assert.equal(e.intervals.length, 1); assert.ok(e.intervals[0] >= -13 && e.intervals[0] <= 4, `${g} : ${e.intervals[0]}`); });
            assert.ok(seven.some(e => near(e.pos, 0, 0.01)), 'fondamentale sur le 1');
        }
    });
    test('samba-canção, samba-jazz, baião : la contrebasse joue la fondamentale sur le 1', () => {
        for (const [g, bpb] of [['br-cancao', 4], ['br-sambajazz', 4], ['br-baiao', 2]]) {
            const out = plan(g, { bpb, step: G7, nextStep: C6 });
            const first = out.bass.find(b => near(b.pos, 0, 0.01));
            assert.ok(first, g);
            assert.equal(first.abs, latBassTones(mkEnv(), G7).root);
        }
    });
});

describe('figures du genre', () => {
    test('partido alto : le cavaquinho attaque la figure x . . x . . x . | . x . . x . x .', () => {
        const ph = phrase(3);
        const env = mkEnv();
        const a = buildPlan(env, 'br-partido', 2, C6, C6, false, null, ph, 0, 4, false, 0);
        const b = buildPlan(env, 'br-partido', 2, C6, C6, false, null, ph, 1, 4, false, 1);
        const chops = (out) => out.piano.filter(e => e.who === 'cav' && !e.mute).map(e => Math.round(e.pos * 4));
        const sides = ph.br.flip ? [b, a] : [a, b];
        assert.deepEqual(chops(sides[0]), B.BR_PARTIDO.A);
        assert.deepEqual(chops(sides[1]), B.BR_PARTIDO.B);
    });
    test('baião : zabumba sur le 1 et sur la 4e double croche, triangle à chaque double croche (ouvert sur le « et »)', () => {
        const out = plan('br-baiao', { nextStep: C6, last: false });
        const zab = out.drums.filter(d => d.drum === 'zab').map(d => d.pos);
        assert.ok(zab.some(p => near(p, 0, 0.01)) && zab.some(p => near(p, 0.75)));
        const tri = out.drums.filter(d => d.drum === 'tri' || d.drum === 'trim');
        assert.equal(tri.length, 8);
        assert.ok(out.drums.filter(d => d.drum === 'tri').some(d => near(d.pos, 0.5)));
        assert.ok(out.drums.some(d => d.drum === 'bacal' && near(d.pos, 1)), 'bacalhau appuyé sur le 2');
    });
    test('baião : la sanfona annonce le changement par une phrase en tierces qui finit sur la tierce du nouvel accord', () => {
        let seen = false;
        for (let s = 1; s < 30 && !seen; s++) {
            const out = plan('br-baiao', { seed: s, isTurn: true, step: C6, nextStep: G7, ph: phrase(s, { intensity: 1 }) });
            const mel = out.piano.filter(e => e.art === 'mel');
            if (!mel.length) continue;
            seen = true;
            mel.forEach(e => { assert.equal(e.intervals.length, 2); const d = e.intervals[1] - e.intervals[0]; assert.ok(d >= 3 && d <= 4, 'tierce'); });
            const last = mel[mel.length - 1].intervals[1];
            assert.equal(((last % 12) + 12) % 12, 11, 'si, tierce de sol');
        }
        assert.ok(seen);
    });
    test('samba-jazz en 4/4 : cymbale ou charleston en croches continues, grosse caisse appuyée sur le 3', () => {
        const out = plan('br-sambajazz', { bpb: 4, nextStep: C6, step: C6, last: false });
        const cym = out.drums.filter(d => d.drum === 'ride' || d.drum === 'hat');
        assert.equal(cym.length, 8);
        const k3 = out.drums.find(d => d.drum === 'kick' && near(d.pos, 2, 0.01));
        const k1 = out.drums.find(d => d.drum === 'kick' && near(d.pos, 0, 0.01));
        assert.ok(k3 && k1 && k3.vel > k1.vel);
    });
    test('samba-jazz : le piano ne double pas la fondamentale de la contrebasse', () => {
        const out = plan('br-sambajazz', { bpb: 4, step: Dm, nextStep: Dm, last: false });
        out.piano.forEach(e => e.intervals.forEach(n => assert.notEqual(((n % 12) + 12) % 12, 2)));
    });
    test('mesure coupée : le second accord s\'entend dès qu\'il arrive', () => {
        for (const g of B.BRASIL_GROOVES) {
            const bpb = B.BR_CUT[g] ? 4 : 2;
            const out = plan(g, { bpb, halves: [C6, G7], env: mkEnv({ splitBeat: bpb / 2 }) });
            assert.ok(out.piano.some(e => Math.abs(e.pos - bpb / 2) < 0.08), g);
        }
    });
});

describe('baixarias et phrases', () => {
    test('brBaixaria : notes conjointes qui mènent à la fondamentale suivante, dans le registre du 7 cordas', () => {
        const env = mkEnv();
        for (let s = 1; s < 40; s++) {
            const notes = B.brBaixaria(env, C6, A7, 4, seeded(s));
            if (!notes.length) continue;
            const target = B.brFold7(env, latBassTones(env, A7).root);
            assert.equal(notes.length, 4);
            assert.ok(Math.abs(notes[3] - target) <= 2, 'la dernière note touche la cible');
            for (let k = 1; k < 4; k++) assert.ok(Math.abs(notes[k] - notes[k - 1]) <= 3, 'mouvement conjoint');
            notes.forEach(n => assert.ok(n >= -13 && n <= 4));
        }
    });
    test('choro : une baixaria remplit la fin de la mesure de turnaround', () => {
        let seen = 0;
        for (let s = 1; s < 30; s++) {
            const out = plan('br-choro', { seed: s, isTurn: true, ph: phrase(s, { intensity: 0.8 }) });
            const seven = out.piano.filter(e => e.who === '7c' && e.pos > 1);
            if (seven.length >= 3) seen++;
        }
        assert.ok(seen > 10, `${seen}`);
    });
});

describe('catalogue et styles de grille', () => {
    test('l\'orchestre Brasil sait jouer les cinq rythmes, chacun a son entrée de menu et son style de grille', () => {
        for (const g of B.BRASIL_GROOVES) {
            assert.ok(BAND_FORMATIONS.latin.grooves.includes(g));
            const e = BAND_MENU.find(x => x.groove === g);
            assert.ok(e && e.band === 'latin' && e.tempo);
            assert.equal(STYLE_REGISTRY[e.value].groove, g, 'style du même nom que l\'entrée de menu');
            assert.ok(bandGrooveSelect('latin', g).options.some(o => o.value === g));
            assert.equal(bandGrooveAfterPlainChoice(g, 'latin'), null);
        }
    });
    test('instruments d\'origine : sanfona au baião, piano au samba-jazz, pas de basse réglable au choro et au partido alto', () => {
        assert.equal(bandNativeInstrument('latin', 'br-baiao', 'harmony'), 'accordion');
        assert.equal(bandNativeInstrument('latin', 'br-sambajazz', 'harmony'), 'piano');
        assert.equal(bandNativeInstrument('latin', 'br-choro', 'harmony'), 'guitar');
        assert.equal(bandNativeInstrument('latin', 'br-choro', 'bass'), null);
        assert.equal(bandNativeInstrument('latin', 'br-partido', 'bass'), null);
        assert.equal(bandNativeInstrument('latin', 'br-cancao', 'bass'), 'upright');
    });
    const styles = ['choro', 'partidoalto', 'baiao', 'sambacancao', 'sambajazz'];
    test('chaque style produit 32 mesures, forme de référence comme propositions renouvelées', () => {
        for (const st of styles) for (const R of [null, seeded(7), seeded(99)]) for (const q of ['ionian', 'aeolian']) {
            const tpl = buildStyleTemplate(st, { keyRoot: 2, mainQuality: q, R, findChordObj });
            assert.equal(tpl.reduce((a, x) => a + x.m, 0), 32, `${st} ${q}`);
            tpl.forEach(x => { assert.ok(T.lookupChord(x.c), `${st} : ${x.c}`); assert.ok(T.scalesDb[x.s], `${st} : ${x.s}`); });
        }
    });
    test('mode mineur : la grille commence sur une tonique mineure', () => {
        for (const st of styles) {
            const tpl = buildStyleTemplate(st, { keyRoot: 9, mainQuality: 'aeolian', R: null, findChordObj });
            const first = tpl[0];
            assert.equal(first.r, 9, st);
            const fam = T.lookupChord(first.c).notes[1];
            assert.equal(fam, 3, `${st} : tierce mineure (${first.c})`);
        }
    });
    test('choro : dominantes secondaires et diminués de passage dans le vocabulaire', () => {
        const ids = new Set();
        for (let s = 1; s < 30; s++) buildStyleTemplate('choro', { keyRoot: 0, mainQuality: 'ionian', R: seeded(s), findChordObj }).forEach(x => ids.add(x.r + ':' + x.c));
        assert.ok(ids.has('9:7b9'), 'VI7');
        assert.ok(ids.has('1:dim7') || ids.has('6:dim7') || ids.has('3:dim7'), 'diminué de passage');
    });
});
