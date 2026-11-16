// Tests de l'orchestre Latin (band/latin-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { latinPhraseExtras, buildLatinPlan } = require('./latin-plan.js');
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
const Dm7 = { rootIndex: 2, chordId: 'm7', scaleId: 'dorian' };
const G7 = { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' };
const Cmaj7 = { rootIndex: 0, chordId: 'maj7', scaleId: 'ionian' };
const freshState = () => ({ latVoice: null, latTie: false, latRunAt: -9, bandLastFill: false });
const mkEnv = (state = freshState(), transOffset = 0) => ({
    transOffset, state, findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0]
});
const ctx = (over = {}) => ({ isCuba: false, bpm: 100, groove: undefined, ...over });
const mkPhrase = (seed, c = ctx(), extra = {}) => ({ rng: seeded(seed), style: 'latin', fill: false, lift: false, ...latinPhraseExtras(c, seeded(seed * 31), null, seed % 3), ...extra });
function plan({ step = Dm7, nextStep = G7, last = false, halves = null, seed = 1, i = 0, L = 4, isTurn = false, m = 0, env = mkEnv(), ph = mkPhrase(seed) } = {}) {
    return buildLatinPlan(env, step, nextStep, last, halves, ph, i, L, isTurn, m);
}

describe('latinPhraseExtras (choix du rythme)', () => {
    test('orchestre Cuba : toujours le rythme afro', () => {
        for (let s = 1; s <= 60; s++) assert.equal(latinPhraseExtras(ctx({ isCuba: true }), seeded(s), null, s % 3).groove, 'afro');
    });
    test('orchestre Brasil : jamais afro quand rien n’est imposé ; bossa ou samba', () => {
        for (let s = 1; s <= 100; s++) {
            const g = latinPhraseExtras(ctx(), seeded(s), null, s % 3).groove;
            assert.ok(['bossa', 'samba'].includes(g), g);
        }
    });
    test('un rythme imposé (tango, samba, piazzolla) est respecté', () => {
        for (const groove of ['tango', 'samba', 'piazzolla']) {
            for (let s = 1; s <= 20; s++) assert.equal(latinPhraseExtras(ctx({ groove }), seeded(s), null, 0).groove, groove);
        }
    });
    test('tempo lent → plutôt bossa, tempo rapide → plutôt samba', () => {
        const count = (bpm, g) => Array.from({ length: 300 }, (_, s) => latinPhraseExtras(ctx({ bpm }), seeded(s + 1), null, 0).groove).filter(x => x === g).length;
        assert.ok(count(90, 'bossa') > count(90, 'samba'));
        assert.ok(count(200, 'samba') > count(200, 'bossa'));
    });
    test('intensité entre 0,25 et 1', () => {
        for (let s = 1; s <= 100; s++) {
            const I = latinPhraseExtras(ctx(), seeded(s), s % 2 ? null : { style: 'latin', intensity: 0.9, groove: 'bossa' }, s % 3).intensity;
            assert.ok(I >= 0.25 && I <= 1, `${I}`);
        }
    });
});

describe('buildLatinPlan', () => {
    for (const groove of ['bossa', 'samba', 'afro', 'tango']) {
        test(`${groove} : guitare, basse et batterie dans la mesure, vélocités valides`, () => {
            for (let seed = 1; seed <= 50; seed++) {
                const c = ctx({ groove: groove === 'afro' ? undefined : groove, isCuba: groove === 'afro' });
                const p = plan({ seed, i: seed % 4, m: seed % 4, isTurn: seed % 5 === 0, last: seed % 2 === 0, ph: mkPhrase(seed, c, { fill: seed % 3 === 0 }) });
                for (const kind of ['piano', 'bass', 'drums']) {
                    assert.ok(Array.isArray(p[kind]), kind);
                    for (const e of p[kind]) {
                        assert.ok(e.pos >= 0 && e.pos < 4 + 1e-6, `${groove} ${kind} pos ${e.pos}`);
                        assert.ok(e.vel > 0 && e.vel <= 1.2, `${groove} ${kind} vel ${e.vel}`);
                    }
                }
                assert.ok(p.bass.length > 0 && p.drums.length > 0, `${groove} vide (graine ${seed})`);
            }
        });
    }
    test('déterministe', () => {
        assert.deepEqual(plan({ seed: 12 }), plan({ seed: 12 }));
    });
    test('mesure coupée en deux accords : basse dans chaque moitié', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const p = plan({ halves: [Dm7, G7], nextStep: Cmaj7, seed });
            assert.ok(p.bass.some(b => b.pos < 2), `1re moitié (graine ${seed})`);
            assert.ok(p.bass.some(b => b.pos >= 2 - 1e-6), `2de moitié (graine ${seed})`);
        }
    });
});

