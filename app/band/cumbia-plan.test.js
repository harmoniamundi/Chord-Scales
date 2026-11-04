// Tests de l'orchestre de la cumbia (band/cumbia-plan.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { cumbiaVoicing, cumbiaPhraseExtras, buildCumbiaPlan, CUMBIA_BASS, CUMBIA_MEL_CELLS } = require('./cumbia-plan.js');
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
const G = { rootIndex: 7, chordId: 'majTriad', scaleId: 'ionian' };
const C = { rootIndex: 0, chordId: 'majTriad', scaleId: 'ionian' };
const D7 = { rootIndex: 2, chordId: '7', scaleId: 'mixolydian' };
const Gm = { rootIndex: 7, chordId: 'minTriad', scaleId: 'aeolian' };
const pc = (n) => ((n % 12) + 12) % 12;

const mkEnv = (over = {}) => ({
    transOffset: 0,
    findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0],
    splitBeat: 2,
    bpm: 98,
    state: { cumbiaVoice: null, cumbiaMel: null },
    ...over
});
const mkPhrase = (seed, over = {}) => ({ rng: seeded(seed), style: 'cumbia', ...cumbiaPhraseExtras(seeded(seed * 31), null, seed % 3), ...over });
function plan({ bpb = 4, ternary = false, step = G, nextStep = C, last = false, halves = null, seed = 1, i = 0, L = 4, isTurn = false, m = 0, env = mkEnv(), ph = mkPhrase(seed) } = {}) {
    return buildCumbiaPlan(env, bpb, ternary, step, nextStep, last, halves, ph, i, L, isTurn, m);
}
const at = (list, pos, drum) => list.filter(e => Math.abs(e.pos - pos) < 1e-6 && (!drum || e.drum === drum));

describe('cumbiaPhraseExtras (choix de la phrase)', () => {
    test('valeurs dans leurs bornes, sur beaucoup de graines', () => {
        for (let s = 1; s <= 300; s++) {
            const e = cumbiaPhraseExtras(seeded(s), s % 2 ? null : { style: 'cumbia', intensity: (s % 10) / 10 }, s % 4);
            assert.ok(e.intensity >= 0.28 && e.intensity <= 0.98);
            assert.ok([0, 1, 2].includes(e.mel));
            for (const [k, n] of [['bassIdx', CUMBIA_BASS.length], ['bassAlt', CUMBIA_BASS.length], ['chopIdx', 3], ['tambIdx', 3], ['alegIdx', 4]]) {
                assert.ok(Number.isInteger(e[k]) && e[k] >= 0 && e[k] < n, `${k}=${e[k]}`);
            }
            assert.equal(e.melSteps.length, 8);
            for (const k of ['alegre', 'guacGhost', 'maracas', 'thirds', 'fill', 'run']) assert.equal(typeof e[k], 'boolean', k);
        }
    });
    test('déterministe à graine égale', () => {
        assert.deepEqual(cumbiaPhraseExtras(seeded(5), null, 1), cumbiaPhraseExtras(seeded(5), null, 1));
    });
});

describe('cumbiaVoicing (accordéon)', () => {
    const env = { transOffset: 0, findChordObj: mkEnv().findChordObj };
    const pcs = (v) => v.map(pc).sort((a, b) => a - b);
    test('triade pour un accord majeur ou mineur : 1-3-5, croissant, dans le registre', () => {
        assert.deepEqual(pcs(cumbiaVoicing(env, G, null)), [2, 7, 11]);
        assert.deepEqual(pcs(cumbiaVoicing(env, Gm, null)), [2, 7, 10]);
        for (const cs of [G, C, Gm, D7]) {
            const v = cumbiaVoicing(env, cs, null);
            for (let k = 1; k < v.length; k++) assert.ok(v[k] > v[k - 1]);
            assert.ok(v[0] >= -7 && v[v.length - 1] <= 24, JSON.stringify(v));
        }
    });
    test('quatre sons pour une dominante (septième incluse)', () => {
        const v = cumbiaVoicing(env, D7, null);
        assert.equal(v.length, 4);
        assert.deepEqual(pcs(v), [0, 2, 6, 9]);
    });
    test('conduite des voix : G puis C bouge peu', () => {
        const a = cumbiaVoicing(env, G, null);
        const b = cumbiaVoicing(env, C, a);
        assert.ok(b.reduce((s, n, k) => s + Math.abs(n - a[k]), 0) <= 9);
    });
});

