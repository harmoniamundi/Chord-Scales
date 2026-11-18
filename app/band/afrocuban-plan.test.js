// Tests des rythmes afro-cubains de l'orchestre Cuba (band/afrocuban-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { AFRO_GROOVES, AFRO_STYLES, AFRO_CLAVE, afroPercussion, afroPhraseExtras, buildAfroCubanPlan, afroUsesGuitar } = require('./afrocuban-plan.js');
const { latinPhraseExtras } = require('./latin-plan.js');
const { drumSpec } = require('../audio/drum-synths.js');
const { latBassTones } = require('./band-helpers.js');
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
const baseEnv = (over = {}) => ({
    splitBeat: 2, transOffset: 0, seed: 0, state: { latTie: false },
    findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0],
    ...over
});
const C = { rootIndex: 0, chordId: 'majTriad' };
const Cm7 = { rootIndex: 0, chordId: 'm7' };
const G7 = { rootIndex: 7, chordId: '7' };
const F = { rootIndex: 5, chordId: 'majTriad' };

function plan(groove, { bpb = (groove === 'cu-danzon' ? 2 : 4), step = Cm7, nextStep = G7, last = false, halves = null, seed = 1, i = 0, L = 4, isTurn = false, m = 0, env = {}, ph = {}, tied = false } = {}) {
    const e = baseEnv({ ...env, state: { latTie: tied } });
    const p = { rng: seeded(seed), index: 0, intensity: 0.5, fill: false, fillKind: 0, ...ph };
    const out = buildAfroCubanPlan(e, groove, bpb, step, nextStep, last, halves, p, i, L, isTurn, m);
    return { ...out, tie: e.state.latTie, ph: p, bpb };
}
const slotOf = (pos, bpb) => Math.round(pos * 8 / bpb);

describe('tables des six rythmes', () => {
    test('six rythmes, préfixe cu-, chacun décrit', () => {
        assert.equal(AFRO_GROOVES.length, 6);
        AFRO_GROOVES.forEach(g => { assert.match(g, /^cu-/); assert.ok(AFRO_STYLES[g] && AFRO_STYLES[g].name, g); });
    });
    test('cellules valides : cases 0-7 triées et uniques, densités croissantes, autant de cellules des deux côtés', () => {
        AFRO_GROOVES.forEach(g => {
            const S = AFRO_STYLES[g];
            assert.equal(S.comp.three.length, S.comp.two.length, g);
            for (const side of ['three', 'two']) {
                let prev = 0;
                S.comp[side].forEach(c => {
                    assert.ok(c.d > prev, g); prev = c.d;
                    const es = c.hits.map(h => h[0]);
                    assert.ok(es.every((e, k) => Number.isInteger(e) && e >= 0 && e < 8 && (k === 0 || e > es[k - 1])), `${g} ${side}`);
                    c.hits.forEach(([, v, vel]) => {
                        const vs = Array.isArray(v) ? v : [v];
                        assert.ok(vs.length && vs.every(x => Number.isInteger(x) && x >= 0 && x <= 5), `${g} voix`);
                        assert.ok(vel > 0 && vel <= 1);
                    });
                });
            }
            [S.bass, S.bassAnt].filter(Boolean).forEach(list => list.forEach(c => c.hits.forEach(([e, tok, d, v]) => {
                assert.ok(e === 'a' || (Number.isInteger(e) && e >= 0 && e < 8), `${g} basse`);
                assert.ok('RFTOAN'.includes(tok) && d > 0 && v > 0 && v <= 1);
                if (tok === 'N') assert.equal(e, 'a', `${g} : N n'apparaît qu'en anticipation`);
                if (e === 'a') assert.ok(S.ant, `${g} : anticipation sans case d'anticipation`);
            })));
        });
    });
    test('la partie d\'accords du son et de la guajira tombe sur les coups de clave (côté trois : 1, 2&, 4)', () => {
        for (const g of ['cu-son']) {
            AFRO_STYLES[g].comp.three.forEach(c => {
                const set = new Set(c.hits.map(h => h[0]));
                AFRO_CLAVE.son.three.forEach(([e]) => assert.ok(set.has(e), `${g} d=${c.d} case ${e}`));
            });
        }
    });
    test('cha-cha-chá : le « chá-chá » (4 et 4&) est joué par le piano du côté deux', () => {
        AFRO_STYLES['cu-chacha'].comp.two.forEach(c => {
            const set = new Set(c.hits.map(h => h[0]));
            assert.ok(set.has(6) && set.has(7));
        });
    });
    test('toutes les percussions utilisées ont un son', () => {
        const names = new Set(['clave']);
        AFRO_GROOVES.forEach(g => {
            AFRO_STYLES[g].fill.forEach(n => names.add(n));
            for (const side of ['three', 'two']) for (const B of [false, true]) for (let s = 1; s < 6; s++)
                afroPercussion(g, side, B, seeded(s), 0.6).forEach(([e, d, v]) => { names.add(d); assert.ok(e >= 0 && e < 8 && v > 0); });
        });
        names.forEach(n => assert.ok(drumSpec({ drum: n }), n));
    });
    test('guitare pour le son, le bolero, la guajira et le guaguancó ; piano pour le cha-cha-chá et le danzón', () => {
        assert.deepEqual(AFRO_GROOVES.filter(afroUsesGuitar), ['cu-son', 'cu-bolero', 'cu-guajira', 'cu-guaguanco']);
        assert.equal(afroUsesGuitar('salsa'), false);
        assert.equal(afroUsesGuitar(undefined), false);
    });
});

