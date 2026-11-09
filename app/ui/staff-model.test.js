// Tests du modèle de portée (ui/staff-model.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { staffCacheKey, staffModel } = require('./staff-model.js');
const T = require('../theory.js');

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const base = { rootName: 'C', intervals: MAJOR, isDesc: false, twoOctaves: false, chordObj: null, avoidNotes: [], characteristicInterval: null, showTargetNotes: false };
const model = (o = {}) => staffModel({ ...base, ...o });
const maj7 = T.chordTypes.maj.find(c => c.id === 'maj7');

describe('staffModel : notes et octaves', () => {
    test('Do majeur : do4 à do5, 8 notes', () => {
        const m = model();
        assert.deepEqual(m.scaleIntervals, [0, 2, 4, 5, 7, 9, 11, 12]);
        assert.deepEqual(m.notes.map(n => n.vexKey), ['c/4', 'd/4', 'e/4', 'f/4', 'g/4', 'a/4', 'b/4', 'c/5']);
    });
    test('Sol majeur : le Do appartient à l\'octave suivante, Fa♯ avec son altération', () => {
        const m = model({ rootName: 'G', intervals: MAJOR });
        assert.deepEqual(m.notes.map(n => n.vexKey), ['g/4', 'a/4', 'b/4', 'c/5', 'd/5', 'e/5', 'f#/5', 'g/5']);
    });
    test('enharmonie : Si♯ reste dans son octave diatonique', () => {
        const m = model({ rootName: 'G#', intervals: [0, 2, 4, 5, 7, 9, 11] });
        assert.ok(m.notes.some(n => n.vexKey.startsWith('b#') || n.vexKey.startsWith('c')));
        assert.equal(m.notes.length, 8);
    });
    test('La#° (Ton / Demi-Ton) : le 7e degré La est à l\'octave 5, au-dessus de La#4 (pas en dessous)', () => {
        const m = model({ rootName: 'A#', intervals: [0, 2, 3, 5, 6, 8, 9, 11] });
        assert.deepEqual(m.notes.map(n => n.vexKey), ['a#/4', 'c/5', 'c#/5', 'd#/5', 'e/5', 'f#/5', 'g/5', 'a/5', 'a#/5']);
    });
    test('toutes les gammes sur toutes les toniques : les hauteurs montent toujours dans l\'ordre de la gamme', () => {
        const SEMI = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
        const acc = a => (a.includes('##') ? 2 : a.includes('bb') ? -2 : a.includes('#') ? 1 : a.includes('b') ? -1 : 0);
        for (const rootName of ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']) {
            for (const [id, sc] of Object.entries(T.scalesDb)) {
                for (const twoOctaves of [false, true]) {
                    const m = model({ rootName, intervals: sc.intervals, twoOctaves });
                    const rootMidi = 60 + SEMI[rootName[0].toLowerCase()] + acc(rootName.slice(1));
                    m.notes.forEach(n => {
                        const [name, oct] = n.vexKey.split('/');
                        const midi = (Number(oct) + 1) * 12 + SEMI[name[0]] + acc(name.slice(1));
                        assert.equal(midi, rootMidi + n.interval, `${rootName} ${id} : ${n.vexKey} devrait sonner ${rootMidi + n.interval}`);
                    });
                }
            }
        }
    });
    test('deux octaves : 15 notes, jusqu\'à 24', () => {
        const m = model({ twoOctaves: true });
        assert.equal(m.notes.length, 15);
        assert.equal(m.scaleIntervals[14], 24);
        assert.equal(m.notes[14].vexKey, 'c/6');
    });
    test('descente : même notes à l\'envers, la tonique haute en premier', () => {
        const up = model({ rootName: 'D' }), down = model({ rootName: 'D', isDesc: true });
        assert.deepEqual(down.scaleIntervals, up.scaleIntervals.slice().reverse().length ? [12, 11, 9, 7, 5, 4, 2, 0] : []);
        assert.equal(down.notes[0].interval, 12);
        assert.equal(down.notes[7].interval, 0);
    });
});

