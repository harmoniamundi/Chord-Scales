// Tests de l'orchestre salsa (band/salsa-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { salsaPhraseExtras, buildSalsaPlan, SALSA_CLAVE, SALSA_CASCARA, SALSA_BELL, SALSA_CONGA, SALSA_MONTUNO, SALSA_BASS } = require('./salsa-plan.js');
const { latinPhraseExtras } = require('./latin-plan.js');
const { drumSpec } = require('../audio/drum-synths.js');
const { latBassTones } = require('./band-helpers.js');
const T = require('../theory.js');

// Générateur pseudo-aléatoire à graine : mêmes graines → mêmes résultats.
function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Environnement factice (ce que JamEngine fournit en vrai).
const baseEnv = (over = {}) => ({
    splitBeat: 2,
    transOffset: 0,
    seed: 0,
    state: { latTie: false },
    findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0],
    ...over
});
const Cm7 = { rootIndex: 0, chordId: 'm7' };
const G7 = { rootIndex: 7, chordId: '7' };
const Fm7 = { rootIndex: 5, chordId: 'm7' };
const phrase = (seed, extra = {}) => ({ rng: seeded(seed), index: 0, intensity: 0.5, fill: false, fillKind: 0, ...extra });

// Une mesure de 4 temps. tie : état de liaison de la basse entrant (la mesure précédente a anticipé).
function plan({ step = Cm7, nextStep = G7, last = false, halves = null, seed = 1, i = 0, L = 4, isTurn = false, m = 0, env = {}, ph = {}, tied = false, sa } = {}) {
    const e = baseEnv({ ...env, state: { latTie: tied } });
    const p = phrase(seed, ph);
    if (sa) p.sa = sa;
    const out = buildSalsaPlan(e, 4, false, step, nextStep, last, halves, p, i, L, isTurn, m);
    return { ...out, tie: e.state.latTie, ph: p };
}
const slots = (list) => list.map(e => e.pos * 2);
const sortedUnique = (a) => a.every((x, k) => k === 0 || x > a[k - 1]);
const claveSlots = (p) => slots(p.drums.filter(d => d.drum === 'clave')).sort((a, b) => a - b);
const pcOf = (note, off = 0) => (((note + off) % 12) + 12) % 12;

