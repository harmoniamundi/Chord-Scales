// Tests des notes du mode Entraînement (audio/practice-notes.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const P = require('./practice-notes.js');
const { playNoteName } = require('./note-events.js');

describe('practiceChordNotes', () => {
    test('accord plaqué : toutes les notes au même instant, 2,5 s, gain donné', () => {
        const n = P.practiceChordNotes('C', 0, [0, 4, 7, 11], 3.5, 0.8);
        assert.deepEqual(n.map(x => x.noteStr), ['C3', 'E3', 'G3', 'B3']);
        n.forEach(x => { assert.equal(x.when, 3.5); assert.deepEqual(x.opts, { duration: 2.5, gain: 0.8 }); });
    });
    test('transposition de l\'instrument', () => {
        const n = P.practiceChordNotes('Bb', 2, [0], 0, 1);
        assert.equal(n[0].noteStr, playNoteName('Bb', 2, 0, 3));
        assert.equal(n[0].noteStr, 'C3');
    });
    test('accord vide : rien', () => assert.deepEqual(P.practiceChordNotes('C', 0, [], 0, 1), []));
});

describe('arpeggioSequence', () => {
    test('montée simple', () => assert.deepEqual(P.arpeggioSequence(4, false), [0, 1, 2, 3]));
    test('aller-retour : sans répéter la note haute ni la fondamentale', () => {
        assert.deepEqual(P.arpeggioSequence(4, true), [0, 1, 2, 3, 2, 1]);
        assert.deepEqual(P.arpeggioSequence(3, true), [0, 1, 2, 1]);
        assert.deepEqual(P.arpeggioSequence(2, true), [0, 1]);
        assert.deepEqual(P.arpeggioSequence(1, true), [0]);
        assert.deepEqual(P.arpeggioSequence(0, true), []);
    });
});

describe('arpeggioCycle', () => {
    test('notes espacées de 0,3 s à partir de start, durée = nombre de notes × espacement', () => {
        const c = P.arpeggioCycle('C', 0, [0, 4, 7, 11], 10, true, 0.9);
        assert.equal(c.notes.length, 6);
        c.notes.forEach((n, k) => { assert.ok(Math.abs(n.when - (10 + k * 0.3)) < 1e-12); assert.deepEqual(n.opts, { duration: 1.5, gain: 0.9 }); });
        assert.ok(Math.abs(c.duration - 1.8) < 1e-12);
        assert.deepEqual(c.notes.map(n => n.noteStr), ['C3', 'E3', 'G3', 'B3', 'G3', 'E3']);
    });
    test('espacement personnalisé, sans aller-retour', () => {
        const c = P.arpeggioCycle('C', 0, [0, 4, 7], 0, false, 1, 0.5);
        assert.deepEqual(c.notes.map(n => n.when), [0, 0.5, 1]);
        assert.equal(c.duration, 1.5);
    });
});

describe('arpeggioCycleStart', () => {
    test('en avance ou à l\'heure : inchangé', () => {
        assert.equal(P.arpeggioCycleStart(5, 4.9), 5);
        assert.equal(P.arpeggioCycleStart(4.96, 5), 4.96);
    });
    test('retard de plus de 50 ms : on se recale sur l\'horloge', () => {
        assert.equal(P.arpeggioCycleStart(4.9, 5), 5);
    });
});

describe('scalePlaybackPlan', () => {
    test('montée jusqu\'à la tonique de l\'octave supérieure, un pas toutes les 280 ms', () => {
        const p = P.scalePlaybackPlan([0, 2, 4], false);
        assert.deepEqual(p.steps.map(s => s.interval), [0, 2, 4, 12]);
        p.steps.forEach((st, k) => assert.ok(Math.abs(st.delayMs - k * 280) < 1e-9));
        assert.ok(Math.abs(p.endDelayMs - (4 * 280 + 300)) < 1e-9);
    });
    test('descente : même notes à l\'envers', () => {
        assert.deepEqual(P.scalePlaybackPlan([0, 2, 4], true).steps.map(s => s.interval), [12, 4, 2, 0]);
    });
    test('ne modifie pas le tableau d\'origine', () => {
        const iv = [0, 2, 4]; P.scalePlaybackPlan(iv, true);
        assert.deepEqual(iv, [0, 2, 4]);
    });
    test('pas personnalisé', () => {
        assert.deepEqual(P.scalePlaybackPlan([0], false, 0.5).steps.map(s => s.delayMs), [0, 500]);
    });
});
