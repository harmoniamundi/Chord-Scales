// Tests du calcul des notes de chaque instrument (audio/note-events.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const N = require('./note-events.js');

function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const env = (extra = {}) => ({ instrumentKey: 'C', currentTime: 1, transOffset: 0, perfTier: 0, bassVolume: 0.8, viaBus: true, outGain: 0.5, rand: () => 0.5, has: () => true, ...extra });
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

describe('playNoteName', () => {
    test('noms et octaves en do', () => {
        assert.equal(N.playNoteName('C', 0, 0), 'C3');
        assert.equal(N.playNoteName('C', 0, 12), 'C4');
        assert.equal(N.playNoteName('C', 0, -1), 'B2');
        assert.equal(N.playNoteName('C', 9, 0, 4), 'A4');
    });
    test('transposition : Bb descend de 2 demi-tons, Eb de 9', () => {
        assert.equal(N.playNoteName('Bb', 2, 0), N.playNoteName('C', 0, 0));
        assert.equal(N.playNoteName('Eb', 9, 0), N.playNoteName('C', 0, 0));
        assert.equal(N.playNoteName('Bb', 0, 0), 'Bb2');
    });
    test('instrument inconnu : pas de transposition', () => {
        assert.equal(N.playNoteName('zz', 4, 0), N.playNoteName('C', 4, 0));
    });
    test('intervalles négatifs ou très grands : octave cohérente', () => {
        for (let r = 0; r < 12; r++) for (let iv = -30; iv <= 40; iv++) {
            const s = N.playNoteName('C', r, iv), abs = r + iv;
            const m = s.match(/^([A-G][b#]?)(-?\d+)$/);
            assert.ok(m, s);
            assert.equal(parseInt(m[2], 10), 3 + Math.floor(abs / 12));
        }
    });
});

describe('bassNote', () => {
    test('gain étroit par défaut, large (style Pop) avec wide ; volume de la basse appliqué', () => {
        const std = N.bassNote(env(), 0, 5, 1, 1, false), wide = N.bassNote(env(), 0, 5, 1, 0, true);
        close(std.opts.gain, Math.min(1.05, 0.6 + 0.45) * 0.8);
        close(wide.opts.gain, 0.35 * 0.8);
        assert.equal(std.when, 5); assert.equal(std.opts.duration, 1);
    });
    test('la basse sonne une octave plus bas que le piano', () => {
        assert.equal(N.bassNote(env(), 0, 0, 1).noteStr, 'C2');
    });
});

describe('pianoNotes', () => {
    const e = { rootIndex: 0, intervals: [0, 4, 7, 11, 14], vel: 0.8, dur: 2 };
    test('une note par voix, « roulées » du grave à l\'aigu', () => {
        const n = N.pianoNotes(env(), e, 2, 0.5);
        assert.equal(n.length, 5);
        n.forEach((x, k) => close(x.when, Math.max(1, 2 + k * 0.006)));
        assert.deepEqual(n.map(x => x.noteStr), ['C3', 'E3', 'G3', 'B3', 'D4']);
    });
    test('niveau de performance minimal : trois voix (grave + deux aigus), notes ≤ 1,6 s', () => {
        const n = N.pianoNotes(env({ perfTier: 2 }), { ...e, dur: 6 }, 0, 1);
        assert.deepEqual(n.map(x => x.noteStr), ['C3', 'B3', 'D4']);
        assert.equal(n[0].opts.duration, 1.6);
    });
    test('hors bus : volume × master appliqué au gain ; sur le bus : non', () => {
        const bus = N.pianoNotes(env({ viaBus: true }), e, 0, 1)[0].opts.gain;
        const off = N.pianoNotes(env({ viaBus: false, outGain: 0.5 }), e, 0, 1)[0].opts.gain;
        close(off, bus * 0.5);
    });
    test('wide élargit la dynamique ; noteVels pondère chaque voix ; gainMul multiplie', () => {
        const soft = { ...e, vel: 0 };
        assert.ok(N.pianoNotes(env(), { ...soft, wide: true }, 0, 1)[0].opts.gain < N.pianoNotes(env(), soft, 0, 1)[0].opts.gain);
        const nv = N.pianoNotes(env(), { ...e, noteVels: [1, 0.5, 0.5, 0.5, 1] }, 0, 1);
        close(nv[1].opts.gain, nv[0].opts.gain * 0.5);
        close(N.pianoNotes(env(), { ...e, gainMul: 1.2 }, 0, 1)[0].opts.gain, N.pianoNotes(env(), e, 0, 1)[0].opts.gain * 1.2);
    });
    test('roll personnalisé, jamais dans le passé', () => {
        const n = N.pianoNotes(env({ currentTime: 10 }), { ...e, roll: 0.1 }, 2, 1);
        n.forEach(x => assert.equal(x.when, 10));
        const m = N.pianoNotes(env({ currentTime: 0 }), { ...e, roll: 0.1 }, 2, 1);
        close(m[3].when, 2.3);
    });
    test('humanisation : la vélocité dépend de rand (±6 %)', () => {
        const lo = N.pianoNotes(env({ rand: () => 0 }), e, 0, 1)[0].opts.gain, hi = N.pianoNotes(env({ rand: () => 0.9999 }), e, 0, 1)[0].opts.gain;
        assert.ok(hi > lo);
    });
});

describe('guitarNotes', () => {
    const e = { rootIndex: 0, intervals: [0, 7, 12, 16], vel: 0.7, dur: 1 };
    test('ordre de grattage : montant par défaut, descendant avec dir < 0', () => {
        const up = N.guitarNotes(env(), e, 5, 1), down = N.guitarNotes(env(), { ...e, dir: -1 }, 5, 1);
        for (let k = 1; k < 4; k++) assert.ok(up[k].when > up[k - 1].when);
        for (let k = 1; k < 4; k++) assert.ok(down[k].when < down[k - 1].when);
    });
    test('les notes aiguës sont adoucies, la durée de release suit la durée', () => {
        const n = N.guitarNotes(env(), e, 0, 1);
        assert.ok(n[3].opts.gain < n[0].opts.gain);
        close(n[0].opts.release, 0.18 + 0.2);
        close(N.guitarNotes(env(), { ...e, dur: 0.1 }, 0, 0.5)[0].opts.release, 0.2);
    });
    test('la transposition de l\'instrument décale l\'adoucissement', () => {
        const hiGain = (off) => N.guitarNotes(env({ transOffset: off }), { ...e, intervals: [12] }, 0, 1)[0].opts.gain;
        assert.ok(hiGain(-9) > hiGain(0));
    });
});

describe('brassNotes', () => {
    const e = { rootIndex: 0, intervals: [0, 4, 7, 11], vel: 0.8, dur: 1, art: 'marc' };
    test('six pupitres pour un accord de 4 notes, noms d\'instruments existants', () => {
        const out = N.brassNotes(env(), e, 0, 1);
        assert.equal(out.notes.length, 6);
        assert.deepEqual(out.notes.map(n => n.inst).sort(), ['french_horn', 'french_horn2', 'trombone', 'trombone2', 'trumpet', 'trumpet2']);
    });
    test('un pupitre « 2 » absent retombe sur l\'instrument de base ; aucun des deux : note ignorée', () => {
        const only = (names) => N.brassNotes(env({ has: (x) => names.includes(x) }), e, 0, 1).notes;
        const n = only(['trumpet', 'french_horn', 'trombone']);
        assert.equal(n.length, 6);
        assert.ok(n.every(x => !/2$/.test(x.inst)));
        assert.equal(only(['trumpet']).length, 2);
    });
    test('le cornet joue une octave au-dessus ; accord en cents propre à chaque pupitre', () => {
        const n = N.brassNotes(env(), { ...e, intervals: [0] }, 0, 1).notes;
        const c1 = n.find(x => x.inst === 'trumpet');
        assert.equal(c1.noteStr, 'C4');
        close(c1.opts.cents, 2);
    });
    test('souffle : seulement avec un cornet 1, pas en staccato ni en nappe', () => {
        assert.ok(N.brassNotes(env(), e, 0, 1).breath > 0);
        close(N.brassNotes(env(), e, 0, 1).breath, 0.014 + 0.03 * 0.8);
        assert.equal(N.brassNotes(env(), { ...e, art: 'stac' }, 0, 1).breath, null);
        assert.equal(N.brassNotes(env(), { ...e, art: 'pad' }, 0, 1).breath, null);
        assert.equal(N.brassNotes(env({ has: (x) => x !== 'trumpet' }), e, 0, 1).breath, null);
    });
    test('articulation : staccato borné à 0,22 s, notes tenues non bornées ; articulation inconnue = tenuto', () => {
        assert.ok(N.brassNotes(env(), { ...e, art: 'stac', dur: 4 }, 0, 1).notes.every(n => n.opts.duration <= 0.22 + 1e-9));
        assert.ok(N.brassNotes(env(), { ...e, art: 'ten', dur: 4 }, 0, 1).notes.every(n => n.opts.duration > 3));
        assert.deepEqual(N.brassNotes(env(), { ...e, art: '???' }, 0, 1), N.brassNotes(env(), { ...e, art: 'ten' }, 0, 1));
    });
    test('parts explicites : pupitre inconnu ignoré, gm multiplie le gain', () => {
        const parts = [{ iv: 0, slot: 'zz' }, { iv: 0, slot: 'h1' }, { iv: 0, slot: 'h1', gm: 0.5 }];
        const n = N.brassNotes(env(), { ...e, parts }, 0, 1).notes;
        assert.equal(n.length, 2);
        close(n[1].opts.gain, n[0].opts.gain / 2);
    });
    test('accord vide : aucune note', () => {
        assert.equal(N.brassNotes(env(), { ...e, intervals: [] }, 0, 1).notes.length, 0);
    });
});

describe('tubaNote', () => {
    test('la hauteur est ramenée dans le registre du tuba', () => {
        for (let abs = -30; abs <= 30; abs++) {
            const n = N.tubaNote(env(), abs, 0, 1);
            const m = n.noteStr.match(/^([A-G][b#]?)(-?\d+)$/);
            assert.ok(m, n.noteStr);
        }
        assert.equal(N.tubaNote(env(), 0, 0, 1).noteStr, 'C2');
        assert.equal(N.tubaNote(env(), 12, 0, 1).noteStr, 'C2'); // 12 > 7 → redescend d'une octave
    });
    test('articulation : staccato court, pulsé, tenu', () => {
        assert.equal(N.tubaNote(env(), 0, 0, 2, 0.85, 'stac').opts.duration, 0.28);
        assert.equal(N.tubaNote(env(), 0, 0, 2, 0.85, 'puls').opts.attack, 0.017);
        assert.equal(N.tubaNote(env(), 0, 0, 2, 0.85).opts.sustain, 0.85);
    });
});

describe('accordionNotes', () => {
    const e = { rootIndex: 0, intervals: [0, 4, 7], vel: 0.7, dur: 1 };
    test('deux jeux d\'anches désaccordés : notes × 2', () => {
        const n = N.accordionNotes(env(), e, 0, 1);
        assert.equal(n.length, 6);
        assert.ok(n.slice(0, 3).every(x => x.opts.cents < 0) && n.slice(3).every(x => x.opts.cents > 0));
    });
    test('ligne (mel) avec doublure à l\'octave inférieure plus douce', () => {
        const n = N.accordionNotes(env(), { ...e, art: 'mel', oct: true }, 0, 1);
        assert.equal(n.length, 12);
        assert.ok(n[3].opts.gain < n[0].opts.gain);
    });
    test('articulation run / mel : attaque plus vive', () => {
        assert.equal(N.accordionNotes(env(), { ...e, art: 'run' }, 0, 1)[0].opts.attack, 0.006);
        assert.equal(N.accordionNotes(env(), e, 0, 1)[0].opts.attack, 0.012);
    });
});

describe('piazzollaNotes', () => {
    const e = { rootIndex: 0, intervals: [0, 7], vel: 0.7, dur: 1 };
    test('bandonéon : deux jeux d\'anches ; violon et guitare : une couche', () => {
        assert.equal(N.piazzollaNotes(env(), e, 0, 1, 'bandoneon').length, 4);
        assert.equal(N.piazzollaNotes(env(), e, 0, 1, 'violin').length, 2);
        assert.equal(N.piazzollaNotes(env(), e, 0, 1, 'guitar').length, 2);
    });
    test('attaque et release selon l\'articulation (repli : line)', () => {
        const o = (art) => N.piazzollaNotes(env(), { ...e, art }, 0, 1, 'violin')[0].opts;
        assert.deepEqual([o('stab').attack, o('stab').release], [0.01, 0.06]);
        assert.deepEqual([o('zz').attack, o('zz').release], [0.045, 0.12]);
    });
    test('la voix aiguë chante un peu plus', () => {
        const n = N.piazzollaNotes(env(), e, 0, 1, 'guitar');
        assert.ok(n[1].opts.gain > n[0].opts.gain);
    });
});

describe('arcoNote', () => {
    test('contrebasse à l\'archet : une octave sous le piano, volume de la basse', () => {
        const n = N.arcoNote(env(), 0, 3, 2, 1);
        assert.equal(n.noteStr, 'C2'); assert.equal(n.when, 3);
        close(n.opts.gain, 1.0 * 0.8); assert.equal(n.opts.attack, 0.07);
    });
    test('jamais dans le passé', () => {
        assert.equal(N.arcoNote(env({ currentTime: 9 }), 0, 3, 2, 1).when, 9);
    });
});

describe('ordre de consommation du hasard (déterminisme)', () => {
    test('même graine → mêmes notes, pour chaque instrument', () => {
        const e = { rootIndex: 2, intervals: [0, 3, 7, 10], vel: 0.6, dur: 1.5, art: 'marc' };
        const fns = [
            (v) => N.pianoNotes(env({ rand: v }), e, 0, 0.5), (v) => N.guitarNotes(env({ rand: v }), e, 0, 0.5),
            (v) => N.brassNotes(env({ rand: v }), e, 0, 0.5), (v) => N.accordionNotes(env({ rand: v }), e, 0, 0.5),
            (v) => N.piazzollaNotes(env({ rand: v }), e, 0, 0.5, 'bandoneon')
        ];
        fns.forEach(f => assert.deepEqual(f(seeded(4)), f(seeded(4))));
        fns.forEach(f => assert.notDeepEqual(f(seeded(4)), f(seeded(5))));
    });
    test('par défaut le hasard est Math.random', () => {
        const o = Math.random; let calls = 0; Math.random = () => { calls++; return 0.5; };
        try { N.pianoNotes({ ...env(), rand: undefined }, { rootIndex: 0, intervals: [0], vel: 1, dur: 1 }, 0, 1); } finally { Math.random = o; }
        assert.equal(calls, 1);
    });
});