describe('staffModel : hampes', () => {
    test('vers le haut sous la ligne médiane (si4), vers le bas au-dessus', () => {
        const m = model();
        assert.deepEqual(m.notes.map(n => n.stemDown), [false, false, false, false, false, false, false, true]);
        const b = model({ rootName: 'B' }); // si4 : sur la ligne médiane → hampe vers le haut
        assert.equal(b.notes[0].stemDown, false);
    });
    test('le sens de la gamme n\'influe pas sur la hampe', () => {
        const up = model(), down = model({ isDesc: true });
        const byInterval = (m) => Object.fromEntries(m.notes.map(n => [n.interval, n.stemDown]));
        assert.deepEqual(byInterval(up), byInterval(down));
    });
});

describe('staffModel : altérations', () => {
    test('Sol majeur : seul le Fa♯ porte une altération', () => {
        const m = model({ rootName: 'G' });
        assert.deepEqual(m.notes.map(n => n.accidental), [null, null, null, null, null, null, '#', null]);
    });
    test('Do mineur (mélodique naturelle) : ♭ posés une fois par ligne', () => {
        const m = model({ rootName: 'C', intervals: [0, 2, 3, 5, 7, 8, 10] });
        assert.deepEqual(m.notes.map(n => n.accidental), [null, null, 'b', null, null, 'b', 'b', null]);
    });
    test('changement d\'altération sur la même ligne : bécarre', () => {
        // Mi♭ puis Mi naturel (intervalles 3 et 4 de Do, même lettre) : la seconde note reçoit un bécarre
        const m = model({ rootName: 'C', intervals: [0, 3, 4, 7] });
        assert.deepEqual(m.notes.map(n => n.accidental).slice(0, 3), [null, 'b', 'n']);
    });
});

describe('staffModel : couleurs', () => {
    test('priorité : à éviter > caractéristique > cible', () => {
        const m = model({ chordObj: maj7, avoidNotes: [5], characteristicInterval: 5, showTargetNotes: true });
        const col = (iv) => m.notes.find(n => n.interval === iv).color;
        assert.equal(col(5), '#e11d48');
        const m2 = model({ chordObj: maj7, avoidNotes: [], characteristicInterval: 4, showTargetNotes: true });
        assert.equal(m2.notes.find(n => n.interval === 4).color, '#d97706');
    });
    test('notes cibles en bleu seulement si showTargetNotes', () => {
        const on = model({ chordObj: maj7, showTargetNotes: true }), off = model({ chordObj: maj7, showTargetNotes: false });
        assert.ok(on.notes.some(n => n.color === '#2563eb'));
        assert.ok(off.notes.every(n => n.color === null));
    });
    test('l\'octave supérieure suit les mêmes couleurs (intervalle modulo 12)', () => {
        const m = model({ avoidNotes: [0] });
        assert.equal(m.notes[0].color, '#e11d48');
        assert.equal(m.notes[7].interval, 12);
        assert.equal(m.notes[7].color, '#e11d48');
    });
    test('pas d\'accord : aucune note cible', () => {
        assert.ok(model({ showTargetNotes: true }).notes.every(n => n.color === null));
    });
});

describe('staffModel : dimensions', () => {
    test('largeur minimale 450 (620 sur deux octaves), hauteur 120', () => {
        assert.equal(model().width, 450);
        assert.equal(model().height, 120);
        assert.equal(model({ twoOctaves: true }).width, 630);
        assert.equal(model({ intervals: [0, 2] }).width, 450);
        assert.equal(model({ twoOctaves: true, intervals: [0] }).width, 620);
    });
    test('gamme très longue : la largeur croît avec le nombre de notes', () => {
        const long = Array.from({ length: 12 }, (_, i) => i);
        assert.equal(model({ intervals: long }).width, Math.max(450, 13 * 42 + 60));
    });
});

describe('staffCacheKey', () => {
    const p = { ...base };
    test('stable pour les mêmes paramètres', () => assert.equal(staffCacheKey(p), staffCacheKey({ ...p })));
    test('change avec chaque paramètre d\'aspect', () => {
        const k = staffCacheKey(p);
        for (const o of [{ rootName: 'D' }, { intervals: [0, 2, 3] }, { isDesc: true }, { avoidNotes: [1] }, { characteristicInterval: 3 },
            { chordObj: maj7 }, { twoOctaves: true }, { showTargetNotes: true }, { isJam: true }]) {
            assert.notEqual(staffCacheKey({ ...p, ...o }), k, JSON.stringify(Object.keys(o)));
        }
    });
});