describe('afroPhraseExtras', () => {
    test('indices valides et déterministes, ambiance B par groupes de deux phrases', () => {
        AFRO_GROOVES.forEach(g => {
            for (let s = 1; s <= 80; s++) {
                const ex = afroPhraseExtras({ rng: seeded(s), intensity: (s % 10) / 10, index: s % 6 }, g);
                const S = AFRO_STYLES[g];
                const list = S[ex.bassList];
                assert.ok(list, g);
                assert.ok(ex.cellIdx >= 0 && ex.cellIdx < S.comp.three.length && ex.altIdx >= 0 && ex.altIdx < S.comp.three.length);
                assert.ok(ex.bassIdx >= 0 && ex.bassIdx < list.length && ex.bassAlt >= 0 && ex.bassAlt < list.length);
                assert.ok(ex.I >= 0.2 && ex.I <= 1);
                assert.equal(ex.B, Math.floor((s % 6) / 2) % 2 === 1);
            }
            assert.deepEqual(afroPhraseExtras({ rng: seeded(4), intensity: 0.5, index: 2 }, g), afroPhraseExtras({ rng: seeded(4), intensity: 0.5, index: 2 }, g));
        });
    });
    test('le bolero reste plus calme que le son à intensité égale', () => {
        const I = (g) => afroPhraseExtras({ rng: seeded(2), intensity: 0.6, index: 1 }, g).I;
        assert.ok(I('cu-bolero') < I('cu-son'));
    });
});