describe('tables rythmiques', () => {
    test('clave de son : trois coups d\'un côté (1, 2&, 4), deux de l\'autre (2, 3)', () => {
        assert.deepEqual(SALSA_CLAVE.three.map(c => c[0]), [0, 3, 6]);
        assert.deepEqual(SALSA_CLAVE.two.map(c => c[0]), [2, 4]);
    });
    test('la cáscara contient tous les coups de la clave, des deux côtés, en version complète comme épurée', () => {
        for (const v of ['full', 'light']) {
            for (const side of ['three', 'two']) {
                const set = new Set(SALSA_CASCARA[v][side]);
                SALSA_CLAVE[side].forEach(([e]) => assert.ok(set.has(e), `${v}/${side} : croche ${e}`));
                assert.ok(SALSA_CASCARA[v][side].every(e => Number.isInteger(e) && e >= 0 && e < 8) && sortedUnique(SALSA_CASCARA[v][side]));
            }
        }
        assert.ok(SALSA_CASCARA.full.three.length > SALSA_CASCARA.light.three.length);
    });
    test('montuno : un coup sur chaque coup de clave, croches valides, densités croissantes, mêmes indices des deux côtés', () => {
        assert.equal(SALSA_MONTUNO.three.length, SALSA_MONTUNO.two.length);
        for (const side of ['three', 'two']) {
            let prevD = 0;
            SALSA_MONTUNO[side].forEach(c => {
                assert.ok(c.d > prevD); prevD = c.d;
                assert.ok(sortedUnique(c.hits.map(h => h[0])), 'croches triées et uniques');
                c.hits.forEach(([e, v, vel]) => { assert.ok(e >= 0 && e < 8 && Number.isInteger(v) && v >= 0 && vel > 0 && vel <= 1); });
                const set = new Set(c.hits.map(h => h[0]));
                SALSA_CLAVE[side].forEach(([e]) => assert.ok(set.has(e), `montuno ${side} d=${c.d} : pas de coup sur la croche ${e} de la clave`));
            });
        }
    });
    test('les coups de clave du montuno portent des voix plus hautes que les notes de remplissage', () => {
        for (const side of ['three', 'two']) {
            SALSA_MONTUNO[side].forEach(c => {
                const cl = new Set(SALSA_CLAVE[side].map(x => x[0]));
                const hi = c.hits.filter(h => cl.has(h[0]) && h[0] !== 0).map(h => h[1]);
                const lo = c.hits.filter(h => !cl.has(h[0]) && h[0] !== 7).map(h => h[1]);
                if (hi.length && lo.length) assert.ok(Math.min(...hi) >= Math.min(...lo), `${side} d=${c.d}`);
            });
        }
    });
    test('tumbao de basse : quinte sur le « et » du 2, anticipation à la fin de mesure, rien sur le 1', () => {
        SALSA_BASS.forEach(c => {
            assert.ok(c.hits.some(h => h[0] === 3 && h[1] === 'F'), 'quinte sur la croche 3 (« et » du 2)');
            assert.equal(c.hits.filter(h => h[1] === 'N').length, 1);
            assert.equal(c.hits.find(h => h[1] === 'N')[0], 'a');
            assert.ok(c.hits.every(h => h[0] !== 0));
        });
    });
    test('conga : claque sur le 2, tons ouverts sur le « et » du 2 et sur le 4', () => {
        SALSA_CONGA.forEach(c => {
            const at = (e) => c.hits.find(h => h[0] === e);
            assert.equal(at(2)[1], 'slap');
            assert.equal(at(3)[1], 'conga2');
            assert.equal(at(6)[1], 'conga2');
            assert.ok(at(6)[2] >= at(3)[2], 'le temps 4 est l\'appui du tumbao');
        });
    });
    test('toutes les percussions utilisées ont un son', () => {
        const names = new Set();
        [...SALSA_CONGA.flatMap(c => c.hits.map(h => h[1])), 'clave', 'bell', 'shaker', 'shell', 'bongol', 'bongoh', 'guiro', 'guirot'].forEach(n => names.add(n));
        names.forEach(n => assert.ok(drumSpec({ drum: n }), n));
        assert.ok(SALSA_BELL.three.length && SALSA_BELL.two.length);
    });
});

describe('salsaPhraseExtras (choix de la phrase)', () => {
    test('indices valides, anticipation 6 ou 7, déterminisme', () => {
        for (let s = 1; s <= 200; s++) {
            const ex = salsaPhraseExtras({ rng: seeded(s), intensity: (s % 10) / 10, index: s % 7 });
            for (const [k, list] of [['cellIdx', SALSA_MONTUNO.three], ['altIdx', SALSA_MONTUNO.three], ['bassIdx', SALSA_BASS], ['bassAlt', SALSA_BASS], ['congaIdx', SALSA_CONGA]]) {
                assert.ok(Number.isInteger(ex[k]) && ex[k] >= 0 && ex[k] < list.length, `${k} = ${ex[k]}`);
            }
            assert.ok([6, 7].includes(ex.ant));
            assert.ok(ex.I >= 0.2 && ex.I <= 1);
        }
        assert.deepEqual(salsaPhraseExtras({ rng: seeded(9), intensity: 0.4, index: 3 }), salsaPhraseExtras({ rng: seeded(9), intensity: 0.4, index: 3 }));
    });
    test('couplets (son) puis montuno par groupes de deux phrases, le montuno plus intense', () => {
        const sec = (index) => salsaPhraseExtras({ rng: seeded(1), intensity: 0.5, index }).section;
        assert.deepEqual([0, 1, 2, 3, 4, 5].map(sec), ['son', 'son', 'montuno', 'montuno', 'son', 'son']);
        const I = (index) => salsaPhraseExtras({ rng: seeded(1), intensity: 0.5, index }).I;
        assert.ok(I(2) > I(1));
        assert.ok(I(1) > I(0), 'la toute première phrase est la plus légère');
    });
    test('sans intensité, elle se déduit de la densité', () => {
        const ex = salsaPhraseExtras({ rng: seeded(3), density: 1, index: 1 });
        assert.ok(Math.abs(ex.I - (0.3 + 0.6 - 0.08)) < 1e-9);
    });
});