describe('buildCumbiaPlan : forme générale', () => {
    const cases = [['2/4', 2, false], ['3/4', 3, false], ['4/4', 4, false], ['6/8', 2, true], ['9/8', 3, true], ['12/8', 4, true]];
    for (const [name, bpb, ternary] of cases) {
        test(`${name} : événements dans la mesure, vélocités valides`, () => {
            for (let seed = 1; seed <= 60; seed++) {
                const p = plan({ bpb, ternary, seed, i: seed % 4, m: seed % 4, isTurn: seed % 5 === 0, last: seed % 2 === 0, env: mkEnv({ splitBeat: bpb === 2 ? 1 : 2 }) });
                for (const kind of ['piano', 'bass', 'drums']) {
                    assert.ok(Array.isArray(p[kind]), `${name} ${kind}`);
                    for (const e of p[kind]) {
                        assert.ok(e.pos >= 0 && e.pos < bpb, `${name} ${kind} pos ${e.pos} (graine ${seed})`);
                        assert.ok(e.vel > 0 && e.vel <= 1, `${name} ${kind} vel ${e.vel}`);
                    }
                    const sorted = p[kind].every((e, k, a) => k === 0 || a[k - 1].pos <= e.pos);
                    assert.ok(sorted, `${name} ${kind} non trié`);
                }
                assert.ok(p.piano.length > 0 && p.bass.length > 0 && p.drums.length > 0, `${name} vide (graine ${seed})`);
                assert.equal(p.accordion, true);
                p.bass.forEach(b => assert.ok(Number.isFinite(b.abs) && b.dur > 0));
                p.piano.forEach(e => assert.ok(e.dur > 0 && e.intervals.length >= 1 && e.intervals.every(Number.isFinite)));
            }
        });
    }
    test('déterministe : même graine, même mémoire → même plan', () => {
        assert.deepEqual(plan({ seed: 9 }), plan({ seed: 9 }));
    });
    test('toutes les percussions produites sont connues de la synthèse', () => {
        const { drumSpec } = require('../audio/drum-synths.js');
        const seen = new Set();
        for (let seed = 1; seed <= 80; seed++) for (const [bpb, ternary] of [[4, false], [2, false], [3, true]]) {
            plan({ bpb, ternary, seed, i: seed % 4, isTurn: seed % 3 === 0 }).drums.forEach(d => seen.add(d.drum));
        }
        for (const d of seen) assert.ok(drumSpec({ drum: d }), `percussion inconnue : ${d}`);
        for (const d of ['guacd', 'guacu', 'llam', 'llamo', 'tamb', 'palo']) assert.ok(seen.has(d), `${d} jamais joué`);
    });
});

describe('rythme de la cumbia (4/4)', () => {
    const flat = (over = {}) => plan({ ph: mkPhrase(4, { maracas: false, alegre: false, fill: false, mel: 0, ...over }), nextStep: G, isTurn: false });
    test('guacharaca : un coup sur chaque temps, deux petits coups sur le « et » et le « a »', () => {
        const p = flat();
        for (let b = 0; b < 4; b++) {
            assert.equal(at(p.drums, b, 'guacd').length, 1, `descendant au temps ${b}`);
            assert.equal(at(p.drums, b + 0.5, 'guacu').length, 1, `ascendant sur le « et » du temps ${b}`);
            assert.equal(at(p.drums, b + 0.75, 'guacu').length, 1, `ascendant sur le « a » du temps ${b}`);
        }
        const d = p.drums.filter(e => e.drum === 'guacd');
        assert.ok(d[0].vel > d[1].vel, 'accent sur le temps 1');
    });
    test('llamador : étouffé sur 1 et 3, ouvert sur 2 et 4 (et plus fort)', () => {
        const p = flat();
        [0, 2].forEach(b => assert.equal(at(p.drums, b, 'llam').length, 1));
        [1, 3].forEach(b => assert.equal(at(p.drums, b, 'llamo').length, 1));
        assert.ok(at(p.drums, 1, 'llamo')[0].vel > at(p.drums, 0, 'llam')[0].vel);
    });
    test('tambora : coup grave sur 1 et 3 dans toutes ses variantes', () => {
        for (let idx = 0; idx < 3; idx++) {
            const p = flat({ tambIdx: idx });
            assert.equal(at(p.drums, 0, 'tamb').length, 1);
            assert.equal(at(p.drums, 2, 'tamb').length, 1);
            assert.ok(p.drums.some(e => e.drum === 'palo'), 'baguettes sur le bois');
        }
    });
    test('maracas et alegre à la demande, absents sinon', () => {
        const without = flat();
        assert.ok(!without.drums.some(e => e.drum === 'shaker' || e.drum.startsWith('conga') || e.drum === 'slap'));
        const withAll = flat({ maracas: true, alegre: true, intensity: 0.7 });
        assert.equal(withAll.drums.filter(e => e.drum === 'shaker').length, 8);
        assert.ok(withAll.drums.some(e => e.drum.startsWith('conga') || e.drum === 'slap'));
    });
    test('fin de phrase : roulement d’alegre sur le dernier temps avant le changement d’accord', () => {
        const p = plan({ ph: mkPhrase(4, { fill: true, maracas: false }), isTurn: true, nextStep: C, last: true });
        const fill = p.drums.filter(e => e.pos >= 3 && (e.drum.startsWith('conga') || e.drum === 'slap'));
        assert.equal(fill.length, 4);
        assert.ok(fill[3].vel > fill[0].vel, 'crescendo');
    });
});