describe('mémoire entre les mesures (env.state)', () => {
    test('le voicing de la guitare est mémorisé', () => {
        const state = freshState();
        plan({ env: mkEnv(state) });
        assert.ok(state.latVoice && state.latVoice.v.length >= 3);
        assert.equal(state.latVoice.key, '2:m7');
    });
    test('latTie reste un booléen après chaque mesure', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const state = freshState();
            plan({ env: mkEnv(state), seed, last: true, nextStep: Cmaj7 });
            assert.equal(typeof state.latTie, 'boolean');
        }
    });
    test('latRunAt ne vaut que -9 (aucune phrase) ou le numéro de la mesure qui vient d’être jouée', () => {
        for (let seed = 1; seed <= 60; seed++) {
            const state = freshState();
            plan({ env: mkEnv(state), seed, m: 3, isTurn: true });
            assert.ok(state.latRunAt === -9 || state.latRunAt === 3, `${state.latRunAt}`);
        }
    });
});

describe('bossa nova (buildBossaPlan)', () => {
    const { bossaFingers, bossaThumb, bossaFingerPcs } = require('./latin-plan.js');
    const bossaPh = (seed, extra = {}) => mkPhrase(seed, ctx({ groove: 'bossa', bpm: 130 }), extra);
    const thumbs = (p) => p.piano.filter(e => e.thumb);
    const fingers = (p) => p.piano.filter(e => !e.thumb);
    const drumPos = (p, drum) => p.drums.filter(e => e.drum === drum).map(e => e.pos);

    test('le pouce joue toujours les temps 1 et 3, une seule note grave', () => {
        for (let seed = 1; seed <= 60; seed++) {
            const p = plan({ seed, m: seed % 4, i: seed % 4, last: seed % 2 === 0, ph: bossaPh(seed) });
            assert.deepEqual(thumbs(p).map(e => e.pos), [0, 2], `graine ${seed}`);
            thumbs(p).forEach(e => { assert.equal(e.intervals.length, 1); assert.ok(e.intervals[0] >= -8 && e.intervals[0] <= 10); });
        }
    });
    test('les doigts pincent des accords de trois notes au-dessus du pouce, sur les croches, sans grattés ni arpèges', () => {
        for (let seed = 1; seed <= 60; seed++) {
            const p = plan({ seed, m: seed % 4, i: seed % 4, ph: bossaPh(seed) });
            assert.ok(fingers(p).length >= 2, `graine ${seed}`);
            fingers(p).forEach(e => {
                assert.equal(e.intervals.length, 3);
                assert.ok(e.intervals[0] > thumbs(p)[0].intervals[0]);
                assert.ok(Math.abs(e.pos * 2 - Math.round(e.pos * 2)) < 1e-9, `pos ${e.pos}`);
                assert.ok(e.roll <= 0.006 && e.dir === 1);
            });
        }
    });
    test('voicing sans fondamentale : tierce, septième et neuvième (Dm7 dorien → fa, do, mi)', () => {
        const env = mkEnv();
        assert.deepEqual(bossaFingerPcs(env, Dm7), [0, 4, 5]);
        const v = bossaFingers(env, Dm7, null);
        assert.equal(v.length, 3);
        for (let k = 0; k + 1 < v.length; k++) assert.ok(v[k + 1] - v[k] > 1, 'pas de seconde mineure serrée');
        // gamme sans neuvième majeure (phrygien) : la quinte remplace la neuvième
        assert.deepEqual(bossaFingerPcs(env, { rootIndex: 4, chordId: 'm7', scaleId: 'phrygian' }), [2, 7, 11]);
    });
    test('pouce : fondamentale entre mi2 et mi♭3 réels, y compris pour un instrument transpositeur', () => {
        for (const off of [0, -2, -9]) for (let r = 0; r < 12; r++) {
            const th = bossaThumb(mkEnv(freshState(), off), { rootIndex: r, chordId: 'maj7', scaleId: 'ionian' });
            assert.ok(th.root + off >= -8 && th.root + off <= 3, `${off} ${r} ${th.root}`);
            assert.equal(Math.abs(th.fifth - th.root) === 5 || Math.abs(th.fifth - th.root) === 7, true);
        }
    });
    test('l’accord anticipé sur le « et » du 4e temps est lié : pas de frappe des doigts sur le 1er temps suivant', () => {
        let seen = 0;
        for (let seed = 1; seed <= 80; seed++) {
            const state = freshState();
            const ph = bossaPh(seed);
            const p1 = plan({ env: mkEnv(state), seed, m: 0, i: 0, last: true, nextStep: G7, ph });
            const ant = fingers(p1).find(e => e.pos === 3.5);
            if (!ant) continue;
            seen++;
            const p2 = plan({ env: mkEnv(state), step: G7, nextStep: Cmaj7, seed, m: 1, i: 1, ph });
            assert.ok(!fingers(p2).some(e => e.pos === 0), `graine ${seed}`);
            assert.deepEqual(fingers(p2)[0].intervals, ant.intervals, 'même accord que l’anticipation');
        }
        assert.ok(seen > 20, `anticipations vues : ${seen}`);
    });
    test('contrebasse : fondamentale sur le 1, quinte sur le 3, levée discrète vers l’accord suivant', () => {
        for (let seed = 1; seed <= 60; seed++) {
            const p = plan({ seed, last: true, nextStep: G7, ph: bossaPh(seed) });
            const at = (pos) => p.bass.find(b => b.pos === pos);
            assert.equal(((at(0).abs % 12) + 12) % 12, 2, 'ré sur le 1er temps');
            assert.equal(((at(2).abs % 12) + 12) % 12, 9, 'la sur le 3e temps');
            p.bass.filter(b => b.pos % 1 !== 0).forEach(b => assert.ok(b.vel < at(0).vel, 'levée plus douce'));
            p.bass.forEach(b => assert.ok(b.pos % 0.5 === 0));
        }
    });
    test('batterie : clave de bossa 3-2 au cross-stick, grosse caisse 1, 2&, 3, 4&, ni toms ni crash', () => {
        for (let seed = 1; seed <= 60; seed++) {
            const ph = bossaPh(seed, { claveOn: true, fill: false });
            assert.deepEqual(drumPos(plan({ seed, m: 0, ph }), 'rim'), [0, 1.5, 3]);
            assert.deepEqual(drumPos(plan({ seed, m: 1, ph }), 'rim'), [1, 2.5]);
            const p = plan({ seed, m: 3, i: 3, isTurn: true, ph: bossaPh(seed, { fill: true }) });
            assert.deepEqual(drumPos(p, 'kick'), [0, 1.5, 2, 3.5]);
            p.drums.forEach(e => assert.ok(['hat', 'ohat', 'shaker', 'rim', 'kick', 'ghost'].includes(e.drum), e.drum));
            assert.ok(p.drums.filter(e => e.drum === 'hat' || e.drum === 'ohat' || e.drum === 'shaker').length >= 8);
        }
    });
    test('mesure à deux accords : pouce sur la fondamentale de chaque accord, chaque accord est joué par les doigts', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const p = plan({ halves: [Dm7, G7], nextStep: Cmaj7, last: true, seed, ph: bossaPh(seed) });
            const [t1, t2] = thumbs(p);
            assert.equal(((t1.intervals[0] % 12) + 12) % 12, 2);
            assert.equal(((t2.intervals[0] % 12) + 12) % 12, 7);
            const g7 = bossaFingerPcs(mkEnv(), G7);
            assert.ok(fingers(p).some(e => e.pos >= 1.5 && e.pos < 3.5 && e.intervals.every(n => g7.includes(((n % 12) + 12) % 12))), `graine ${seed}`);
        }
    });
    test('accord maj7 tenu : la septième majeure s’allège en sixte une mesure sur deux', () => {
        const state = freshState();
        const ph = bossaPh(5);
        const tops = [0, 1].map(m => {
            const p = plan({ env: mkEnv(state), step: Cmaj7, nextStep: Cmaj7, seed: 5, m, i: m, ph });
            return new Set(fingers(p).filter(e => e.pos < 3.5).flatMap(e => e.intervals.map(n => ((n % 12) + 12) % 12)));
        });
        assert.ok(tops[0].has(11) && !tops[0].has(9));
        assert.ok(tops[1].has(9) && !tops[1].has(11));
    });
});