describe('phrase du moteur Latin : le rythme salsa traverse', () => {
    const ctx = (over) => ({ bpm: 180, isCuba: true, ...over });
    test('orchestre Cuba avec le rythme salsa → groove « salsa », sans rien casser côté tumbao Latin', () => {
        for (let s = 1; s <= 60; s++) {
            const ex = latinPhraseExtras(ctx({ groove: 'salsa' }), seeded(s), null, s % 3);
            assert.equal(ex.groove, 'salsa');
            assert.ok(Number.isInteger(ex.bassIdx) && ex.bassIdx >= 0);
        }
    });
    test('sans rythme imposé, Cuba garde l\'afro-cubain', () => {
        for (let s = 1; s <= 30; s++) assert.equal(latinPhraseExtras(ctx({}), seeded(s), null, 0).groove, 'afro');
    });
    test('« salsa » ne fuit pas vers l\'orchestre Brasil', () => {
        for (let s = 1; s <= 30; s++) assert.notEqual(latinPhraseExtras(ctx({ isCuba: false, groove: undefined }), seeded(s), null, 0).groove, 'salsa');
    });
});

describe('clave et sens 3-2 / 2-3', () => {
    test('graine paire : 3-2 (côté des trois coups d\'abord) ; graine impaire : 2-3 ; les deux côtés alternent à chaque mesure', () => {
        for (const [seed, first, second] of [[0, [0, 3, 6], [2, 4]], [2, [0, 3, 6], [2, 4]], [1, [2, 4], [0, 3, 6]], [7, [2, 4], [0, 3, 6]]]) {
            assert.deepEqual(claveSlots(plan({ env: { seed }, m: 0 })), first, `graine ${seed}, mesure 0`);
            assert.deepEqual(claveSlots(plan({ env: { seed }, m: 1 })), second, `graine ${seed}, mesure 1`);
            assert.deepEqual(claveSlots(plan({ env: { seed }, m: 6 })), first);
            assert.deepEqual(claveSlots(plan({ env: { seed }, m: 7 })), second);
        }
    });
    test('le sens ne change jamais en cours de lecture, quelle que soit la phrase', () => {
        for (let idx = 0; idx < 8; idx++) {
            for (let m = 0; m < 8; m++) {
                const got = claveSlots(plan({ env: { seed: 1 }, m, ph: { index: idx }, seed: idx + 3 }));
                assert.deepEqual(got, m % 2 === 0 ? [2, 4] : [0, 3, 6], `phrase ${idx}, mesure ${m}`);
            }
        }
    });
    test('la clave joue sur cinq coups par cycle de deux mesures, sans autre coup', () => {
        const a = claveSlots(plan({ m: 0 })), b = claveSlots(plan({ m: 1 }));
        assert.equal(a.length + b.length, 5);
    });
});

