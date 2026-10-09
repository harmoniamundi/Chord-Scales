// Tests du choix des phrases de la bande (band/phrase-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { buildBandPhrase } = require('./phrase-plan.js');
const H = require('./band-helpers.js');
const G = require('../grid/generation.js');

const ctxFor = (style, key = '4/4', seed = 1, extra = {}) => {
    const [n, d] = key.split('/').map(Number);
    const ternary = d === 8;
    const bpb = ternary ? n / 3 : n;
    return { lib: H.patternLib(key, style), bpb, ternary, bpm: 100, isCuba: false, groove: undefined, rng: G.makeVariationRng(seed, style, 0), ...extra };
};
const STYLES = ['swing', 'pop', 'latin', 'classic', 'brass', 'balkan', 'piazzolla'];
const COMMON = ['index', 'style', 'rng', 'motif', 'second', 'varied', 'turn', 'bassMotif', 'bassAlt', 'bassTurn', 'voicing', 'density', 'feather', 'kickPattern', 'hat16', 'fill', 'fillKind'];

describe('buildBandPhrase : champs communs', () => {
    for (const style of STYLES) test(`${style} : tous les champs sont présents et bien formés`, () => {
        for (let s = 1; s <= 40; s++) {
            const ph = buildBandPhrase(ctxFor(style, '4/4', s), s, style, null);
            COMMON.forEach(k => assert.ok(k in ph, `${style}: ${k}`));
            assert.equal(ph.index, s); assert.equal(ph.style, style);
            assert.ok(Array.isArray(ph.motif) && ph.motif.length > 0);
            assert.ok(Array.isArray(ph.turn));
            assert.ok(ph.voicing === 'rootless' || ph.voicing === 'closed');
            assert.ok(ph.density >= 0.4 && ph.density < 0.95);
            assert.ok(Number.isInteger(ph.fillKind) && ph.fillKind >= 0); // pop / latin peuvent ajouter des fills
            assert.equal(typeof ph.fill, 'boolean');
        }
    });
});

describe('buildBandPhrase : motifs', () => {
    test('motif et turn viennent de la bibliothèque', () => {
        const ctx = ctxFor('swing');
        const ph = buildBandPhrase(ctx, 0, 'swing', null);
        assert.ok(ctx.lib.piano.some(c => c.hits === ph.motif));
        assert.ok(ctx.lib.turn.some(c => c.hits === ph.turn));
    });
    test('sans bibliothèque de basse : bassMotif, bassAlt et bassTurn valent null', () => {
        const ph = buildBandPhrase(ctxFor('swing'), 0, 'swing', null);
        assert.equal(ph.bassMotif, null); assert.equal(ph.bassAlt, null); assert.equal(ph.bassTurn, null);
        const pop = buildBandPhrase(ctxFor('pop'), 0, 'pop', null);
        assert.ok(Array.isArray(pop.bassMotif) && Array.isArray(pop.bassAlt));
    });
    test('kickPattern vient de lib.kicks quand il existe, sinon null', () => {
        const pop = ctxFor('pop');
        assert.ok(pop.lib.kicks.some(k => k === buildBandPhrase(pop, 0, 'pop', null).kickPattern));
        assert.equal(buildBandPhrase(ctxFor('swing'), 0, 'swing', null).kickPattern, null);
    });
    test('la phrase suivante reprend parfois le motif précédent (environ 35 %), jamais si le style change', () => {
        let kept = 0, N = 400;
        for (let s = 1; s <= N; s++) {
            const prev = buildBandPhrase(ctxFor('swing', '4/4', s * 2), 0, 'swing', null);
            const next = buildBandPhrase(ctxFor('swing', '4/4', s * 2 + 1), 1, 'swing', prev);
            if (next.motif === prev.motif) kept++;
            const other = buildBandPhrase(ctxFor('pop', '4/4', s), 1, 'pop', prev);
            assert.notEqual(other.motif, prev.motif);
        }
        assert.ok(kept / N > 0.25 && kept / N < 0.55, `reprises : ${kept / N}`);
    });
    test('les cellules variées restent dans la mesure (maxPos = bpb − 0.5)', () => {
        for (let s = 1; s <= 100; s++) {
            const ph = buildBandPhrase(ctxFor('swing', '3/4', s), 0, 'swing', null);
            [ph.second, ph.varied].forEach(c => c.forEach(h => assert.ok(h[0] <= 3.0 + 1e-9 || ph.motif.some(m => m[0] === h[0]))));
        }
    });
    test('déterministe pour une même graine', () => {
        const a = buildBandPhrase(ctxFor('latin', '4/4', 5), 2, 'latin', null);
        const b = buildBandPhrase(ctxFor('latin', '4/4', 5), 2, 'latin', null);
        const strip = (p) => JSON.parse(JSON.stringify({ ...p, rng: undefined }));
        assert.deepEqual(strip(a), strip(b));
    });
});

