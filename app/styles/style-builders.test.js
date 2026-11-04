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
    test('47 styles, dont les alias blues128, ballad128 et balkan98', () => {
        assert.equal(STYLES.length, 47);
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

describe('flamenco', () => {
    const FLA = ['flamencosolea', 'flamencobulerias', 'flamencotangos'];
    test('formes de référence : soleá et bulerías 12 compás, rumba / tangos 16 mesures, en La (cadence andalouse)', () => {
        assert.equal(bars(build('flamencosolea', 9)), 12);
        assert.equal(bars(build('flamencobulerias', 9)), 12);
        assert.equal(bars(build('flamencotangos', 9)), 16);
        const t = build('flamencosolea', 9);
        // première cellule : La mineur - Sol - Fa - Mi
        assert.deepEqual(t.slice(0, 4).map(x => [x.r, x.c]), [[9, 'minTriad'], [7, 'majTriad'], [5, 'majTriad'], [4, 'majTriad']]);
        assert.equal(t[3].s, 'phrygianDominant');
    });
    test('chaque cellule de quatre mesures part de l\'accord que la précédente appelle (V puis i, i puis V…)', () => {
        const lastOf = (x) => x.split || { r: x.r, c: x.c };
        for (const style of FLA) {
            for (let seed = 0; seed <= 40; seed++) {
                const tpl = build(style, 9, seed ? seeded(seed) : null);
                const cells = {};
                tpl.forEach(x => { (cells[x.phrase] = cells[x.phrase] || []).push(x); });
                const order = [...new Set(tpl.map(x => x.phrase))];
                order.forEach((ph, k) => {
                    const cur = cells[ph], prev = cells[order[(k + order.length - 1) % order.length]];
                    const start = cur[0].r, end = lastOf(prev[prev.length - 1]).r;
                    // fin de cellule sur V (Mi) ou sur i (La) ; début sur i (La), V (Mi), iv (Ré) ou III (Do) pour le contraste de la rumba
                    assert.ok([9, 4].includes(end) || (style === 'flamencobulerias' && end === 5), `${style}/${seed} fin ${ph}: ${end}`);
                    assert.ok([9, 4, 2, 0].includes(start), `${style}/${seed} début ${ph}: ${start}`);
                    if (end === 4) assert.ok([9, 4].includes(start), `${style}/${seed} V puis ${start}`); // le Mi résout sur La (ou se prolonge : por medio)
                });
            }
        }
    });
    test('mesures à deux accords (moitiés de compás) : jamais deux fois le même accord', () => {
        for (const style of FLA) {
            for (let seed = 0; seed <= 40; seed++) {
                build(style, 9, seed ? seeded(seed) : null).forEach(x => { if (x.split) assert.ok(x.split.r !== x.r || x.split.c !== x.c); });
            }
        }
    });
    test('toutes les formes suivent la tonique', () => {
        FLA.forEach(style => assert.equal(build(style, 2)[0].r, 2));
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

describe('cumbia : grille de bal en triades et dominante', () => {
    const CUMBIA_OK = new Set(['majTriad', 'minTriad', '7']);
    test('forme de référence : 16 mesures en majeur, I - IV - V7 seulement', () => {
        for (const key of [0, 2, 7, 10]) {
            const t = build('cumbia', key);
            assert.equal(bars(t), 16);
            const degrees = new Set(t.map(x => ((x.r - key) % 12 + 12) % 12));
            for (const d of degrees) assert.ok([0, 5, 7, 9].includes(d), `degré ${d} inattendu en référence`);
            assert.equal(t[0].r, key);
            assert.equal(t[0].c, 'majTriad');
        }
    });
    test('accords : triades et V7 uniquement, un V7 est suivi de la tonique ou du IV', () => {
        for (let seed = 1; seed <= 80; seed++) {
            const key = seed % 12;
            const t = build('cumbia', key, seeded(seed));
            t.forEach(x => assert.ok(CUMBIA_OK.has(x.c), `accord ${x.c}`));
            t.forEach((x, k) => {
                if (x.c !== '7' || k === t.length - 1) return;
                const d = ((t[k + 1].r - key) % 12 + 12) % 12;
                assert.ok([0, 5, 7].includes(d) || (t[k + 1].c === 'minTriad' && d === 9), `après V7 : degré ${d}`);
            });
            // la grille se pose sur la tonique
            const lastDeg = ((t[t.length - 1].r - key) % 12 + 12) % 12;
            assert.ok(lastDeg === 0 || lastDeg === 7, `fin sur le degré ${lastDeg}`);
        }
    });
    test('les propositions renouvelées sont parfois en mineur (tonique mineure, V7 sur la dominante)', () => {
        let minor = 0, major = 0;
        for (let seed = 1; seed <= 120; seed++) {
            const t = build('cumbia', 0, seeded(seed));
            if (t[0].c === 'minTriad') { minor++; assert.ok(t.some(x => x.c === '7' && x.r === 7)); } else major++;
        }
        assert.ok(minor > 15 && major > 40, `mineur ${minor}, majeur ${major}`);
    });
    test('deux sections A et B de huit mesures', () => {
        const t = build('cumbia', 0, seeded(3));
        const sum = (sec) => t.filter(x => x.section === sec).reduce((s, x) => s + x.m, 0);
        assert.equal(sum('A'), 8);
        assert.equal(sum('B'), 8);
    });
});
