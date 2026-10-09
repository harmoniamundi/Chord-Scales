// Tests des utilitaires partagés (band/band-helpers.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./band-helpers.js');
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
const envFor = (transOffset = 0) => ({ transOffset, findChordObj: (id) => T.lookupChord(id) || T.chordTypes.maj[0] });
const OFFSETS = [0, -2, -9];                       // instruments en Do, Si♭, Mi♭
const CHORDS = ['majTriad', 'maj7', 'm7', '7', 'm7b5', 'dim7', 'minTriad', '7sus4'];
const cs = (rootIndex, chordId, extra = {}) => ({ rootIndex, chordId, scaleId: 'ionian', ...extra });
const pc = (n) => ((n % 12) + 12) % 12;

describe('popFoldBass : ramène une note dans le registre de la basse', () => {
    test('toute note ressort dans [-8, 3] après transposition, à l’octave près', () => {
        for (const off of OFFSETS) for (let abs = -30; abs <= 50; abs++) {
            const r = H.popFoldBass(envFor(off), abs);
            assert.ok(r + off <= 3 && r + off >= -8, `abs ${abs} offset ${off} → ${r}`);
            assert.equal(pc(r), pc(abs));
        }
    });
    test('une note déjà dans le registre ne bouge pas', () => {
        assert.equal(H.popFoldBass(envFor(0), -5), -5);
    });
});

describe('bassPc / bassNear', () => {
    test('bassPc : fondamentale de l’accord, ou basse choisie (accord sur basse)', () => {
        assert.equal(H.bassPc(envFor(), cs(2, 'm7')), 2);
        assert.equal(H.bassPc(envFor(), cs(2, 'm7', { bassRootIndex: 9 })), 9);
    });
    test('bassNear : à moins d’un triton de la fondamentale', () => {
        for (let root = 0; root < 12; root++) for (let bass = 0; bass < 12; bass++) {
            const n = H.bassNear(envFor(), cs(root, 'maj7', { bassRootIndex: bass }));
            assert.ok(Math.abs(n - root) <= 6, `${root}/${bass} → ${n}`);
            assert.equal(pc(n), bass);
        }
    });
});

describe('popBassTones / latBassTones', () => {
    test('fondamentale = hauteur de l’accord, quinte juste sur un accord majeur', () => {
        const t = H.popBassTones(envFor(), cs(7, 'maj7'));
        assert.equal(pc(t.root), 7);
        assert.equal(pc(t.third), 11);
        assert.equal(pc(t.fifth), 2);
        assert.equal(pc(t.seventh), 6);
        assert.equal(t.octave, t.root + 12);
    });
    test('accord sur basse : la basse joue la note choisie, les degrés restent ceux de l’accord', () => {
        const t = H.popBassTones(envFor(), cs(0, 'maj7', { bassRootIndex: 4 }));
        assert.equal(pc(t.root), 4);
        assert.equal(pc(t.third), 4);
    });
    test('la fondamentale reste dans le registre pour tous les accords et instruments', () => {
        for (const off of OFFSETS) for (let r = 0; r < 12; r++) for (const id of CHORDS) {
            const t = H.popBassTones(envFor(off), cs(r, id));
            assert.ok(t.root + off <= 3 && t.root + off >= -8, `${r} ${id} offset ${off} : ${t.root}`);
        }
    });
    test('latBassTones : même fondamentale, octave ramenée dans le registre', () => {
        for (const off of OFFSETS) for (let r = 0; r < 12; r++) {
            const p = H.popBassTones(envFor(off), cs(r, '7'));
            const l = H.latBassTones(envFor(off), cs(r, '7'));
            assert.equal(l.root, p.root);
            assert.ok(l.octave === l.root + 12 || l.octave === l.fifth);
        }
    });
});

