// Tests de la mécanique de lecture de la Jam (grid/transport.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const X = require('./transport.js');
const PO = require('./play-order.js');

describe('beatClock', () => {
    const base = { now: 10, intervalSec: 0.5, firstLead: 0.35, lead: 0.12 };
    test('premier temps : après firstLead', () => {
        const c = X.beatClock({ ...base, beatAudio: null });
        assert.ok(Math.abs(c.t - 10.35) < 1e-12);
        assert.ok(Math.abs(c.next - 10.85) < 1e-12);
    });
    test('en avance ou à l\'heure : la grille est conservée', () => {
        assert.deepEqual(X.beatClock({ ...base, beatAudio: 10.2 }), { t: 10.2, next: 10.7 });
    });
    test('en retard de moins d\'un temps : conservée', () => {
        assert.equal(X.beatClock({ ...base, beatAudio: 9.6 }).t, 9.6);
    });
    test('en retard de plus d\'un temps : recalée sur lead', () => {
        const c = X.beatClock({ ...base, beatAudio: 9.4 });
        assert.ok(Math.abs(c.t - 10.12) < 1e-12);
        assert.ok(Math.abs(c.next - 10.62) < 1e-12);
    });
});

describe('nextTickDelayMs', () => {
    test('le tick part « lead » avant son temps', () => {
        assert.ok(Math.abs(X.nextTickDelayMs({ beatAudio: 11, now: 10, lead: 0.12, intervalSec: 0.5 }) - 880) < 1e-9);
    });
    test('l\'avance ne dépasse jamais 90 % d\'un temps', () => {
        // temps très court (0,1 s) : avance plafonnée à 0,09 s
        assert.ok(Math.abs(X.nextTickDelayMs({ beatAudio: 11, now: 10, lead: 0.5, intervalSec: 0.1 }) - 910) < 1e-9);
    });
    test('jamais négatif', () => {
        assert.equal(X.nextTickDelayMs({ beatAudio: 9, now: 10, lead: 0.12, intervalSec: 0.5 }), 0);
    });
});

describe('intro et affichage', () => {
    test('intro : accent sur le premier temps, compteur 1/bpb…', () => {
        assert.deepEqual(X.countInBeat(4, 4), { n: 0, accent: true, label: 'Intro : 1/4' });
        assert.deepEqual(X.countInBeat(1, 4), { n: 3, accent: false, label: 'Intro : 4/4' });
        assert.deepEqual(X.countInBeat(3, 3), { n: 0, accent: true, label: 'Intro : 1/3' });
    });
    test('premier temps d\'une mesure : on redessine', () => {
        const p = X.beatDisplayPlan({ beat: 4, bpb: 4, measures: 2, isSplitStep: false, splitBeat: 2 });
        assert.deepEqual(p, { newMeasure: true, splitHalf: false, counter: 'Mesure : 2/2' });
    });
    test('mesure à deux accords : la moitié change au temps de coupure, pas ailleurs', () => {
        const at = (beat) => X.beatDisplayPlan({ beat, bpb: 4, measures: 1, isSplitStep: true, splitBeat: 2 });
        assert.equal(at(2).splitHalf, true);
        assert.equal(at(1).splitHalf, false);
        assert.equal(at(3).splitHalf, false);
        assert.equal(at(0).splitHalf, false);
        assert.equal(X.beatDisplayPlan({ beat: 2, bpb: 4, measures: 1, isSplitStep: false, splitBeat: 2 }).splitHalf, false);
    });
    test('compteur de mesure dans le bloc', () => {
        assert.equal(X.beatDisplayPlan({ beat: 9, bpb: 4, measures: 3, isSplitStep: false, splitBeat: 2 }).counter, 'Mesure : 3/3');
    });
});

// Grille de test : A (2 mesures), B (1 mesure), C (2 mesures)
const grid = [
    { rootIndex: 0, chordId: 'maj7', scaleId: 'ionian', measures: 2 },
    { rootIndex: 5, chordId: 'm7', scaleId: 'dorian', measures: 1 },
    { rootIndex: 7, chordId: '7', scaleId: 'mixolydian', measures: 2 },
];
const navOf = (g, passes = {}) => ({
    stepSpan: (i) => PO.stepSpan(g, i),
    nextStepInfo: (i, commit) => PO.nextStepInfo(g, i, commit ? passes : { ...passes }),
    stepOfMeasure: (n) => PO.stepOfMeasure(g, n),
});
const adv = (over) => X.advanceAfterBeat({
    stepIdx: 0, beat: 0, bpb: 4, totalBeatsInStep: 8, activeSlot: 0, playRange: null, loopEnabled: false, nav: navOf(grid), ...over,
});