describe('buildBandPhrase : extras par style', () => {
    test('pop, classic, brass, balkan, piazzolla : champs spécifiques ajoutés', () => {
        const pop = buildBandPhrase(ctxFor('pop'), 0, 'pop', null);
        ['intensity', 'pianoStyle', 'bassStyle', 'feel', 'halfTime'].forEach(k => assert.ok(k in pop, k));
        const cl = buildBandPhrase(ctxFor('classic'), 0, 'classic', null);
        assert.ok(['quarter', 'blockarp', 'mixed', 'roll', 'bassup'].includes(cl.family));
        for (const st of ['brass', 'balkan', 'piazzolla', 'latin']) {
            const ph = buildBandPhrase(ctxFor(st), 0, st, null);
            assert.ok(Object.keys(ph).length > COMMON.length, st);
        }
    });
    test('le swing n\'ajoute aucun champ spécifique', () => {
        const ph = buildBandPhrase(ctxFor('swing'), 0, 'swing', null);
        assert.deepEqual(Object.keys(ph).sort(), COMMON.slice().sort());
    });
    test('le tempo est transmis au style classique (au-delà de 165 : pas de croches continues)', () => {
        for (let s = 1; s <= 100; s++) {
            const ph = buildBandPhrase(ctxFor('classic', '4/4', s, { bpm: 200 }), 0, 'classic', null);
            assert.ok(['quarter', 'blockarp', 'mixed'].includes(ph.family));
        }
    });
    test('les extras sont tirés avec le même générateur : la chaîne dépend de prev', () => {
        const p0 = buildBandPhrase(ctxFor('classic', '4/4', 3), 0, 'classic', null);
        assert.ok(Math.abs(p0.intensity - 0.45) <= 0.1 + 1e-9);
        const p1 = buildBandPhrase(ctxFor('classic', '4/4', 4), 1, 'classic', p0);
        assert.ok(p1.intensity >= 0.25 && p1.intensity <= 0.9);
    });
});

describe('buildBandPhrase : signatures', () => {
    test('4/4 : pas de champ mx', () => {
        assert.equal(buildBandPhrase(ctxFor('pop'), 0, 'pop', null).mx, undefined);
    });
    test('3/4 et 2/4 : mx (extras de signature) ajouté', () => {
        for (const key of ['3/4', '2/4']) for (const st of ['swing', 'pop', 'latin', 'classic']) {
            const ph = buildBandPhrase(ctxFor(st, key), 0, st, null);
            assert.ok(ph.mx !== undefined, `${key} ${st}`);
        }
    });
    test('6/8, 9/8, 12/8 : mx ternaire ajouté', () => {
        for (const key of ['6/8', '9/8', '12/8']) for (const st of ['swing', 'pop', 'latin', 'classic']) {
            const ph = buildBandPhrase(ctxFor(st, key), 0, st, null);
            assert.ok(ph.mx !== undefined, `${key} ${st}`);
        }
    });
});
