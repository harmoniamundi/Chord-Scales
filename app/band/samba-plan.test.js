// Tests de l'orchestre samba (band/samba-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { sambaPhraseExtras, buildSambaPlan, SAMBA_TELECO, SAMBA_FINGERS, SAMBA_BASS, SAMBA_GINGA } = require('./samba-plan.js');
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
    splitBeat: 1, transOffset: 0, state: { latVoice: null, bandLastFill: false },
    findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0],
    ...over
});
const C = { rootIndex: 0, chordId: 'maj7', scaleId: 'ionian' };
const A7 = { rootIndex: 9, chordId: '7', scaleId: 'mixolydian' };
const Dm7 = { rootIndex: 2, chordId: 'm7', scaleId: 'dorian' };
const phrase = (seed, extra = {}) => ({ rng: seeded(seed), index: 0, intensity: 0.5, fill: false, fillKind: 0, groove: 'samba', ...extra });

function plan({ bpb = 2, step = C, nextStep = A7, last = false, halves = null, seed = 1, i = 0, L = 4, isTurn = false, m = 0, env = {}, ph = {}, sb } = {}) {
    const e = baseEnv(env);
    const p = phrase(seed, ph);
    if (sb) p.sb = { ...sambaPhraseExtras(p, p.rng), ...sb };
    return { ...buildSambaPlan(e, bpb, step, nextStep, last, halves, p, i, L, isTurn, m), env: e, ph: p };
}
const near = (a, b, eps = 0.06) => Math.abs(a - b) < eps;
const of = (out, drum) => out.drums.filter(d => d.drum === drum);

describe('tables rythmiques', () => {
    test('teleco-teco : 7 coups sur deux cycles, tous sur la grille des doubles croches', () => {
        const all = [...SAMBA_TELECO.A.map(h => h[0]), ...SAMBA_TELECO.B.map(h => h[0] + 2)];
        assert.equal(all.length, 7);
        assert.ok(all.every(p => Number.isInteger(p * 4) && p >= 0 && p < 4));
    });
    test('les figures de doigts ne tombent jamais sur les temps (le pouce les tient)', () => {
        for (const f of Object.values(SAMBA_FINGERS)) for (const sd of ['A', 'B']) {
            assert.ok(f[sd].every(([p]) => !Number.isInteger(p) && p > 0 && p < 2));
        }
    });
    test('basse : toujours la fondamentale sur le 1 et une note sur le 2', () => {
        SAMBA_BASS.forEach(c => { assert.equal(c[0][0], 0); assert.equal(c[0][1], 'R'); assert.ok(c.some(h => h[0] === 1)); });
    });
    test('ginga : la première double croche reste sur le temps, les autres traînent légèrement', () => {
        assert.equal(SAMBA_GINGA[0], 0);
        assert.ok(SAMBA_GINGA.slice(1).every(x => x > 0 && x < 0.05));
    });
    test('tous les sons de percussion existent', () => {
        const out = plan({ sb: { ganza: true, agogo: true, tamborim: true, terceira: true }, isTurn: true, ph: { fill: true } });
        new Set(out.drums.map(d => d.drum)).forEach(d => assert.ok(drumSpec({ drum: d }), d));
    });
});