describe('percussions : couplets (son) et montuno', () => {
    const son = (extra = {}) => plan({ ph: { index: 0 }, ...extra });
    const mon = (extra = {}) => plan({ ph: { index: 2 }, ...extra });
    const drumsOf = (p, name) => p.drums.filter(d => d.drum === name);
    test('son : cáscara sur le flanc, bongos, güiro ; ni cloche ni maracas', () => {
        for (let seed = 1; seed <= 20; seed++) for (let m = 0; m < 2; m++) {
            const p = son({ seed, m });
            assert.ok(drumsOf(p, 'shell').length >= 3);
            assert.ok(drumsOf(p, 'bongol').length > 0 && drumsOf(p, 'bongoh').length > 0);
            assert.ok(drumsOf(p, 'guiro').length === 2 && drumsOf(p, 'guirot').length === 4);
            assert.equal(drumsOf(p, 'bell').length + drumsOf(p, 'shaker').length, 0);
        }
    });
    test('son : la cáscara tombe sur chaque coup de clave', () => {
        for (let seed = 1; seed <= 20; seed++) for (let m = 0; m < 2; m++) {
            const p = son({ seed, m });
            const sh = new Set(slots(drumsOf(p, 'shell')));
            claveSlots(p).forEach(e => assert.ok(sh.has(e), `graine ${seed}, mesure ${m} : croche ${e}`));
        }
    });
    test('son : les coups de clave de la cáscara sont plus forts que les notes de remplissage', () => {
        const p = son({ seed: 4, m: 0, ph: { index: 0, intensity: 0.9 } });
        const cl = new Set(claveSlots(p));
        const vels = (inClave) => drumsOf(p, 'shell').filter(d => cl.has(d.pos * 2) === inClave).map(d => d.vel);
        assert.ok(Math.min(...vels(true)) > Math.max(...vels(false)));
    });
    test('montuno : cloche et maracas à la place de la cáscara, des bongos et du güiro', () => {
        for (let seed = 1; seed <= 20; seed++) for (let m = 0; m < 2; m++) {
            const p = mon({ seed, m });
            assert.ok(drumsOf(p, 'bell').length >= 4);
            assert.equal(drumsOf(p, 'shaker').length, 8);
            assert.equal(['shell', 'bongol', 'bongoh', 'guiro', 'guirot'].reduce((n, k) => n + drumsOf(p, k).length, 0), 0);
        }
    });
    test('montuno : la cloche accentue les coups de clave', () => {
        for (let m = 0; m < 2; m++) {
            const p = mon({ seed: 2, m, ph: { index: 2, intensity: 0.6 } });
            const bell = Object.fromEntries(drumsOf(p, 'bell').map(d => [d.pos * 2, d.vel]));
            const cl = claveSlots(p);
            const others = Object.keys(bell).map(Number).filter(e => !cl.includes(e));
            if (others.length) assert.ok(Math.max(...cl.filter(e => bell[e] !== undefined).map(e => bell[e])) >= Math.max(...others.map(e => bell[e])));
        }
    });
    test('conga : tumbao à chaque mesure, claque sur le 2 et tons ouverts sur le « et » du 2 et le 4', () => {
        for (const p of [son({ seed: 5 }), mon({ seed: 5 }), son({ seed: 5, m: 1 })]) {
            const c = p.drums.filter(d => ['conga1', 'conga2', 'slap'].includes(d.drum));
            const at = (e) => c.find(d => d.pos * 2 === e);
            assert.equal(at(2).drum, 'slap'); assert.equal(at(3).drum, 'conga2'); assert.equal(at(6).drum, 'conga2');
        }
    });
    test('positions dans la mesure, vélocités dans ]0 ; 1], noms de sons connus', () => {
        for (let seed = 1; seed <= 30; seed++) for (const idx of [0, 2]) {
            const p = plan({ seed, m: seed % 4, ph: { index: idx, intensity: (seed % 10) / 10 } });
            p.drums.forEach(d => { assert.ok(d.pos >= 0 && d.pos < 4, d.drum); assert.ok(d.vel > 0 && d.vel <= 1, d.drum); assert.ok(drumSpec({ drum: d.drum }), d.drum); });
        }
    });
    test('roulement de fin de phrase : il remplace congas, cáscara, bongos et güiro sur le dernier temps, jamais la clave ni la cloche', () => {
        for (const fillKind of [0, 1, 2]) for (const idx of [0, 2]) {
            const p = plan({ seed: 3, isTurn: true, i: 3, ph: { index: idx, fill: true, fillKind } });
            const last = p.drums.filter(d => d.pos >= 3 - 1e-9);
            const roll = last.filter(d => ['bongol', 'bongoh', 'conga1', 'conga2', 'slap', 'shell'].includes(d.drum));
            assert.equal(roll.length, 4, `roulement de 4 doubles croches (type ${fillKind})`);
            assert.deepEqual(roll.map(d => d.pos).sort((a, b) => a - b), [3, 3.25, 3.5, 3.75]);
            assert.ok(roll.every((d, k) => k === 0 || d.vel >= roll[k - 1].vel), 'crescendo');
            assert.equal(last.filter(d => ['guiro', 'guirot', 'shaker'].includes(d.drum)).length, 0);
            const before = p.drums.filter(d => d.pos < 3 - 1e-9);
            assert.ok(before.some(d => ['conga1', 'conga2', 'slap'].includes(d.drum)), 'le tumbao joue avant le roulement');
        }
    });
    test('sans roulement, le dernier temps joue le tumbao complet', () => {
        const p = plan({ seed: 3, isTurn: true, i: 3, ph: { index: 0, fill: false } });
        assert.ok(p.drums.some(d => d.drum === 'conga2' && d.pos === 3));
    });
});