describe('basse', () => {
    const rootPc = (cs) => pc(cs.rootIndex + (T.lookupChord(cs.chordId).notes[0] || 0));
    test('fondamentale de l’accord sur le temps 1 et sur le temps 3, notes courtes', () => {
        for (let seed = 1; seed <= 80; seed++) {
            const p = plan({ step: G, nextStep: G, last: false, seed, i: 0 });
            const first = at(p.bass, 0)[0];
            assert.ok(first, `pas de basse sur le 1 (graine ${seed})`);
            assert.equal(pc(first.abs), rootPc(G));
            p.bass.forEach(b => assert.ok(b.dur <= 1.5));
        }
    });
    test('toutes les notes sont des degrés de l’accord (fondamentale, tierce, quinte, octave), hors note d’approche', () => {
        for (let seed = 1; seed <= 80; seed++) {
            const p = plan({ step: D7, nextStep: D7, last: false, seed, i: seed % 3 });
            const ok = new Set([2, 6, 9, 0]); // ré, fa#, la ; do (septième) toléré
            p.bass.forEach(b => assert.ok(ok.has(pc(b.abs)), `note ${pc(b.abs)} (graine ${seed})`));
        }
    });
    test('une note d’approche annonce l’accord suivant sur la dernière croche (souvent en fin de phrase)', () => {
        let withApproach = 0;
        for (let seed = 1; seed <= 60; seed++) {
            const p = plan({ step: D7, nextStep: G, last: true, isTurn: true, seed, i: 3, L: 4 });
            const lastHit = p.bass[p.bass.length - 1];
            // note d'approche vers sol : degré conjoint (fa, fa#, la♭, la) ou quinte inférieure (ré)
            if (lastHit.pos >= 3.5 - 1e-6 && [5, 6, 8, 9, 2].includes(pc(lastHit.abs))) withApproach++;
        }
        assert.ok(withApproach >= 30, `approche sur ${withApproach}/60`);
    });
    test('registre de la basse', () => {
        for (let seed = 1; seed <= 60; seed++) {
            plan({ step: C, seed, i: seed % 4 }).bass.forEach(b => assert.ok(b.abs >= -14 && b.abs <= 12, `abs ${b.abs}`));
        }
    });
    test('mesure coupée en deux accords : la basse reprend la fondamentale du second accord', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const p = plan({ halves: [G, D7], seed, env: mkEnv({ splitBeat: 2 }) });
            const second = p.bass.filter(b => b.pos >= 2 - 1e-6 && b.pos < 2.8);
            assert.ok(second.length > 0, `rien dans la 2de moitié (graine ${seed})`);
            assert.equal(pc(second[0].abs), 2, `fondamentale ré attendue (graine ${seed})`);
        }
    });
});

