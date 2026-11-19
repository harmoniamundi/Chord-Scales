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
    test('70 styles (dont sept styles rock, quatre danses aksak, six styles afro-cubains et six styles africains), dont les alias blues128, ballad128 et balkan98', () => {
        assert.equal(STYLES.length, 70);
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
    test('styles classiques en degrés (baroque, Mozart, trad) en mode mineur : tonique mineure, V7 avec sensible, ii°, ♭VI', () => {
        for (const s of ['baroque', 'mozart', 'trad']) for (const q of ['dorian', 'aeolian']) for (let seed = 0; seed <= 8; seed++) {
            const t = build(s, 0, seed ? seeded(seed) : null, q);
            assert.equal(t[0].c, 'minTriad', `${s} ${q}`);
            const V = t.filter(x => x.r === 7);
            assert.ok(V.length && V.every(x => x.c === '7'), `${s} ${q} : V7 (sensible)`);
            t.filter(x => x.r === 2 && x.function !== 'secondaryDominant').forEach(x => assert.equal(x.c, 'dimTriad', `${s} : ii°`));
            assert.ok(!t.some(x => x.r === 9 && x.c === 'minTriad'), `${s} : pas de vi mineur en mineur`);
            t.forEach(x => assert.ok(T.scaleFits(x.s, x.c), `${s} ${x.c} ${x.s}`));
        }
        assert.deepEqual(build('mozart', 0, null, 'lydian'), build('mozart', 0, null, 'ionian'));
    });
});

describe('jazz tonal : majeur ou mineur, jamais un mode d\'église (la dominante reste)', () => {
    const JAZZ = ['ii-v-i', 'anatole', 'bebop', 'swing', 'ballad', 'ballad128', 'hardbop', 'dixieland'];
    const DOM = ['7', '9', '7alt', '7b9', '7sharp5', '7sus4'];
    const halves = (tpl) => tpl.flatMap(x => [x, ...(x.split ? [x.split] : [])]);
    const off = (x, key) => ((x.r - key) % 12 + 12) % 12;
    test('mode lydien ou mixolydien : grille majeure identique à l\'ionien', () => {
        for (const s of JAZZ) for (const q of ['lydian', 'mixolydian']) assert.deepEqual(build(s, 2, null, q), build(s, 2, null, 'ionian'), `${s} ${q}`);
    });
    test('mode mineur : tonique mineure, une dominante présente, jamais de v mineur en fonction de dominante', () => {
        for (const s of JAZZ) for (const q of ['dorian', 'aeolian', 'phrygian']) for (const key of [0, 2, 9]) for (let seed = 0; seed <= 6; seed++) {
            const t = build(s, key, seed ? seeded(seed) : null, q);
            const H = halves(t);
            assert.ok(H.some(x => DOM.includes(x.c)), `${s} ${q} : pas de dominante`);
            assert.ok(!H.some(x => off(x, key) === 7 && x.c === 'm7' && x.function === 'dominant'), `${s} ${q} : v mineur en dominante`);
            const tonic = t.find(x => x.function === 'tonic' && off(x, key) === 0);
            if (tonic) assert.ok(['m7', 'm9', 'mmaj7', 'minTriad'].includes(tonic.c), `${s} ${q} : tonique ${tonic.c}`);
            H.forEach(x => assert.ok(T.scaleFits(x.s, x.c), `${s} ${q} ${x.c} ${x.s}`));
        }
    });
    test('ii-V-I mineur : iiø - V7(b9) - i', () => {
        const t = build('ii-v-i', 0, null, 'dorian');
        assert.deepEqual(t.map(x => [x.r, x.c]), [[2, 'm7b5'], [7, '7b9'], [0, 'm7']]);
    });
    test('turnaround mineur : i - ♭VImaj7 - iiø - V7(b9) ; VI7 garde sa résolution vers iiø', () => {
        const t = build('anatole', 0, null, 'aeolian');
        assert.deepEqual(t.slice(0, 4).map(x => [x.r, x.c]), [[0, 'm7'], [8, 'maj7'], [2, 'm7b5'], [7, '7b9']]);
        assert.deepEqual([t[5].r, t[5].c], [9, '7b9']);
    });
    test('pont de la ballade en mineur : iv7 - ♭VII7 - ♭IIImaj7 (relatif majeur)', () => {
        const t = build('ballad', 0, null, 'dorian');
        const B = t.filter(x => x.section === 'B').map(x => [x.r, x.c]);
        assert.deepEqual(B.slice(0, 3), [[5, 'm7'], [10, '7'], [3, 'maj7']]);
    });
});