describe('basse : tumbao', () => {
    const bassOf = (o) => plan(o).bass;
    test('quinte sur le « et » du 2 dans chaque mesure', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const t = latBassTones(baseEnv(), Cm7);
            const b = bassOf({ seed, tied: true, nextStep: Cm7 });
            const h = b.find(x => x.pos === 1.5);
            assert.ok(h, `graine ${seed} : pas de note sur le « et » du 2`);
            assert.equal(h.abs, t.fifth);
        }
    });
    test('mesure suivante sur le même accord : la basse reste sur la fondamentale à l\'anticipation', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const b = bassOf({ seed, tied: true, nextStep: Cm7, step: Cm7, last: true });
            const ant = b.find(x => x.tok === 'N');
            assert.equal(ant.abs, latBassTones(baseEnv(), Cm7).root);
        }
    });
    test('l\'accord change à la mesure suivante : la basse annonce la fondamentale du nouvel accord, tenue par-dessus la barre de mesure', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const p = plan({ seed, step: Cm7, nextStep: G7, last: true, tied: true });
            const ant = p.bass.find(x => x.tok === 'N');
            assert.equal(ant.abs, latBassTones(baseEnv(), G7).root);
            assert.ok(ant.pos === 3 || ant.pos === 3.5, `anticipation sur le temps 4 ou le « et » du 4 : ${ant.pos}`);
            assert.ok(ant.pos + ant.dur > 4, 'note tenue sur le 1 suivant');
            assert.equal(p.tie, true);
        }
    });
    test('pas de note sur le 1 quand la mesure précédente a anticipé ; fondamentale sur le 1 en début de jam', () => {
        for (let seed = 1; seed <= 30; seed++) {
            assert.ok(bassOf({ seed, tied: true }).every(b => b.pos >= 0.2), `graine ${seed} : note sur le 1 malgré la liaison`);
            const first = bassOf({ seed, tied: false });
            assert.equal(first[0].pos, 0);
            assert.equal(first[0].abs, latBassTones(baseEnv(), Cm7).root);
        }
    });
    test('l\'état de liaison est rendu à la mesure suivante', () => {
        assert.equal(plan({ tied: false }).tie, true);
        assert.equal(plan({ tied: true, nextStep: Cm7 }).tie, true);
    });
    test('durées et vélocités valides, notes triées sans chevauchement notable', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const b = bassOf({ seed, m: seed % 4, tied: seed % 2 === 0, nextStep: seed % 3 ? G7 : Cm7, last: true, ph: { index: seed % 5, intensity: (seed % 10) / 10 } });
            b.forEach((x, k) => {
                assert.ok(x.dur >= 0.12 && x.vel > 0 && x.vel <= 1 && x.pos >= 0 && x.pos < 4);
                if (k) assert.ok(x.pos > b[k - 1].pos && b[k - 1].pos + b[k - 1].dur <= x.pos + 0.031);
            });
        }
    });
});