describe('advanceAfterBeat : lecture normale', () => {
    test('au milieu d\'un bloc : on avance d\'un temps', () => {
        assert.deepEqual(adv({ beat: 2 }), { kind: 'continue', currentStepIndex: 0, currentBeat: 3, activeSlot: 0, resetPasses: false });
    });
    test('dernier temps d\'un bloc : bloc suivant, créneau inversé', () => {
        assert.deepEqual(adv({ beat: 7 }), { kind: 'next-step', currentStepIndex: 1, currentBeat: 0, activeSlot: 1, resetPasses: false });
        assert.equal(adv({ beat: 7, activeSlot: 1 }).activeSlot, 0);
    });
    test('fin de grille sans boucle : arrêt (le dernier temps sonne)', () => {
        const r = adv({ stepIdx: 2, beat: 7, totalBeatsInStep: 8 });
        assert.equal(r.kind, 'stop');
        assert.equal(r.currentBeat, 8);
        assert.equal(r.currentStepIndex, 2);
    });
    test('fin de grille avec boucle : retour au premier bloc', () => {
        const r = adv({ stepIdx: 2, beat: 7, totalBeatsInStep: 8, loopEnabled: true });
        assert.deepEqual(r, { kind: 'next-step', currentStepIndex: 0, currentBeat: 0, activeSlot: 1, resetPasses: false });
    });
    test('mesure à 3 temps : le bloc finit au 3e temps de sa dernière mesure', () => {
        assert.equal(adv({ stepIdx: 1, beat: 2, bpb: 3, totalBeatsInStep: 3 }).kind, 'next-step');
        assert.equal(adv({ stepIdx: 0, beat: 2, bpb: 3, totalBeatsInStep: 6 }).kind, 'continue');
    });
});

describe('advanceAfterBeat : reprises', () => {
    const rep = [
        { rootIndex: 0, chordId: 'maj7', scaleId: 'ionian', measures: 1, repeatStart: true },
        { rootIndex: 5, chordId: 'm7', scaleId: 'dorian', measures: 1, repeatEnd: 2 },
        { rootIndex: 7, chordId: '7', scaleId: 'mixolydian', measures: 1 },
    ];
    test('le passage est mémorisé : retour au début de la reprise, puis suite', () => {
        const passes = {};
        const nav = navOf(rep, passes);
        const first = X.advanceAfterBeat({ stepIdx: 1, beat: 3, bpb: 4, totalBeatsInStep: 4, activeSlot: 0, playRange: null, loopEnabled: false, nav });
        assert.equal(first.currentStepIndex, 0);
        const second = X.advanceAfterBeat({ stepIdx: 1, beat: 3, bpb: 4, totalBeatsInStep: 4, activeSlot: 0, playRange: null, loopEnabled: false, nav });
        assert.equal(second.currentStepIndex, 2);
    });
});

describe('advanceAfterBeat : plage sélectionnée', () => {
    // mesures : A = 1-2, B = 3, C = 4-5
    test('hors dernier temps de mesure : rien de spécial', () => {
        assert.equal(adv({ beat: 2, playRange: { from: 1, to: 1 } }).kind, 'continue');
    });
    test('fin de plage au milieu d\'un bloc, sans boucle : arrêt', () => {
        const r = adv({ beat: 3, playRange: { from: 1, to: 1 } });
        assert.equal(r.kind, 'stop');
        assert.equal(r.currentBeat, 4);
    });
    test('fin de plage au milieu d\'un bloc, avec boucle : retour au début de la plage', () => {
        const r = adv({ stepIdx: 2, beat: 7, totalBeatsInStep: 8, playRange: { from: 2, to: 5 }, loopEnabled: true });
        assert.equal(r.kind, 'range-loop');
        assert.equal(r.resetPasses, true);
        assert.equal(r.currentStepIndex, 0);
        assert.equal(r.currentBeat, 4); // mesure 2 = 2e mesure du bloc A
        assert.equal(r.activeSlot, 1);
    });
    test('mesure intérieure à la plage : on continue', () => {
        assert.equal(adv({ beat: 3, playRange: { from: 1, to: 2 } }).kind, 'continue');
    });
    test('fin de bloc dans la plage : bloc suivant', () => {
        const r = adv({ beat: 7, playRange: { from: 1, to: 3 } });
        assert.equal(r.kind, 'next-step');
        assert.equal(r.currentStepIndex, 1);
    });
    test('dernier bloc de la plage terminé : arrêt', () => {
        const r = adv({ stepIdx: 1, beat: 3, totalBeatsInStep: 4, playRange: { from: 1, to: 3 } });
        assert.equal(r.kind, 'stop');
    });
});

describe('advanceAfterBeat : un saut qui quitte la plage est ignoré', () => {
    const rep = [
        { rootIndex: 0, chordId: 'maj7', scaleId: 'ionian', measures: 1, repeatStart: true },
        { rootIndex: 5, chordId: 'm7', scaleId: 'dorian', measures: 1 },
        { rootIndex: 7, chordId: '7', scaleId: 'mixolydian', measures: 1, repeatEnd: 2 },
        { rootIndex: 2, chordId: 'm7', scaleId: 'dorian', measures: 1 },
    ];
    test('fin de reprise dont le retour sort de la plage : on avance d\'un bloc', () => {
        // plage = mesures 2-3 ; la reprise renverrait à la mesure 1 (hors plage), on passe au bloc suivant dans la plage
        const nav = navOf(rep);
        const r = X.advanceAfterBeat({ stepIdx: 1, beat: 3, bpb: 4, totalBeatsInStep: 4, activeSlot: 0, playRange: { from: 2, to: 3 }, loopEnabled: false, nav });
        assert.equal(r.kind, 'next-step');
        assert.equal(r.currentStepIndex, 2);
    });
});