describe('popBassApproach (note de liaison vers l’accord suivant)', () => {
    test('déterministe, dans le registre, et proche de la cible', () => {
        for (const off of OFFSETS) for (let seed = 1; seed <= 100; seed++) {
            const r = seeded(seed);
            const next = cs(Math.floor(r() * 12), CHORDS[Math.floor(r() * CHORDS.length)]);
            const from = Math.floor(r() * 12) - 8;
            const a = H.popBassApproach(envFor(off), from, next, seeded(seed));
            const b = H.popBassApproach(envFor(off), from, next, seeded(seed));
            assert.equal(a, b);
            assert.ok(a + off <= 6 && a + off >= -9, `${a} (offset ${off})`);
        }
    });
    test('scaleId inconnu : retombe sur la gamme majeure sans planter', () => {
        const n = H.popBassApproach(envFor(), 0, cs(5, 'maj7', { scaleId: 'nope' }), seeded(1));
        assert.ok(Number.isInteger(n));
    });
});

describe('gammes : popScaleNotes, popLineNote, popRun', () => {
    test('popScaleNotes ne renvoie que des notes de la gamme, dans les bornes', () => {
        const notes = H.popScaleNotes(cs(2, 'm7', { scaleId: 'dorian' }), 0, 24);
        assert.ok(notes.length > 0);
        for (const n of notes) {
            assert.ok(n >= 0 && n <= 24);
            assert.ok(T.scalesDb.dorian.intervals.includes(pc(n - 2)), `note ${n}`);
        }
    });
    test('popLineNote : note voisine, différente de la note de départ, dans la gamme', () => {
        for (let seed = 1; seed <= 60; seed++) {
            const c = cs(seed % 12, 'maj7');
            const n = H.popLineNote(envFor(), c, 12, seeded(seed), [-1, 0, 1][seed % 3]);
            assert.notEqual(n, 12);
            assert.ok(Math.abs(n - 12) <= 7);
            assert.ok(T.scalesDb.ionian.intervals.includes(pc(n - c.rootIndex)));
        }
    });
    test('popRun : montée ou descente conjointe de la bonne longueur, dans la gamme', () => {
        for (const count of [1, 2, 3, 4]) {
            const c = cs(0, 'maj7');
            const run = H.popRun(envFor(), c, 10, 14, count);
            assert.equal(run.length, count);
            for (const n of run) assert.ok(T.scalesDb.ionian.intervals.includes(pc(n)));
            const steps = run.slice(1).map((n, k) => n - run[k]);
            assert.ok(steps.every(s => s > 0) || steps.every(s => s < 0), 'sens constant');
        }
    });
    test('popRun : tableau vide si la gamme est trop courte pour la phrase demandée', () => {
        assert.deepEqual(H.popRun(envFor(), cs(0, 'maj7'), 10, 14, 40), []);
    });
});

