// Tests des générateurs de grille par style (styles/style-builders.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { STYLE_BUILDERS, buildStyleTemplate } = require('./style-builders.js');
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
const build = (styleKey, keyRoot = 0, R = null, mainQuality = 'ionian') => buildStyleTemplate(styleKey, { keyRoot, mainQuality, R, findChordObj });
const STYLES = Object.keys(STYLE_BUILDERS);
const bars = (tpl) => tpl.reduce((s, x) => s + x.m, 0);

describe('catalogue des styles', () => {
    test('40 styles, dont les alias blues128, ballad128 et balkan98', () => {
        assert.equal(STYLES.length, 40);
        assert.equal(STYLE_BUILDERS.blues128, STYLE_BUILDERS.blues);
        assert.equal(STYLE_BUILDERS.ballad128, STYLE_BUILDERS.ballad);
        assert.equal(STYLE_BUILDERS.balkan98, STYLE_BUILDERS.balkan);
    });
    test('style inconnu : quatre mesures de tonique', () => {
        const t = build('nimportequoi', 3);
        assert.equal(t.length, 1);
        assert.deepEqual([t[0].r, t[0].m, t[0].function], [3, 4, 'tonic']);
    });
});

describe('chaque style produit une grille valide', () => {
    for (const style of STYLES) {
        test(`${style} : accords connus, gammes connues, tonalités 0-11, forme de référence stable`, () => {
            for (const key of [0, 5, 10]) {
                const ref = build(style, key);
                assert.deepEqual(ref, build(style, key), 'la forme de référence doit être déterministe');
                assert.ok(ref.length > 0 && bars(ref) >= 2, `${style} trop court`);
                for (const x of ref) {
                    assert.ok(Number.isInteger(x.r) && x.r >= 0 && x.r < 12, `${style} r=${x.r}`);
                    assert.ok(T.lookupChord(x.c), `${style} accord inconnu ${x.c}`);
                    assert.ok(T.scalesDb[x.s], `${style} gamme inconnue ${x.s}`);
                    assert.ok(Number.isInteger(x.m) && x.m >= 1, `${style} mesures ${x.m}`);
                    assert.equal(typeof x.section, 'string');
                    assert.equal(typeof x.phrase, 'string');
                    if (x.split) assert.ok(T.lookupChord(x.split.c) && T.scalesDb[x.split.s]);
                }
            }
        });
        test(`${style} : les propositions renouvelées restent valides`, () => {
            for (let seed = 1; seed <= 25; seed++) {
                const tpl = build(style, seed % 12, seeded(seed));
                assert.ok(tpl.length > 0 && bars(tpl) >= 2);
                for (const x of tpl) {
                    assert.ok(Number.isInteger(x.r) && x.r >= 0 && x.r < 12, `${style} r=${x.r}`);
                    assert.ok(T.lookupChord(x.c), `${style} accord inconnu ${x.c}`);
                    assert.ok(T.scalesDb[x.s], `${style} gamme inconnue ${x.s}`);
                }
            }
        });
        test(`${style} : transposer la tonique transpose tous les accords`, () => {
            const base = build(style, 0);
            for (const key of [1, 4, 7, 11]) {
                const tr = build(style, key);
                assert.equal(tr.length, base.length);
                tr.forEach((x, i) => {
                    assert.equal(x.r, (base[i].r + key) % 12, `${style} accord ${i}`);
                    assert.equal(x.c, base[i].c);
                    assert.equal(x.m, base[i].m);
                });
            }
        });
    }
});

describe('formes connues', () => {
    test('ii-V-I : cadence résolue sur la tonique', () => {
        const t = build('ii-v-i', 0);
        assert.deepEqual(t.map(x => x.c), ['m7', '7', 'maj7']);
        assert.equal(t[2].r, 0);
    });
    test('blues et blues128 : même grille', () => {
        assert.deepEqual(build('blues', 2), build('blues128', 2));
    });
    test('blues : 12 mesures en forme de référence', () => {
        assert.equal(bars(build('blues', 0)), 12);
    });
    test('valse jazz : AABA de 32 mesures', () => {
        assert.equal(bars(build('valsejazz', 0)), 32);
    });
    test('« I got rythm » : AABA (la reprise de A est ajoutée plus tard par le moteur : 24 mesures écrites)', () => {
        const t = build('i-got-rythm', 0);
        assert.equal(bars(t), 24);
        assert.deepEqual([...new Set(t.map(x => x.section))], ['A', 'B', 'A3']);
    });
});

describe('ponts modulants (kc)', () => {
    test('si un accord porte une tonalité traversée, tous en portent une (0 par défaut)', () => {
        for (const style of STYLES) {
            for (let seed = 0; seed <= 8; seed++) {
                const tpl = build(style, 0, seed ? seeded(seed) : null);
                if (tpl.some(x => Number.isInteger(x.kc))) assert.ok(tpl.every(x => Number.isInteger(x.kc)), style);
            }
        }
    });
    test('la valse jazz en majeur emprunte un pont modulant dans certaines propositions', () => {
        let found = false;
        for (let seed = 1; seed <= 60 && !found; seed++) found = build('valsejazz', 0, seeded(seed)).some(x => x.kc > 0);
        assert.ok(found);
    });
});

describe('mode choisi', () => {
    test('un style en degrés suit le mode : en dorien, la tonique est mineure', () => {
        const t = build('anatole', 0, null, 'dorian');
        assert.equal(t[0].c, 'm7');
    });
    test('un style en absolu ignore le mode', () => {
        assert.deepEqual(build('bossa', 0, null, 'dorian'), build('bossa', 0, null, 'ionian'));
    });
    test('les propositions renouvelées des styles en degrés restent sur la forme de référence en mode non majeur', () => {
        assert.deepEqual(build('swing', 0, seeded(3), 'aeolian'), build('swing', 0, null, 'aeolian'));
    });
});
