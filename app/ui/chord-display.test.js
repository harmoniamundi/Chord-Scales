// Tests de l'affichage de l'accord en cours et suivant de la Jam (ui/chord-display.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../theory.js');
const PO = require('../grid/play-order.js');
const D = require('./chord-display.js');

const isSplit = (s) => !!(s && s.split);
const grid = [
    { rootIndex: 0, chordId: 'maj7', scaleId: 'ionian', measures: 1 },
    { rootIndex: 5, chordId: 'm7', scaleId: 'dorian', measures: 1, split: { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' } },
    { rootIndex: 2, chordId: 'm7', scaleId: 'dorian', measures: 1 },
];
const peekNext = (g, loop) => (i) => PO.peekNextDisplayIndex(g, i, { playRange: null, loopEnabled: loop, passes: {} });
const ctx = (over) => ({
    playing: true, grid, step: grid[0], half: 0, currentStepIndex: 0, displayedStepIndex: 0, displayedHalf: 0,
    isSplit, peekNext: peekNext(grid, true), ...over,
});

describe('displayedChordOf', () => {
    const step = grid[1];
    test('moitié 0 : le premier accord du bloc', () => {
        assert.deepEqual(D.displayedChordOf(step, 0, true), { chord: step, half: 0 });
    });
    test('moitié 1 sur un bloc à deux accords : le second', () => {
        assert.deepEqual(D.displayedChordOf(step, 1, true), { chord: step.split, half: 1 });
    });
    test('moitié 1 sur un bloc simple : toujours le bloc, moitié 0', () => {
        assert.deepEqual(D.displayedChordOf(grid[0], 1, false), { chord: grid[0], half: 0 });
    });
    test('autre valeur de moitié : premier accord', () => {
        assert.equal(D.displayedChordOf(step, 2, true).chord, step);
    });
});

describe('nextChordOf : en lecture', () => {
    test('bloc simple : le bloc suivant', () => {
        assert.deepEqual(D.nextChordOf(ctx({})), { rootIndex: 5, chordId: 'm7' });
    });
    test('premier accord d\'une mesure à deux accords : le second de la même mesure', () => {
        assert.deepEqual(D.nextChordOf(ctx({ step: grid[1], currentStepIndex: 1, half: 0 })), { rootIndex: 7, chordId: '7' });
    });
    test('second accord : le bloc suivant', () => {
        assert.deepEqual(D.nextChordOf(ctx({ step: grid[1], currentStepIndex: 1, half: 1 })), { rootIndex: 2, chordId: 'm7' });
    });
    test('fin de grille : retour au début avec la boucle, rien sans', () => {
        const last = { step: grid[2], currentStepIndex: 2 };
        assert.deepEqual(D.nextChordOf(ctx({ ...last })), { rootIndex: 0, chordId: 'maj7' });
        assert.equal(D.nextChordOf(ctx({ ...last, peekNext: peekNext(grid, false) })), null);
    });
    test('pas de bloc ou grille vide : rien', () => {
        assert.equal(D.nextChordOf(ctx({ step: null })), null);
        assert.equal(D.nextChordOf(ctx({ grid: [] })), null);
    });
    test('le résultat ne garde que racine et qualité', () => {
        assert.deepEqual(Object.keys(D.nextChordOf(ctx({}))), ['rootIndex', 'chordId']);
    });
});

describe('nextChordOf : à l\'arrêt', () => {
    const stopped = (over) => ctx({ playing: false, step: null, ...over });
    test('part de l\'accord sélectionné, pas du bloc en cours', () => {
        assert.deepEqual(D.nextChordOf(stopped({ displayedStepIndex: 0, currentStepIndex: -1 })), { rootIndex: 5, chordId: 'm7' });
    });
    test('premier accord d\'une mesure à deux accords sélectionné : le second', () => {
        assert.deepEqual(D.nextChordOf(stopped({ displayedStepIndex: 1, displayedHalf: 0 })), { rootIndex: 7, chordId: '7' });
    });
    test('second accord sélectionné : bloc suivant', () => {
        assert.deepEqual(D.nextChordOf(stopped({ displayedStepIndex: 1, displayedHalf: 1 })), { rootIndex: 2, chordId: 'm7' });
    });
    test('moitié inconnue (undefined) : on passe au bloc suivant', () => {
        assert.deepEqual(D.nextChordOf(stopped({ displayedStepIndex: 1, displayedHalf: undefined })), { rootIndex: 2, chordId: 'm7' });
    });
    test('aucune sélection ou indice hors grille : rien', () => {
        assert.equal(D.nextChordOf(stopped({ displayedStepIndex: undefined })), null);
        assert.equal(D.nextChordOf(stopped({ displayedStepIndex: -1 })), null);
        assert.equal(D.nextChordOf(stopped({ displayedStepIndex: 9 })), null);
        assert.equal(D.nextChordOf(stopped({ grid: [] })), null);
    });
});

describe('chordBadges', () => {
    test('notes de l\'accord et intervalle de chacune', () => {
        const c = T.chordTypes.maj.find(x => x.id === 'maj7');
        assert.deepEqual(D.chordBadges('C', c), [
            { label: 'C', interval: 0 }, { label: 'E', interval: 4 }, { label: 'G', interval: 7 }, { label: 'B', interval: 11 },
        ]);
    });
    test('l\'orthographe suit la fondamentale', () => {
        const c = T.chordTypes.maj.find(x => x.id === 'maj7');
        assert.equal(D.chordBadges('Db', c)[0].label, 'Db');
        assert.equal(D.chordBadges('C#', c)[0].label, 'C#');
    });
    test('accord inconnu : erreur (comme avant)', () => {
        assert.throws(() => D.chordBadges('C', undefined));
    });
    test('classe des pastilles', () => {
        assert.ok(D.CHORD_BADGE_CLASS.includes('bg-blue-600') && D.CHORD_BADGE_CLASS.includes('cursor-pointer'));
    });
});