describe('popVoicing / popSusVoicing (voicing du piano)', () => {
    test('toutes les notes de l’accord sont présentes, en ordre croissant, dans le registre médium', () => {
        for (const off of OFFSETS) for (let r = 0; r < 12; r++) for (const id of CHORDS) {
            const v = H.popVoicing(envFor(off), cs(r, id), null);
            assert.ok(v.length >= 3, `${r} ${id}`);
            for (let k = 1; k < v.length; k++) assert.ok(v[k] > v[k - 1], `${r} ${id} : ${v}`);
            assert.ok(v[0] + off >= -3 - 1 && v[v.length - 1] + off <= 17 + 12, `${r} ${id} offset ${off} : ${v}`);
            const want = new Set(H.jamChordPlaybackNotes(envFor(off).findChordObj(id)).map(iv => pc(r + iv)));
            assert.deepEqual(new Set(v.map(pc)), want, `${r} ${id}`);
        }
    });
    test('conduite des voix : le voicing suivant reste proche du précédent', () => {
        const env = envFor();
        const a = H.popVoicing(env, cs(0, 'maj7'), null);
        const b = H.popVoicing(env, cs(7, '7'), a);
        const move = Math.abs(b[b.length - 1] - a[a.length - 1]);
        assert.ok(move <= 7, `saut de ${move} demi-tons au sommet`);
    });
    test('un accord sans notes donne un voicing vide', () => {
        assert.deepEqual(H.popVoicing({ transOffset: 0, findChordObj: () => ({ notes: [] }) }, cs(0, 'x'), null), []);
    });
    test('jamChordPlaybackNotes : 4 notes au plus (fondamentale, tierce, septième, tension la plus haute)', () => {
        assert.deepEqual(H.jamChordPlaybackNotes({ notes: [0, 4, 7] }), [0, 4, 7]);
        assert.deepEqual(H.jamChordPlaybackNotes({ notes: [0, 4, 7, 11, 2] }), [0, 4, 11, 2]);
        assert.deepEqual(H.jamChordPlaybackNotes({ notes: [0, 3, 7, 10, 2, 5] }), [0, 3, 10, 5]);
    });
    test('popSusVoicing : retarde la tierce par la quarte, et garde la résolution', () => {
        const env = envFor();
        const V = H.popVoicing(env, cs(0, 'maj7'), null);
        const r = H.popSusVoicing(env, cs(0, 'maj7'), V);
        assert.deepEqual(r.resolved, V);
        assert.equal(r.sus.length, V.length);
        assert.ok(r.sus.some(n => pc(n) === 5), 'la quarte remplace la tierce');
        assert.ok(!r.sus.some(n => pc(n) === 4), 'plus de tierce majeure');
    });
    test('popSusVoicing : null si l’accord est déjà suspendu', () => {
        const env = envFor();
        const V = H.popVoicing(env, cs(0, '7sus4'), null);
        assert.equal(H.popSusVoicing(env, cs(0, '7sus4'), V), null);
    });
});

describe('guitare latine : latThumb, latVary, latDetach', () => {
    const cell = [[0, 1, 'U', 0.8], [0.5, 1, 'X', 0.6], [1, 1, 'D', 0.7], [1.5, 1, 'U', 0.5], [2, 1, 'D', 0.8], [2.5, 1, 'U', 0.5], [3, 1, 'D', 0.7]];
    test('latThumb : fondamentale et quinte de la basse', () => {
        const t = H.latThumb(envFor(), cs(7, 'maj7'));
        assert.deepEqual(Object.keys(t).sort(), ['fifth', 'root']);
        assert.equal(pc(t.root), 7);
    });
    test('latVary ne modifie jamais la cellule d’origine, et la 1re mesure (i=0) reste intacte', () => {
        const copy = JSON.stringify(cell);
        for (let seed = 1; seed <= 50; seed++) H.latVary(cell, seeded(seed), 0.5, seed % 4);
        assert.equal(JSON.stringify(cell), copy);
        assert.deepEqual(H.latVary(cell, seeded(1), 0.5, 0), cell);
    });
    test('latDetach ne modifie pas la cellule d’origine et garde les positions imposées (keep)', () => {
        const copy = JSON.stringify(cell);
        for (let seed = 1; seed <= 50; seed++) {
            const out = H.latDetach(cell, seeded(seed), 0.6, 'bossa', { free: [0.5, 1, 1.5, 2, 2.5, 3, 3.5], u: 0.5, keep: [0] });
            assert.ok(out.some(h => h[0] === 0), `graine ${seed} : le temps 1 doit rester`);
        }
        assert.equal(JSON.stringify(cell), copy);
    });
});

describe('brassParts (répartition entre les pupitres)', () => {
    test('1 note → 2 pupitres, 2 notes → 5, 3 notes et plus → 6', () => {
        assert.equal(H.brassParts([5]).length, 2);
        assert.equal(H.brassParts([0, 7]).length, 5);
        assert.equal(H.brassParts([0, 4, 7]).length, 6);
        assert.equal(H.brassParts([0, 4, 7, 11, 14]).length, 6);
    });
    test('vide → vide, et l’entrée n’est pas modifiée', () => {
        assert.deepEqual(H.brassParts([]), []);
        assert.deepEqual(H.brassParts(undefined), []);
        const V = [7, 0, 4];
        H.brassParts(V);
        assert.deepEqual(V, [7, 0, 4]);
    });
    test('trombone basse = note la plus grave, cornet 1 = note la plus aiguë', () => {
        const parts = H.brassParts([0, 4, 7, 11]);
        assert.equal(parts.find(p => p.slot === 't2').iv, 0);
        assert.equal(parts.find(p => p.slot === 'c1').iv, 11);
    });
});