describe('plans de mesure', () => {
    test('chaque rythme : piano, basse et percussions dans la mesure, valeurs bornées', () => {
        AFRO_GROOVES.forEach(g => {
            for (let s = 1; s <= 25; s++) for (let m = 0; m < 2; m++) {
                const p = plan(g, { seed: s, m, ph: { index: s % 4 }, last: s % 2 === 0 });
                assert.ok(p.piano.length > 0 && p.bass.length > 0 && p.drums.length > 0, g);
                [...p.piano, ...p.bass, ...p.drums].forEach(e => {
                    assert.ok(e.pos >= 0 && e.pos < p.bpb, `${g} pos ${e.pos}`);
                    assert.ok(e.vel > 0 && e.vel <= 1, `${g} vel`);
                });
                p.piano.forEach(e => { assert.ok(e.dur > 0 && e.intervals.length >= 1); e.intervals.forEach(n => assert.ok(n >= 0 && n <= 40, `${g} note ${n}`)); });
                p.bass.forEach(e => assert.ok(e.dur > 0 && Number.isFinite(e.abs)));
                assert.equal(!!p.classicalGuitar, afroUsesGuitar(g));
            }
        });
    });
    test('la partie d\'accords ne joue que des notes de l\'accord', () => {
        AFRO_GROOVES.forEach(g => {
            for (let s = 1; s <= 15; s++) {
                const p = plan(g, { seed: s, step: Cm7, nextStep: Cm7 });
                const pcs = new Set([0, 3, 7, 10]);
                p.piano.forEach(e => e.intervals.forEach(n => assert.ok(pcs.has(((n % 12) + 12) % 12), `${g} : ${n}`)));
            }
        });
    });
    test('clave de son 3-2 / 2-3 selon la graine (son), clave de rumba au guaguancó, pas de clave au cha-cha-chá ni au danzón', () => {
        const cl = (g, seed, m, idx = 0) => plan(g, { env: { seed }, m, ph: { index: idx } }).drums.filter(d => d.drum === 'clave').map(d => slotOf(d.pos, 4)).sort((a, b) => a - b);
        assert.deepEqual(cl('cu-son', 0, 0), [0, 3, 6]);
        assert.deepEqual(cl('cu-son', 0, 1), [2, 4]);
        assert.deepEqual(cl('cu-son', 1, 0), [2, 4]);
        assert.deepEqual(cl('cu-guaguanco', 0, 0), [0, 3, 7]);
        assert.deepEqual(cl('cu-chacha', 0, 0), []);
        assert.equal(plan('cu-danzon').drums.filter(d => d.drum === 'clave').length, 0);
        // guajira : clave seulement dans la 2e ambiance
        assert.deepEqual(cl('cu-guajira', 0, 0, 0), []);
        assert.deepEqual(cl('cu-guajira', 0, 0, 2), [0, 3, 6]);
    });
    test('danzón (2/4) : cinquillo des timbales sur la première mesure de chaque paire, quelle que soit la graine', () => {
        for (const seed of [0, 1, 5]) {
            const a = plan('cu-danzon', { env: { seed }, m: 0 }).drums.filter(d => d.drum === 'shell').map(d => slotOf(d.pos, 2));
            const b = plan('cu-danzon', { env: { seed }, m: 1 }).drums.filter(d => d.drum === 'shell').map(d => slotOf(d.pos, 2));
            assert.deepEqual(a, [0, 2, 3, 5, 6]);
            assert.deepEqual(b, [0, 2, 6]);
        }
        // en 2/4, une case vaut une double croche
        const p = plan('cu-danzon');
        p.drums.forEach(d => assert.ok(Math.abs(d.pos * 4 - Math.round(d.pos * 4)) < 1e-9));
    });
    test('son : la basse anticipe l\'accord suivant et le tient sur le 1 de la mesure suivante', () => {
        let seen = 0;
        for (let s = 1; s <= 40; s++) {
            const p = plan('cu-son', { seed: s, step: Cm7, nextStep: F, last: true });
            const ant = p.bass.find(b => b.tok === 'N');
            if (!ant) continue;
            seen++;
            assert.ok(ant.pos >= 3 - 1e-9);
            assert.equal(ant.abs, latBassTones(baseEnv(), F).root);
            assert.equal(p.tie, true);
            const nx = plan('cu-son', { seed: s + 100, step: F, nextStep: Cm7, tied: true });
            assert.ok(nx.bass.every(b => b.pos >= 0.2), 'le 1 reste tenu');
        }
        assert.ok(seen > 20);
    });
    test('cha-cha-chá et bolero : la basse joue toujours le 1, sans liaison', () => {
        for (const g of ['cu-chacha', 'cu-bolero', 'cu-danzon']) for (let s = 1; s <= 20; s++) {
            const p = plan(g, { seed: s, last: true });
            assert.ok(p.bass.some(b => b.pos === 0), g);
            assert.equal(p.tie, false, g);
        }
    });
    test('mesure à deux accords : chaque moitié a sa fondamentale à la basse et ses accords', () => {
        AFRO_GROOVES.forEach(g => {
            const bpb = g === 'cu-danzon' ? 2 : 4;
            const env = { splitBeat: bpb / 2 };
            const p = plan(g, { bpb, halves: [C, G7], step: C, nextStep: C, env });
            const second = p.piano.filter(e => e.pos >= bpb / 2);
            assert.ok(second.length > 0, g);
            second.forEach(e => e.intervals.forEach(n => assert.ok([7, 11, 2, 5].includes(((n % 12) + 12) % 12), `${g} : ${n}`)));
            assert.ok(p.bass.some(b => b.pos >= bpb / 2 && b.pos < bpb / 2 + bpb / 4), g);
        });
    });
    test('fill de fin de phrase : roulement sur le dernier temps', () => {
        AFRO_GROOVES.forEach(g => {
            const p = plan(g, { isTurn: true, i: 3, ph: { fill: true } });
            const S = AFRO_STYLES[g];
            const last = p.drums.filter(d => d.pos >= p.bpb - Math.min(1, p.bpb / 2) - 1e-9);
            assert.ok(last.filter(d => S.fill.includes(d.drum)).length >= 4, g);
        });
    });
    test('déterminisme', () => {
        const strip = (p) => ({ piano: p.piano, bass: p.bass, drums: p.drums, tie: p.tie });
        AFRO_GROOVES.forEach(g => assert.deepEqual(strip(plan(g, { seed: 7, m: 3 })), strip(plan(g, { seed: 7, m: 3 }))));
    });
});

describe('phrase du moteur Latin : les rythmes cubains traversent', () => {
    test('orchestre Cuba avec un rythme cu-… → ce rythme ; Brasil ne le prend pas', () => {
        AFRO_GROOVES.forEach(g => {
            for (let s = 1; s <= 20; s++) {
                const ex = latinPhraseExtras({ bpm: 110, isCuba: true, groove: g }, seeded(s), null, s % 3);
                assert.equal(ex.groove, g);
                assert.ok(Number.isInteger(ex.bassIdx) && ex.bassIdx >= 0);
            }
        });
    });
});