describe('hard bop et dixieland', () => {
    const DOM = ['7', '9', '7alt', '7b9', '7sharp5', '7sus4'];
    test('hard bop : 16 mesures, tonique mineure en mode mineur, iiø - V7alt ; versant soul/gospel en majeur', () => {
        for (let seed = 0; seed <= 30; seed++) {
            const R = seed ? seeded(seed) : null;
            const mi = build('hardbop', 0, R, 'dorian'), ma = build('hardbop', 0, R, 'ionian');
            assert.equal(bars(mi), 16); assert.equal(bars(ma), 16);
            assert.ok(['m7', 'm9'].includes(mi[0].c));
            assert.ok(mi.some(x => x.r === 7 && x.c === '7alt'));
            assert.ok(['6', '7', '7sus4'].includes(ma[0].c), 'tonique 6 ou 7 bluesy, ou pédale sus4');
            assert.ok(ma.some(x => x.function === 'dominant' && DOM.includes(x.c)));
        }
        const forms = new Set(); for (let seed = 1; seed <= 40; seed++) forms.add(JSON.stringify(build('hardbop', 0, seeded(seed), 'aeolian').map(x => x.c)));
        assert.ok(forms.size >= 3);
    });
    test('dixieland : 32 mesures de 2/4, triades et septièmes de dominante seulement, aucun ii-V en m7', () => {
        const OK = new Set(['majTriad', 'minTriad', '7', 'dim7']);
        for (const q of ['ionian', 'dorian', 'aeolian']) for (let seed = 0; seed <= 30; seed++) {
            const t = build('dixieland', 0, seed ? seeded(seed) : null, q);
            assert.equal(bars(t), 32);
            t.forEach(x => assert.ok(OK.has(x.c), `${q} ${x.c}`));
            t.forEach(x => assert.ok(x.m >= 2, 'au moins deux mesures de 2/4 par accord'));
            assert.ok(t.some(x => x.r === 7 && x.c === '7'), 'V7');
        }
        const chain = new Set(); for (let seed = 1; seed <= 40; seed++) build('dixieland', 0, seeded(seed)).forEach(x => { if (DOM.includes(x.c)) chain.add(x.r); });
        assert.ok(chain.has(9) && chain.has(2), 'chaîne ragtime VI7 - II7');
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

describe('styles rock', () => {
    const ROCK = ['rockroll', 'rockclassic', 'hardrock', 'punk', 'rockballad', 'bluesrock', 'indierock'];
    const TWELVE = ['rockroll', 'bluesrock'];
    test('formes de 12 mesures (blues) ou de 16 mesures, de référence et renouvelées', () => {
        ROCK.forEach(st => {
            const n = TWELVE.includes(st) ? 12 : 16;
            assert.equal(bars(build(st)), n, st);
            for (let seed = 1; seed <= 40; seed++) assert.equal(bars(build(st, 0, seeded(seed))), n, st + ' ' + seed);
        });
    });
    test('triades et dominantes septièmes seulement (aucune couleur de jazz)', () => {
        ROCK.forEach(st => {
            for (let seed = 1; seed <= 40; seed++) build(st, 0, seeded(seed)).forEach(x => assert.ok(['majTriad', 'minTriad', '7'].includes(x.c), st + ' ' + x.c));
        });
    });
    test('chaque style commence et finit sur sa tonique', () => {
        ROCK.forEach(st => {
            const t = build(st);
            assert.equal(t[0].r, 0, st);
            assert.ok([0, 5, 7, 9, 10].includes(t[t.length - 1].r), st); // dernière mesure : tonique ou dominante qui reboucle
        });
    });
    test('le blues rock renouvelé peut être mineur', () => {
        let minor = false;
        for (let seed = 1; seed <= 80; seed++) if (build('bluesrock', 0, seeded(seed)).some(x => x.c === 'minTriad')) minor = true;
        assert.ok(minor);
    });
});

describe('Balkans : danses aksak', () => {
    test('16 mesures, triades et dominantes, tonique au début et à la fin', () => {
        for (const st of ['balkan58', 'balkan78', 'balkan78r', 'balkan118']) {
            for (let seed = 0; seed <= 20; seed++) {
                const tpl = build(st, 2, seed ? seeded(seed) : null);
                assert.equal(bars(tpl), 16, st);
                assert.equal(tpl[0].r, 2, st);
                assert.equal(tpl[tpl.length - 1].r, 2, st);
                for (const x of tpl) assert.ok(['majTriad', 'minTriad', '7', '7b9', 'm7b5'].includes(x.c), `${st} ${x.c}`);
            }
        }
    });
    test('mineur (paidouchko, lesnoto, kopanitsa) ; majeur (ratchenitsa)', () => {
        for (const st of ['balkan58', 'balkan78', 'balkan118']) assert.equal(build(st, 0)[0].c, 'minTriad', st);
        assert.equal(build('balkan78r', 0)[0].c, 'majTriad');
    });
});

describe('styles afro-cubains', () => {
    const CUBAN = ['sonmontuno', 'chachacha', 'bolerocubano', 'guajira', 'danzon', 'guaguanco'];
    test('formes : 16 mesures (danzón : 32 mesures de 2/4), de référence et renouvelées', () => {
        for (const st of CUBAN) {
            assert.equal(bars(build(st, 0)), st === 'danzon' ? 32 : 16, st);
            for (let seed = 1; seed <= 30; seed++) assert.equal(bars(build(st, seed % 12, seeded(seed))), st === 'danzon' ? 32 : 16, `${st} graine ${seed}`);
        }
    });
    test('chaque gamme proposée appartient aux gammes de son accord', () => {
        for (const st of CUBAN) for (let seed = 0; seed <= 30; seed++) {
            const tpl = seed ? build(st, 2, seeded(seed)) : build(st, 2);
            tpl.forEach(x => assert.ok(T.lookupChord(x.c).scales.some(sc => sc.id === x.s), `${st} : ${x.c} / ${x.s}`));
        }
    });
    test('son, guajira, danzón : triades et dominantes seulement (sauf le ii7 du son)', () => {
        for (const st of ['guajira', 'danzon']) for (let seed = 0; seed <= 30; seed++) {
            const tpl = seed ? build(st, 0, seeded(seed)) : build(st, 0);
            tpl.forEach(x => assert.ok(['majTriad', 'minTriad', '7'].includes(x.c), `${st} : ${x.c}`));
        }
        for (let seed = 0; seed <= 30; seed++) {
            const tpl = seed ? build('sonmontuno', 0, seeded(seed)) : build('sonmontuno', 0);
            tpl.forEach(x => assert.ok(['majTriad', 'minTriad', '7', 'm7'].includes(x.c), `son : ${x.c}`));
        }
    });
    test('bolero : harmonie de septièmes et de neuvièmes (aucune triade)', () => {
        for (let seed = 0; seed <= 30; seed++) {
            const tpl = seed ? build('bolerocubano', 0, seeded(seed)) : build('bolerocubano', 0);
            tpl.forEach(x => assert.ok(!['majTriad', 'minTriad'].includes(x.c), x.c));
        }
    });
    test('danzón : le paseo (A) revient à l\'identique entre les parties B et C', () => {
        for (let seed = 0; seed <= 20; seed++) {
            const tpl = seed ? build('danzon', 0, seeded(seed)) : build('danzon', 0);
            const sig = (sec) => tpl.filter(x => x.phrase === sec).map(x => x.r + x.c + x.m).join('|');
            assert.equal(sig('A1'), sig('A2'));
            assert.ok(tpl.some(x => x.section === 'C'));
        }
    });
    test('forme de référence : commence sur la tonique', () => {
        for (const st of CUBAN) {
            const tpl = build(st, 0);
            assert.equal(tpl[0].r, 0, st);
            assert.equal(tpl[0].function, 'tonic', st);
        }
    });
});

describe('styles africains', () => {
    const AFRICA = ['afrobeat', 'highlife', 'rumbacongo', 'soukous', 'benga', 'mbaqanga'];
    const G = require('../grid/generation.js');
    const all = (st, key) => [build(st, key)].concat(Array.from({ length: 30 }, (_, k) => build(st, key, seeded(k + 1))));
    test('16 mesures, tonique au début et à la fin (forme de référence et renouvelée)', () => {
        for (const st of AFRICA) for (const tpl of all(st, 3)) {
            assert.equal(bars(tpl), 16, st);
            assert.equal(tpl[0].r, 3, st);
            const last = tpl[tpl.length - 1];
            assert.equal((last.split || last).r, 3, `${st} fin`);
            assert.equal(tpl[0].function, 'tonic', st);
        }
    });
    test('vocabulaire : triades et V7 ; afrobeat en m7 (vamp dorien i7 - IV7)', () => {
        for (const st of AFRICA) for (const tpl of all(st, 0)) {
            tpl.forEach(x => {
                const ok = st === 'afrobeat' ? ['m7', '7', 'majTriad'] : ['majTriad', 'minTriad', '7'];
                assert.ok(ok.includes(x.c), `${st} : ${x.c}`);
                if (x.split) assert.ok(ok.includes(x.split.c), `${st} : ${x.split.c}`);
                assert.ok(T.lookupChord(x.c).scales.some(sc => sc.id === x.s), `${st} : ${x.c} / ${x.s}`);
            });
        }
        const ref = build('afrobeat', 2);
        assert.deepEqual([ref[0].r, ref[0].c, ref[1].r, ref[1].c], [2, 'm7', 7, '7']);   // Rém7 puis Sol7
    });
    test('mesures à deux accords : jamais deux fois le même accord', () => {
        for (const st of AFRICA) for (const tpl of all(st, 0)) tpl.filter(x => x.split).forEach(x => {
            assert.equal(x.m, 1, st);
            assert.ok(!(x.split.r === x.r && x.split.c === x.c), st);
        });
    });
    test('mbaqanga : la tonique sur sa quinte (I/V) avant la dominante', () => {
        const tpl = build('mbaqanga', 0);
        const i = tpl.findIndex(x => Number.isInteger(x.bassRootIndex));
        assert.ok(i > 0);
        assert.deepEqual([tpl[i].r, tpl[i].c, tpl[i].bassRootIndex], [0, 'majTriad', 7]);
        assert.equal(tpl[i + 1].c, '7');
        assert.equal(build('mbaqanga', 5)[i].bassRootIndex, 0);   // suit la tonique (fa : basse do)
    });
    test('aucune fusion de deux blocs qui ne diffèrent que par la basse', () => {
        for (const tpl of all('mbaqanga', 0)) {
            const out = G.enforceChordRepeatLimits(tpl);
            assert.equal(out.reduce((s, x) => s + x.m, 0), 16);
            for (let k = 1; k < tpl.length; k++) {
                const a = tpl[k - 1], b = tpl[k];
                if (!a.split && !b.split && a.r === b.r && a.c === b.c) assert.equal(Number.isInteger(a.bassRootIndex), Number.isInteger(b.bassRootIndex));
            }
        }
    });
});