describe('piano : montuno', () => {
    const rootPc = (n, off = 0) => pcOf(n, off);
    test('le montuno joue sur chaque coup de clave, des deux côtés', () => {
        for (let seed = 1; seed <= 30; seed++) for (let m = 0; m < 2; m++) {
            const p = plan({ seed, m, nextStep: Cm7, ph: { index: seed % 4, intensity: (seed % 10) / 10 } });
            const at = new Set(slots(p.piano));
            claveSlots(p).forEach(e => assert.ok(at.has(e), `graine ${seed}, mesure ${m} : pas de coup de piano sur la croche ${e}`));
        }
    });
    test('positions, durées, vélocités et notes valides', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const p = plan({ seed, m: seed % 4, step: seed % 2 ? Cm7 : G7, nextStep: seed % 3 ? Fm7 : Cm7, last: true, ph: { index: seed % 5, intensity: (seed % 10) / 10 } });
            assert.ok(p.piano.length >= 1);
            p.piano.forEach((e, k) => {
                assert.ok(e.pos >= 0 && e.pos < 4 && e.dur >= 0.14 && e.vel > 0 && e.vel <= 1);
                assert.ok(e.intervals.length >= 1 && e.intervals.length <= 2 && e.intervals.every(Number.isInteger));
                if (k) assert.ok(e.pos > p.piano[k - 1].pos);
            });
        }
    });
    test('les notes sont des notes de l\'accord joué', () => {
        for (const [step, tones] of [[Cm7, [0, 3, 7, 10]], [G7, [7, 11, 2, 5]]]) {
            for (let seed = 1; seed <= 20; seed++) {
                const p = plan({ seed, step, nextStep: step, last: false, m: seed % 2 });
                p.piano.forEach(e => e.intervals.forEach(n => assert.ok(tones.includes(rootPc(n)), `graine ${seed} : ${n} hors accord`)));
            }
        }
    });
    test('changement d\'accord : le piano passe au nouvel accord à l\'anticipation (quand la phrase le prévoit), jamais avant', () => {
        let anticipated = 0, total = 0;
        for (let seed = 1; seed <= 80; seed++) {
            const p = plan({ seed, step: Cm7, nextStep: G7, last: true, m: seed % 2, ph: { index: seed % 4 } });
            const ant = p.ph.sa.ant / 2;
            const cm = [0, 3, 7, 10], g = [7, 11, 2, 5];
            p.piano.forEach(e => {
                const inNew = e.intervals.every(n => g.includes(rootPc(n)) && !cm.includes(rootPc(n)));
                const inOld = e.intervals.every(n => cm.includes(rootPc(n)));
                if (e.pos < ant - 1e-9) assert.ok(inOld, `graine ${seed} : note du nouvel accord trop tôt (${e.pos})`);
                else if (p.ph.sa.pianoAnt) { assert.ok(g.includes(rootPc(e.intervals[0])), `graine ${seed}`); if (inNew) anticipated++; }
            });
            if (p.ph.sa.pianoAnt) total++;
        }
        assert.ok(total > 0 && anticipated > 0);
    });
    test('une mesure à deux accords : chaque accord a sa part de montuno et de basse', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const p = plan({ seed, halves: [Cm7, Fm7], nextStep: Cm7, last: true, tied: seed % 2 === 0, m: seed % 2 });
            assert.ok(p.piano.some(e => e.pos < 2) && p.piano.some(e => e.pos >= 2), 'piano sur les deux moitiés');
            assert.ok(p.bass.some(e => e.pos >= 2) && (seed % 2 === 0 || p.bass.some(e => e.pos < 2)), 'basse sur les deux moitiés');
            const second = p.bass.find(e => e.pos >= 2 && e.pos < 2.4);
            assert.ok(second, 'fondamentale du second accord au changement');
            assert.equal(pcOf(second.abs), pcOf(latBassTones(baseEnv(), Fm7).root), 'fondamentale (éventuellement à l\'octave)');
        }
    });
    test('transposition d\'instrument : le registre suit', () => {
        const hi = (off) => Math.max(...plan({ seed: 3, env: { transOffset: off } }).piano.flatMap(e => e.intervals)) + off;
        for (const off of [0, -2, -9]) assert.ok(hi(off) <= 36 + 11, `transOffset ${off}`);
    });
});

describe('déterminisme et bords', () => {
    test('à entrées égales, plan identique ; autre graine de phrase, autre plan', () => {
        const a = plan({ seed: 11, m: 3, ph: { index: 2 } }), b = plan({ seed: 11, m: 3, ph: { index: 2 } });
        assert.deepEqual({ ...a, ph: 0 }, { ...b, ph: 0 });
        const variants = new Set();
        for (let seed = 1; seed <= 30; seed++) variants.add(JSON.stringify(plan({ seed, m: 3, ph: { index: 2 } }).piano));
        assert.ok(variants.size > 2);
    });
    test('sans nextStep (fin de grille) : pas d\'anticipation de nouvel accord', () => {
        const p = plan({ nextStep: null, last: true });
        assert.ok(p.bass.length > 0 && p.piano.length > 0);
        assert.equal(p.bass.find(x => x.tok === 'N').abs, latBassTones(baseEnv(), Cm7).root);
    });
    test('le plan de phrase est mis en cache dans la phrase (ph.sa) et reste le même d\'une mesure à l\'autre', () => {
        const ph = phrase(5, { index: 2 });
        const env = baseEnv();
        buildSalsaPlan(env, 4, false, Cm7, G7, false, null, ph, 0, 4, false, 0);
        const first = ph.sa;
        buildSalsaPlan(env, 4, false, Cm7, G7, false, null, ph, 1, 4, false, 1);
        assert.equal(ph.sa, first);
    });
});