describe('mesures coupées : isSplit, isSplitEffective, getStepHalves', () => {
    const chord = (rootIndex, chordId) => ({ rootIndex, chordId, scaleId: 'ionian' });
    const split = { ...chord(0, 'maj7'), measures: 1, split: chord(7, '7') };
    test('isSplit : seulement pour une mesure unique avec un second accord', () => {
        assert.equal(H.isSplit(split), true);
        assert.equal(H.isSplit({ ...split, measures: 2 }), false);
        assert.equal(H.isSplit({ ...chord(0, 'maj7'), measures: 1 }), false);
        assert.equal(H.isSplit(null), false);
    });
    test('isSplitEffective : faux si les deux moitiés sont identiques', () => {
        assert.equal(H.isSplitEffective(split), true);
        assert.equal(H.isSplitEffective({ ...chord(0, 'maj7'), measures: 1, split: chord(0, 'maj7') }), false);
    });
    test('isSplitEffective : une basse différente suffit', () => {
        const s = { ...chord(0, 'maj7'), measures: 1, split: { ...chord(0, 'maj7'), bassRootIndex: 4 } };
        assert.equal(H.isSplitEffective(s), true);
    });
    test('getStepHalves : deux moitiés pour une mesure coupée, une seule sinon', () => {
        const halves = H.getStepHalves({ ...split, split: { ...split.split, bassRootIndex: 2 } });
        assert.equal(halves.length, 2);
        assert.equal(halves[0].chordId, 'maj7');
        assert.equal(halves[1].rootIndex, 7);
        assert.equal(halves[1].bassRootIndex, 2);
        assert.equal(H.getStepHalves(chord(0, 'maj7')).length, 1);
    });
});

describe('rythme : bandSwing, swingPos, pickWeighted, meterKey, patternLib', () => {
    test('bandSwing : croches droites hors swing, triolet qui se resserre avec le tempo', () => {
        assert.equal(H.bandSwing('pop', 120), 0.5);
        assert.ok(Math.abs(H.bandSwing('swing', 140) - 0.667) < 1e-9);
        assert.ok(H.bandSwing('swing', 300) >= 0.58);
        assert.ok(H.bandSwing('swing', 60) <= 0.667);
        assert.ok(H.bandSwing('swing', 200) < H.bandSwing('swing', 100));
    });
    test('swingPos : seuls les « et » (x.5) sont décalés', () => {
        assert.equal(H.swingPos(1, 0.62), 1);
        assert.equal(H.swingPos(1.5, 0.62), 1.62);
        assert.equal(H.swingPos(0.5, 0.667), 0.667);
        assert.equal(H.swingPos(2.25, 0.62), 2.25);
    });
    test('pickWeighted : respecte les poids et reste dans la liste', () => {
        const list = [{ w: 1, id: 'a' }, { w: 0.0001, id: 'b' }, { w: 3, id: 'c' }];
        const count = { a: 0, b: 0, c: 0 };
        const rng = seeded(4);
        for (let k = 0; k < 4000; k++) count[H.pickWeighted(list, rng).id]++;
        assert.ok(count.c > count.a * 2 && count.a > 500 && count.b < 20, JSON.stringify(count));
        assert.equal(H.pickWeighted(list, () => 0.9999999).id, 'c');
    });
    test('meterKey : 2/4, 3/4, 4/4 et 6/8, 9/8, 12/8', () => {
        assert.deepEqual([2, 3, 4].map(b => H.meterKey(b, false)), ['2/4', '3/4', '4/4']);
        assert.deepEqual([2, 3, 4].map(b => H.meterKey(b, true)), ['6/8', '9/8', '12/8']);
    });
    test('patternLib : bibliothèque propre à la signature, sinon celle du 4/4', () => {
        const P = require('../band-patterns.js');
        assert.equal(H.patternLib('3/4', 'swing'), P.METER_LIB['3/4'].swing);
        assert.equal(H.patternLib('12/8', 'pop'), P.TERN_LIB.pop);
        assert.equal(H.patternLib('4/4', 'swing'), P.BAND_PATTERNS.swing);
        assert.equal(H.patternLib('3/4', 'brass'), P.BAND_PATTERNS.brass); // pas de motif 3/4 pour ce style
    });
});