describe('mesure à 2 temps', () => {
    test('surdo étouffé sur le 1, ouvert et plus fort sur le 2 ; pas de batterie', () => {
        const out = plan({ sb: { terceira: false } });
        const s1 = out.drums.find(d => near(d.pos, 0, 0.01) && d.drum.startsWith('surdo'));
        const s2 = out.drums.find(d => near(d.pos, 1, 0.01) && d.drum.startsWith('surdo'));
        assert.equal(s1.drum, 'surdom'); assert.equal(s2.drum, 'surdo');
        assert.ok(s2.vel > s1.vel);
        assert.ok(!out.drums.some(d => ['kick', 'hat', 'snare', 'rim', 'ohat'].includes(d.drum)));
    });
    test('pandeiro : quatre coups par temps, accent sur la dernière double croche', () => {
        const out = plan({ sb: { ganza: false, agogo: false } });
        const pd = out.drums.filter(d => d.drum.startsWith('pand'));
        assert.equal(pd.length, 8);
        const first = pd.filter(d => d.pos < 1);
        assert.ok(first[3].vel > first[1].vel);
    });
    test('tamborim : côté A puis côté B d\'une mesure à l\'autre', () => {
        const a = plan({ m: 0, sb: { tamborim: true, flip: false }, seed: 3 });
        const b = plan({ m: 1, sb: { tamborim: true, flip: false }, seed: 3 });
        const posA = of(a, 'tamborim').map(d => Math.round(d.pos * 4) / 4);
        const posB = of(b, 'tamborim').map(d => Math.round(d.pos * 4) / 4);
        assert.ok(posA.includes(0) && !posB.includes(0));
        assert.ok(posB.every(p => SAMBA_TELECO.B.some(h => h[0] === p)));
    });
    test('violão : pouce sur les deux temps, doigts sur les syncopes', () => {
        const out = plan({ sb: { ghosts: false } });
        assert.ok(out.piano.some(e => near(e.pos, 0, 0.01)));
        assert.ok(out.piano.some(e => near(e.pos, 1, 0.01)));
        assert.ok(out.piano.filter(e => !Number.isInteger(Math.round(e.pos * 100) / 100)).length >= 2);
        assert.equal(out.guitar, true);
    });
    test('positions dans la mesure et durées positives', () => {
        for (let seed = 1; seed < 40; seed++) {
            const out = plan({ seed, last: seed % 2 === 0, isTurn: seed % 3 === 0, ph: { fill: seed % 3 === 0, intensity: (seed % 10) / 10 } });
            [...out.piano, ...out.bass, ...out.drums].forEach(e => assert.ok(e.pos >= 0 && e.pos < 2 + 0.05, `pos ${e.pos}`));
            [...out.piano, ...out.bass].forEach(e => assert.ok(e.dur > 0));
        }
    });
    test('anticipation : l\'accord suivant peut être pincé sur la dernière double croche', () => {
        let seen = false;
        for (let seed = 1; seed < 30 && !seen; seed++) {
            const out = plan({ seed, last: true, ph: { intensity: 0.9 } });
            const lastG = out.piano.filter(e => e.pos >= 1.75 - 1e-6);
            if (lastG.length) {
                const pcs = lastG[0].intervals.map(n => ((n % 12) + 12) % 12);
                if (pcs.includes(1)) seen = true; // do# : tierce de A7, absente de Cmaj7
            }
        }
        assert.ok(seen);
    });
    test('baixaria : trois doubles croches qui aboutissent juste à côté de la fondamentale suivante', () => {
        let found = null;
        for (let seed = 1; seed < 80 && !found; seed++) {
            const out = plan({ seed, last: true, isTurn: true, nextStep: Dm7, ph: { intensity: 0.9 } });
            const run = out.bass.filter(b => b.pos >= 1.25 - 1e-6);
            if (run.length === 3 && run.every(b => b.tok === 'A')) found = run;
        }
        assert.ok(found, 'baixaria jouée au moins une fois');
        const t = latBassTones(baseEnv(), Dm7).root;
        const lastN = found[2].abs;
        assert.ok(Math.abs(lastN - t) <= 3 && lastN !== t);
    });
    test('mesure à deux accords : le second accord a sa fondamentale à la basse sur son temps', () => {
        const out = plan({ halves: [C, A7] });
        const b = out.bass.find(x => near(x.pos, 1, 0.01));
        assert.equal(((b.abs % 12) + 12) % 12, 9);
    });
    test('virada en fin de phrase, surdo ouvert sur le 1 de la phrase suivante', () => {
        const env = baseEnv();
        const p1 = phrase(5, { fill: true });
        const out = buildSambaPlan(env, 2, C, A7, true, null, p1, 3, 4, true, 3);
        assert.ok(of(out, 'tamborim').filter(d => d.pos >= 1).length >= 3);
        assert.equal(env.state.bandLastFill, true);
        const out2 = buildSambaPlan(env, 2, A7, C, false, null, phrase(6), 0, 4, false, 4);
        assert.equal(out2.drums.find(d => near(d.pos, 0, 0.01) && d.drum.startsWith('surdo')).drum, 'surdo');
    });
});

describe('mesure à 4 temps', () => {
    test('deux cycles : surdo ouvert sur 2 et 4, teleco-teco complet dans la mesure', () => {
        const out = plan({ bpb: 4, sb: { tamborim: true, flip: false, terceira: false } });
        const open = of(out, 'surdo').map(d => Math.round(d.pos));
        assert.deepEqual(open, [1, 3]);
        assert.ok(of(out, 'tamborim').length >= 6);
        [...out.piano, ...out.bass, ...out.drums].forEach(e => assert.ok(e.pos < 4.05));
    });
    test('déterministe avec la même graine', () => {
        const a = plan({ bpb: 4, seed: 11 }), b = plan({ bpb: 4, seed: 11 });
        assert.deepEqual(JSON.stringify(a.drums), JSON.stringify(b.drums));
        assert.deepEqual(JSON.stringify(a.piano), JSON.stringify(b.piano));
    });
});