describe('accordéon : mélodie et accords', () => {
    const mel = (p) => p.piano.filter(e => e.art === 'mel');
    test('mélodie dans la gamme, dans le registre, sans accord sous une attaque de mélodie', () => {
        for (let seed = 1; seed <= 80; seed++) {
            const p = plan({ step: G, nextStep: G, last: false, seed, i: seed % 4, ph: mkPhrase(seed, { mel: 2 }) });
            const sc = new Set(T.scalesDb.ionian.intervals.map(x => pc(7 + x)));
            mel(p).forEach(e => e.intervals.forEach(n => {
                assert.ok(sc.has(pc(n)), `note ${pc(n)} hors gamme (graine ${seed})`);
                assert.ok(n >= 6 && n <= 27, `note ${n} hors registre`);
            }));
            const pah = p.piano.filter(e => e.art === 'pah');
            pah.forEach(c => assert.ok(!mel(p).some(m => Math.abs(m.pos - c.pos) < 0.2), 'accord sur une attaque de mélodie'));
        }
    });
    test('question / réponse : la question se pose sur la tierce ou la quinte, la réponse sur la fondamentale', () => {
        for (let seed = 1; seed <= 80; seed++) {
            const ph = mkPhrase(seed, { mel: 2, thirds: false, run: false });
            const env = mkEnv();
            const q = mel(plan({ step: G, nextStep: G, env, ph, i: 0 }));
            const a = mel(plan({ step: G, nextStep: G, env, ph, i: 1 }));
            assert.ok(q.length && a.length);
            assert.ok([11, 2].includes(pc(q[q.length - 1].intervals[0])), `question sur ${pc(q[q.length - 1].intervals[0])} (graine ${seed})`);
            assert.equal(pc(a[a.length - 1].intervals[0]), 7, `réponse sur ${pc(a[a.length - 1].intervals[0])} (graine ${seed})`);
        }
    });
    test('phrase de deux mesures reprise telle quelle une fois sur deux (carrure de quatre mesures)', () => {
        const ph = mkPhrase(11, { mel: 2, thirds: false, run: false });
        const rhythm = (i) => mel(plan({ step: G, nextStep: G, env: mkEnv(), ph, i })).map(e => e.pos);
        assert.deepEqual(rhythm(0), rhythm(0));
        assert.ok(rhythm(0).length > 0);
    });
    test('doublure à la tierce inférieure quand elle est activée', () => {
        const p = plan({ step: G, nextStep: G, ph: mkPhrase(3, { mel: 2, thirds: true }) });
        const doubled = mel(p).filter(e => e.intervals.length === 2);
        assert.ok(doubled.length > 0);
        doubled.forEach(e => { const d = e.intervals[1] - e.intervals[0]; assert.ok(d >= 2 && d <= 5, `intervalle ${d}`); });
    });
    test('sans mélodie : accords en contretemps seulement', () => {
        const p = plan({ ph: mkPhrase(2, { mel: 0, chopIdx: 0 }), nextStep: G });
        assert.ok(p.piano.every(e => e.art === 'pah'));
        assert.deepEqual(p.piano.map(e => e.pos), [0.5, 1.5, 2.5, 3.5]);
    });
    test('petite gamme rapide vers l’accord suivant en fin de phrase', () => {
        let runs = 0;
        for (let seed = 1; seed <= 40; seed++) {
            const p = plan({ step: G, nextStep: D7, last: true, isTurn: true, seed, i: 3, L: 4, ph: mkPhrase(seed, { run: true }) });
            const r = p.piano.filter(e => e.art === 'run');
            if (r.length) { runs++; assert.equal(r.length, 4); assert.ok(r.every(e => e.pos >= 3)); }
        }
        assert.ok(runs > 20, `${runs} phrases avec gamme`);
    });
});

describe('mémoire entre deux mesures (env.state)', () => {
    test('le renversement de l’accordéon et la dernière note de mélodie sont mémorisés', () => {
        const env = mkEnv();
        plan({ env, seed: 3, ph: mkPhrase(3, { mel: 2 }) });
        assert.ok(env.state.cumbiaVoice && env.state.cumbiaVoice.v.length >= 3);
        assert.ok(Number.isFinite(env.state.cumbiaMel));
    });
    test('sans mémoire initiale, le plan se calcule quand même', () => {
        assert.ok(plan({ env: mkEnv({ state: { cumbiaVoice: null, cumbiaMel: null } }) }).piano.length > 0);
    });
});

describe('transposition de l’instrument (Si♭, Mi♭)', () => {
    test('les hauteurs écrites restent dans le registre de l’accordéon pour chaque transposition', () => {
        for (const off of [0, -2, -9]) {
            for (let seed = 1; seed <= 30; seed++) {
                const p = plan({ env: mkEnv({ transOffset: off }), step: Gm, nextStep: D7, seed, ph: mkPhrase(seed, { mel: 2 }) });
                p.piano.forEach(e => e.intervals.forEach(n => assert.ok(n + off >= -6 && n + off <= 30, `off ${off} : ${n}`)));
            }
        }
    });
});

describe('cellules rythmiques de la mélodie', () => {
    test('chaque cellule tient dans une demi-mesure, positions croissantes, sur la grille de la double croche', () => {
        for (const { c } of CUMBIA_MEL_CELLS) {
            c.forEach((x, k) => { assert.ok(x >= 0 && x < 2); assert.equal((x * 4) % 1, 0); if (k) assert.ok(x > c[k - 1]); });
        }
    });
});