describe('piano : intervalles d’une frappe', () => {
    const maj7 = T.lookupChord('maj7'), dom7 = T.lookupChord('7');
    test('note guide : tierce, quinte, septième', () => {
        assert.equal(H.pianoGuideInterval(dom7, 'third'), 4);
        assert.equal(H.pianoGuideInterval(dom7, 'fifth'), 7);
        assert.equal(H.pianoGuideInterval(dom7, 'color'), 10);
    });
    test('accord plaqué : intervalles croissants', () => {
        const iv = H.pianoHitIntervals(maj7, 'C', 'closed', seeded(1));
        assert.deepEqual(iv, [0, 4, 7, 11]);
    });
    test('sans fondamentale (rootless) : la basse la joue déjà', () => {
        const iv = H.pianoHitIntervals(maj7, 'C', 'rootless', seeded(1));
        assert.deepEqual(iv, [4, 7, 11]);
    });
    test('dyade tierce + septième', () => {
        assert.deepEqual(H.pianoHitIntervals(dom7, 'S', 'closed', seeded(1)), [4, 10]);
    });
    test('note isolée : une seule note, éventuellement à l’octave', () => {
        for (let s = 1; s <= 30; s++) {
            const iv = H.pianoHitIntervals(dom7, 'N', 'closed', seeded(s));
            assert.equal(iv.length, 1);
            assert.ok([4, 7, 10, 16, 19, 22].includes(iv[0]), String(iv[0]));
        }
    });
    test('arpège (type numérique) : une note de l’accord empilé', () => {
        assert.deepEqual(H.pianoHitIntervals(maj7, 2, 'closed', seeded(1)), [7]);
    });
});

describe('style classique : voicing, note grave, variation', () => {
    const env = { transOffset: 0, findChordObj: (id) => T.lookupChord(id) };
    test('clsVoicing : notes croissantes dans un registre stable pour toutes les fondamentales', () => {
        for (let root = 0; root < 12; root++) {
            const v = H.clsVoicing(env, { rootIndex: root, chordId: 'maj7' }, 0);
            for (let k = 1; k < v.length; k++) assert.ok(v[k] > v[k - 1]);
            assert.ok(v[0] >= -5 - 11 && v[0] <= 6, `fondamentale ${root} → ${v[0]}`);
        }
    });
    test('clsLowNote : à l’octave grave, de même hauteur que la basse de l’accord', () => {
        for (let root = 0; root < 12; root++) {
            const low = H.clsLowNote(env, { rootIndex: root, chordId: 'maj7' }, 0);
            assert.ok(low <= -6 && low >= -17, `${root} → ${low}`);
            assert.equal(((low % 12) + 12) % 12, root);
        }
        const slash = H.clsLowNote(env, { rootIndex: 0, chordId: 'maj7', bassRootIndex: 7 }, 0);
        assert.equal(((slash % 12) + 12) % 12, 7);
    });
    test('clsMutate : ne modifie pas le motif d’origine, garde 8 positions de rang 0 à 3 ou silence', () => {
        const base = [0, 1, 2, 3, 2, 1, 3, 0];
        for (let s = 1; s <= 200; s++) {
            const out = H.clsMutate(base, seeded(s));
            assert.equal(out.length, 8);
            assert.deepEqual(base, [0, 1, 2, 3, 2, 1, 3, 0]);
            for (const x of out) assert.ok(x === null || (x >= 0 && x <= 3));
        }
    });
});
